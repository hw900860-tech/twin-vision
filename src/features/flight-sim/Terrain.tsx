import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlightStore, type Biome } from './flightStore';
import { terrainHeightAt } from './terrainMath';

const CHUNK_SIZE = 160;
const RES = 44; // Optimized grid resolution for 60+ FPS performance
const GRID_RADIUS = 1; // 3x3 chunks (9 total chunks, zero lag)

// Smooth color palette generator based on elevation & slope
function calculateVertexColor(y: number, ny: number, biome: Biome): THREE.Color {
  const isSteep = ny < 0.72;

  switch (biome) {
    case 'himalaya': {
      if (isSteep) return new THREE.Color(y > 10 ? '#8e9aa8' : '#48525e');
      if (y < 3.5) return new THREE.Color('#2d4c2d'); // Valley grass
      if (y < 8.0) return new THREE.Color('#445e44'); // Low alpine
      if (y < 12.0) return new THREE.Color('#5e6a76'); // Slate mountain rock
      return new THREE.Color('#f4f8fe'); // Smooth snow peak
    }

    case 'thar': {
      if (isSteep) return new THREE.Color('#a87448');
      if (y < 2.5) return new THREE.Color('#c49654');
      if (y < 4.5) return new THREE.Color('#dcae64');
      return new THREE.Color('#e8bd74');
    }

    case 'coastal': {
      if (y < 0) return new THREE.Color('#0e2a3c'); // Sea bed
      if (y < 2.0) return new THREE.Color('#d4bc78'); // Beach sand
      if (isSteep) return new THREE.Color('#4c443b'); // Cliff face
      return new THREE.Color('#2c5c2c'); // Coastal grass
    }
  }
}

function TerrainChunk({ cx, cz }: { cx: number; cz: number }) {
  const biome = useFlightStore((s) => s.biome);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, RES - 1, RES - 1);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes['position'] as THREE.BufferAttribute;
    const count = posAttr.count;
    const colors = new Float32Array(count * 3);
    const wox = cx * CHUNK_SIZE;
    const woz = cz * CHUNK_SIZE;

    // 1. Set smooth vertex heights
    for (let i = 0; i < count; i++) {
      const lx = posAttr.getX(i) + wox;
      const lz = posAttr.getZ(i) + woz;
      const h = terrainHeightAt(lx, lz, biome);
      posAttr.setY(i, h);
    }

    // 2. Calculate normals for smooth shading & slope detection
    geo.computeVertexNormals();
    const normAttr = geo.attributes['normal'] as THREE.BufferAttribute;

    // 3. Compute continuous colors per vertex
    for (let i = 0; i < count; i++) {
      const h = posAttr.getY(i);
      const ny = normAttr.getY(i);
      const col = calculateVertexColor(h, ny, biome);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [cx, cz, biome]);

  return (
    <mesh position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]} geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        roughness={0.85}
        metalness={0.02}
        flatShading={false}
      />
    </mesh>
  );
}

// Smooth ocean water for coastal biome
function AnimatedOceanWater({ cx, cz }: { cx: number; cz: number }) {
  const waterRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (waterRef.current) {
      waterRef.current.position.y = -0.3 + Math.sin(clock.getElapsedTime() * 0.7) * 0.1;
    }
  });

  return (
    <mesh
      ref={waterRef}
      position={[cx * CHUNK_SIZE, -0.3, cz * CHUNK_SIZE]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[CHUNK_SIZE * 3.5, CHUNK_SIZE * 3.5]} />
      <meshStandardMaterial
        color="#124a68"
        roughness={0.15}
        metalness={0.3}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

// Lightweight instanced vegetation groves
function ClusteredVegetation({ biome, cx, cz }: { biome: Biome; cx: number; cz: number }) {
  const trees = useMemo(() => {
    const list: { pos: [number, number, number]; scale: number; color: string }[] = [];
    const count = biome === 'himalaya' ? 25 : biome === 'coastal' ? 20 : 8;

    for (let i = 0; i < count; i++) {
      const hash = (cx * 733 + cz * 433 + i * 197) % 10000;
      const r1 = (hash / 10000) - 0.5;
      const r2 = ((hash * 17) % 10000 / 10000) - 0.5;

      const px = cx * CHUNK_SIZE + r1 * CHUNK_SIZE * 1.8;
      const pz = cz * CHUNK_SIZE + r2 * CHUNK_SIZE * 1.8;
      const h = terrainHeightAt(px, pz, biome);

      if (biome === 'himalaya' && h > 1.5 && h < 7.0) {
        list.push({ pos: [px, h, pz], scale: 0.6 + (hash % 5) * 0.1, color: '#1e3a1e' });
      } else if (biome === 'coastal' && h > 1.5 && h < 6.0) {
        list.push({ pos: [px, h, pz], scale: 0.7 + (hash % 5) * 0.1, color: '#1b4d1b' });
      } else if (biome === 'thar' && h > 1.0 && h < 3.5 && (hash % 4 === 0)) {
        list.push({ pos: [px, h, pz], scale: 0.4 + (hash % 3) * 0.08, color: '#72643e' });
      }
    }
    return list;
  }, [biome, cx, cz]);

  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={t.pos} scale={t.scale}>
          <mesh position={[0, 1.0, 0]}>
            <coneGeometry args={[0.5, 2.0, 5]} />
            <meshStandardMaterial color={t.color} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.1, 0.14, 0.4, 4]} />
            <meshStandardMaterial color="#4a321a" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function TerrainChunks() {
  const x = useFlightStore((s) => s.x);
  const z = useFlightStore((s) => s.z);
  const biome = useFlightStore((s) => s.biome);

  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);

  const chunks = useMemo(() => {
    const arr: { key: string; cx: number; cz: number }[] = [];
    for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
      for (let dz = -GRID_RADIUS; dz <= GRID_RADIUS; dz++) {
        arr.push({ key: `${cx + dx}_${cz + dz}`, cx: cx + dx, cz: cz + dz });
      }
    }
    return arr;
  }, [cx, cz]);

  return (
    <group>
      {chunks.map((c) => (
        <TerrainChunk key={c.key} cx={c.cx} cz={c.cz} />
      ))}

      {biome === 'coastal' && <AnimatedOceanWater cx={cx} cz={cz} />}
      <ClusteredVegetation biome={biome} cx={cx} cz={cz} />
    </group>
  );
}
