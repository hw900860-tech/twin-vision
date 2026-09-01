import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, Html, Line } from '@react-three/drei';
import * as THREE from 'three';

const CYAN = '#06b6d4';
const AMBER = '#f59e0b';
const CRITICAL = '#ef4444';

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
    dir: [-1.2, 1.8, 0.4] as [number, number, number],
    glow: '#ef4444',
    val: (h: PartHighlights) => `${Math.max(h.cyl1CHT, h.cyl2CHT, h.cyl3CHT, h.cyl4CHT).toFixed(0)}°C CHT`,
    valC: (h: PartHighlights) => tempToColor(Math.max(h.cyl1CHT, h.cyl2CHT, h.cyl3CHT, h.cyl4CHT)),
  },
  {
    id: 'exhaust',
    name: 'EXHAUST MANIFOLD',
    sub: 'Stainless Steel Exhaust Pipe',
    center: [-0.45, 0.1, -0.2] as [number, number, number],
    dir: [-1.8, 0.4, -0.8] as [number, number, number],
    glow: AMBER,
    val: (h: PartHighlights) => `${h.egt.toFixed(0)}°C EGT`,
    valC: (h: PartHighlights) => tempToColor(h.egt, 700, 780),
  },
  {
    id: 'turbo',
    name: 'INTAKE / TURBO & CARBS',
    sub: 'Silver Aluminum Manifold',
    center: [0.45, 0.2, 0.1] as [number, number, number],
    dir: [1.8, 0.5, 0.6] as [number, number, number],
    glow: '#06b6d4',
    val: (h: PartHighlights) => `${h.rpm.toFixed(0)} RPM`,
    valC: (h: PartHighlights) => h.rpm > 3500 ? AMBER : CYAN,
  },
  {
    id: 'crankcase',
    name: 'CRANKCASE BLOCK',
    sub: 'Cast Aluminum Engine Core',
    center: [0, 0, 0] as [number, number, number],
    dir: [0, -0.05, 0] as [number, number, number],
    glow: '#94a3b8',
    val: (h: PartHighlights) => `${(h.health * 100).toFixed(0)}% HEALTH`,
    valC: (h: PartHighlights) => h.health > 0.8 ? CYAN : h.health > 0.5 ? AMBER : CRITICAL,
  },
  {
    id: 'oilsump',
    name: 'OIL SUMP & FILTER',
    sub: 'Yellow Cap & Lower Sump',
    center: [0, -0.35, 0] as [number, number, number],
    dir: [0, -1.8, 0] as [number, number, number],
    glow: '#eab308',
    val: (h: PartHighlights) => `${h.oilTemp.toFixed(0)}°C OIL`,
    valC: (h: PartHighlights) => h.oilTemp > 110 ? AMBER : CYAN,
  },
  {
    id: 'propflange',
    name: 'GEARBOX & PROP FLANGE',
    sub: 'Machined Gearbox & Flange',
    center: [0, 0.1, 0.55] as [number, number, number],
    dir: [0, 0.3, 2.0] as [number, number, number],
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

    let colorHex = '#cbd5e1';
    let roughness = 0.32;
    let metalness = 0.75;

    if (zone.id === 'cylhead') {
      colorHex = '#dc2626';
      roughness = 0.18;
      metalness = 0.35;
    } else if (zone.id === 'oilsump') {
      colorHex = '#334155';
      roughness = 0.40;
    } else if (zone.id === 'propflange') {
      colorHex = '#f1f5f9';
      roughness = 0.22;
      metalness = 0.85;
    } else if (zone.id === 'turbo') {
      colorHex = '#cbd5e1';
      roughness = 0.28;
      metalness = 0.80;
    } else if (zone.id === 'exhaust') {
      colorHex = '#94a3b8';
      roughness = 0.32;
      metalness = 0.80;
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness,
      metalness,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0,
      emissive: new THREE.Color('#000000'),
      emissiveIntensity: 0,
    });

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

  const subAssemblies = useMemo(() => create6SeparateSubAssemblies(scene), [scene]);

  useEffect(() => () => {
    subAssemblies.forEach(zm => { zm.geometry.dispose(); zm.material.dispose(); });
  }, [subAssemblies]);

  // Smooth 60 FPS animation loop — moves and focuses camera on selected part exclusively
  useFrame((_, delta) => {
    const target = exploded ? explodeAmount : 0;
    explodeP.current += (target - explodeP.current) * Math.min(1, delta * 6);
    const p = explodeP.current;

    if (group.current && spin) group.current.rotation.y += delta * 0.12;

    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

    subAssemblies.forEach((zm) => {
      const mesh = meshRefs.current.get(zm.zone.name);
      if (!mesh) return;

      zm.material.wireframe = wireframe;

      // Animate position of each of the 6 sub-meshes independently
      const dir = new THREE.Vector3(...zm.zone.dir);
      mesh.position.copy(dir).multiplyScalar(ease);

      const isHovered = hoveredZone === zm.zone.name;
      const isSelected = selectedZone === zm.zone.name;

      if (selectedZone) {
        if (isSelected) {
          zm.material.opacity = 1.0;
          zm.material.emissive.set('#06b6d4');
          zm.material.emissiveIntensity = 0.8;
        } else {
          zm.material.opacity = 0.35; // Dim other components for exclusive focus!
          zm.material.emissive.set('#000000');
          zm.material.emissiveIntensity = 0;
        }
      } else if (isHovered) {
        zm.material.opacity = 1.0;
        zm.material.emissive.set('#06b6d4');
        zm.material.emissiveIntensity = 0.7;
      } else {
        zm.material.opacity = 1.0;
        zm.material.emissive.set('#000000');
        zm.material.emissiveIntensity = 0;
      }
    });

    if (motorRef.current) {
      motorRef.current.scale.setScalar(3 + p * 0.12);
    }
  });

  return (
    <group ref={group} position={modelPosition} scale={modelScale}>
      <group ref={motorRef} scale={[3, 3, 3]} position={[0, 0.1, 0.5]}>
        {/* Render 6 separate physical sub-mesh objects */}
        {subAssemblies.map((zm) => (
          <mesh
            key={zm.zone.name}
            ref={(m) => { if (m) meshRefs.current.set(zm.zone.name, m); }}
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
            }}
          />
        ))}

        {/* Laser indicator connector lines */}
        {exploded &&
          ZONES.map((zone) => {
            const ease = explodeP.current;
            const targetPos: [number, number, number] = [
              zone.dir[0] * ease,
              zone.dir[1] * ease,
              zone.dir[2] * ease,
            ];
            const isSelected = selectedZone === zone.name;
            return (
              <Line
                key={`line-${zone.name}`}
                points={[[0, 0, 0], targetPos]}
                color={hoveredZone === zone.name || isSelected ? CYAN : zone.glow}
                lineWidth={hoveredZone === zone.name || isSelected ? 3 : 1}
                transparent
                opacity={isSelected ? 1.0 : selectedZone ? 0.2 : Math.min(0.7, ease * 0.8)}
              />
            );
          })}
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
              onSelect={() => onSelectZone?.(zone.name)}
              onHover={(isH) => setHoveredZone(isH ? zone.name : null)}
            />
          ))}
        </group>
      )}
    </group>
  );
}

function ZoneLabel({
  zone,
  h,
  explodeP,
  isHovered,
  isSelected,
  onSelect,
  onHover,
}: {
  zone: typeof ZONES[number];
  h: PartHighlights;
  explodeP: React.MutableRefObject<number>;
  isHovered: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const p = explodeP.current;
  const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const dir = new THREE.Vector3(...zone.dir);
  const baseCenter = new THREE.Vector3(...zone.center);

  const labelPos = baseCenter.clone().add(dir.clone().multiplyScalar(ease));
  labelPos.y += 0.25;

  const glowColor = isHovered || isSelected ? CYAN : zone.glow;

  return (
    <Html
      position={[labelPos.x, labelPos.y, labelPos.z]}
      center
      distanceFactor={9}
      style={{ pointerEvents: 'auto' }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onMouseEnter={() => {
          onHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onMouseLeave={() => {
          onHover(false);
          document.body.style.cursor = 'auto';
        }}
        style={{
          background: isHovered || isSelected ? 'rgba(11,18,24,0.96)' : 'rgba(7,9,11,0.90)',
          border: `1px solid ${glowColor}`,
          borderRadius: '2px',
          padding: '5px 9px',
          whiteSpace: 'nowrap',
          boxShadow: isHovered || isSelected ? `0 0 24px ${CYAN}88` : `0 0 14px ${glowColor}33`,
          minWidth: '105px',
          transform: isHovered || isSelected ? 'scale(1.08)' : 'scale(1)',
          transition: 'all 0.18s ease-out',
          cursor: 'pointer',
        }}
      >
        <div style={{ width: '100%', height: '1.5px', background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)`, marginBottom: '3px' }} />
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '7.5px', letterSpacing: '0.16em', color: glowColor, fontWeight: 700 }}>
          {zone.name}
        </div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px', color: zone.valC(h), fontWeight: 700, marginTop: '1px' }}>
          {zone.val(h)}
        </div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '6px', color: '#85939c', marginTop: '2px', letterSpacing: '0.06em' }}>
          {zone.sub}
        </div>
        <div style={{ marginTop: '3px', fontSize: '6px', fontFamily: 'IBM Plex Mono, monospace', color: CYAN, letterSpacing: '0.12em', textAlign: 'right' }}>
          [CLICK TO STUDY]
        </div>
        <div style={{ width: '100%', height: '1.5px', background: `linear-gradient(90deg, transparent, ${glowColor}66, transparent)`, marginTop: '3px' }} />
      </div>
    </Html>
  );
}

useGLTF.preload('/engine.glb');
