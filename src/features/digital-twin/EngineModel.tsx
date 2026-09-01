import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';

const CYAN = '#6fd8e8';
const AMBER = '#f0a63c';
const CRITICAL = '#e2523f';

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

function applyColors(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  const bounds = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const size = bounds.getSize(new THREE.Vector3());
  const c = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);

  const palette = {
    flange: '#c0c4ca', accent: '#c87020', head: '#7a7e84',
    sump: '#2a2e34', exhaust: '#6e6259', cylinder: '#5a5e64', block: '#8a8e94',
  };

  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) - bounds.min.x) / Math.max(size.x, 0.001);
    const y = (pos.getY(i) - bounds.min.y) / Math.max(size.y, 0.001);
    const z = (pos.getZ(i) - bounds.min.z) / Math.max(size.z, 0.001);

    if (z > 0.86) c.set(palette.flange);
    else if (x > 0.68 && y < 0.62) c.set(palette.accent);
    else if (y > 0.72) c.set(palette.head);
    else if (y < 0.18) c.set(palette.sump);
    else if (z < 0.28) c.set(palette.exhaust);
    else if (y < 0.45) c.set(palette.cylinder);
    else c.set(palette.block);

    c.multiplyScalar(0.88 + y * 0.18);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

// Explode zone definitions
const ZONES = [
  { name: 'CYLINDER HEAD', sub: 'Aluminum alloy · 4-cyl', yMin: 0.72, dir: [0, 1.6, 0] as [number,number,number], glow: CYAN, val: (h: PartHighlights) => `${Math.max(h.cyl1CHT, h.cyl2CHT, h.cyl3CHT, h.cyl4CHT).toFixed(0)}°C CHT`, valC: (h: PartHighlights) => tempToColor(Math.max(h.cyl1CHT, h.cyl2CHT, h.cyl3CHT, h.cyl4CHT)) },
  { name: 'EXHAUST MANIFOLD', sub: 'Heat-brown cast iron', yMin: 0.25, yMax: 0.72, zMax: 0.4, dir: [-1.4, 0.3, -0.6] as [number,number,number], glow: AMBER, val: (h: PartHighlights) => `${h.egt.toFixed(0)}°C EGT`, valC: (h: PartHighlights) => tempToColor(h.egt, 700, 780) },
  { name: 'INTAKE / TURBO', sub: 'Forced induction', yMin: 0.25, yMax: 0.72, zMin: 0.6, dir: [1.4, 0.3, 0.6] as [number,number,number], glow: '#7fd6e8', val: (h: PartHighlights) => `${h.rpm.toFixed(0)} RPM`, valC: (h: PartHighlights) => h.rpm > 3500 ? AMBER : CYAN },
  { name: 'CRANKCASE', sub: 'Cast aluminum block', yMin: 0.18, yMax: 0.72, dir: [0, -0.1, 0] as [number,number,number], glow: '#9aa0a5', val: (h: PartHighlights) => `${(h.health * 100).toFixed(0)}% HEALTH`, valC: (h: PartHighlights) => h.health > 0.8 ? CYAN : h.health > 0.5 ? AMBER : CRITICAL },
  { name: 'OIL SUMP', sub: 'Wet sump · 2.5L', yMax: 0.18, dir: [0, -1.4, 0] as [number,number,number], glow: '#c87020', val: (h: PartHighlights) => `${h.oilTemp.toFixed(0)}°C OIL`, valC: (h: PartHighlights) => h.oilTemp > 110 ? AMBER : CYAN },
  { name: 'PROP FLANGE', sub: 'Steel · SAE Class 1', yMin: 0.3, yMax: 0.7, zMin: 0.88, dir: [0, 0, 1.6] as [number,number,number], glow: '#c0c4ca', val: (h: PartHighlights) => `${h.vibration.toFixed(2)} m/s² VIB`, valC: (h: PartHighlights) => h.vibration > 1.5 ? CRITICAL : h.vibration > 0.9 ? AMBER : CYAN },
];

// Build ghost meshes for each zone
type ZoneMesh = { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; zone: typeof ZONES[number] };

function buildZoneMeshes(scene: THREE.Group): ZoneMesh[] {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((child) => { if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh); });
  const src = meshes[0];
  if (!src) return [];

  const geo = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry.clone();
  const pos = geo.getAttribute('position');
  const srcColors = geo.getAttribute('color');
  if (!pos) return [];

  const bounds = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const size = bounds.getSize(new THREE.Vector3());
  const mat = (Array.isArray(src.material) ? src.material[0] : src.material) as THREE.MeshStandardMaterial;

  return ZONES.map((zone) => {
    const verts: number[] = [];
    const cols: number[] = [];

    for (let i = 0; i < pos.count; i += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let v = 0; v < 3; v++) { cx += pos.getX(i+v); cy += pos.getY(i+v); cz += pos.getZ(i+v); }
      cx /= 3; cy /= 3; cz /= 3;
      const ny = (cy - bounds.min.y) / Math.max(size.y, 0.001);
      const nz = (cz - bounds.min.z) / Math.max(size.z, 0.001);

      let match = true;
      if (zone.yMin !== undefined && ny < zone.yMin) match = false;
      if (zone.yMax !== undefined && ny > zone.yMax) match = false;
      if (zone.zMin !== undefined && nz < zone.zMin) match = false;
      if (zone.zMax !== undefined && nz > zone.zMax) match = false;

      if (match) {
        for (let v = 0; v < 3; v++) {
          const idx = i + v;
          verts.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
          if (srcColors) cols.push(srcColors.getX(idx), srcColors.getY(idx), srcColors.getZ(idx));
        }
      }
    }

    if (verts.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    if (cols.length > 0) geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geometry.computeVertexNormals();

    const material = mat.clone();
    material.transparent = true;
    material.opacity = 0;
    material.depthWrite = false;
    material.emissive = new THREE.Color('#000000');
    material.emissiveIntensity = 0;

    return { geometry, material, zone };
  }).filter(Boolean) as ZoneMesh[];
}

export function EngineModel({
  spin = true,
  fault = 0,
  highlights,
  exploded = false,
  showLabels = true,
  modelScale = 1,
  modelPosition = [0, -0.35, 0],
}: {
  spin?: boolean;
  fault?: number;
  highlights?: PartHighlights;
  exploded?: boolean;
  showLabels?: boolean;
  modelScale?: number;
  modelPosition?: [number, number, number];
}) {
  const group = useRef<THREE.Group>(null);
  const motorRef = useRef<THREE.Group>(null);
  const ghostRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  const explodeP = useRef(0);
  const { scene } = useGLTF('/engine.glb');
  const h = highlights ?? EMPTY_HIGHLIGHTS;

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.geometry = mesh.geometry.clone();
        applyColors(mesh.geometry);
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#ffffff', roughness: 0.34, metalness: 0.78,
          vertexColors: true, emissive: new THREE.Color('#000000'), emissiveIntensity: 0,
        });
      }
    });
    return clone;
  }, [scene]);

  const zoneMeshes = useMemo(() => buildZoneMeshes(clonedScene), [clonedScene]);

  useEffect(() => () => {
    zoneMeshes.forEach(zm => { zm.geometry.dispose(); zm.material.dispose(); });
  }, [zoneMeshes]);

  useFrame((_, delta) => {
    // Smooth explode interpolation
    const target = exploded ? 1 : 0;
    explodeP.current += (target - explodeP.current) * Math.min(1, delta * 5);
    const p = explodeP.current;

    if (group.current && spin) group.current.rotation.y += delta * 0.14;

    // Fade original model
    clonedScene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.emissive) return;
      mat.transparent = true;
      mat.opacity = Math.max(0.02, 1 - p * 1.5);
      mat.depthWrite = p < 0.8;

      // Telemetry glow on original
      const pos = mesh.position;
      if (pos.x < -0.15 && pos.y > 0.1) { mat.emissive.set(tempToColor(h.cyl1CHT)); mat.emissiveIntensity = h.cyl1CHT > 170 ? 0.6 : 0; }
      else if (pos.x >= -0.15 && pos.x < 0.05 && pos.y > 0.1) { mat.emissive.set(tempToColor(h.cyl2CHT)); mat.emissiveIntensity = h.cyl2CHT > 170 ? 0.6 : 0; }
      else if (pos.x >= 0.05 && pos.x < 0.25 && pos.y > 0.1) { mat.emissive.set(tempToColor(h.cyl3CHT)); mat.emissiveIntensity = h.cyl3CHT > 170 ? 0.6 : 0; }
      else if (pos.x >= 0.25 && pos.y > 0.1) { mat.emissive.set(tempToColor(h.cyl4CHT)); mat.emissiveIntensity = h.cyl4CHT > 170 ? 0.6 : 0; }
      else { mat.emissive.set('#000000'); mat.emissiveIntensity = 0; }
    });

    // Animate ghost meshes
    zoneMeshes.forEach((zm) => {
      const mesh = ghostRefs.current.get(zm.zone.name);
      if (!mesh) return;
      const dir = new THREE.Vector3(...zm.zone.dir);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      mesh.position.copy(dir).multiplyScalar(ease);
      mesh.rotation.set(ease * dir.y * 0.06, ease * dir.x * 0.1, ease * 0.04);
      zm.material.opacity = Math.min(1, p * 2);
      zm.material.emissive.set(p > 0.3 ? zm.zone.glow : '#000000');
      zm.material.emissiveIntensity = p > 0.3 ? (p - 0.3) * 0.3 : 0;
    });

    if (motorRef.current) {
      motorRef.current.scale.setScalar(3 + p * 0.3);
    }
  });

  return (
    <group ref={group} position={modelPosition} scale={modelScale}>
      <group ref={motorRef} scale={[3, 3, 3]} position={[0, 0.1, 0.5]}>
        <primitive object={clonedScene} />
        {zoneMeshes.map((zm) => (
          <mesh
            key={zm.zone.name}
            ref={(m) => { if (m) ghostRefs.current.set(zm.zone.name, m); }}
            geometry={zm.geometry}
            material={zm.material}
            castShadow
          />
        ))}
      </group>

      {/* Labels */}
      {showLabels && highlights && (
        <group scale={[3, 3, 3]} position={[0, 0.1, 0.5]}>
          {ZONES.map((zone) => (
            <ZoneLabel key={zone.name} zone={zone} h={h} explodeP={explodeP} />
          ))}
        </group>
      )}
    </group>
  );
}

function ZoneLabel({ zone, h, explodeP }: { zone: typeof ZONES[number]; h: PartHighlights; explodeP: React.MutableRefObject<number> }) {
  const [, setTick] = useState(0);
  useFrame(() => setTick(n => n + 1));

  const p = explodeP.current;
  if (p < 0.12) return null;

  const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const dir = new THREE.Vector3(...zone.dir);
  const labelPos = dir.clone().multiplyScalar(ease).multiplyScalar(3);
  // Position label offset from the exploded part
  labelPos.y += 0.3;
  const opacity = Math.min(1, (p - 0.12) / 0.3);

  return (
    <Html
      position={[labelPos.x, labelPos.y, labelPos.z]}
      center
      distanceFactor={10}
      style={{ pointerEvents: 'auto', opacity, transition: 'opacity 0.2s' }}
    >
      <div style={{
        background: 'rgba(7,9,11,0.92)',
        border: `1px solid ${zone.glow}`,
        borderRadius: '2px',
        padding: '5px 9px',
        whiteSpace: 'nowrap',
        boxShadow: `0 0 16px ${zone.glow}33`,
        minWidth: '100px',
      }}>
        <div style={{ width: '100%', height: '1px', background: `linear-gradient(90deg, transparent, ${zone.glow}, transparent)`, marginBottom: '3px' }} />
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '7px', letterSpacing: '0.14em', color: zone.glow, fontWeight: 600 }}>{zone.name}</div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px', color: zone.valC(h), fontWeight: 700, marginTop: '1px' }}>{zone.val(h)}</div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '5.5px', color: '#5f696f', marginTop: '2px', letterSpacing: '0.06em' }}>{zone.sub}</div>
        <div style={{ width: '100%', height: '1px', background: `linear-gradient(90deg, transparent, ${zone.glow}66, transparent)`, marginTop: '3px' }} />
      </div>
    </Html>
  );
}

useGLTF.preload('/engine.glb');
