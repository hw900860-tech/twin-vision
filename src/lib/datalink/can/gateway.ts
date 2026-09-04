/**
 * CAN ingestion gateway. Owns the live bus, decodes every tick into the
 * latest merged `CanDecoded`, keeps a short raw-frame ring for the bus
 * inspector, and exposes `buildCanTelemetrySnapshot()` — the single function
 * the airborne datalink uses to substitute CAN-decoded values for the raw
 * physics model outputs. When the toggle is OFF the datalink bypasses this
 * module entirely (zero overhead).
 */

import { create } from "zustand";
import { emergencyCodeOf, type TelemetrySnapshot } from "../codec";
import { useFlightStore } from "@/features/flight-sim/flightStore";
import { SimulatedCanBus } from "./bus";
import { decodeCanTelegram } from "./decoder";
import type { CanDecoded, CanFrame } from "./types";

const RING_CAP = 12;
const CAN_HZ = 50; // frames-per-second cadence the gateway observes

export interface CanBusState {
  enabled: boolean;
  transportName: string;
  framesPerSec: number;
  totalFrames: number;
  ring: CanFrame[];
  decoded: CanDecoded | null;
  lastTickMs: number;
  setEnabled: (on: boolean) => void;
}

export const useCanBusStore = create<CanBusState>((set, get) => ({
  enabled: false,
  transportName: "CAN BUS OFFLINE",
  framesPerSec: 0,
  totalFrames: 0,
  ring: [],
  decoded: null,
  lastTickMs: 0,
  setEnabled: (on) => {
    if (on === get().enabled) return;
    if (on) startIngestion();
    else stopIngestion();
  },
}));

let bus: SimulatedCanBus | null = null;
let windowStart = 0;
let windowFrames = 0;
let windowTimer: ReturnType<typeof setInterval> | null = null;

function onFrame(frame: CanFrame): void {
  const st = useCanBusStore.getState();
  windowFrames += 1;

  const ring = [...st.ring, frame];
  while (ring.length > RING_CAP) ring.shift();

  // Decode only when a full telegram (12 frames) has arrived — cheap merge otherwise.
  const decoded = decodeCanTelegram([frame]);
  const merged: CanDecoded = { ...(st.decoded ?? {}) };
  Object.assign(merged, decoded);

  useCanBusStore.setState({
    ring,
    decoded: merged,
    totalFrames: st.totalFrames + 1,
  });
}

export function startIngestion(): void {
  if (bus) return;
  bus = new SimulatedCanBus();
  windowStart = Date.now();
  windowFrames = 0;

  bus.start(onFrame);
  useCanBusStore.setState({ enabled: true, transportName: bus.name, lastTickMs: Date.now() });

  windowTimer = setInterval(() => {
    const elapsed = (Date.now() - windowStart) / 1000;
    const fps = elapsed > 0 ? Math.round(windowFrames / elapsed) : 0;
    windowStart = Date.now();
    windowFrames = 0;
    useCanBusStore.setState({ framesPerSec: fps, lastTickMs: Date.now() });
  }, 1000);
}

export function stopIngestion(): void {
  bus?.stop();
  bus = null;
  if (windowTimer) clearInterval(windowTimer);
  windowTimer = null;
  useCanBusStore.setState({
    enabled: false,
    transportName: "CAN BUS OFFLINE",
    framesPerSec: 0,
    ring: [],
    decoded: null,
  });
}

/** Estimated bus load: 12 frames × (47+8×8) bits @ 50 Hz on a 500 kbit/s bus. */
export function canBusLoadPct(): number {
  return ((13 * (47 + 8 * 8) * CAN_HZ) / 500_000) * 100;
}

/** CAN bus throughput in kbit/s. */
export function canBusThroughputKbps(): number {
  return (13 * (47 + 8 * 8) * CAN_HZ) / 1000;
}

/**
 * Build a full datalink TelemetrySnapshot from the latest CAN-decoded values.
 * Returns null when no valid telegram has arrived yet (caller falls back to
 * the direct model path for the first tick).
 */
export function buildCanTelemetrySnapshot(): TelemetrySnapshot | null {
  const d = useCanBusStore.getState().decoded;
  if (!d || d.rpm === undefined || d.altitude === undefined) return null;

  return {
    altitude: d.altitude,
    speed: d.speed ?? 0,
    verticalSpeed: d.verticalSpeed ?? 0,
    pitch: d.pitch ?? 0,
    roll: d.roll ?? 0,
    heading: d.heading ?? 0,
    throttle: d.throttle ?? 0,
    rpm: d.rpm,
    injectionTiming: d.injectionTiming ?? 0,
    map: d.map ?? 0,
    cht: d.cht ?? [0, 0, 0, 0],
    egt: d.egt ?? [0, 0, 0, 0],
    oilTemp: d.oilTemp ?? 0,
    oilPressure: d.oilPressure ?? 0,
    vibrationRMS: d.vibrationRMS ?? 0,
    health: d.healthIndex ?? 0,
    anomalyScore: d.anomalyScore ?? 0,
    ambientTemp: d.ambientTemp ?? 0,
    rul: d.rul ?? 0,
    lat: d.lat ?? 28.6139,
    lon: d.lon ?? 77.209,
    faults: d.faults ?? {
      c2Overheat: false,
      turboFail: false,
      bearingFail: false,
      injectorClog: false,
      misfire3: false,
    },
    // Aircraft-level state (not sensor-bus data) — read from the store so
    // MAYDAY/emergency and mission flags survive the CAN path unchanged.
    emergency: emergencyCodeOf(useFlightStore.getState().emergencyState),
    missionActive: useFlightStore.getState().missionActive,
  };
}
