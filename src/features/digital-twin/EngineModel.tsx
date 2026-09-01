import { useRef, useMemo, useState, useEffect } from 'react';
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

function applyRotaxSurfaceColors(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  if (!position) return;
  const bounds = new THREE.Box3().setFromBufferAttribute(position as THREE.BufferAttribute);
  const size = bounds.getSize(new THREE.Vector3());
  const color = new THREE.Color();
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i += 1) {
    const x = (position.getX(i) - bounds.min.x) / Math.max(size.x, 0.001);
    const y = (position.getY(i) - bounds.min.y) / Math.max(size.y, 0.001);
    const z = (position.getZ(i) - bounds.min.z) / Math.max(size.z, 0.001);

    if (z > 0.86) color.set(ROTAX.flange);
    else if (x > 0.68 && y < 0.62) color.set(ROTAX.accent);
    else if (y > 0.72) color.set(ROTAX.head);
    else if (y < 0.18) color.set(ROTAX.sump);
    else if (z < 0.28) color.set(ROTAX.exhaust);
    else if (y < 0.45) color.set(ROTAX.cylinder);
    else color.set(ROTAX.block);

    color.multiplyScalar(0.88 + y * 0.18);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

type ExplodedFragment = {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  direction: THREE.Vector3;
};

function buildExplodedFragments(scene: THREE.Group): ExplodedFragment[] {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });
  const sourceMesh = meshes[0];
  if (!sourceMesh) return [];

  const sourceGeometry = sourceMesh.geometry.index ? sourceMesh.geometry.toNonIndexed() : sourceMesh.geometry;
  const position = sourceGeometry.getAttribute('position');
  const sourceColors = sourceGeometry.getAttribute('color');
  if (!position) return [];

  const bounds = new THREE.Box3().setFromBufferAttribute(position as THREE.BufferAttribute);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const buckets: { vertices: number[]; colors: number[] }[] = Array.from({ length: 6 }, () => ({ vertices: [], colors: [] }));
  const centroid = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 3) {
    centroid.set(0, 0, 0);
    for (let vertex = 0; vertex < 3; vertex += 1) {
      centroid.x += position.getX(i + vertex);
      centroid.y += position.getY(i + vertex);
      centroid.z += position.getZ(i + vertex);
    }
    centroid.multiplyScalar(1 / 3);
    const verticalBand = Math.min(2, Math.max(0, Math.floor(((centroid.y - bounds.min.y) / size.y) * 3)));
    const side = centroid.x >= center.x ? 1 : 0;
    const bucket = verticalBand * 2 + side;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const index = i + vertex;
      buckets[bucket]!.vertices.push(position.getX(index), position.getY(index), position.getZ(index));
      if (sourceColors) {
        buckets[bucket]!.colors.push(sourceColors.getX(index), sourceColors.getY(index), sourceColors.getZ(index));
      }
    }
  }

  const sourceMaterial = Array.isArray(sourceMesh.material) ? sourceMesh.material[0] : sourceMesh.material;
  if (!(sourceMaterial instanceof THREE.MeshStandardMaterial)) return [];

  return buckets.flatMap((bucket, index) => {
    if (bucket.vertices.length === 0) return [];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.vertices, 3));
    if (sourceColors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3));
    geometry.computeVertexNormals();
    const material = sourceMaterial.clone();
    material.transparent = true;
    material.opacity = 0;
    material.depthWrite = false;
    const direction = new THREE.Vector3(
      index % 2 === 0 ? -1 : 1,
      Math.floor(index / 2) - 1,
      index > 3 ? 0.8 : -0.8,
    ).normalize();
    return [{ geometry, material, direction }];
  });
}

/** The ROTAX engine model with inspection animation and live labels. */
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
  const motor = useRef<THREE.Group>(null);
  const fragmentNodes = useRef<Array<THREE.Group | null>>([]);
  const explodeProgress = useRef(0);
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
        mesh.geometry = mesh.geometry.clone();
        applyRotaxSurfaceColors(mesh.geometry);
        // Apply Rotax aluminum color to the single mesh
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#ffffff',
          roughness: 0.34,
          metalness: 0.78,
          vertexColors: true,
          emissive: new THREE.Color('#000000'),
          emissiveIntensity: 0,
        });
      }
    });
    return clone;
  }, [scene]);
  const fragments = useMemo(() => buildExplodedFragments(clonedScene), [clonedScene]);

  useEffect(() => () => {
    fragments.forEach((fragment) => {
      fragment.geometry.dispose();
      fragment.material.dispose();
    });
  }, [fragments]);

  // Animate: rotation + GLB emissive highlights
  useFrame((_, delta) => {
    explodeProgress.current = THREE.MathUtils.damp(explodeProgress.current, exploded ? 1 : 0, 5, delta);
    const progress = explodeProgress.current;

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
       mat.transparent = true;
       mat.opacity = 1 - progress;
       mat.depthWrite = progress < 0.95;

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

    if (motor.current) {
      motor.current.position.set(0, 0.1 + progress * 0.22, 0.5);
      motor.current.scale.set(3 + progress * 0.42, 3 + progress * 0.28, 3 + progress * 0.42);
      motor.current.rotation.z = progress * 0.08;
      motor.current.rotation.y = progress * 0.18;
    }
    fragments.forEach((fragment, index) => {
      const node = fragmentNodes.current[index];
      if (!node) return;
      node.position.copy(fragment.direction).multiplyScalar(progress * 0.72);
      node.rotation.set(progress * fragment.direction.y * 0.2, progress * fragment.direction.x * 0.25, progress * 0.1);
      fragment.material.opacity = progress;
      fragment.material.emissive.set(progress > 0.6 ? CYAN : '#000000');
      fragment.material.emissiveIntensity = progress > 0.6 ? 0.08 : 0;
    });
  });

  return (
    <group ref={group} position={modelPosition} scale={modelScale}>
      {/* The ROTAX GLB is the only rendered engine model. */}
      <group ref={motor} scale={[3, 3, 3]} position={[0, 0.1, 0.5]}>
        <primitive object={clonedScene} />
        <group>
          {fragments.map((fragment, index) => (
            <group
              key={index}
              ref={(node) => { fragmentNodes.current[index] = node; }}
            >
              <mesh geometry={fragment.geometry} material={fragment.material} />
            </group>
          ))}
        </group>
      </group>

      {/* Live telemetry labels — always visible */}
      {showLabels && highlights && (
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
        <div style={{ width: '1px', height: '10px', margin: '0 auto -2px', background: color, opacity: 0.8 }} />
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '7px', letterSpacing: '0.12em', color: '#8d979e', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: hovered ? '12px' : '10px', color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {hovered && <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '6px', color: '#64748b', marginTop: '2px' }}>{type} · SYNTHETIC</div>}
      </div>
    </Html>
  );
}

useGLTF.preload('/engine.glb');
