import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useFlightStore } from '../flight-sim/flightStore';

const CYAN = '#06b6d4';
const AMBER = '#f59e0b';
const CRITICAL = '#ef4444';

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

type Zone6Mesh = {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  zone: typeof ZONES[number];
};

function create6SeparateSubAssemblies(scene: THREE.Group): Zone6Mesh[] {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((child) => { if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh); });
  if (meshes.length === 0) return [];

  const srcMesh = meshes[0];
  const geo = srcMesh.geometry.index ? srcMesh.geometry.toNonIndexed() : srcMesh.geometry.clone();
  const pos = geo.getAttribute('position');
  if (!pos) return [];

  const bounds = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const size = bounds.getSize(new THREE.Vector3());

  const buckets: Record<string, number[]> = {
    cylhead: [],
    turbo: [],
    exhaust: [],
    propflange: [],
    oilsump: [],
    crankcase: [],
  };

  for (let i = 0; i < pos.count; i += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let v = 0; v < 3; v++) {
      cx += pos.getX(i + v);
      cy += pos.getY(i + v);
      cz += pos.getZ(i + v);
    }
    cx /= 3; cy /= 3; cz /= 3;

    const ny = (cy - bounds.min.y) / Math.max(size.y, 0.001);
    const nx = (cx - bounds.min.x) / Math.max(size.x, 0.001) - 0.5;
    const nz = (cz - bounds.min.z) / Math.max(size.z, 0.001) - 0.5;

    let targetZone = 'crankcase';
    if (ny > 0.62 && nx < 0.15) {
      targetZone = 'cylhead';
    } else if (ny < 0.22) {
      targetZone = 'oilsump';
    } else if (nz > 0.35) {
      targetZone = 'propflange';
    } else if (nx > 0.28) {
      targetZone = 'turbo';
    } else if (nx < -0.28 || nz < -0.32) {
      targetZone = 'exhaust';
    } else {
      targetZone = 'crankcase';
    }

    for (let v = 0; v < 3; v++) {
      const idx = i + v;
      buckets[targetZone].push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
    }
  }

  return ZONES.map((zone) => {
    const verts = buckets[zone.id] || [];
    if (verts.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.computeVertexNormals();

    // Physical Rotax 914 palette — reads as the real engine (bright red valve
    // covers, cast/silver aluminium, dark gunmetal exhaust), not a cyber mass.
    let colorHex = '#a7acb3'; // crankcase: cast aluminium
    let roughness = 0.55;
    let metalness = 0.60;

    if (zone.id === 'cylhead') {
      colorHex = '#c8131f'; // Rotax valve-cover red
      roughness = 0.24;
      metalness = 0.32;
    } else if (zone.id === 'oilsump') {
      colorHex = '#26292e'; // graphite sump
      roughness = 0.60;
      metalness = 0.35;
    } else if (zone.id === 'propflange') {
      colorHex = '#d9dee4'; // machined gearbox & prop flange
      roughness = 0.18;
      metalness = 0.92;
    } else if (zone.id === 'turbo') {
      colorHex = '#c8cdd5'; // silver aluminium manifold / carbs
      roughness = 0.28;
      metalness = 0.85;
    } else if (zone.id === 'exhaust') {
      colorHex = '#43484f'; // heat-darkened steel exhaust
      roughness = 0.50;
      metalness = 0.80;
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness,
      metalness,
      side: THREE.DoubleSide,
      // Opaque by default — translucency is switched on only for X-ray /
      // selection-dimming states. Always-transparent meshes render as a glassy
      // wireframe-ish mass and hide the physical colours underneath.
      transparent: false,
      opacity: 1.0,
      emissive: new THREE.Color('#000000'),
      emissiveIntensity: 0,
    });
    // Physical base colour, kept for the X-ray → physical resolution blend.
    material.userData['baseColor'] = new THREE.Color(colorHex);

    return { geometry, material, zone };
  }).filter(Boolean) as Zone6Mesh[];
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
  onSelectZone?: (zoneName: string) => void;
  selectedZone?: string | null;
}) {
  const group = useRef<THREE.Group>(null);
  const motorRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  const explodeP = useRef(0);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const { scene } = useGLTF('/engine.glb');
  const h = highlights ?? EMPTY_HIGHLIGHTS;

  const vizMode = useFlightStore((s) => s.vizMode);
  const componentStress = useFlightStore((s) => s.componentStress);
  const faults = useFlightStore((s) => s.faults);
  const engineDecision = useFlightStore((s) => s.engineDecision);
  const setFocusedComponent = useFlightStore((s) => s.setFocusedComponent);

  const subAssemblies = useMemo(() => create6SeparateSubAssemblies(scene), [scene]);

  useEffect(() => () => {
    subAssemblies.forEach((zm) => {
      zm.geometry.dispose();
      zm.material.dispose();
    });
  }, [subAssemblies]);

  // Smooth 60 FPS animation loop — dynamic pressure/thermal/vibration heatmaps & bearing vibration
  useFrame((_, delta) => {
    const target = exploded ? explodeAmount : 0;
    explodeP.current += (target - explodeP.current) * Math.min(1, delta * 6);
    const p = explodeP.current;
    const t = Date.now() / 1000;
    // Reusable colour temps for the physical↔X-ray blend (avoid per-frame churn).
    const physGlow = new THREE.Color();
    const blendTmp = new THREE.Color();

    if (group.current && spin) group.current.rotation.y += delta * 0.12;

    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

    subAssemblies.forEach((zm) => {
      const mesh = meshRefs.current.get(zm.zone.name);
      if (!mesh) return;

      zm.material.wireframe = wireframe || vizMode === 'XRAY';

      // Position lerping for Exploded / Dismantle mode
      const dir = new THREE.Vector3(...zm.zone.dir);
      mesh.position.copy(dir).multiplyScalar(ease);

      // Localized Bearing Spall Vibration Pulse
      if (zm.zone.id === 'crankcase' && faults.bearingFail) {
        const pulse = Math.sin(t * 30) * 0.025;
        mesh.position.x += pulse;
        mesh.position.y += pulse;
      }

      // Compute stress value for this component
      let stress = 0.2;
      let mlRisk = 0;
      if (zm.zone.id === 'cylhead') {
        stress = Math.max(...componentStress.cylinders);
        mlRisk = engineDecision?.subsystems?.cylinderHead ? 1 - engineDecision.subsystems.cylinderHead.health / 100 : 0;
      } else if (zm.zone.id === 'exhaust') {
        stress = Math.max(...componentStress.exhaustRunners);
        mlRisk = engineDecision?.subsystems?.exhaust ? 1 - engineDecision.subsystems.exhaust.health / 100 : 0;
      } else if (zm.zone.id === 'turbo') {
        stress = componentStress.turbo;
        mlRisk = engineDecision?.subsystems?.turboIntake ? 1 - engineDecision.subsystems.turboIntake.health / 100 : 0;
      } else if (zm.zone.id === 'crankcase') {
        stress = componentStress.crankcase;
        mlRisk = engineDecision?.subsystems?.crankcase ? 1 - engineDecision.subsystems.crankcase.health / 100 : 0;
      } else if (zm.zone.id === 'oilsump') {
        stress = componentStress.oilSystem;
        mlRisk = engineDecision?.subsystems?.oilSump ? 1 - engineDecision.subsystems.oilSump.health / 100 : 0;
      } else if (zm.zone.id === 'propflange') {
        stress = componentStress.gearbox;
        mlRisk = engineDecision?.subsystems?.propGearbox ? 1 - engineDecision.subsystems.propGearbox.health / 100 : 0;
      }

      const isHovered = hoveredZone === zm.zone.name;
      const isSelected = selectedZone === zm.zone.name;

      if (vizMode === 'XRAY') {
        zm.material.opacity = isSelected || isHovered ? 0.85 : 0.22;
        zm.material.emissive.set(isSelected || isHovered ? '#06b6d4' : '#38bdf8');
        zm.material.emissiveIntensity = isSelected || isHovered ? 0.8 : 0.25;
      } else if (vizMode === 'PRESSURE' || vizMode === 'THERMAL' || vizMode === 'VIBRATION' || vizMode === 'ML_RISK') {
        const valueToMap = vizMode === 'ML_RISK' ? mlRisk : stress;
        const heatColor = getStressColor(valueToMap);
        zm.material.opacity = selectedZone ? (isSelected ? 1.0 : 0.25) : 1.0;
        zm.material.emissive.copy(heatColor);
        zm.material.emissiveIntensity = 0.35 + valueToMap * 0.55 + (isHovered ? 0.2 : 0);
      } else if (physicalTone) {
        // PHYSICAL-TONE (landing twin) — real Rotax colours; emissive is
        // reserved for hover/selection and genuinely extreme load.
        const heatColor = getStressColor(stress);
        const baseColor =
          (zm.material.userData['baseColor'] as THREE.Color | undefined) ??
          new THREE.Color('#a7acb3');
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
        if (k > 0.0001) {
          blendTmp.copy(baseColor).lerp(XRAY_LINE, k);
          zm.material.color.copy(blendTmp);
          zm.material.opacity = physOpacity * (1 - k) + 0.5 * k;
          zm.material.wireframe = k > 0.5;
          blendTmp.copy(physGlow).lerp(XRAY_GLOW, k);
          zm.material.emissive.copy(blendTmp);
          zm.material.emissiveIntensity = glowIntensity * (1 - k) + 1.15 * k;
        } else {
          zm.material.color.copy(baseColor);
          zm.material.opacity = physOpacity;
          zm.material.wireframe = false;
          zm.material.emissive.copy(physGlow);
          zm.material.emissiveIntensity = glowIntensity;
        }
      } else {
        // NORMAL mode — Dynamic stress highlight driven by Throttle, Rudder & Flight Physics
        const heatColor = getStressColor(stress);
        zm.material.opacity = selectedZone ? (isSelected ? 1.0 : 0.3) : 1.0;
        if (isSelected) {
          zm.material.emissive.set('#06b6d4');
          zm.material.emissiveIntensity = 0.5;
        } else if (isHovered) {
          zm.material.emissive.set('#06b6d4');
          zm.material.emissiveIntensity = 0.35;
        } else if (stress > 0.22) {
          // Dynamically glow to visually highlight parts experiencing high load from Throttle & Rudder!
          zm.material.emissive.copy(heatColor);
          zm.material.emissiveIntensity = Math.min(0.95, (stress - 0.18) * 1.15);
        } else {
          zm.material.emissive.set('#000000');
          zm.material.emissiveIntensity = 0;
        }
      }

      // Follow opacity with real transparency. Opaque by default — only the
      // translucent X-ray / selection-dimming states should alpha-blend (this
      // also stops internal geometry ghosting through and washing out colour).
      const wantTransparent = zm.material.opacity < 0.999;
      if (zm.material.transparent !== wantTransparent) {
        zm.material.transparent = wantTransparent;
        zm.material.needsUpdate = true;
      }
      zm.material.depthWrite = !wantTransparent;
    });

    if (motorRef.current) {
      motorRef.current.scale.setScalar(3 + p * 0.08);
    }
  });

  return (
    <group ref={group} position={modelPosition} scale={modelScale}>
      <group ref={motorRef} scale={[3, 3, 3]} position={[0, 0.1, 0.5]}>
        {/* Render 6 separate physical sub-mesh objects */}
        {subAssemblies.map((zm) => (
          <mesh
            key={zm.zone.name}
            ref={(m) => {
              if (m) meshRefs.current.set(zm.zone.name, m);
            }}
            geometry={zm.geometry}
            material={zm.material}
            castShadow
            receiveShadow
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              setHoveredZone(zm.zone.name);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              setHoveredZone(null);
              document.body.style.cursor = 'auto';
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelectZone?.(zm.zone.name);
              setFocusedComponent(zm.zone.name);
            }}
          />
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
