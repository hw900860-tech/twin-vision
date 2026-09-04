/**
 * Region-adaptive flight pilot — pure math.
 *
 * Mission autopilot helper. When the planned leg to the next waypoint crosses a
 * CAUTION/CRITICAL atmospheric region the pilot first asks whether an ALTERNATE
 * path exists: a curved detour around the ring, approximated by a fan of
 * waypoints at radius r+m outside the ring so every chord stays clear. If a
 * clear detour exists the aircraft diverts; if none exists (the waypoint sits
 * inside the zone, or geometry blocks both sides) the aircraft keeps its path
 * and transits under OPTIMAL conditions — the flight store reduces throttle so
 * the engine crosses the air mass with minimal CHT/EGT stress.
 */
import type { FlightRegion } from "./regions";
import { segmentRegionCrossing, pointInRegion, type Point } from "./routePlanner";

/** A caution/critical region crossed by the straight leg a→b. */
export interface LegThreat {
  region: FlightRegion;
  entryT: number;
  exitT: number;
}

/** Threatening (caution+) regions the leg a→b passes through, by entry order. */
export function legThreats(a: Point, b: Point, regions: FlightRegion[]): LegThreat[] {
  const out: LegThreat[] = [];
  for (const region of regions) {
    if (region.severity === "info") continue;
    const c = segmentRegionCrossing(a, b, region);
    if (c && c.entryT > -1e-6 && c.exitT <= 1 + 1e-6) {
      out.push({ region, entryT: c.entryT, exitT: c.exitT });
    }
  }
  out.sort((x, y) => x.entryT - y.entryT);
  return out;
}

/** Closest distance from point (cx,cz) to the segment a→b. */
function segCenterClear(
  ax: number, az: number,
  bx: number, bz: number,
  cx: number, cz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((cx - ax) * abx + (cz - az) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + abx * t - cx;
  const qz = az + abz * t - cz;
  return Math.hypot(qx, qz);
}

const TAU = Math.PI * 2;
function wrapAngle(a: number): number {
  return ((a % TAU) + TAU) % TAU;
}

interface EscapeCandidate {
  side: number;
  pts: Point[];
}

/**
 * Try a detour around ONE side of the ring. `side` = +1 arcs counter-clockwise
 * (angle increasing), -1 clockwise. Points sit on radius R = r + margin; each
 * connector chord is checked to clear the ring by >= 2 units and to avoid
 * entering any other CRITICAL region.
 */
function trySide(
  px: number, pz: number,
  tx: number, tz: number,
  region: FlightRegion,
  regions: FlightRegion[],
  side: number,
): Point[] | null {
  const r = region.radius;
  const margin = Math.min(90, r * 1.25 + 40);
  const R = r + margin;
  const cx = region.cx;
  const cz = region.cz;
  const aP = wrapAngle(Math.atan2(pz - cz, px - cx));
  const aT = wrapAngle(Math.atan2(tz - cz, tx - cx));

  // Angular length of the arc on this side, P-angle → T-angle.
  const along = wrapAngle((side > 0 ? aT - aP : aP - aT));
  if (along < 0.12) return null; // target basically on this side already — nothing to detour

  const chordsClear = (pts: Point[]): boolean => {
    let prev = { x: px, z: pz };
    for (const p of pts) {
      if (segCenterClear(prev.x, prev.z, p.x, p.z, cx, cz) < r + 2) return false;
      prev = p;
    }
    if (segCenterClear(prev.x, prev.z, tx, tz, cx, cz) < r + 2) return false;
    return true;
  };
  const avoidsCritical = (pts: Point[]): boolean => {
    let prev = { x: px, z: pz };
    for (const p of pts) {
      for (const th of legThreats(prev, p, regions)) {
        if (th.region.severity === "critical" && th.region.id !== region.id) return false;
      }
      prev = p;
    }
    for (const th of legThreats(prev, { x: tx, z: tz }, regions)) {
      if (th.region.severity === "critical" && th.region.id !== region.id) return false;
    }
    return true;
  };

  // Margins (rad) at each end of the arc — the bigger the margin the wider the
  // connector chords swing, guaranteeing the entry/exit legs stay outside.
  const margins = [0.42, 0.66, 0.95, 1.3, 1.75];
  for (const mIn of margins) {
    for (const mOut of margins) {
      const span = along - mIn - mOut;
      if (span < 0.1) continue;
      const step = 0.4;
      const pts: Point[] = [];
      const n = Math.ceil(span / step);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = side > 0
          ? aP + mIn + span * t
          : aP - mIn - span * t;
        pts.push({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R });
      }
      if (chordsClear(pts) && avoidsCritical(pts)) return pts;
    }
  }
  return null;
}

/** How deep the straight leg a→b cuts into a ring (0 when it stays outside). */
export function ringPenetration(
  ax: number, az: number,
  bx: number, bz: number,
  region: FlightRegion,
): number {
  const clear = segCenterClear(ax, az, bx, bz, region.cx, region.cz);
  return Math.max(0, region.radius - clear);
}

/**
 * Plan a detour around `region` from (px,pz) to (tx,tz). Both endpoints must be
 * OUTSIDE the ring — otherwise no alternate route exists (return null) and the
 * aircraft must transit the zone under optimal conditions.
 *
 * Returns an ordered waypoint chain approximating the arc around the ring, or
 * null when the zone cannot be avoided (waypoint inside the zone / geometry
 * blocks both sides).
 */
export function planEscape(
  px: number, pz: number,
  tx: number, tz: number,
  region: FlightRegion,
  regions: FlightRegion[],
): Point[] | null {
  if (pointInRegion(px, pz, region) || pointInRegion(tx, tz, region)) return null;
  const aP = wrapAngle(Math.atan2(pz - region.cz, px - region.cx));
  const aT = wrapAngle(Math.atan2(tz - region.cz, tx - region.cx));
  const diff = wrapAngle(aT - aP);
  // Prefer the shorter way around; the sign tells us which arc that is.
  const preferred = diff <= Math.PI ? 1 : -1;
  for (const side of [preferred, -preferred]) {
    const pts = trySide(px, pz, tx, tz, region, regions, side);
    if (pts && pts.length > 0) return pts;
  }
  return null;
}
