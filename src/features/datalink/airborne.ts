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
  emergencyCodeOf,
  encodeAckFrame,
  encodeTelemetryFrame,
  type TelemetrySnapshot,
} from "@/lib/datalink/codec";
import { useLinkStore } from "./linkStore";

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

function snapshot(): TelemetrySnapshot {
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
    map: s.map,
    cht: [s.cht[0] ?? 0, s.cht[1] ?? 0, s.cht[2] ?? 0, s.cht[3] ?? 0],
    egt: [egt, egt, egt + (injectorActive ? 68 : 0), egt],
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
    },
    emergency: emergencyCodeOf(s.emergencyState),
    missionActive: s.missionActive,
  };
}

function handleBinary(buf: ArrayBuffer): void {
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

function tick(): void {
  if (!socket?.connected) return;
  const frame = encodeTelemetryFrame(snapshot(), seq, Date.now());
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
  useLinkStore.getState().patch({ txRateHz: deltaFrames, txBps: deltaBytes * 8 });
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
