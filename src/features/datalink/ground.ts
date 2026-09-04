/**
 * GROUND side of the datalink (the /gcs window).
 *
 * Receives binary telemetry frames that crossed the real network, decodes +
 * integrity-verifies them, and feeds an ORDERED store-and-forward receiver:
 * frames are applied to the GCS in strict sequence order, missing frames
 * (radio/SATCOM drops, gateway reconnects) trigger a GAP_REQ upstream, and the
 * airborne session bursts its buffered window back down to close the hole —
 * the classic "store-and-forward" datalink behaviour for beyond-line-of-sight
 * UAV operations.
 *
 * Applied values are written into the flight store the GCS widgets render, and
 * the engine-health ML is recomputed ground-side from received data (the
 * digital-twin story: same physics + ML model runs ground-side on what arrived
 * over the link).
 *
 * Command downlink: GCS controls are patched so operator actions become
 * acknowledged command frames (QoS: guaranteed delivery, retry ×3).
 */
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { regionById } from "@/features/flight-sim/regions";
import { runEngineDecisionEngine } from "@/features/digital-twin/engineMlService";
import { LinkSocket } from "@/lib/datalink/client";
import { OrderedReceiver } from "@/lib/datalink/orderReceiver";
import {
  CMD_ALTITUDE,
  CMD_FAULT,
  CMD_HEADING,
  CMD_RUDDER,
  CMD_THROTTLE,
  FAULT_INDEX,
} from "@/lib/datalink/protocol";
import {
  decodeAckFrame,
  decodeMissionRecord,
  decodeRegionAlert,
  decodeTelemetryFrame,
  emergencyNameOf,
  encodeCmdFrame,
  encodeGapReq,
  encodeWeatherSync,
  type DecodedTelemetry,
} from "@/lib/datalink/codec";
import type { WeatherObservation } from "@/lib/domain/engine/environment";
import { useLinkStore } from "./linkStore";
import { RegionExcursionRecorder } from "./regionExcursions";

let started = false;
// Correlates region enter/exit alerts with the telemetry stream so the GCS can
// show engine-response excursions (MAP/EGT/CHT) while the UAV was inside a region.
let recorder: RegionExcursionRecorder | null = null;
let socket: LinkSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let ageTimer: ReturnType<typeof setInterval> | null = null;
let rateTimer: ReturnType<typeof setInterval> | null = null;
let pendingTimer: ReturnType<typeof setInterval> | null = null;
let stallTimer: ReturnType<typeof setInterval> | null = null;
let actionsPatched = false;

// ---- ordered store-and-forward receive chain ----
let receiver: OrderedReceiver | null = null;
let gapReqAtMs = 0; // last GAP_REQ send time (throttle)
let gapReqRetries = 0; // consecutive unanswered requests before abandoning a hole
let lastRxFrames = 0;

// ---- command downlink state ----
let cmdSeq = 0;
const pending = new Map<number, { sentAt: number; attempts: number; name: string; cmdId: number; value: number }>();

/** Deterministic FFT stand-in derived from received values (ML needs a spectrum). */
function synthFft(throttle: number, vib: number, bearing: boolean, rpm: number): number[] {
  const thr = throttle / 100;
  const out: number[] = [];
  for (let i = 0; i < 64; i++) {
    let val = 0.1 + Math.exp(-i / 12) * 0.3;
    if (i >= 7 && i <= 9) val += 0.4 * thr;
    if (i >= 15 && i <= 17) val += 0.25 * thr;
    if (i >= 23 && i <= 25) val += 0.15 * thr;
    if (i >= 13 && i <= 15) val += bearing ? 1.6 : 0;
    val += Math.abs(Math.sin(i * 0.7 + rpm * 0.001)) * 0.05;
    out.push(Math.max(0, Math.min(2, val)));
  }
  return out;
}

/** Sync receiver counters (holes / pending / recovered / lost) into the store. */
function syncReceiverStats(): void {
  if (!receiver) return;
  const st = receiver.state;
  const ls = useLinkStore.getState();
  const total = ls.rxFrames + st.holes;
  const lossPct = total > 0 ? Math.min(100, (st.holes * 100) / total) : 0;
  useLinkStore.getState().patch({
    rxGaps: st.holes,
    gapPending: st.pending,
    gapRecovered: st.recovered,
    gapLost: st.lost,
    lossPct,
  });
}

/** One in-order telemetry frame delivered by the receiver — write it to the GCS. */
function applyLive(f: DecodedTelemetry, recovered: boolean): void {
  const now = Date.now();
  // Feed the region-excursion recorder (only live frames — replays would double-sample).
  if (!recovered) recorder?.pushTelemetry(f);
  const ls = useLinkStore.getState();

  // One-way latency EMA. Replayed (store-and-forward) frames are excluded: their
  // age is dominated by buffering time on the aircraft, not the live link.
  let latencyMs = ls.latencyMs;
  if (!recovered) {
    const lat = Math.max(0, now - f.txMs);
    latencyMs = latencyMs > 0 ? latencyMs * 0.8 + lat * 0.2 : lat;
  }

  useLinkStore.getState().patch({
    rxFrames: ls.rxFrames + 1,
    rxBytes: ls.rxBytes + 112,
    latencyMs,
    lastRxTxMs: f.txMs,
  });
  syncReceiverStats();

  // ---- write decoded values into the store the GCS renders ----
  const s = useFlightStore.getState();
  const egt = f.egt[0] ?? 0;
  const healthIndex = Math.max(0, Math.min(1, f.health / 100));
  const anomalyScore = Math.max(0, Math.min(1, f.anomalyScore / 100));
  const cht = [...f.cht];
  const history = (s.historyBuffer || []).slice(-39);
  history.push({
    time: f.txMs / 1000,
    chtMax: Math.max(...cht),
    egt,
    map: f.map,
    oilTemp: f.oilTemp,
    oilPressure: f.oilPressure,
    vibrationRMS: f.vibrationRMS,
    health: healthIndex * 100,
  });
  useFlightStore.setState({
    altitude: f.altitude,
    speed: f.speed,
    heading: f.heading,
    throttle: f.throttle,
    rpm: f.rpm,
    map: f.map,
    cht,
    egt,
    oilTemp: f.oilTemp,
    oilPressure: f.oilPressure,
    vibrationRMS: f.vibrationRMS,
    healthIndex,
    anomalyScore,
    ambientTemp: f.ambientTemp,
    rul: f.rul,
    faults: { ...f.faults },
    emergencyState: emergencyNameOf(f.emergency),
    missionActive: f.missionActive,
    historyBuffer: history,
    engineDecision: runEngineDecisionEngine({
      altitude: f.altitude,
      ambientTemp: f.ambientTemp,
      ambientDeltaC: 0,
      throttle: f.throttle,
      rpm: f.rpm,
      map: f.map,
      cht,
      egt,
      oilPressure: f.oilPressure,
      oilTemp: f.oilTemp,
      vibrationRMS: f.vibrationRMS,
      fftSpectrum: synthFft(f.throttle, f.vibrationRMS, f.faults.bearingFail, f.rpm),
      healthIndex,
      rul: f.rul,
      anomalyScore,
      faults: { ...f.faults },
    }),
  });
}

/**
 * Ask the airborne session to replay everything it buffered after our highest
 * applied frame. Throttled: one live request is enough — its answer covers the
 * whole ring window; retries happen only when a request goes unanswered.
 */
function requestGap(): void {
  if (!socket?.connected || !receiver) return;
  const now = Date.now();
  if (now - gapReqAtMs < 500) return;
  gapReqAtMs = now;
  const base = receiver.highestApplied;
  if (base < 0) return; // stream not started yet — nothing to recover
  if (socket.sendBinary(encodeGapReq(base, now))) {
    const ls = useLinkStore.getState();
    useLinkStore.getState().patch({ gapRequests: ls.gapRequests + 1 });
  }
}

/** Watch the hole: request replay, retry once, then abandon what can't be filled. */
function stallWatch(): void {
  if (!receiver) return;
  const st = receiver.state;
  syncReceiverStats();
  if (st.pending === 0) {
    gapReqRetries = 0;
    return;
  }
  // Retry with backoff while the hole stays open: the modem may be in OUTAGE
  // (the aircraft is still buffering — retrying is correct, abandoning is not).
  const retryAt = 2500 + gapReqRetries * 2500; // ~2.5s, 5s, 7.5s, 10s after the hole
  if (receiver.stallAgeMs > retryAt && gapReqRetries < 4) {
    // No in-order progress — the earlier request (or its replay) was lost.
    gapReqRetries++;
    gapReqAtMs = 0;
    requestGap();
  } else if (receiver.stallAgeMs > 25000) {
    // Hole cannot be filled (outage outlasted the airborne ring window). Drop
    // it and resume from the newest held frame so the live stream never freezes.
    const lost = receiver.fastForward();
    gapReqRetries = 0;
    gapReqAtMs = 0;
    if (lost > 0) {
      const ls = useLinkStore.getState();
      console.warn(`[ground] abandoned ${lost} unrecoverable frame(s) — ring under-run`);
    }
    syncReceiverStats();
  }
}

// ================= command downlink (acknowledged) =================

/** Uplink the live weather observation to the aircraft so its region map reshapes. */
function sendWeatherUplink(obs: WeatherObservation | null): void {
  if (!socket?.connected) return;
  const frame = encodeWeatherSync(
    obs
      ? {
          valid: true,
          biome: obs.biome,
          code: obs.code,
          elevationFt: obs.elevationFt,
          oatC: obs.oatC,
          qnhHpa: obs.qnhHpa,
          windSpeedKts: obs.windSpeedKts,
          windDirDeg: obs.windDirDeg,
          relativeHumidityPct: obs.relativeHumidityPct,
        }
      : {
          valid: false,
          biome: "himalaya",
          code: "",
          elevationFt: 0,
          oatC: 0,
          qnhHpa: 1013.25,
          windSpeedKts: 0,
          windDirDeg: 0,
          relativeHumidityPct: 0,
        },
    0,
    Date.now(),
  );
  socket.sendBinary(frame);
}

function doSend(cmdId: number, value: number, name: string): void {
  if (!socket?.connected) {
    useLinkStore.getState().patch({ cmdStatus: "noack", cmdName: name, cmdAttempts: 0 });
    return;
  }
  cmdSeq = (cmdSeq + 1) & 0xffff;
  const frame = encodeCmdFrame(cmdId, value, cmdSeq, Date.now());
  pending.set(cmdSeq, { sentAt: Date.now(), attempts: 1, name, cmdId, value });
  if (socket.sendBinary(frame)) {
    useLinkStore.getState().patch({ cmdStatus: "sent", cmdName: name, cmdAttempts: 1 });
  }
}

export function sendCommand(cmdId: number, value: number, name: string): void {
  if (!started) return;
  // coalesce repeated slider commands
  const s = useLinkStore.getState();
  if (cmdId === CMD_THROTTLE && s.cmdStatus !== "noack" && s.cmdStatus !== "retrying" && s.cmdName === name) {
    const last = [...pending.values()].at(-1);
    if (last && Date.now() - last.sentAt < 120) return;
  }
  doSend(cmdId, value, name);
}

function checkPending(): void {
  const now = Date.now();
  for (const [seqNo, p] of pending) {
    if (now - p.sentAt < 700) continue;
    if (p.attempts >= 3) {
      pending.delete(seqNo);
      useLinkStore.getState().patch({ cmdStatus: "noack", cmdName: p.name, cmdAttempts: p.attempts });
      continue;
    }
    const frame = encodeCmdFrame(p.cmdId, p.value, seqNo, Date.now());
    if (socket?.connected && socket.sendBinary(frame)) {
      p.attempts++;
      p.sentAt = Date.now();
      useLinkStore.getState().patch({ cmdStatus: "retrying", cmdName: p.name, cmdAttempts: p.attempts });
    }
  }
}

// ================= handlers =================

function onBinary(buf: ArrayBuffer): void {
  // Tactical region alert from the aircraft (entered/exited an air mass).
  const regionAlert = decodeRegionAlert(buf);
  if (regionAlert) {
    if (regionAlert.crcOk) {
      useLinkStore.getState().pushAlert(regionAlert);
      // Surface it on the ground flight store too, so GCS widgets/banners react.
      const flight = useFlightStore.getState();
      const reg = regionById(regionAlert.regionId);
      useFlightStore.setState({
        systemMessage: regionAlert.event === "EXIT"
          ? `UAV LEFT ${reg?.name ?? regionAlert.regionId} — CONDITIONS NORMALIZING`
          : (reg?.advisory ?? `UAV ENTERED REGION ${regionAlert.regionId}`),
      });
      // Excursion history: start/stop the engine-response recorder. An ENTER
      // while another region is still open finalizes the previous excursion
      // (its EXIT was lost over the link or the UAV hopped straight over).
      const name = reg?.name ?? regionAlert.regionId;
      if (regionAlert.event === "ENTER") {
        const finalized = recorder?.onEnter(regionAlert.regionId, name, regionAlert.severity, regionAlert.txMs);
        if (finalized) useLinkStore.getState().pushExcursion(finalized);
      } else {
        const finalized = recorder?.onExit(regionAlert.regionId, regionAlert.txMs);
        if (finalized) useLinkStore.getState().pushExcursion(finalized);
      }
    }
    return;
  }
  // Completed sortie record from the aircraft (mission recorder) — the ground
  // keeps it for the animated route replay / debrief.
  const missionRec = decodeMissionRecord(buf);
  if (missionRec) {
    if (missionRec.crcOk && missionRec.record) {
      useLinkStore.getState().pushSortie(missionRec.record);
    }
    return;
  }
  const ack = decodeAckFrame(buf);
  if (ack) {
    const p = pending.get(ack.cmdSeq);
    if (p && ack.crcOk) {
      pending.delete(ack.cmdSeq);
      useLinkStore.getState().patch({
        cmdStatus: "acked",
        cmdName: p.name,
        cmdRttMs: Math.max(0, Date.now() - ack.origTxMs),
      });
    }
    return;
  }
  const f = decodeTelemetryFrame(buf);
  if (!f) return;
  if (!f.crcOk) {
    const ls = useLinkStore.getState();
    useLinkStore.getState().patch({ rxBadCrc: ls.rxBadCrc + 1 });
    return;
  }
  receiver?.push(f);
}

function onControl(msg: Record<string, unknown>): void {
  switch (msg["type"]) {
    case "pong": {
      const ts = typeof msg["ts"] === "number" ? msg["ts"] : 0;
      useLinkStore.getState().patch({ rttMs: Math.max(0, Date.now() - ts) });
      break;
    }
    case "link":
      useLinkStore.getState().setAirborneOnline(msg["airborne"] === true);
      break;
    case "no-airborne": {
      for (const [seqNo, p] of pending) {
        if (Date.now() - p.sentAt > 300) {
          pending.delete(seqNo);
          useLinkStore.getState().patch({ cmdStatus: "noack", cmdName: p.name, cmdAttempts: p.attempts });
        }
      }
      break;
    }
    default:
      break;
  }
}

// ---- patch GCS store actions so operator inputs travel over the link ----
const originalActions = {
  setThrottle: useFlightStore.getState().setThrottle,
  toggleFault: useFlightStore.getState().toggleFault,
  setTargetAltitude: useFlightStore.getState().setTargetAltitude,
  setTargetHeading: useFlightStore.getState().setTargetHeading,
  setRudder: useFlightStore.getState().setRudder,
  syncLiveWeather: useFlightStore.getState().syncLiveWeather,
  clearLiveWeather: useFlightStore.getState().clearLiveWeather,
};

function patchGroundActions(): void {
  if (actionsPatched) return;
  actionsPatched = true;
  useFlightStore.setState({
    setThrottle: (v: number) => {
      originalActions.setThrottle(v);
      sendCommand(CMD_THROTTLE, v, "THROTTLE");
    },
    toggleFault: (fault: "c2Overheat" | "turboFail" | "bearingFail" | "injectorClog" | "misfire3") => {
      originalActions.toggleFault(fault);
      sendCommand(CMD_FAULT, FAULT_INDEX[fault] ?? 0, `FAULT ${fault.toUpperCase()}`);
    },
    setTargetAltitude: (a: number) => {
      originalActions.setTargetAltitude(a);
      sendCommand(CMD_ALTITUDE, a, "ALTITUDE");
    },
    setTargetHeading: (h: number) => {
      originalActions.setTargetHeading(h);
      sendCommand(CMD_HEADING, h, "HEADING");
    },
    setRudder: (r: number) => {
      originalActions.setRudder(r);
      sendCommand(CMD_RUDDER, r, "RUDDER");
    },
    syncLiveWeather: (obs: WeatherObservation) => {
      originalActions.syncLiveWeather(obs);
      sendWeatherUplink(obs);
    },
    clearLiveWeather: () => {
      originalActions.clearLiveWeather();
      sendWeatherUplink(null);
    },
  });
}

function restoreGroundActions(): void {
  if (!actionsPatched) return;
  actionsPatched = false;
  useFlightStore.setState({
    setThrottle: originalActions.setThrottle,
    toggleFault: originalActions.toggleFault,
    setTargetAltitude: originalActions.setTargetAltitude,
    setTargetHeading: originalActions.setTargetHeading,
    setRudder: originalActions.setRudder,
    syncLiveWeather: originalActions.syncLiveWeather,
    clearLiveWeather: originalActions.clearLiveWeather,
  });
}

// ================= lifecycle =================

export function startGroundLink(): void {
  if (started) return;
  started = true;
  const ls = useLinkStore.getState();
  ls.resetRx();
  useLinkStore.getState().setRole("ground");

  recorder = new RegionExcursionRecorder();
  receiver = new OrderedReceiver({
    onApply: (f, recovered) => applyLive(f, recovered),
    onGap: () => requestGap(),
  });

  socket = new LinkSocket(ls.relayUrl, {
    onOpen: () => {
      useLinkStore.getState().setWsStatus("online");
      socket?.sendControl({ type: "hello", role: "ground" });
      // Reconnected mid-stream: anything the aircraft sent while we were down
      // is sitting in its ring — ask for it immediately.
      if (receiver?.started) {
        gapReqAtMs = 0;
        requestGap();
      }
    },
    onClose: () => {
      useLinkStore.getState().setWsStatus("offline");
      useLinkStore.getState().setAirborneOnline(false);
      useLinkStore.getState().patch({ cmdStatus: "idle" });
    },
    onBinary,
    onControl,
  });
  socket.connect();

  pingTimer = setInterval(() => socket?.sendControl({ type: "ping", ts: Date.now() }), 1000);
  ageTimer = setInterval(() => {
    const s = useLinkStore.getState();
    useLinkStore.getState().patch({
      lastFrameAgeMs: s.lastRxTxMs > 0 ? Math.max(0, Date.now() - s.lastRxTxMs) : 0,
    });
  }, 500);
  rateTimer = setInterval(() => {
    const s = useLinkStore.getState();
    const d = s.rxFrames - lastRxFrames;
    lastRxFrames = s.rxFrames;
    useLinkStore.getState().patch({ rxRateHz: d });
  }, 1000);
  pendingTimer = setInterval(checkPending, 200);
  stallTimer = setInterval(stallWatch, 400);
  patchGroundActions();
}

export function stopGroundLink(): void {
  if (!started) return;
  started = false;
  if (pingTimer) clearInterval(pingTimer);
  if (ageTimer) clearInterval(ageTimer);
  if (rateTimer) clearInterval(rateTimer);
  if (pendingTimer) clearInterval(pendingTimer);
  if (stallTimer) clearInterval(stallTimer);
  pingTimer = null;
  ageTimer = null;
  rateTimer = null;
  pendingTimer = null;
  stallTimer = null;
  pending.clear();
  socket?.close();
  socket = null;
  receiver = null;
  recorder = null;
  restoreGroundActions();
  useLinkStore.getState().setRole("offline");
  useLinkStore.getState().setWsStatus("offline");
  useLinkStore.getState().setAirborneOnline(false);
}
