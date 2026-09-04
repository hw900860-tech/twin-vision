/**
 * ROUTE PLANNER + LIVE MISSION PROGRESS — 3D overlay.
 *
 * Two jobs in one scene layer:
 *
 * 1. PLANNING (pre-launch) — planned legs are risk-tinted over the terrain and
 *    the region rings (green = clear, amber = caution ring, red = critical).
 *    Click the terrain to append a waypoint, drag markers to re-route around
 *    LOW PRESSURE TROUGHs BEFORE launch.
 *
 * 2. FLIGHT — while a mission is running the same route becomes a live
 *    progress strip: completed legs (and the portion of the active leg already
 *    flown) fill in emerald behind the UAV, the active leg glows bright, and
 *    each waypoint flips to a ✓ PASSED state as the aircraft captures it, so
 *    the out-and-back round trip reads at a glance. After landing back at base
 *    the whole circuit stays drawn as a completed loop until reset.
 */
import { useCallback, useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { useFlightStore, type Biome } from "./flightStore";
import { terrainHeightAt } from "./terrainMath";
import { analyzeLegs, LEG_RISK_COLOR, type LegAnalysis } from "./routePlanner";

const TRAVELED_COLOR = "#34d399"; // emerald — route already flown
const ACTIVE_COLOR = "#f0fdff";   // near-white — the leg being flown right now

function legToPoints(leg: LegAnalysis, biome: Biome): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const dx = leg.to.x - leg.from.x;
  const dz = leg.to.z - leg.from.z;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = leg.from.x + dx * t;
    const z = leg.from.z + dz * t;
    pts.push([x, terrainHeightAt(x, z, biome) + 1.4, z]);
  }
  return pts;
}

/** Sub-segment of a leg from its start up to normalized `t` (the flown part). */
function legPointsTo(leg: LegAnalysis, biome: Biome, upto: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const dx = leg.to.x - leg.from.x;
  const dz = leg.to.z - leg.from.z;
  const dist = Math.hypot(dx, dz) * Math.max(0, Math.min(1, upto));
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * upto;
    const x = leg.from.x + dx * t;
    const z = leg.from.z + dz * t;
    pts.push([x, terrainHeightAt(x, z, biome) + 1.6, z]);
  }
  return pts;
}

/** Progress of the UAV along the active leg (projection, clamped 0..1). */
function progressOnLeg(px: number, pz: number, leg: LegAnalysis): number {
  const ax = leg.from.x, az = leg.from.z;
  const bx = leg.to.x, bz = leg.to.z;
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 <= 0) return 0;
  return Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2));
}

type LegStatus = "idle" | "done" | "active" | "future";

export function RoutePath() {
  const waypoints = useFlightStore((s) => s.waypoints);
  const regions = useFlightStore((s) => s.regions);
  const biome = useFlightStore((s) => s.biome);
  const plannerMode = useFlightStore((s) => s.plannerMode);
  const missionActive = useFlightStore((s) => s.missionActive);
  const missionProgress = useFlightStore((s) => s.missionProgress);
  const uavX = useFlightStore((s) => s.x);
  const uavZ = useFlightStore((s) => s.z);

  const legs = analyzeLegs(waypoints, regions);

  // Waypoint index currently being flown to (-1 when no mission is active).
  const flying = missionActive || (!missionActive && missionProgress >= waypoints.length && waypoints.length > 1);
  const completedTrip = !missionActive && missionProgress >= waypoints.length;
  const targetIdx = flying
    ? Math.min(Math.floor(missionProgress), waypoints.length - 1)
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

  return (
    <group>
      {legs.map((leg) => {
        const status = legStatus(leg.index);
        const color = LEG_RISK_COLOR[leg.risk];
        const pts = legToPoints(leg, biome);
        const donePts = status === "active"
          ? legPointsTo(leg, biome, progressOnLeg(uavX, uavZ, leg))
          : null;

        if (status === "done") {
          // fully travelled — draw the emerald flown overlay only
          return (
            <Line key={leg.index} points={pts} color={TRAVELED_COLOR} lineWidth={2.4} transparent opacity={0.9} depthTest={false} />
          );
        }
        if (status === "active") {
          return (
            <group key={leg.index}>
              {/* bright active leg (whole planned segment, dim under the fill) */}
              <Line points={pts} color={color} lineWidth={3} transparent opacity={0.85} depthTest={false} />
              {/* emerald fill for the part already flown along it */}
              {donePts && donePts.length > 1 && (
                <Line points={donePts} color={TRAVELED_COLOR} lineWidth={3} transparent opacity={1} depthTest={false} />
              )}
              <Line points={pts} color={ACTIVE_COLOR} lineWidth={1} transparent opacity={0.5} depthTest={false} />
            </group>
          );
        }
        // idle (planning / manual flight) or future leg
        const opacity = status === "idle" ? (plannerMode ? 0.95 : 0.55) : 0.35;
        return (
          <group key={leg.index}>
            <Line points={pts} color={color} lineWidth={status === "idle" ? (plannerMode ? 2.5 : 1.4) : 1.1} transparent opacity={opacity} depthTest={false} />
            {/* region-boundary dots only make sense on legs not yet flown */}
            {status === "future" &&
              leg.crossings.map((c, ci) => (
                <CrossingDot
                  key={ci}
                  leg={leg}
                  t={c.entryT}
                  color={LEG_RISK_COLOR[c.region.severity === "critical" ? "critical" : "caution"]}
                  biome={biome}
                />
              ))}
          </group>
        );
      })}

      {waypoints.map((wp, i) => (
        <WaypointMarker
          key={`${wp.x.toFixed(1)}_${wp.z.toFixed(1)}_${i}`}
          index={i}
          x={wp.x}
          z={wp.z}
          label={wp.label}
          total={waypoints.length}
          status={wpStatus(i)}
        />
      ))}
    </group>
  );
}

function CrossingDot({ leg, t, color, biome }: { leg: LegAnalysis; t: number; color: string; biome: Biome }) {
  const x = leg.from.x + (leg.to.x - leg.from.x) * t;
  const z = leg.from.z + (leg.to.z - leg.from.z) * t;
  return (
    <mesh position={[x, terrainHeightAt(x, z, biome) + 1.6, z]}>
      <sphereGeometry args={[0.5, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} depthTest={false} />
    </mesh>
  );
}

function WaypointMarker({
  index, x, z, label, total, status,
}: {
  index: number;
  x: number;
  z: number;
  label: string;
  total: number;
  status: "passed" | "current" | "future";
}) {
  const biome = useFlightStore((s) => s.biome);
  const gy = terrainHeightAt(x, z, biome) + 2.4;
  const isBase = index === 0 || index === total - 1;

  if (status === "passed") {
    // Captured waypoint: dim + checkmark — the round trip is visibly building.
    return (
      <group position={[x, gy, z]}>
        <mesh>
          <sphereGeometry args={[isBase ? 0.9 : 0.7, 10, 10]} />
          <meshBasicMaterial color="#3f4a55" transparent opacity={0.85} depthTest={false} />
        </mesh>
        <Html center distanceFactor={70} position={[0, 2.0, 0]} zIndexRange={[100, 0]}>
          <div
            style={{
              color: "#64748b",
              background: "rgba(4,10,18,0.6)",
              border: "1px solid #475569",
              borderRadius: 3,
              padding: "1px 5px",
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: 1,
              whiteSpace: "nowrap",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            ✓ {label}
          </div>
        </Html>
      </group>
    );
  }

  const isCurrent = status === "current";
  const color = isBase ? (isCurrent ? "#ffffff" : "#22c55e") : isCurrent ? "#ffffff" : "#22d3ee";
  return (
    <group position={[x, gy, z]}>
      <mesh>
        <sphereGeometry args={[isCurrent ? 1.5 : isBase ? 1.1 : 0.9, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.98} depthTest={false} />
      </mesh>
      {isCurrent && (
        <mesh>
          <ringGeometry args={[1.7, 2.4, 24]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.85} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <Html center distanceFactor={70} position={[0, 2.4, 0]} zIndexRange={[100, 0]}>
        <div
          className={isCurrent ? "animate-pulse" : ""}
          style={{
            color,
            background: isCurrent ? "rgba(12,18,28,0.9)" : "rgba(4,10,18,0.75)",
            border: `1px solid ${color}`,
            borderRadius: 3,
            padding: "1px 5px",
            fontSize: isCurrent ? 10 : 9,
            fontWeight: 700,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {isCurrent ? "▶ " : isBase ? "● " : ""}{label}
        </div>
      </Html>
    </group>
  );
}

/**
 * Interaction layer — owns the drag state and the camera ray.
 * Rendered inside the Canvas once; inactive unless planner mode is on.
 */
export function RoutePlannerInteraction() {
  const { camera, gl } = useThree();
  const plannerMode = useFlightStore((s) => s.plannerMode);
  const missionActive = useFlightStore((s) => s.missionActive);
  const dragRef = useRef<{ index: number; y: number } | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const hit = useRef(new THREE.Vector3());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  const startDrag = useCallback(
    (index: number, y: number) => {
      dragRef.current = { index, y };
      (gl.domElement as HTMLElement).style.cursor = "grabbing";
    },
    [gl],
  );

  useEffect(() => {
    if (!plannerMode || missionActive) return;

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.current.setFromCamera(ndc.current, camera);
      plane.current.constant = dragRef.current.y;
      if (raycaster.current.ray.intersectPlane(plane.current, hit.current)) {
        useFlightStore.getState().moveWaypoint(dragRef.current.index, hit.current.x, hit.current.z);
      }
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      (gl.domElement as HTMLElement).style.cursor = "crosshair";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [plannerMode, missionActive, camera, gl]);

  // Cursor affordance
  useEffect(() => {
    (gl.domElement as HTMLElement).style.cursor = plannerMode ? "crosshair" : "grab";
  }, [plannerMode, gl]);

  const waypoints = useFlightStore((s) => s.waypoints);
  const biome = useFlightStore((s) => s.biome);

  if (!plannerMode || missionActive) return null;

  // Transparent drag targets over each marker. Terrain clicks to append
  // waypoints are handled on the terrain chunk mesh (terrainPointerDown).
  return (
    <group>
      {waypoints.map((wp, i) => {
        const gy = terrainHeightAt(wp.x, wp.z, biome) + 2.4;
        return (
          <mesh
            key={i}
            position={[wp.x, gy, wp.z]}
            onPointerDown={(e) => {
              e.stopPropagation();
              startDrag(i, gy);
            }}
          >
            <sphereGeometry args={[2.4, 10, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Terrain click handler attached to the chunk mesh — see Terrain.tsx. */
export function terrainPointerDown(e: { point: THREE.Vector3; stopPropagation: () => void }) {
  const s = useFlightStore.getState();
  if (!s.plannerMode || s.missionActive) return;
  e.stopPropagation();
  s.addWaypoint(e.point.x, e.point.z);
}
