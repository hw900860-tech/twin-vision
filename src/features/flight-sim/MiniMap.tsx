/**
 * TACTICAL MINI-MAP — top-down mission overview for the flight sim.
 *
 * A pure-DOM SVG overlay (no WebGL) showing the operator everything they need
 * without the 3D chase view:
 *   - atmospheric region rings (severity-coloured, weather-deformed ellipses,
 *     brightened + dashed inner ring while the UAV is inside),
 *   - the full planned route with per-leg risk colours, an emerald "flown"
 *     overlay with progress tick marks, and ✓-style passed waypoint markers,
 *   - the UAV itself as a heading-aligned aircraft arrow.
 *
 * The frame auto-fits the route + region rings (and follows the UAV if it
 * wanders off the mission area), north-up with the flight model's 0° = −Z.
 */
import { useMemo } from "react";
import { useFlightStore } from "./flightStore";
import type { FlightRegion } from "./regions";
import { analyzeLegs, LEG_RISK_COLOR } from "./routePlanner";

const VIEW_W = 900;
const VIEW_H = 600;

const SEV_COLOR: Record<string, string> = {
  info: "#3b82f6",
  caution: "#f0a63c",
  critical: "#e2523f",
};
const FLOWN = "#34d399"; // emerald — route already travelled
const WP_PASSED = "#3f4a55";
const WP_FUTURE = "#22d3ee";
const WP_BASE = "#22c55e";
const WP_CURRENT = "#ffffff";

const TRAVELED_TICK = 42; // world units between progress tick marks

type LegStatus = "idle" | "done" | "active" | "future";

/** Ellipse half-extents in world units for the deformed region ring. */
function regionExtents(r: FlightRegion): { hw: number; hh: number } {
  const rx = r.radius * (r.stretch ?? 1);
  const ry = r.radius;
  const t = ((r.axisDeg ?? 0) * Math.PI) / 180;
  return {
    hw: Math.hypot(rx * Math.cos(t), ry * Math.sin(t)),
    hh: Math.hypot(rx * Math.sin(t), ry * Math.cos(t)),
  };
}

/** Ellipse outline as an SVG path (matches the 3D ring's THREE Y-rotation). */
function ellipsePath(r: FlightRegion, tx: (wx: number) => number, tz: (wz: number) => number): string {
  const rx = r.radius * (r.stretch ?? 1);
  const ry = r.radius;
  const t = ((r.axisDeg ?? 0) * Math.PI) / 180;
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const lx = rx * Math.cos(a);
    const lz = ry * Math.sin(a);
    // world = center + Y-rotated local (same convention as the 3D marker)
    const wx = r.cx + lx * Math.cos(t) + lz * Math.sin(t);
    const wz = r.cz - lx * Math.sin(t) + lz * Math.cos(t);
    pts.push(`${(tx(wx)).toFixed(1)},${(tz(wz)).toFixed(1)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

/** Sample tick marks along the straight leg from a→b. */
function ticksAlong(ax: number, az: number, bx: number, bz: number, step: number) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.floor(d / step);
  const out: { x: number; z: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const t = (i * step) / d;
    out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t });
  }
  return out;
}

export function MiniMap() {
  const waypoints = useFlightStore((s) => s.waypoints);
  const regions = useFlightStore((s) => s.regions);
  const biome = useFlightStore((s) => s.biome);
  const missionActive = useFlightStore((s) => s.missionActive);
  const missionProgress = useFlightStore((s) => s.missionProgress);
  const regionsInside = useFlightStore((s) => s.regionsInside);
  const ux = useFlightStore((s) => s.x);
  const uz = useFlightStore((s) => s.z);
  const heading = useFlightStore((s) => s.heading);

  const legs = useMemo(() => analyzeLegs(waypoints, regions), [waypoints, regions]);
  const biomeLabel = biome.toUpperCase();

  // ---- frame: anchored on the MISSION AREA ----
  // The frame always centers route + region rings (min span for stability).
  // The UAV is drawn inside it when present; when it wanders off (idle cruise,
  // scouting), its arrow is clamped to the frame edge — the tactical picture
  // never shifts under the operator.
  const frame = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    waypoints.forEach((w) => { xs.push(w.x); zs.push(w.z); });
    regions.forEach((r) => {
      const { hw, hh } = regionExtents(r);
      xs.push(r.cx - hw, r.cx + hw);
      zs.push(r.cz - hh, r.cz + hh);
    });
    if (xs.length === 0 || zs.length === 0) {
      // Degenerate (no route / no rings): fall back to a stable view on the UAV.
      xs.push(ux - 250, ux + 250);
      zs.push(uz - 175, uz + 175);
    }
    const pad = 46;
    let minX = Math.min(...xs) - pad;
    let maxX = Math.max(...xs) + pad;
    let minZ = Math.min(...zs) - pad;
    let maxZ = Math.max(...zs) + pad;
    let bw = Math.max(maxX - minX, 300);
    let bh = Math.max(maxZ - minZ, 210);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    minX = cx - bw / 2;
    maxX = cx + bw / 2;
    minZ = cz - bh / 2;
    maxZ = cz + bh / 2;
    const scale = Math.min(VIEW_W / (maxX - minX), VIEW_H / (maxZ - minZ));
    const toX = (wx: number) => (wx - cx) * scale + VIEW_W / 2;
    const toZ = (wz: number) => (wz - cz) * scale + VIEW_H / 2;
    // World bounds visible on the map (for edge clamping).
    const xLo = cx - (VIEW_W / 2) / scale;
    const xHi = cx + (VIEW_W / 2) / scale;
    const zLo = cz - (VIEW_H / 2) / scale;
    const zHi = cz + (VIEW_H / 2) / scale;
    return { toX, toZ, xLo, xHi, zLo, zHi };
  }, [waypoints, regions, ux, uz]);

  // ---- mission progress → leg / waypoint visual state (mirrors RoutePath) ----
  const completedTrip = !missionActive && missionProgress >= waypoints.length;
  const flying =
    missionActive ||
    (!missionActive && missionProgress >= waypoints.length && waypoints.length > 1);
  const targetIdx = flying
    ? Math.min(Math.floor(missionProgress), Math.max(waypoints.length - 1, 0))
    : -1;
  const legStatus = (i: number): LegStatus => {
    if (completedTrip) return "done";
    if (!flying) return "idle";
    if (i < targetIdx - 1) return "done";
    if (i === targetIdx - 1) return "active";
    return "future";
  };
  const wpStatus = (i: number): "passed" | "current" | "future" => {
    if (completedTrip) return "passed";
    if (!flying) return "future";
    if (i < targetIdx) return "passed";
    if (i === targetIdx) return "current";
    return "future";
  };

  const { toX, toZ } = frame;

  // ---- progress fraction along the ACTIVE leg (UAV projection) ----
  let activeFill: number | null = null;
  for (const leg of legs) {
    if (legStatus(leg.index) === "active") {
      const { from, to } = leg;
      const abx = to.x - from.x;
      const abz = to.z - from.z;
      const len2 = abx * abx + abz * abz;
      activeFill =
        len2 <= 0
          ? 0
          : Math.max(0, Math.min(1, ((ux - from.x) * abx + (uz - from.z) * abz) / len2));
    }
  }

  const P = (wx: number, wz: number) => `${toX(wx).toFixed(1)},${toZ(wz).toFixed(1)}`;

  return (
    <div
      className="pointer-events-none rounded border border-cyan/30 bg-panel/95 backdrop-blur-md font-mono"
      style={{ boxShadow: "0 4px 18px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(34,211,238,0.06)" }}
    >
      {/* header */}
      <div className="flex items-center justify-between border-b border-cyan/20 px-2 py-1 text-[7.5px] tracking-widest text-cyan">
        <span className="font-bold">TACTICAL MAP</span>
        <span className="flex items-center gap-1 text-cyan/80">
          <span className="inline-block h-1.5 w-1.5 rotate-45 bg-cyan/70" /> N · {biomeLabel}
        </span>
      </div>

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block h-auto w-full">
        {/* subtle grid + frame */}
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="rgba(2,6,10,0.55)" rx={2} />
        <g stroke="rgba(148,163,184,0.07)" strokeWidth={1}>
          {[150, 300, 450, 600, 750].map((gx) => (
            <line key={`gx${gx}`} x1={gx} y1={0} x2={gx} y2={VIEW_H} />
          ))}
          {[100, 200, 300, 400, 500].map((gy) => (
            <line key={`gy${gy}`} x1={0} y1={gy} x2={VIEW_W} y2={gy} />
          ))}
        </g>

        {/* region rings (severity colour; ellipse when weather-deformed) */}
        {regions.map((r) => {
          const active = regionsInside.includes(r.id);
          const col = SEV_COLOR[r.severity] ?? "#3b82f6";
          return (
            <g key={r.id}>
              <path d={ellipsePath(r, toX, toZ)} fill={col} opacity={active ? 0.22 : 0.07} stroke="none" />
              <path
                d={ellipsePath(r, toX, toZ)}
                fill="none"
                stroke={col}
                strokeWidth={active ? 3.5 : 2}
                strokeDasharray={active ? "none" : "14 8"}
                opacity={active ? 1 : 0.85}
              />
              {active && (
                <path
                  d={ellipsePath({ ...r, radius: r.radius * 0.72 }, toX, toZ)}
                  fill="none"
                  stroke={col}
                  strokeWidth={1.6}
                  strokeDasharray="6 6"
                  opacity={0.85}
                />
              )}
              <text x={toX(r.cx)} y={toZ(r.cz) + 4} textAnchor="middle" fontSize={22} fontWeight={700} fill={active ? "#fff" : col} opacity={active ? 1 : 0.9}>
                {active ? "◈ " : "◇ "}
              </text>
            </g>
          );
        })}

        {/* route legs */}
        {legs.map((leg) => {
          const status = legStatus(leg.index);
          const col = LEG_RISK_COLOR[leg.risk];
          const a = P(leg.from.x, leg.from.z);
          const b = P(leg.to.x, leg.to.z);
          if (status === "done") {
            const ticks = ticksAlong(leg.from.x, leg.from.z, leg.to.x, leg.to.z, TRAVELED_TICK);
            return (
              <g key={leg.index}>
                <line x1={a.split(",")[0]} y1={a.split(",")[1]} x2={b.split(",")[0]} y2={b.split(",")[1]} stroke={FLOWN} strokeWidth={5} strokeLinecap="round" />
                {ticks.map((t, i) => (
                  <circle key={i} cx={toX(t.x)} cy={toZ(t.z)} r={2.6} fill="#04121c" stroke={FLOWN} strokeWidth={1.2} />
                ))}
              </g>
            );
          }
          if (status === "active") {
            const from = P(leg.from.x, leg.from.z);
            const fx = Number(from.split(",")[0]);
            const fy = Number(from.split(",")[1]);
            const fillX = fx + (Number(b.split(",")[0]) - fx) * (activeFill ?? 0);
            const fillY = fy + (Number(b.split(",")[1]) - fy) * (activeFill ?? 0);
            const f = (activeFill ?? 0) > 0.02 ? `${fx},${fy} ${fillX},${fillY}` : "";
            const flownTicks =
              (activeFill ?? 0) > 0.02
                ? ticksAlong(
                    leg.from.x,
                    leg.from.z,
                    leg.from.x + (leg.to.x - leg.from.x) * (activeFill ?? 1),
                    leg.from.z + (leg.to.z - leg.from.z) * (activeFill ?? 1),
                    TRAVELED_TICK,
                  )
                : [];
            return (
              <g key={leg.index}>
                <line x1={fx} y1={fy} x2={Number(b.split(",")[0])} y2={Number(b.split(",")[1])} stroke={col} strokeWidth={5} strokeLinecap="round" opacity={0.55} />
                {f && <line x1={fx} y1={fy} x2={fillX} y2={fillY} stroke={FLOWN} strokeWidth={5} strokeLinecap="round" />}
                {flownTicks.map((t, i) => (
                  <circle key={i} cx={toX(t.x)} cy={toZ(t.z)} r={2.6} fill="#04121c" stroke={FLOWN} strokeWidth={1.2} />
                ))}
                <line x1={fx} y1={fy} x2={Number(b.split(",")[0])} y2={Number(b.split(",")[1])} stroke="#f0fdff" strokeWidth={1} opacity={0.5} />
              </g>
            );
          }
          const opacity = status === "idle" ? 0.8 : 0.35;
          return (
            <line
              key={leg.index}
              x1={a.split(",")[0]}
              y1={a.split(",")[1]}
              x2={b.split(",")[0]}
              y2={b.split(",")[1]}
              stroke={col}
              strokeWidth={status === "idle" ? 3 : 2}
              strokeDasharray="2 7"
              strokeLinecap="round"
              opacity={opacity}
            />
          );
        })}

        {/* waypoint markers */}
        {waypoints.map((w, i) => {
          const isBase = i === 0 || i === waypoints.length - 1;
          const st = wpStatus(i);
          const col = st === "passed" ? WP_PASSED : st === "current" ? WP_CURRENT : isBase ? WP_BASE : WP_FUTURE;
          const r = st === "current" ? 15 : isBase ? 13 : 10;
          const x = toX(w.x);
          const y = toZ(w.z);
          return (
            <g key={i}>
              {st === "current" && <circle cx={x} cy={y} r={r + 9} fill="none" stroke="#f8fafc" strokeWidth={2.5} opacity={0.85} />}
              {st === "passed" && <text x={x + r - 2} y={y - 3} textAnchor="middle" fontSize={17} fontWeight={700} fill="#34d399" opacity={0.9}>✓</text>}
              <circle cx={x} cy={y} r={r} fill={col} opacity={st === "future" ? 0.95 : 0.9} />
              <circle cx={x} cy={y} r={r - 4.5} fill="none" stroke="rgba(2,6,10,0.65)" strokeWidth={1.4} />
            </g>
          );
        })}

        {/* UAV — heading-aligned arrow (0° = up, matches flight model 0° = −Z).
            Clamped to the frame edge when the aircraft is outside the map. */}
        {(() => {
          const rawX = toX(ux);
          const rawZ = toZ(uz);
          const offX = ux < frame.xLo || ux > frame.xHi;
          const offZ = uz < frame.zLo || uz > frame.zHi;
          const off = offX || offZ;
          const E = 20;
          const cx = Math.max(E, Math.min(VIEW_W - E, rawX));
          const cz2 = Math.max(E, Math.min(VIEW_H - E, rawZ));
          return (
            <g transform={`translate(${cx.toFixed(1)},${cz2.toFixed(1)}) rotate(${heading.toFixed(1)})`} opacity={off ? 0.78 : 1}>
              <circle r={26} fill="rgba(248,250,252,0.10)" />
              {off && <circle r={16} fill="none" stroke="#f8fafc" strokeWidth={1.4} strokeDasharray="5 4" opacity={0.5} />}
              <path
                d="M 0 -22 L 9 14 L 0 8 L -9 14 Z"
                fill="#f8fafc"
                stroke="#0891b2"
                strokeWidth={2.4}
                strokeLinejoin="round"
              />
            </g>
          );
        })()}
      </svg>

      {/* legend strip */}
      <div className="flex items-center gap-2 border-t border-cyan/20 px-2 py-1 text-[7px] tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#e2523f]" />CRIT</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f0a63c]" />CAUT</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#3b82f6]" />INFO</span>
        <span className="ml-auto flex items-center gap-1 text-[#34d399]"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#34d399]" />FLOWN</span>
      </div>
    </div>
  );
}

export default MiniMap;
