import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useFlightStore } from '../flight-sim/flightStore';

const CYAN = '#06b6d4';
const AMBER = '#f59e0b';
const CRITICAL = '#ef4444';

/**
 * Slow showcase idle spin (rad/s). Both the real-time cinematic and the landing
 * hero drive the engine from this single deterministic clock, so the rotation is
 * bit-for-bit continuous across the video→twin handoff — the engine never stops,
 * jumps or restarts when one scene hands off to the next.
 */
export const ENGINE_SPIN_RATE = 0.12;
let spinStartAbs = 0;
/** Deterministic engine angle in radians for the current wall-clock time. */
export function engineSpinAngle(): number {
  if (!spinStartAbs) spinStartAbs = performance.now();
  return ENGINE_SPIN_RATE * ((performance.now() - spinStartAbs) / 1000);
}

// Cinematic X-ray reveal palette — the video hands off with the engine in its
// X-ray state (translucent cyan wireframe), so the twin must open in the SAME
// look and only then resolve into the physical engine.
const XRAY_LINE = new THREE.Color('#155e75');
const XRAY_GLOW = new THREE.Color('#22d3ee');

export interface PartHighlights {
  cyl1CHT: number;
  cyl2CHT: number;
  cyl3CHT: number;
  cyl4CHT: number;
  egt: number;
  rpm: number;
  vibration: number;
  oilTemp: number;
  health: number;
}

const EMPTY_HIGHLIGHTS: PartHighlights = {
  cyl1CHT: 0, cyl2CHT: 0, cyl3CHT: 0, cyl4CHT: 0,
  egt: 0, rpm: 0, vibration: 0, oilTemp: 0, health: 1,
};

function tempToColor(temp: number, warn = 170, crit = 200): string {
  if (temp > crit) return CRITICAL;
  if (temp > warn) return AMBER;
  return CYAN;
}

export const ZONES = [
  {
    id: 'cylhead',
    name: 'CYLINDER HEAD (ROTAX RED)',
    sub: 'Iconic Red Rotax Valve Covers',
    center: [-0.25, 0.35, 0.1] as [number, number, number],
    dir: [-0.6, 0.9, 0.2] as [number, number, number], // Tightly spaced dismantle vector
    glow: '#ef4444',
    val: (h: PartHighlights) => `${Math.max(h.cyl1CHT, h.cyl2CHT, h.cyl3CHT, h.cyl4CHT).toFixed(0)}°C CHT`,
    valC: (h: PartHighlights) => tempToColor(Math.max(h.cyl1CHT, h.cyl2CHT, h.cyl3CHT, h.cyl4CHT)),
  },
  {
    id: 'exhaust',
    name: 'EXHAUST MANIFOLD',
    sub: 'Stainless Steel Exhaust Pipe',
    center: [-0.45, 0.1, -0.2] as [number, number, number],
    dir: [-0.9, 0.2, -0.4] as [number, number, number],
    glow: AMBER,
    val: (h: PartHighlights) => `${h.egt.toFixed(0)}°C EGT`,
    valC: (h: PartHighlights) => tempToColor(h.egt, 700, 780),
  },
  {
    id: 'turbo',
    name: 'INTAKE / TURBO & CARBS',
    sub: 'Silver Aluminum Manifold',
    center: [0.45, 0.2, 0.1] as [number, number, number],
    dir: [0.9, 0.25, 0.3] as [number, number, number],
    glow: '#06b6d4',
    val: (h: PartHighlights) => `${h.rpm.toFixed(0)} RPM`,
    valC: (h: PartHighlights) => h.rpm > 3500 ? AMBER : CYAN,
  },
  {
    id: 'crankcase',
    name: 'CRANKCASE BLOCK',
    sub: 'Cast Aluminum Engine Core',
    center: [0, 0, 0] as [number, number, number],
    dir: [0, -0.02, 0] as [number, number, number],
    glow: '#94a3b8',
    val: (h: PartHighlights) => `${(h.health * 100).toFixed(0)}% HEALTH`,
    valC: (h: PartHighlights) => h.health > 0.8 ? CYAN : h.health > 0.5 ? AMBER : CRITICAL,
  },
  {
    id: 'oilsump',
    name: 'OIL SUMP & FILTER',
    sub: 'Yellow Cap & Lower Sump',
    center: [0, -0.35, 0] as [number, number, number],
    dir: [0, -0.9, 0] as [number, number, number],
    glow: '#eab308',
    val: (h: PartHighlights) => `${h.oilTemp.toFixed(0)}°C OIL`,
    valC: (h: PartHighlights) => h.oilTemp > 110 ? AMBER : CYAN,
  },
  {
    id: 'propflange',
    name: 'GEARBOX & PROP FLANGE',
    sub: 'Machined Gearbox & Flange',
    center: [0, 0.1, 0.55] as [number, number, number],
    dir: [0, 0.15, 1.0] as [number, number, number],
    glow: '#f8fafc',
    val: (h: PartHighlights) => `${h.vibration.toFixed(2)} m/s² VIB`,
    valC: (h: PartHighlights) => h.vibration > 1.5 ? CRITICAL : h.vibration > 0.9 ? AMBER : CYAN,
  },
];

/* ------------------------------------------------------------------ */
/* REAL-ENGINE MATERIAL SYSTEM                                         */
/*                                                                     */
/* The GLB ships as ONE merged mesh with a single flat white material, */
/* so components are recovered by classifying every triangle by where  */
/* it sits on the engine and how its face points, then painting it     */
/* with the physical material that part would carry (Rotax 914 look):  */
/*                                                                     */
/*   red       — glossy powder-coated rocker-cover lumps on top        */
/*   head      — machined darker alloy between/below the covers        */
/*   crankcase — cast aluminium core (machined top decks)              */
/*   intake    — brighter machined silver (carbs / turbo / plenum)     */
/*   exhaust   — heat-darkened powder-coated steel                     */
/*   sump      — dark graphite cast                                    */
/*   prop      — black gearbox housing + machined flange (Rotax front) */
/*                                                                     */
/* Surface classes (top / wall / shade, from the face normal) pick the */
/* roughness and base brightness: up-facing machined decks read        */
/* brighter & smoother, vertical cast walls mid, down-facing/under     */
/* surfaces darker & rougher — like a real engine under workshop light.*/
/* Baked per-face vertex tinting adds jitter, crevice darkening (faces */
/* sitting deep under the local top surface are pre-shadowed) and      */
/* underside occlusion, giving manufactured texture without textures.  */
/* ------------------------------------------------------------------ */

type FaceClass = 'top' | 'wall' | 'shade';

interface FamilySpec {
  color: string;
  metalness: number;
  env: number;
  rough: Record<FaceClass, number>;
}

const MAT_FAMILIES: Record<string, FamilySpec> = {
  red:       { color: '#bf1624', metalness: 0.10, env: 0.5,  rough: { top: 0.30, wall: 0.38, shade: 0.55 } }, // glossy ROTAX covers
  head:      { color: '#767d84', metalness: 0.85, env: 0.55, rough: { top: 0.42, wall: 0.52, shade: 0.70 } }, // machined head/deck alloy
  crankcase: { color: '#8c939a', metalness: 0.90, env: 0.55, rough: { top: 0.30, wall: 0.46, shade: 0.66 } }, // cast aluminium case
  intake:    { color: '#aeb4bb', metalness: 0.95, env: 0.75, rough: { top: 0.24, wall: 0.38, shade: 0.58 } }, // bright alloy intake/carbs
  exhaust:   { color: '#474c53', metalness: 0.85, env: 0.5,  rough: { top: 0.50, wall: 0.62, shade: 0.78 } }, // heat-darkened steel
  sump:      { color: '#30343a', metalness: 0.45, env: 0.35, rough: { top: 0.60, wall: 0.72, shade: 0.84 } }, // graphite sump
  prop:      { color: '#3b4047', metalness: 0.80, env: 0.6,  rough: { top: 0.26, wall: 0.40, shade: 0.58 } }, // black gearbox / machined flange
};

const ZONE_FAMILY: Record<string, string> = {
  crankcase: 'crankcase',
  exhaust: 'exhaust',
  turbo: 'intake',
  oilsump: 'sump',
  propflange: 'prop',
};

type BuiltItem = { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial };
type BuiltZone = { zone: typeof ZONES[number]; items: BuiltItem[] };

/** Deterministic per-face tonal jitter (no visible pattern, breaks up flat paint). */
function triJitter(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function buildEngineAssemblies(scene: THREE.Group): BuiltZone[] {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((child) => { if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh); });
  if (meshes.length === 0) return [];

  const srcMesh = meshes[0]!;
  const geo = srcMesh.geometry.index ? srcMesh.geometry.toNonIndexed() : srcMesh.geometry.clone();
  const pos = geo.getAttribute('position');
  if (!pos) return [];

  const bounds = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const size = bounds.getSize(new THREE.Vector3());
  const minX = bounds.min.x, minY = bounds.min.y, minZ = bounds.min.z;
  const sx = Math.max(size.x, 1e-3), sy = Math.max(size.y, 1e-3), sz = Math.max(size.z, 1e-3);

  // Top-surface height field: tallest up-facing surface per (x,z) cell. Used to
  // (a) find the cover lumps that get the red paint and (b) bake crevice
  // shading — faces sitting well below the local ceiling are pre-shadowed.
  const GW = 110, GZ = 160;
  const ceilH = new Float32Array(GW * GZ).fill(-1e9);
  const cellOf = (cx: number, cz: number) => {
    const gx = Math.min(GW - 1, Math.max(0, (((cx - minX) / sx) * GW) | 0));
    const gz = Math.min(GZ - 1, Math.max(0, (((cz - minZ) / sz) * GZ) | 0));
    return gz * GW + gx;
  };

  const nTri = pos.count / 3;

  // Pass 1 — face normals + ceiling field.
  for (let i = 0; i < nTri; i++) {
    const i0 = i * 3;
    const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
    const bx = pos.getX(i0 + 1), by = pos.getY(i0 + 1), bz = pos.getZ(i0 + 1);
    const dx = pos.getX(i0 + 2), dy = pos.getY(i0 + 2), dz = pos.getZ(i0 + 2);
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = dx - ax, fy = dy - ay, fz = dz - az;
    let nyN = ez * fx - ex * fz;
    const L = Math.hypot(ey * fz - ez * fy, nyN, ex * fy - ey * fx);
    if (L < 1e-12) continue;
    nyN /= L;
    if (nyN > 0.18) {
      const fcy = (ay + by + dy) / 3;
      const ci = cellOf((ax + bx + dx) / 3, (az + bz + dz) / 3);
      if (fcy > (ceilH[ci] ?? -1e9)) ceilH[ci] = fcy;
    }
  }

  // Crown map: cells whose surface is near the very top of the engine — the
  // red valve-cover lumps. Dilate one cell (still ≥ 0.80 height) to catch the
  // cover walls/slopes; deep valleys between parts stay unpainted metal.
  const crown = new Uint8Array(GW * GZ);
  const crownD = new Uint8Array(GW * GZ);
  for (let ci = 0; ci < GW * GZ; ci++) {
    const ch = ceilH[ci] ?? -1e9;
    if ((ch - minY) / sy >= 0.865) crown[ci] = 1;
  }
  for (let gz = 0; gz < GZ; gz++) {
    for (let gx = 0; gx < GW; gx++) {
      const ci = gz * GW + gx;
      if (crown[ci]) { crownD[ci] = 1; continue; }
      const ch = ceilH[ci] ?? -1e9;
      if ((ch - minY) / sy < 0.83) continue;
      let near = false;
      for (let dz = -1; dz <= 1 && !near; dz++) {
        for (let dg = -1; dg <= 1; dg++) {
          const gxx = gx + dg, gzz = gz + dz;
          if (gxx < 0 || gxx >= GW || gzz < 0 || gzz >= GZ) continue;
          if (crown[gzz * GW + gxx]) { near = true; break; }
        }
      }
      if (near) crownD[ci] = 1;
    }
  }

  // Pass 2 — classify every face into (zone, family, surface class) and
  // accumulate its vertices + a baked relative-tone per vertex.
  const buckets: Record<string, Record<string, { v: number[]; r: number[] }>> = {};
  const zoneIdOf: Record<string, string> = {};
  ZONES.forEach((z) => { zoneIdOf[z.name] = z.id; });

  for (let i = 0; i < nTri; i++) {
    const i0 = i * 3;
    const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
    const bx = pos.getX(i0 + 1), by = pos.getY(i0 + 1), bz = pos.getZ(i0 + 1);
    const dx = pos.getX(i0 + 2), dy = pos.getY(i0 + 2), dz = pos.getZ(i0 + 2);
    const fcx = (ax + bx + dx) / 3, fcy = (ay + by + dy) / 3, fcz = (az + bz + dz) / 3;
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = dx - ax, fy = dy - ay, fz = dz - az;
    let nxN = ey * fz - ez * fy;
    let nyN = ez * fx - ex * fz;
    let nzN = ex * fy - ey * fx;
    const L = Math.hypot(nxN, nyN, nzN);
    if (L < 1e-12) continue;
    nxN /= L; nyN /= L; nzN /= L;

    const nx = (fcx - minX) / sx - 0.5;
    const ny = (fcy - minY) / sy;
    const nz = (fcz - minZ) / sz - 0.5;

    // Zone boundaries are identical to the legacy 6-subassembly split, so
    // EXPLODE / ASSEMBLE, JARVIS picking and per-zone highlighting are
    // unchanged — only the surfaces inside each zone gained real materials.
    let zoneId = 'crankcase';
    if (ny > 0.62 && nx < 0.15) zoneId = 'cylhead';
    else if (ny < 0.22) zoneId = 'oilsump';
    else if (nz > 0.35) zoneId = 'propflange';
    else if (nx > 0.28) zoneId = 'turbo';
    else if (nx < -0.28 || nz < -0.32) zoneId = 'exhaust';

    let family: string;
    if (zoneId === 'cylhead') family = crownD[cellOf(fcx, fcz)] ? 'red' : 'head';
    else family = ZONE_FAMILY[zoneId]!;

    const cls: FaceClass = nyN > 0.35 ? 'top' : nyN < -0.3 ? 'shade' : 'wall';

    // Relative tone: surface class + crevice pre-shadow + subtle jitter.
    let rel = cls === 'top' ? 1.0 : cls === 'wall' ? 0.95 : 0.89;
    const ceiling = ceilH[cellOf(fcx, fcz)] ?? -1e9;
    if (ceiling > -1e8) {
      const depth = Math.max(0, ceiling - fcy);
      rel *= 1 - Math.min(0.22, 0.22 * (depth / (sy * 0.55)));
    }
    rel *= 0.985 + 0.03 * triJitter(i);
    if (rel < 0.7) rel = 0.7;
    if (rel > 1.05) rel = 1.05;

    const key = `${family}|${cls}`;
    let zoneBucket = buckets[zoneId];
    if (!zoneBucket) { zoneBucket = {}; buckets[zoneId] = zoneBucket; }
    let group = zoneBucket[key];
    if (!group) { group = { v: [], r: [] }; zoneBucket[key] = group; }
    for (let v = 0; v < 3; v++) {
      const idx = i0 + v;
      group.v.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
      group.r.push(rel, rel, rel);
    }
  }

  const out: BuiltZone[] = [];
  for (const zone of ZONES) {
    const zoneBucket = buckets[zone.id];
    if (!zoneBucket) continue;
    const items: BuiltItem[] = [];
    for (const [key, group] of Object.entries(zoneBucket)) {
      const idx = key.indexOf('|');
      const family = key.slice(0, idx);
      const cls = key.slice(idx + 1) as FaceClass;
      const spec = MAT_FAMILIES[family];
      if (!spec) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(group.v, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(group.r, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        // Base albedo lives on material.color; the baked per-vertex 'color'
        // attribute is a RELATIVE multiplier (±roughly 5%, crevices −22%),
        // so dynamic colour blends (X-ray etc.) stay proportional.
        color: new THREE.Color(spec.color),
        roughness: spec.rough[cls],
        metalness: spec.metalness,
        envMapIntensity: spec.env,
        vertexColors: true,
        side: THREE.DoubleSide,
        // Opaque by default — translucency is switched on only for X-ray /
        // selection-dimming states. Always-transparent meshes render as a
        // glassy wireframe-ish mass and hide the physical colours underneath.
        transparent: false,
        opacity: 1.0,
        emissive: new THREE.Color('#000000'),
        emissiveIntensity: 0,
      });
      // Physical base colour, kept for the X-ray → physical resolution blend.
      material.userData['baseColor'] = new THREE.Color(spec.color);
      material.userData['family'] = family;
      items.push({ geometry, material });
    }
    if (items.length) out.push({ zone, items });
  }
  return out;
}

export function EngineModel({
  spin = true,
  fault = 0,
  highlights,
  exploded = false,
  showLabels = true,
  wireframe = false,
  physicalTone = false,
  xrayReveal = 0,
  explodeAmount = 1.0,
  modelScale = 1,
  modelPosition = [0, -0.35, 0],
  onSelectZone,
  selectedZone,
  rotationSync,
  macroPose: _macroPose,
}: {
  spin?: boolean;
  fault?: number;
  highlights?: PartHighlights;
  exploded?: boolean;
  showLabels?: boolean;
  wireframe?: boolean;
  physicalTone?: boolean;
  /** 1 = engine rendered in the cinematic's X-ray look … 0 = physical engine. Only meaningful with physicalTone. */
  xrayReveal?: number;
  explodeAmount?: number;
  modelScale?: number;
  modelPosition?: [number, number, number];
  onSelectZone?: (zoneName: string | null) => void;
  selectedZone?: string | null;
  /**
   * Drives the showcase rotation from an external deterministic clock (see
   * `engineSpinAngle`) so the angle is continuous across scenes. When provided,
   * the engine rotates around its visual centre to exactly this angle each
   * frame; `spin` is ignored.
   */
  rotationSync?: { angle: number };
  /**
   * Cinematic handoff pose — the macro twin opens TILTED to match the exact
   * camera stance of the video's final engine frame (the clip looks down on the
   * engine from slightly right of its axis, which is why its red valve-cover
   * band and bright case read at frame centre rather than on top). `blend`
   * scales the pose from 1 (full match at the cut) to 0 (the twin's natural
   * upright resting pose once it has docked). Applied on the outer group so the
   * showcase spin on the motor is unaffected.
   */
  macroPose?: { yawDeg: number; pitchDeg: number; blend: number };
}) {
  const group = useRef<THREE.Group>(null);
  const motorRef = useRef<THREE.Group>(null);
  const macroPose = _macroPose;
  const zoneRefs = useRef<Map<string, THREE.Group>>(new Map());
  const explodeP = useRef(0);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const { scene } = useGLTF('/engine.glb') as { scene: THREE.Group };
  const h = highlights ?? EMPTY_HIGHLIGHTS;

  const vizMode = useFlightStore((s) => s.vizMode);
  const componentStress = useFlightStore((s) => s.componentStress);
  const faults = useFlightStore((s) => s.faults);
  const engineDecision = useFlightStore((s) => s.engineDecision);
  const setFocusedComponent = useFlightStore((s) => s.setFocusedComponent);

  // Handoff pose (radians). Euler order XYZ on the outer group composes
  // Rx(pitch)·Ry(yaw), exactly the stance measured against the video's final
  // engine frame. Fades out with `blend` so the twin rights itself as it glides
  // centre → right and lands at the familiar upright hero pose.
  const poseRotation = useMemo<[number, number, number]>(() => {
    const b = macroPose ? Math.min(1, Math.max(0, macroPose.blend)) : 0;
    return [
      (macroPose?.pitchDeg ?? 0) * (Math.PI / 180) * b,
      (macroPose?.yawDeg ?? 0) * (Math.PI / 180) * b,
      0,
    ];
  }, [macroPose?.pitchDeg, macroPose?.yawDeg, macroPose?.blend]);

  const zoneAssemblies = useMemo(() => buildEngineAssemblies(scene), [scene]);

  useEffect(() => () => {
    zoneAssemblies.forEach((za) => {
      za.items.forEach((it) => {
        it.geometry.dispose();
        it.material.dispose();
      });
    });
  }, [zoneAssemblies]);

  // Smooth 60 FPS animation loop — dynamic pressure/thermal/vibration heatmaps & bearing vibration
  useFrame((_, delta) => {
    const target = exploded ? explodeAmount : 0;
    explodeP.current += (target - explodeP.current) * Math.min(1, delta * 6);
    const p = explodeP.current;
    const t = Date.now() / 1000;
    // Reusable colour temps for the physical↔X-ray blend (avoid per-frame churn).
    const physGlow = new THREE.Color();
    const blendTmp = new THREE.Color();

    // Showcase rotation. With `rotationSync` (deterministic shared clock) we
    // snap to that exact angle so the spin is continuous across scenes. Otherwise
    // accumulate on the motor group — NOT the outer group — so the engine spins
    // around its true visual centre (the outer group carries the model offset).
    if (rotationSync) {
      if (motorRef.current) motorRef.current.rotation.y = rotationSync.angle;
    } else if (spin && motorRef.current) {
      motorRef.current.rotation.y += delta * ENGINE_SPIN_RATE;
    }

    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

    zoneAssemblies.forEach((za) => {
      const zgroup = zoneRefs.current.get(za.zone.name);
      if (!zgroup) return;
      const mats = za.items.map((it) => it.material);

      // Position lerping for Exploded / Dismantle mode
      const dir = new THREE.Vector3(...za.zone.dir);
      zgroup.position.copy(dir).multiplyScalar(ease);

      // Localized Bearing Spall Vibration Pulse
      if (za.zone.id === 'crankcase' && faults.bearingFail) {
        const pulse = Math.sin(t * 30) * 0.025;
        zgroup.position.x += pulse;
        zgroup.position.y += pulse;
      }

      // Compute stress value for this component
      let stress = 0.2;
      let mlRisk = 0;
      if (za.zone.id === 'cylhead') {
        stress = Math.max(...componentStress.cylinders);
        mlRisk = engineDecision?.subsystems?.cylinderHead ? 1 - engineDecision.subsystems.cylinderHead.health / 100 : 0;
      } else if (za.zone.id === 'exhaust') {
        stress = Math.max(...componentStress.exhaustRunners);
        mlRisk = engineDecision?.subsystems?.exhaust ? 1 - engineDecision.subsystems.exhaust.health / 100 : 0;
      } else if (za.zone.id === 'turbo') {
        stress = componentStress.turbo;
        mlRisk = engineDecision?.subsystems?.turboIntake ? 1 - engineDecision.subsystems.turboIntake.health / 100 : 0;
      } else if (za.zone.id === 'crankcase') {
        stress = componentStress.crankcase;
        mlRisk = engineDecision?.subsystems?.crankcase ? 1 - engineDecision.subsystems.crankcase.health / 100 : 0;
      } else if (za.zone.id === 'oilsump') {
        stress = componentStress.oilSystem;
        mlRisk = engineDecision?.subsystems?.oilSump ? 1 - engineDecision.subsystems.oilSump.health / 100 : 0;
      } else if (za.zone.id === 'propflange') {
        stress = componentStress.gearbox;
        mlRisk = engineDecision?.subsystems?.propGearbox ? 1 - engineDecision.subsystems.propGearbox.health / 100 : 0;
      }

      const isHovered = hoveredZone === za.zone.name;
      const isSelected = selectedZone === za.zone.name;

      if (vizMode === 'XRAY') {
        for (const m of mats) {
          m.wireframe = wireframe || true;
          m.opacity = isSelected || isHovered ? 0.85 : 0.22;
          m.emissive.set(isSelected || isHovered ? '#06b6d4' : '#38bdf8');
          m.emissiveIntensity = isSelected || isHovered ? 0.8 : 0.25;
        }
      } else if (vizMode === 'PRESSURE' || vizMode === 'THERMAL' || vizMode === 'VIBRATION' || vizMode === 'ML_RISK') {
        const valueToMap = vizMode === 'ML_RISK' ? mlRisk : stress;
        const heatColor = getStressColor(valueToMap);
        for (const m of mats) {
          m.wireframe = wireframe;
          m.opacity = selectedZone ? (isSelected ? 1.0 : 0.25) : 1.0;
          m.emissive.copy(heatColor);
          m.emissiveIntensity = 0.35 + valueToMap * 0.55 + (isHovered ? 0.2 : 0);
        }
      } else if (physicalTone) {
        // PHYSICAL-TONE (landing twin) — real Rotax colours; emissive is
        // reserved for hover/selection and genuinely extreme load.
        const heatColor = getStressColor(stress);
        let physOpacity = selectedZone ? (isSelected ? 1.0 : 0.3) : 1.0;
        physGlow.set('#000000');
        let glowIntensity = 0;
        if (isSelected) {
          physGlow.set('#06b6d4');
          glowIntensity = 0.45;
        } else if (isHovered) {
          physGlow.set('#06b6d4');
          glowIntensity = 0.22;
        } else if (stress > 0.7) {
          physGlow.copy(heatColor);
          glowIntensity = Math.min(0.55, (stress - 0.55) * 0.9);
        }

        // X-RAY REVEAL blend: the cinematic ends with the engine in its X-ray
        // state — the twin must open in that SAME look (translucent cyan
        // wireframe) and only then resolve into the physical engine, otherwise
        // the handoff reads as a different object. k: 1 = full X-ray, 0 =
        // physical. Wireframe switches off at the half point while opacity +
        // emissive keep blending, so the resolve reads as a solidification.
        const k = Math.min(1, Math.max(0, xrayReveal));
        for (const m of mats) {
          const baseColor =
            (m.userData['baseColor'] as THREE.Color | undefined) ??
            new THREE.Color('#8c939a');
          if (k > 0.0001) {
            blendTmp.copy(baseColor).lerp(XRAY_LINE, k);
            m.color.copy(blendTmp);
            m.opacity = physOpacity * (1 - k) + 0.5 * k;
            m.wireframe = k > 0.5;
            blendTmp.copy(physGlow).lerp(XRAY_GLOW, k);
            m.emissive.copy(blendTmp);
            m.emissiveIntensity = glowIntensity * (1 - k) + 1.15 * k;
          } else {
            m.color.copy(baseColor);
            m.opacity = physOpacity;
            m.wireframe = false;
            m.emissive.copy(physGlow);
            m.emissiveIntensity = glowIntensity;
          }
        }
      } else {
        // NORMAL mode — Dynamic stress highlight driven by Throttle, Rudder & Flight Physics
        const heatColor = getStressColor(stress);
        for (const m of mats) {
          m.wireframe = wireframe;
          m.opacity = selectedZone ? (isSelected ? 1.0 : 0.3) : 1.0;
          if (isSelected) {
            m.emissive.set('#06b6d4');
            m.emissiveIntensity = 0.5;
          } else if (isHovered) {
            m.emissive.set('#06b6d4');
            m.emissiveIntensity = 0.35;
          } else if (stress > 0.22) {
            // Dynamically glow to visually highlight parts experiencing high load from Throttle & Rudder!
            m.emissive.copy(heatColor);
            m.emissiveIntensity = Math.min(0.95, (stress - 0.18) * 1.15);
          } else {
            m.emissive.set('#000000');
            m.emissiveIntensity = 0;
          }
        }
      }

      for (const m of mats) {
        // Follow opacity with real transparency. Opaque by default — only the
        // translucent X-ray / selection-dimming states should alpha-blend (this
        // also stops internal geometry ghosting through and washing out colour).
        const wantTransparent = m.opacity < 0.999;
        if (m.transparent !== wantTransparent) {
          m.transparent = wantTransparent;
          m.needsUpdate = true;
        }
        m.depthWrite = !wantTransparent;
      }
    });

    motorRef.current?.scale.setScalar(3 + p * 0.08);
  });

  return (
    <group ref={group} position={modelPosition} scale={modelScale} rotation={poseRotation}>
      <group ref={motorRef} scale={[3, 3, 3]} position={[0, 0.1, 0.5]}>
        {/* Render 6 physical sub-assemblies, each split into the real material
            surfaces that make up that component. */}
        {zoneAssemblies.map((za) => (
          <group
            key={za.zone.name}
            ref={(g) => {
              if (g) zoneRefs.current.set(za.zone.name, g);
            }}
          >
            {za.items.map((it, k) => (
              <mesh
                key={k}
                geometry={it.geometry}
                material={it.material}
                castShadow
                receiveShadow
                onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                  e.stopPropagation();
                  setHoveredZone(za.zone.name);
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e: ThreeEvent<PointerEvent>) => {
                  e.stopPropagation();
                  setHoveredZone(null);
                  document.body.style.cursor = 'auto';
                }}
                onClick={(e: ThreeEvent<MouseEvent>) => {
                  e.stopPropagation();
                  onSelectZone?.(za.zone.name);
                  setFocusedComponent(za.zone.name);
                }}
              />
            ))}
          </group>
        ))}
      </group>

      {/* Holographic 3D HUD Labels */}
      {showLabels && (
        <group scale={[3, 3, 3]} position={[0, 0.1, 0.5]}>
          {ZONES.map((zone) => (
            <ZoneLabel
              key={zone.name}
              zone={zone}
              h={h}
              explodeP={explodeP}
              isHovered={hoveredZone === zone.name}
              isSelected={selectedZone === zone.name}
              onSelect={() => {
                onSelectZone?.(zone.name);
                setFocusedComponent(zone.name);
              }}
              onHover={(isH) => setHoveredZone(isH ? zone.name : null)}
            />
          ))}
        </group>
      )}
    </group>
  );
}

function getStressColor(stress: number): THREE.Color {
  if (stress > 0.72) return new THREE.Color('#ef4444');
  if (stress > 0.48) return new THREE.Color('#f97316');
  if (stress > 0.28) return new THREE.Color('#eab308');
  if (stress > 0.14) return new THREE.Color('#10b981');
  return new THREE.Color('#06b6d4');
}

function ZoneLabel({
  zone,
  h,
  explodeP,
  isHovered,
}: {
  zone: typeof ZONES[number];
  h: PartHighlights;
  explodeP: React.MutableRefObject<number>;
  isHovered: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
}) {
  const componentStress = useFlightStore((s) => s.componentStress);
  if (!isHovered) return null;

  const p = explodeP.current;
  const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const dir = new THREE.Vector3(...zone.dir);
  const baseCenter = new THREE.Vector3(...zone.center);
  const labelPos = baseCenter.clone().add(dir.clone().multiplyScalar(ease));
  labelPos.y += 0.20;

  let stress = 0.2;
  if (zone.id === 'cylhead') stress = Math.max(...componentStress.cylinders);
  else if (zone.id === 'exhaust') stress = Math.max(...componentStress.exhaustRunners);
  else if (zone.id === 'turbo') stress = componentStress.turbo;
  else if (zone.id === 'crankcase') stress = componentStress.crankcase;
  else if (zone.id === 'oilsump') stress = componentStress.oilSystem;
  else if (zone.id === 'propflange') stress = componentStress.gearbox;

  const pct = Math.round(stress * 100);
  const glowColor = pct > 85 ? '#ef4444' : pct > 70 ? '#f97316' : '#06b6d4';

  return (
    <Html position={[labelPos.x, labelPos.y, labelPos.z]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
      <div className="bg-[#05080c]/95 border border-cyan/70 px-2.5 py-1 rounded text-[9px] font-mono text-cyan shadow-xl backdrop-blur-md whitespace-nowrap flex items-center gap-2">
        <span className="font-bold tracking-wider">{zone.name}</span>
        <span className="font-bold" style={{ color: glowColor }}>{pct}% LOAD</span>
      </div>
    </Html>
  );
}

useGLTF.preload('/engine.glb');
