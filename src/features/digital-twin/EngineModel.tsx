import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';

export type Subsystem = 'CYLINDER' | 'EXHAUST' | 'INTAKE' | 'OIL' | 'FUEL' | 'VIBRATION' | 'ELECTRICAL';

// ── Rotax 914 real-world colors ──
const ROTAX = {
  block: '#8a8e94',        // Cast aluminum — light gray
  cylinder: '#5a5e64',     // Iron cylinder barrels — darker gray
  head: '#7a7e84',         // Aluminum heads — medium gray
  rocker: '#3a3e44',       // Rocker covers — dark gray/black
  exhaust: '#6e6259',      // Exhaust manifold — heat-brown
  intake: '#4a4e54',       // Intake runners — dark
  sump: '#2a2e34',         // Oil sump — very dark
  flange: '#c0c4ca',       // Prop flange — bright steel
  turbo: '#4a4e54',        // Turbo housing — dark
  bolt: '#9aa0a5',         // Steel bolts — silver
  wire: '#1a1a2a',         // Ignition wires — black
  hose: '#2a2a2a',         // Rubber hoses — black
  accent: '#c87020',       // Copper/bronze accents
};

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

function tempToIntensity(temp: number, warn = 170, crit = 200): number {
  if (temp > crit) return 1.5;
  if (temp > warn) return 0.8;
  return 0;
}

// ── Exploded view part definitions ──
// Each part has a rest position, explode offset, and geometry
const EXPLODE_PARTS = [
  { name: 'CYL HEAD 1', restY: 0.6, explodeY: 1.8, restX: -1.2, explodeX: -1.8, color: ROTAX.head, geo: 'box' as const, size: [0.5, 0.25, 0.5] as [number, number, number] },
  { name: 'CYL HEAD 2', restY: 0.6, explodeY: 1.8, restX: -0.4, explodeX: -0.6, color: ROTAX.head, geo: 'box' as const, size: [0.5, 0.25, 0.5] as [number, number, number] },
  { name: 'CYL HEAD 3', restY: 0.6, explodeY: 1.8, restX: 0.4, explodeX: 0.6, color: ROTAX.head, geo: 'box' as const, size: [0.5, 0.25, 0.5] as [number, number, number] },
  { name: 'CYL HEAD 4', restY: 0.6, explodeY: 1.8, restX: 1.2, explodeX: 1.8, color: ROTAX.head, geo: 'box' as const, size: [0.5, 0.25, 0.5] as [number, number, number] },
  { name: 'CYL BARREL 1', restY: 0.25, explodeY: 0.9, restX: -1.2, explodeX: -1.8, color: ROTAX.cylinder, geo: 'cylinder' as const, size: [0.22, 0.22, 0.35] as [number, number, number] },
  { name: 'CYL BARREL 2', restY: 0.25, explodeY: 0.9, restX: -0.4, explodeX: -0.6, color: ROTAX.cylinder, geo: 'cylinder' as const, size: [0.22, 0.22, 0.35] as [number, number, number] },
  { name: 'CYL BARREL 3', restY: 0.25, explodeY: 0.9, restX: 0.4, explodeX: 0.6, color: ROTAX.cylinder, geo: 'cylinder' as const, size: [0.22, 0.22, 0.35] as [number, number, number] },
  { name: 'CYL BARREL 4', restY: 0.25, explodeY: 0.9, restX: 1.2, explodeX: 1.8, color: ROTAX.cylinder, geo: 'cylinder' as const, size: [0.22, 0.22, 0.35] as [number, number, number] },
  { name: 'CRANKCASE', restY: -0.05, explodeY: -0.05, restX: 0, explodeX: 0, color: ROTAX.block, geo: 'box' as const, size: [3.0, 0.5, 0.8] as [number, number, number] },
  { name: 'OIL SUMP', restY: -0.55, explodeY: -1.4, restX: 0, explodeX: 0, color: ROTAX.sump, geo: 'box' as const, size: [1.8, 0.25, 0.6] as [number, number, number] },
  { name: 'INTAKE', restY: 0.7, explodeY: 2.6, restX: 0, explodeX: 0, restZ: -0.5, explodeZ: -1.2, color: ROTAX.intake, geo: 'cylinder' as const, size: [0.08, 0.08, 2.6] as [number, number, number], rotX: Math.PI / 2 },
  { name: 'EXHAUST', restY: 0.35, explodeY: -1.8, restX: 0, explodeX: 0, restZ: 0.5, explodeZ: 1.2, color: ROTAX.exhaust, geo: 'cylinder' as const, size: [0.1, 0.1, 2.8] as [number, number, number], rotX: Math.PI / 2 },
  { name: 'PROP FLANGE', restY: 0, explodeY: 0, restX: 2.0, explodeX: 3.2, color: ROTAX.flange, geo: 'cylinder' as const, size: [0.35, 0.35, 0.12] as [number, number, number], rotZ: Math.PI / 2 },
];

/** GLB Engine with explode animation + Rotax colors + live labels */
export function EngineModel({
  spin = true,
  fault = 0,
  highlights,
  exploded = false,
  selectedCylinder,
  onSelectCylinder,
}: {
  spin?: boolean;
  fault?: number;
  highlights?: PartHighlights;
  exploded?: boolean;
  selectedCylinder?: number | null;
  onSelectCylinder?: (i: number) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/engine.glb');
  const h = highlights ?? EMPTY_HIGHLIGHTS;

  // Clone scene with Rotax-colored materials
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Apply Rotax aluminum color to the single mesh
        mesh.material = new THREE.MeshStandardMaterial({
          color: ROTAX.block,
          roughness: 0.45,
          metalness: 0.85,
          emissive: new THREE.Color('#000000'),
          emissiveIntensity: 0,
        });
      }
    });
    return clone;
  }, [scene]);

  // Animate: rotation + GLB emissive highlights
  useFrame((_, delta) => {
    if (group.current && spin) {
      group.current.rotation.y += delta * 0.14;
    }

    // Apply emissive highlights to GLB based on telemetry
    const cylColors = [tempToColor(h.cyl1CHT), tempToColor(h.cyl2CHT), tempToColor(h.cyl3CHT), tempToColor(h.cyl4CHT)];
    const cylIntensities = [tempToIntensity(h.cyl1CHT), tempToIntensity(h.cyl2CHT), tempToIntensity(h.cyl3CHT), tempToIntensity(h.cyl4CHT)];
    const egtColor = tempToColor(h.egt, 700, 780);
    const egtInt = tempToIntensity(h.egt, 700, 780);
    const vibColor = h.vibration > 1.5 ? CRITICAL : h.vibration > 0.9 ? AMBER : CYAN;
    const vibInt = h.vibration > 1.5 ? 1.2 : h.vibration > 0.9 ? 0.6 : 0;

    clonedScene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.emissive) return;

      const pos = mesh.position;
      // Position-based highlight on the GLB mesh
      if (pos.x < -0.15 && pos.y > 0.1) {
        mat.emissive.set(cylColors[0]!);
        mat.emissiveIntensity = cylIntensities[0]!;
      } else if (pos.x >= -0.15 && pos.x < 0.05 && pos.y > 0.1) {
        mat.emissive.set(cylColors[1]!);
        mat.emissiveIntensity = cylIntensities[1]!;
      } else if (pos.x >= 0.05 && pos.x < 0.25 && pos.y > 0.1) {
        mat.emissive.set(cylColors[2]!);
        mat.emissiveIntensity = cylIntensities[2]!;
      } else if (pos.x >= 0.25 && pos.y > 0.1) {
        mat.emissive.set(cylColors[3]!);
        mat.emissiveIntensity = cylIntensities[3]!;
      } else if (pos.z > 0.3 && pos.y > 0.1) {
        mat.emissive.set(egtColor);
        mat.emissiveIntensity = egtInt;
      } else if (pos.y < 0) {
        mat.emissive.set(vibColor);
        mat.emissiveIntensity = vibInt;
      } else {
        mat.emissive.set('#000000');
        mat.emissiveIntensity = 0;
      }
    });
  });

  // Explode animation factor (smooth lerp)
  const explodeFactor = exploded ? 1 : 0;

  return (
    <group ref={group} position={[0, -0.35, 0]}>
      {/* GLB model — fades when exploded */}
      <group scale={[3, 3, 3]} position={[0, 0.1, 0.5]}>
        <primitive object={clonedScene} />
      </group>

      {/* Exploded view overlay — procedural parts */}
      {EXPLODE_PARTS.map((part, i) => {
        const t = explodeFactor;
        const x = part.restX + (part.explodeX - part.restX) * t;
        const y = part.restY + (part.explodeY - part.restY) * t;
        const z = (part.restZ ?? 0) + ((part.explodeZ ?? 0) - (part.restZ ?? 0)) * t;

        // Highlight color for this part
        let emissive = '#000000';
        let emissiveI = 0;
        if (part.name.includes('1') && part.name.includes('CYL')) {
          emissive = tempToColor(h.cyl1CHT);
          emissiveI = tempToIntensity(h.cyl1CHT);
        } else if (part.name.includes('2') && part.name.includes('CYL')) {
          emissive = tempToColor(h.cyl2CHT);
          emissiveI = tempToIntensity(h.cyl2CHT);
        } else if (part.name.includes('3') && part.name.includes('CYL')) {
          emissive = tempToColor(h.cyl3CHT);
          emissiveI = tempToIntensity(h.cyl3CHT);
        } else if (part.name.includes('4') && part.name.includes('CYL')) {
          emissive = tempToColor(h.cyl4CHT);
          emissiveI = tempToIntensity(h.cyl4CHT);
        } else if (part.name === 'EXHAUST') {
          emissive = tempToColor(h.egt, 700, 780);
          emissiveI = tempToIntensity(h.egt, 700, 780);
        } else if (part.name === 'OIL SUMP') {
          emissive = h.oilTemp > 110 ? AMBER : CYAN;
          emissiveI = h.oilTemp > 110 ? 0.5 : 0;
        }

        const opacity = 0.15 + explodeFactor * 0.85;

        return (
          <group key={part.name} position={[x, y, z]}>
            {part.geo === 'box' ? (
              <mesh>
                <boxGeometry args={part.size} />
                <meshStandardMaterial
                  color={part.color}
                  roughness={0.45}
                  metalness={0.85}
                  transparent
                  opacity={opacity}
                  emissive={emissive}
                  emissiveIntensity={emissiveI}
                />
              </mesh>
            ) : (
              <mesh rotation={[part.rotX ?? 0, 0, part.rotZ ?? 0]}>
                <cylinderGeometry args={part.size} />
                <meshStandardMaterial
                  color={part.color}
                  roughness={0.45}
                  metalness={0.85}
                  transparent
                  opacity={opacity}
                  emissive={emissive}
                  emissiveIntensity={emissiveI}
                />
              </mesh>
            )}

            {/* Part label — only visible when exploded */}
            {explodeFactor > 0.5 && (
              <Html position={[0, 0.4, 0]} center distanceFactor={8}>
                <div style={{
                  background: 'rgba(11,14,17,0.9)', border: `1px solid ${emissive}`,
                  borderRadius: '2px', padding: '2px 6px', whiteSpace: 'nowrap',
                  opacity: Math.min(1, (explodeFactor - 0.5) * 2),
                }}>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '6px', letterSpacing: '0.12em', color: '#8d979e', textTransform: 'uppercase' }}>
                    {part.name}
                  </div>
                  {part.name.includes('CYL') && (
                    <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: emissive, fontWeight: 600 }}>
                      {part.name.includes('1') ? h.cyl1CHT.toFixed(0) :
                       part.name.includes('2') ? h.cyl2CHT.toFixed(0) :
                       part.name.includes('3') ? h.cyl3CHT.toFixed(0) :
                       h.cyl4CHT.toFixed(0)}°C
                    </div>
                  )}
                  {part.name === 'EXHAUST' && (
                    <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: emissive, fontWeight: 600 }}>
                      {h.egt.toFixed(0)}°C
                    </div>
                  )}
                  {part.name === 'OIL SUMP' && (
                    <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: emissive, fontWeight: 600 }}>
                      {h.oilTemp.toFixed(0)}°C
                    </div>
                  )}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {/* Live telemetry labels — always visible */}
      {highlights && !exploded && (
        <>
          <PartLabel position={[-1.35, 1.5, 0]} label="CYL 1" value={`${h.cyl1CHT.toFixed(0)}°C`} color={tempToColor(h.cyl1CHT)} type="CHT" />
          <PartLabel position={[-0.45, 1.5, 0]} label="CYL 2" value={`${h.cyl2CHT.toFixed(0)}°C`} color={tempToColor(h.cyl2CHT)} type="CHT" pulse={h.cyl2CHT > 200} />
          <PartLabel position={[0.45, 1.5, 0]} label="CYL 3" value={`${h.cyl3CHT.toFixed(0)}°C`} color={tempToColor(h.cyl3CHT)} type="CHT" />
          <PartLabel position={[1.35, 1.5, 0]} label="CYL 4" value={`${h.cyl4CHT.toFixed(0)}°C`} color={tempToColor(h.cyl4CHT)} type="CHT" />
          <PartLabel position={[0, 0.9, 0.8]} label="EGT" value={`${h.egt.toFixed(0)}°C`} color={tempToColor(h.egt, 700, 780)} type="EXHAUST" />
          <PartLabel position={[0, -0.9, 0.3]} label="OIL" value={`${h.oilTemp.toFixed(0)}°C`} color={h.oilTemp > 110 ? AMBER : CYAN} type="OIL" />
          <PartLabel position={[2.2, 0.2, 0]} label="RPM" value={`${h.rpm.toFixed(0)}`} color={h.rpm > 3500 ? AMBER : CYAN} type="ENGINE" />
          <PartLabel position={[0, -1.1, 0]} label="VIB" value={`${h.vibration.toFixed(2)} m/s²`} color={h.vibration > 1.5 ? CRITICAL : h.vibration > 0.9 ? AMBER : CYAN} type="VIBRATION" />
        </>
      )}
    </group>
  );
}

function PartLabel({
  position, label, value, color, type, pulse = false,
}: {
  position: [number, number, number]; label: string; value: string; color: string; type: string; pulse?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Html position={position} center distanceFactor={8} style={{ pointerEvents: 'auto' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: 'rgba(11,14,17,0.85)', border: `1px solid ${color}`, borderRadius: '2px',
          padding: hovered ? '4px 8px' : '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'all 0.2s', boxShadow: pulse ? `0 0 12px ${color}` : 'none',
        }}
      >
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '7px', letterSpacing: '0.12em', color: '#8d979e', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: hovered ? '12px' : '10px', color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {hovered && <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '6px', color: '#64748b', marginTop: '2px' }}>{type} · LIVE</div>}
      </div>
    </Html>
  );
}

useGLTF.preload('/engine.glb');
