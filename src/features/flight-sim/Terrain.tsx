import { useMemo } from 'react';
import * as THREE from 'three';
import { useFlightStore, type Biome } from './flightStore';

/** Deterministic hash for stable "random" values */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function noise2D(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 0.013 + seed) * 43758.5453 +
    Math.cos(z * 0.017 + seed * 1.3) * 23421.631;
  return n - Math.floor(n);
}

function fbm(x: number, z: number, octaves = 5, seed = 42): number {
  let val = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise2D(x * freq, z * freq, seed + i * 100);
    max += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return val / max;
}

const CHUNK_SIZE = 120;
const RES = 100;
const GRID_RADIUS = 2;

function heightAt(wx: number, wz: number, biome: Biome): number {
  const n = fbm(wx, wz, 5, biome === 'himalaya' ? 42 : biome === 'thar' ? 99 : 17);
  switch (biome) {
    case 'himalaya': {
      const ridge = 1 - Math.abs(n * 2 - 1);
      return (n * 0.7 + ridge * 0.3) * 26;
    }
    case 'thar': {
      const dune = Math.sin(wx * 0.03) * Math.cos(wz * 0.025) * 0.4 + 0.5;
      return n * 8 * dune;
    }
    case 'coastal': {
      const shore = (wz + CHUNK_SIZE * 0.3) / (CHUNK_SIZE * 0.4);
      if (shore < -0.1) return -0.3;
      const land = n * 10;
      return THREE.MathUtils.lerp(-0.3, land, Math.max(0, Math.min(1, shore)));
    }
    default: return n * 10;
  }
}

function vertexColor(h: number, biome: Biome): THREE.Color {
  const c = new THREE.Color();
  switch (biome) {
    case 'himalaya':
      if (h > 20) c.setHex(0xf0f4ff);
      else if (h > 15) c.setHex(0xd8dce8);
      else if (h > 10) c.setHex(0x8a929c);
      else if (h > 5) c.setHex(0x4a5a3c);
      else c.setHex(0x2a4028);
      break;
    case 'thar':
      if (h > 6) c.setHex(0xc4a060);
      else if (h > 3) c.setHex(0xd4b070);
      else if (h > 1) c.setHex(0xe0c088);
      else c.setHex(0xd8c898);
      break;
    case 'coastal':
      if (h < -0.1) c.setHex(0x1a4a6a);
      else if (h < 0.2) c.setHex(0x2a7090);
      else if (h < 1) c.setHex(0xc8b878);
      else if (h < 4) c.setHex(0x3a7a3a);
      else c.setHex(0x2a5a2a);
      break;
  }
  return c;
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

    for (let i = 0; i < count; i++) {
      const lx = (posAttr.getX ? posAttr.getX(i) : (posAttr.array[i * 3] as number)) + wox;
      const lz = (posAttr.getZ ? posAttr.getZ(i) : (posAttr.array[i * 3 + 2] as number)) + woz;
      const h = heightAt(lx, lz, biome);
      posAttr.setY(i, h);
      const col = vertexColor(h, biome);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [cx, cz, biome]);

  const isCoastal = biome === 'coastal';
  const roughness = biome === 'coastal' ? 0.6 : 0.85;
  const metalness = biome === 'himalaya' ? 0.05 : 0.02;

  return (
    <>
      <mesh
        position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}
        receiveShadow
        geometry={geometry}
      >
        <meshStandardMaterial vertexColors roughness={roughness} metalness={metalness} flatShading />
      </mesh>
      {isCoastal && (
        <mesh position={[cx * CHUNK_SIZE, -0.15, cz * CHUNK_SIZE]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CHUNK_SIZE * 3, CHUNK_SIZE * 3]} />
          <meshStandardMaterial color="#1a5a8a" transparent opacity={0.75} roughness={0.1} metalness={0.3} />
        </mesh>
      )}
    </>
  );
}

function Vegetation({ biome }: { biome: Biome }) {
  const instances = useMemo(() => {
    const items: { pos: [number, number, number]; scale: number; color: string }[] = [];
    const count = biome === 'himalaya' ? 80 : biome === 'thar' ? 40 : 60;
    const range = biome === 'thar' ? 3 : 4;

    for (let i = 0; i < count; i++) {
      // Seeded random — deterministic per index, no flicker
      const px = (seededRandom(i * 3 + 0) - 0.5) * CHUNK_SIZE * range;
      const pz = (seededRandom(i * 3 + 1) - 0.5) * CHUNK_SIZE * range;
      const h = heightAt(px, pz, biome);
      const s = seededRandom(i * 3 + 2);

      if (biome === 'himalaya' && h > 3 && h < 12) {
        items.push({ pos: [px, h, pz], scale: 0.5 + s * 1.2, color: '#2a4a2a' });
      } else if (biome === 'thar' && h > 0.5 && h < 4) {
        items.push({ pos: [px, h, pz], scale: 0.3 + s * 0.6, color: '#8a7a4a' });
      } else if (biome === 'coastal' && h > 1 && h < 6) {
        items.push({ pos: [px, h, pz], scale: 0.6 + s * 1.5, color: '#1a5a1a' });
      }
    }
    return items;
  }, [biome]);

  return (
    <group>
      {instances.map((inst, i) => (
        <group key={i} position={inst.pos} scale={inst.scale}>
          <mesh position={[0, 1, 0]} castShadow>
            <coneGeometry args={[0.5, 2, 6]} />
            <meshStandardMaterial color={inst.color} flatShading />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.1, 0.15, 0.4, 5]} />
            <meshStandardMaterial color="#5a3a1a" flatShading />
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

  const cx = Math.round(x / CHUNK_SIZE);
  const cz = Math.round(z / CHUNK_SIZE);

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
      <Vegetation biome={biome} />
    </group>
  );
}
