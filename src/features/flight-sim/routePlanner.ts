/**
 * Waypoint route planner — pure math.
 *
 * The operator plans the mission route BEFORE launch. Each straight leg between
 * two waypoints is checked against every atmospheric region ring (line-segment
 * × circle/ellipse intersection in the region's local frame). The output drives
 * both the 3D route overlay (legs tinted green/amber/red) and the ROUTE PLANNER
 * panel warnings, so the operator can re-route around a LOW PRESSURE TROUGH
 * (critical MAP collapse) before the aircraft ever leaves the ground.
 */
import type { FlightRegion } from "./regions";

export type LegRisk = "clear" | "caution" | "critical";

export interface RegionCrossing {
  region: FlightRegion;
  /** Normalized t along the leg where the leg ENTERS the ring (0..1). */
  entryT: number;
  /** Normalized t along the leg where the leg EXITS the ring (0..1). */
  exitT: number;
}

export interface LegAnalysis {
  index: number;
  from: { x: number; z: number };
  to: { x: number; z: number };
  risk: LegRisk;
  crossings: RegionCrossing[];
}

export interface Point {
  x: number;
  z: number;
}

/** Region rings deform into ellipses along the wind axis when a live station is synced. */
function toRegionLocal(x: number, z: number, r: FlightRegion): Point {
  const axis = ((r.axisDeg ?? 0) * Math.PI) / 180;
  const stretch = r.stretch ?? 1;
  const dx = x - r.cx;
  const dz = z - r.cz;
  const cos = Math.cos(-axis);
  const sin = Math.sin(-axis);
  return {
    x: (dx * cos - dz * sin) / stretch,
    z: dx * sin + dz * cos,
  };
}

/**
 * Line-segment × ring intersection in region-local space.
 * Returns the entry/exit normalized parameters, or null when the leg misses.
 */
export function segmentRegionCrossing(
  a: Point,
  b: Point,
  region: FlightRegion,
): { entryT: number; exitT: number } | null {
  const A = toRegionLocal(a.x, a.z, region);
  const B = toRegionLocal(b.x, b.z, region);
  const abx = B.x - A.x;
  const abz = B.z - A.z;
  const len2 = abx * abx + abz * abz;
  const r2 = region.radius * region.radius;

  // Closest approach of the line (not segment) to the origin.
  let t = 0;
  if (len2 > 0) {
    t = Math.max(0, Math.min(1, -(A.x * abx + A.z * abz) / len2));
  }
  const px = A.x + abx * t;
  const pz = A.z + abz * t;
  const dist2 = px * px + pz * pz;
  if (dist2 > r2) return null;

  // Chord half-length along the segment direction.
  const halfLen = len2 > 0 ? Math.sqrt(Math.max(0, r2 - dist2) / len2) : 1;
  return {
    entryT: Math.max(0, t - halfLen),
    exitT: Math.min(1, t + halfLen),
  };
}

/** Is a world point inside the (possibly deformed) ring? */
export function pointInRegion(x: number, z: number, region: FlightRegion): boolean {
  const p = toRegionLocal(x, z, region);
  return p.x * p.x + p.z * p.z <= region.radius * region.radius;
}

export function analyzeLegs(
  waypoints: Point[],
  regions: FlightRegion[],
): LegAnalysis[] {
  const legs: LegAnalysis[] = [];
  for (let i = 0; i + 1 < waypoints.length; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    if (!from || !to) continue;
    const crossings: RegionCrossing[] = [];
    for (const region of regions) {
      const c = segmentRegionCrossing(from, to, region);
      if (c) crossings.push({ region, entryT: c.entryT, exitT: c.exitT });
    }
    crossings.sort((a, b) => a.entryT - b.entryT);
    let risk: LegRisk = "clear";
    for (const c of crossings) {
      if (c.region.severity === "critical") {
        risk = "critical";
        break;
      }
      if (c.region.severity === "caution") risk = "caution";
    }
    legs.push({ index: i, from, to, risk, crossings });
  }
  return legs;
}

/** Fraction of a leg that sits inside a given ring (0..1) — for panel stats. */
export function fractionInside(a: Point, b: Point, region: FlightRegion): number {
  const c = segmentRegionCrossing(a, b, region);
  if (!c) return 0;
  return Math.max(0, c.exitT - c.entryT);
}

export const LEG_RISK_COLOR: Record<LegRisk, string> = {
  clear: "#22c55e",
  caution: "#f0a63c",
  critical: "#ef4444",
};