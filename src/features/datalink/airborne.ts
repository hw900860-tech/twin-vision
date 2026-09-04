/**
 * AIRBORNE side of the datalink (the /sim window).
 *
 * Samples the authoritative flight store at 20 Hz, encodes compact binary
 * telemetry frames, routes them through the simulated datalink channel model
 * (LOS / SATCOM / OUTAGE) and transmits over the real WebSocket to the ground
 * gateway. Also receives + acknowledges GCS command frames.
 */
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { LinkSocket } from "@/lib/datalink/client";
import { DatalinkChannel } from "@/lib/datalink/channel";
import {
  CMD_ALTITUDE,
  CMD_FAULT,
  CMD_HEADING,
  CMD_RUDDER,
  CMD_THROTTLE,
  FAULT_KEYS,
  TELEMETRY_FRAME_BYTES,
} from "@/lib/datalink/protocol";
import {
  decodeCmdFrame,
  decodeGapReq,
  decodeWeatherSync,
  emergencyCodeOf,
  encodeAckFrame,
  encodeMissionRecord,
  encodeRegionAlert,
  encodeTelemetryFrame,
  type TelemetrySnapshot,
} from "@/lib/datalink/codec";
import type { WeatherObservation } from "@/lib/domain/engine/environment";
import { useLinkStore } from "./linkStore";
import { buildCanTelemetrySnapshot, useCanBusStore } from "@/lib/datalink/can/gateway";

const TX_INTERVAL_MS = 50; // 20 Hz sampling — matches the authoritative sim cadence

let started = false;
let socket: LinkSocket | null = null;
let channel: DatalinkChannel | null = null;
let txTimer: ReturnType<typeof setInterval> | null = null;
let rateTimer: ReturnType<typeof setInterval> | null = null;
let seq = 0;
let lastTxFrames = 0;
let lastTxBytes = 0;
let lastDropped = 0;

/**
 * Store-and-forward ring buffer. Every frame encoded for transmission is kept
 * here (60 s at 20 Hz) so that when the ground station reports missing sequence
 * numbers — radio outage, SATCOM loss, a dropped gateway connection — the
 * airborne session can replay the exact missing window from its own buffer.
 */
const RING_CAP = 1200;
const RING_MAX_REPLAY = 900; // max frames burst per GAP_REQ
const ring: { seq: number; buf: ArrayBuffer }[] = [];

function snapshot(): TelemetrySnapshot {
  // CAN INGESTION PATH — when the simulated socketCAN layer is enabled, the
  // telemetry sent to the GCS is built from frames decoded off the CAN bus
  // (the values the ECU broadcast as scaled integers) rather than the raw
  // physics model outputs. This is the exact code path a real socketCAN
  // adapter feeds once the hardware swap point is wired (see can/bus.ts).
  if (useCanBusStore.getState().enabled) {
    const canSnap = buildCanTelemetrySnapshot();
    if (canSnap) return canSnap;
    // Fall back to the direct path until the first telegram completes.
  }

  const s = useFlightStore.getState();
  const injectorActive = s.faultSmooth.injectorClog > 0.3;
  const egt = s.egt;
  const lat = s.crashCoordinates?.lat ?? 28.6139 + s.x * 0.00001;
  const lon = s.crashCoordinates?.lon ?? 77.209 + s.z * 0.00001;
  return {
    altitude: s.altitude,
    speed: s.speed,
    verticalSpeed: s.pitchAngle * 1000,
    pitch: s.pitchAngle * 57.3,
    roll: s.bankAngle,
    heading: s.heading,
    throttle: s.throttle,
    rpm: s.rpm,
    injectionTiming: s.injectionTiming,
    map: s.map,
    cht: [s.cht[0] ?? 0, s.cht[1] ?? 0, s.cht[2] ?? 0, s.cht[3] ?? 0],
    egt: [egt, egt, egt + (injectorActive ? 68 : 0) - (s.faultSmooth.misfire3 > 0.3 ? 55 : 0), egt],
    oilTemp: s.oilTemp,
    oilPressure: s.oilPressure,
    vibrationRMS: s.vibrationRMS,
    health: s.healthIndex * 100,
    anomalyScore: s.anomalyScore * 100,
    ambientTemp: s.ambientTemp,
    rul: s.rul,
    lat,
    lon,
    faults: {
      c2Overheat: s.faultSmooth.c2Overheat > 0.3,
      turboFail: s.faultSmooth.turboFail > 0.3,
      bearingFail: s.faultSmooth.bearingFail > 0.3,
      injectorClog: s.faultSmooth.injectorClog > 0.3,
      misfire3: s.faultSmooth.misfire3 > 0.3,
    },
    emergency: emergencyCodeOf(s.emergencyState),
    missionActive: s.missionActive,
  };
}

/** Replay buffered frames whose seq is strictly after the ground's reported last seq. */
function replyGapBurst(groundSeq: number): number {
  let sent = 0;
  for (const f of ring) {
    if (sent >= RING_MAX_REPLAY) break;
    const dist = (f.seq - groundSeq) & 0xffff;
    if (dist > 0 && dist < 60000) {
      if (socket?.connected && socket.sendBinary(f.buf)) sent++;
    }
  }
  return sent;
}

function handleBinary(buf: ArrayBuffer): void {
  const gap = decodeGapReq(buf);
  if (gap) {
    // Radio is physically off in OUTAGE — the burst cannot be transmitted. The
    // ground side re-requests on its own retry schedule once frames flow again.
    if (gap.crcOk && channel?.mode !== "OUTAGE") {
      const sent = replyGapBurst(gap.groundSeq);
      if (sent > 0) {
        const ls = useLinkStore.getState();
        useLinkStore.getState().patch({ replaysSent: ls.replaysSent + sent });
      }
    }
    return;
  }
  // Weather uplink from the GCS: rebuild the observation and let the region
  // map + physics deform around it (valid=false clears the binding).
  const wx = decodeWeatherSync(buf);
  if (wx) {
    if (wx.crcOk) {
      const flight = useFlightStore.getState();
      if (wx.valid) {
        const obs: WeatherObservation = {
          source: "LIVE",
          station: wx.code,
          code: wx.code,
          biome: wx.biome,
          lat: 0,
          lon: 0,
          elevationFt: wx.elevationFt,
          oatC: wx.oatC,
          relativeHumidityPct: wx.relativeHumidityPct,
          windSpeedKts: wx.windSpeedKts,
          windDirDeg: wx.windDirDeg,
          qnhHpa: wx.qnhHpa,
          updatedAt: Date.now(),
        };
        flight.syncLiveWeather(obs);
      } else {
        flight.clearLiveWeather();
      }
    }
    return;
  }
  const cmd = decodeCmdFrame(buf);
  if (!cmd || !cmd.crcOk) return;
  const flight = useFlightStore.getState();
  switch (cmd.cmdId) {
    case CMD_THROTTLE:
      flight.setThrottle(cmd.value);
      break;
    case CMD_FAULT: {
      const key = FAULT_KEYS[Math.round(cmd.value)];
      if (key) useFlightStore.getState().toggleFault(key);
      break;
    }
    case CMD_ALTITUDE:
      flight.setTargetAltitude(cmd.value);
      break;
    case CMD_HEADING:
      flight.setTargetHeading(cmd.value);
      break;
    case CMD_RUDDER:
      flight.setRudder(Math.max(-1, Math.min(1, cmd.value)));
      break;
    default:
      break;
  }
  // Acknowledge so the ground side can measure command RTT / confirm delivery.
  const ack = encodeAckFrame(cmd.seq, cmd.txMs, 0, Date.now());
  if (socket?.connected) socket.sendBinary(ack);
}

/** Transmit any region enter/exit alerts queued by the physics tick. */
function drainRegionAlerts(): void {
  if (!socket?.connected) return;
  // Do not flush the queue into a dead radio: OUTAGE keeps them pending so they
  // cross the link the moment it comes back (like the store-and-forward ring).
  if (channel?.mode === "OUTAGE") return;
  const pending = useFlightStore.getState().pendingRegionAlerts;
  if (pending.length === 0) return;
  useFlightStore.getState().clearPendingRegionAlerts();
  for (const a of pending) {
    const frame = encodeRegionAlert(
      {
        regionId: a.regionId,
        severity: a.severity,
        event: a.event,
        tempDeltaC: a.tempDeltaC,
        densityRatio: a.densityRatio,
        pressureDelta: a.pressureDelta,
        turbulence: a.turbulence,
      },
      0,
      Date.now(),
    );
    channel?.dispatch(frame, (b) => {
      if (socket?.connected) socket.sendBinary(b);
    });
  }
}

/** Transmit completed sortie records (mission recorder → GCS debrief). */
function drainPendingSorties(): void {
  if (!socket?.connected) return;
  if (channel?.mode === "OUTAGE") return; // keep queued until the link returns
  const pending = useFlightStore.getState().pendingSorties;
  if (pending.length === 0) return;
  useFlightStore.getState().clearPendingSorties();
  for (const rec of pending) {
    try {
      const frame = encodeMissionRecord(rec, 0, Date.now());
      channel?.dispatch(frame, (b) => {
        if (socket?.connected) socket.sendBinary(b);
      });
    } catch (e) {
      console.warn("[airborne] sortie record send failed", e);
    }
  }
}

function tick(): void {
  if (!socket?.connected) return;
  drainRegionAlerts();
  drainPendingSorties();
  const frame = encodeTelemetryFrame(snapshot(), seq, Date.now());
  ring.push({ seq, buf: frame });
  if (ring.length > RING_CAP) ring.splice(0, ring.length - RING_CAP);
  const mySeq = seq;
  seq = (seq + 1) & 0xffff;
  channel?.dispatch(frame, (b) => {
    if (socket?.connected && socket.sendBinary(b)) {
      const ls = useLinkStore.getState();
      useLinkStore.getState().patch({ txFrames: ls.txFrames + 1, txBytes: ls.txBytes + b.byteLength });
    }
  });
}

function rateTicker(): void {
  const ls = useLinkStore.getState();
  const deltaFrames = ls.txFrames - lastTxFrames;
  const deltaBytes = ls.txBytes - lastTxBytes;
  const deltaDropped = channel ? channel.dropped - lastDropped : 0;
  lastTxFrames = ls.txFrames;
  lastTxBytes = ls.txBytes;
  lastDropped = channel?.dropped ?? 0;
  useLinkStore.getState().patch({ txRateHz: deltaFrames, txBps: deltaBytes * 8, txBuffer: ring.length });
  if (deltaDropped > 0) useLinkStore.getState().patch({ txDropped: ls.txDropped + deltaDropped });
}

export function startAirborneLink(): void {
  if (started) return;
  started = true;
  useLinkStore.getState().resetTx();
  useLinkStore.getState().setRole("airborne");
  const link = useLinkStore.getState();
  channel = new DatalinkChannel();
  channel.setMode(link.mode);
  socket = new LinkSocket(link.relayUrl, {
    onOpen: () => {
      useLinkStore.getState().setWsStatus("online");
      socket?.sendControl({ type: "hello", role: "airborne" });
    },
    onClose: () => {
      useLinkStore.getState().setWsStatus("offline");
      useLinkStore.getState().setAirborneOnline(false);
    },
    onBinary: handleBinary,
  });
  socket.connect();

  txTimer = setInterval(tick, TX_INTERVAL_MS);
  rateTimer = setInterval(rateTicker, 1000);
}

export function stopAirborneLink(): void {
  if (!started) return;
  started = false;
  if (txTimer) clearInterval(txTimer);
  if (rateTimer) clearInterval(rateTimer);
  txTimer = null;
  rateTimer = null;
  socket?.close();
  socket = null;
  channel = null;
  useLinkStore.getState().setRole("offline");
  useLinkStore.getState().setWsStatus("offline");
}

export function setAirborneMode(mode: "LOS" | "SATCOM" | "OUTAGE"): void {
  useLinkStore.getState().setMode(mode);
  if (channel) channel.setMode(mode);
}

export function airborneFrameBytes(): number {
  return TELEMETRY_FRAME_BYTES;
}
