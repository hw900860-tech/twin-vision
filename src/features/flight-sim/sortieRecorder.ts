/**
 * SORTIE RECORDER — airborne mission capture.
 *
 * A thin observer on the flight store (installed only on /sim): it watches the
 * mission lifecycle by DIFFING consecutive store states, so the 20 Hz physics
 * tick is never touched. While a mission preset is active it:
 *   - snapshots the planned route + preset at launch,
 *   - timestamps every waypoint capture against the mission clock,
 *   - keeps a ~1 Hz sample stream (position + engine state) for smooth replay,
 * and when the sortie ends (complete / crash / forced landing / recovery /
 * abort) it queues the finished record on the store, where the airborne
 * datalink drains it into a MISSION_RECORD frame for the GCS.
 */
import type { FlightState } from "./flightStore";
import { MISSIONS, useFlightStore } from "./flightStore";
import type { SortieEndReason, SortieRecord, SortieSample } from "@/lib/datalink/sortie";

const SAMPLE_INTERVAL = 1.0; // seconds of mission clock between samples
const MAX_SAMPLES = 900;

interface OpenRecord {
  rec: SortieRecord;
  lastSampleT: number;
}

let installed = false;
let open: OpenRecord | null = null;

function finalizeReason(s: FlightState): SortieEndReason {
  switch (s.emergencyState) {
    case "crashed":
      return "CRASHED";
    case "forcedLanding":
      return "FORCED LANDING";
    case "recovery":
      return "RECOVERED";
    default:
      return s.missionProgress >= s.waypoints.length ? "COMPLETE" : "ABORTED";
  }
}

function sampleOf(s: FlightState, t: number): SortieSample {
  return {
    t,
    x: s.x,
    z: s.z,
    alt: s.altitude,
    hdg: s.heading,
    spd: s.speed,
    rpm: s.rpm,
    egt: s.egt,
    map: s.map,
    thr: s.throttle,
  };
}

function pushSample(rec: SortieRecord, sample: SortieSample): void {
  rec.samples.push(sample);
  // Keep the record bounded for the wire: decimate oldest half when too long.
  if (rec.samples.length > MAX_SAMPLES) {
    const keep = rec.samples.filter((_, i) => i % 2 === 0);
    rec.samples = keep;
  }
}

function finalizeAndQueue(): void {
  if (!open) return;
  const rec = open.rec;
  open = null;
  const st = useFlightStore.getState();
  rec.endReason = finalizeReason(st);
  rec.duration = st.missionElapsed;
  // Always keep a final sample so the replay ends exactly where the UAV is.
  const last = rec.samples[rec.samples.length - 1];
  if (!last || st.missionElapsed - last.t > 0.25) {
    pushSample(rec, sampleOf(st, st.missionElapsed));
  }
  useFlightStore.getState().queueSortie(rec);

}

/** Observe one store transition and update the open sortie record. */
function observe(prev: FlightState, next: FlightState): void {
  // --- mission launch ---
  if (!prev.missionActive && next.missionActive && next.waypoints.length > 0) {
    if (open) finalizeAndQueue(); // safety: a new mission while one is open
    const mission = MISSIONS[next.missionPreset];
    open = {
      rec: {
        id: `S-${Date.now().toString(36)}`,
        preset: next.missionPreset,
        presetLabel: mission?.label ?? next.missionPreset.toUpperCase(),
        biome: next.biome,
        endReason: "ABORTED",
        duration: 0,
        waypoints: next.waypoints.map((w) => ({ ...w })),
        captures: [],
        samples: [],
      },
      lastSampleT: next.missionElapsed,
    };
    pushSample(open.rec, sampleOf(next, next.missionElapsed));
    return;
  }
  if (!open) return;

  // --- mission clock samples ---
  if (next.missionActive && next.missionElapsed - open.lastSampleT >= SAMPLE_INTERVAL) {
    open.lastSampleT = next.missionElapsed;
    pushSample(open.rec, sampleOf(next, next.missionElapsed));
  }

  // --- waypoint capture (progress strictly increased) ---
  if (next.missionProgress > prev.missionProgress) {
    const captured = next.missionProgress - 1; // newest reached waypoint index
    const last = open.rec.captures[open.rec.captures.length - 1];
    if (!last || last.wp !== captured) {
      open.rec.captures.push({ wp: captured, t: next.missionElapsed });
    }
  }

  // --- sortie end ---
  if (prev.missionActive && !next.missionActive) {
    finalizeAndQueue();
  }
}

export function installSortieRecorder(): void {
  if (installed) return;
  installed = true;
  useFlightStore.subscribe((state, prevState) => observe(prevState, state));
}

export function uninstallSortieRecorder(): void {
  // The store subscription lives for the lifetime of the /sim session; there is
  // no per-component teardown needed (the module-level singleton is per window).
  installed = false;
  open = null;
}
