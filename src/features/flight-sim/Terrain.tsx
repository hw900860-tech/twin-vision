import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFlightStore, type Biome } from './flightStore';
import { terrainHeightAt } from './terrainMath';

/** Deterministic hash for stable "random" values */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const CHUNK_SIZE = 120;
const RES = 100;
const GRID_RADIUS = 2;

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

function createBiomeTexture(biome: Biome): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const palette = biome === 'himalaya'
    ? [[105, 119, 132], [151, 160, 168], [205, 211, 218]]
    : biome === 'thar'
      ? [[166, 119, 62], [205, 158, 88], [232, 193, 123]]
      : [[28, 82, 99], [42, 119, 105], [91, 143, 94]];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const wave = Math.sin(x * 0.38 + y * 0.11) * 0.5 + Math.cos(y * 0.27) * 0.3;
      const grain = seededRandom(x * 71 + y * 113) * 0.35;
      const index = Math.max(0, Math.min(palette.length - 1, Math.floor((grain + wave + 0.8) * 1.2)));
      const color = palette[index]!;
      const offset = (y * size + x) * 4;
      data[offset] = color[0]!;
      data[offset + 1] = color[1]!;
      data[offset + 2] = color[2]!;
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
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
      const h = terrainHeightAt(lx, lz, biome);
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

  const texture = useMemo(() => createBiomeTexture(biome), [biome]);
  const roughness = biome === 'coastal' ? 0.6 : 0.85;
  const metalness = biome === 'himalaya' ? 0.05 : 0.02;

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <>
      <mesh
        position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}
        receiveShadow
        geometry={geometry}
      >
        <meshStandardMaterial map={texture} vertexColors roughness={roughness} metalness={metalness} />
      </mesh>
    </>
  );
}

function Vegetation({ biome, centerX, centerZ }: { biome: Biome; centerX: number; centerZ: number }) {
  const instances = useMemo(() => {
    const items: { pos: [number, number, number]; scale: number; color: string }[] = [];
    const count = biome === 'himalaya' ? 80 : biome === 'thar' ? 40 : 60;
    const range = biome === 'thar' ? 3 : 4;

    for (let i = 0; i < count; i++) {
      // Seeded random — deterministic per index, no flicker
      const px = centerX * CHUNK_SIZE + (seededRandom(i * 3 + 0) - 0.5) * CHUNK_SIZE * range;
      const pz = centerZ * CHUNK_SIZE + (seededRandom(i * 3 + 1) - 0.5) * CHUNK_SIZE * range;
      const h = terrainHeightAt(px, pz, biome);
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
  }, [biome, centerX, centerZ]);

  return (
    <group>
      {instances.map((inst, i) => (
        <group key={i} position={inst.pos} scale={inst.scale}>
          <mesh position={[0, 1, 0]} castShadow>
            <coneGeometry args={[0.5, 2, 8]} />
            <meshStandardMaterial color={inst.color} flatShading />
          </mesh>
          <mesh position={[0, 1.8, 0]} castShadow>
            <coneGeometry args={[0.36, 1.4, 8]} />
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

function MountainRange({ centerX, centerZ }: { centerX: number; centerZ: number }) {
  const peaks = useMemo(() => [
    { x: -190, z: -250, radius: 80, height: 48 },
    { x: 40, z: -290, radius: 105, height: 58 },
    { x: 250, z: -210, radius: 75, height: 42 },
    { x: -280, z: 170, radius: 92, height: 52 },
    { x: 230, z: 230, radius: 110, height: 46 },
  ], []);

  return (
    <group>
      {peaks.map((peak, index) => {
        const x = centerX * CHUNK_SIZE + peak.x;
        const z = centerZ * CHUNK_SIZE + peak.z;
        const base = terrainHeightAt(x, z, 'himalaya');
        return (
          <group key={index} position={[x, base + peak.height / 2, z]}>
            <mesh receiveShadow>
              <coneGeometry args={[peak.radius, peak.height, 10]} />
              <meshStandardMaterial color="#4f5c68" roughness={0.9} flatShading />
            </mesh>
            <mesh position={[0, peak.height * 0.38, 0]}>
              <coneGeometry args={[peak.radius * 0.42, peak.height * 0.28, 10]} />
              <meshStandardMaterial color="#dce2e8" roughness={0.95} flatShading />
            </mesh>
          </group>
        );
      })}
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
      {biome === 'coastal' && (
        <mesh position={[cx * CHUNK_SIZE, -0.3, cz * CHUNK_SIZE]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CHUNK_SIZE * (GRID_RADIUS * 2 + 3), CHUNK_SIZE * (GRID_RADIUS * 2 + 3)]} />
          <meshStandardMaterial color="#1b5875" transparent opacity={0.78} roughness={0.18} metalness={0.2} />
        </mesh>
      )}
      {biome === 'himalaya' && <MountainRange centerX={cx} centerZ={cz} />}
      <Vegetation biome={biome} centerX={cx} centerZ={cz} />
    </group>
  );
}
