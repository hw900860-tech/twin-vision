/**
 * SORTIE RECORD — a captured mission sortie.
 *
 * Produced AIRBORNE (/sim) while a mission preset flies: the planned route is
 * snapshotted at launch, every waypoint capture is time-stamped against the
 * mission clock, and a ~1 Hz position/engine sample stream is kept for smooth
 * animated replay. When the sortie ends (complete / crash / abort / recovery)
 * the whole record is transmitted once over the datalink as a MISSION_RECORD
 * frame and the ground station can replay the flight as an animated route.
 *
 * This module is intentionally dependency-free (plain data) so both the
 * flight-sim recorder and the binary codec can share it.
 */
export interface SortieWaypoint {
  x: number;
  z: number;
  label: string;
}

export interface SortieCapture {
  /** Index into the waypoints array of the waypoint just reached. */
  wp: number;
  /** Mission-clock seconds (missionElapsed) at capture. */
  t: number;
}

export interface SortieSample {
  /** Mission-clock seconds. */
  t: number;
  x: number;
  z: number;
  alt: number; // ft
  hdg: number; // deg
  spd: number; // knots
  rpm: number;
  egt: number; // °C
  map: number; // kPa
  thr: number; // %
}

export type SortieEndReason = "COMPLETE" | "CRASHED" | "FORCED LANDING" | "RECOVERED" | "ABORTED";

export interface SortieRecord {
  id: string;
  preset: string;
  presetLabel: string;
  biome: string;
  endReason: SortieEndReason;
  duration: number; // mission-clock seconds at end
  waypoints: SortieWaypoint[];
  captures: SortieCapture[];
  samples: SortieSample[];
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
