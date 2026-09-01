import * as THREE from 'three';
import type { Biome } from './flightStore';

const CHUNK_SIZE = 120;

function noise2D(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 0.013 + seed) * 43758.5453 + Math.cos(z * 0.017 + seed * 1.3) * 23421.631;
  return n - Math.floor(n);
}

function fbm(x: number, z: number, seed: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maximum = 0;
  for (let i = 0; i < 5; i += 1) {
    value += amplitude * noise2D(x * frequency, z * frequency, seed + i * 100);
    maximum += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return value / maximum;
}

export function terrainHeightAt(wx: number, wz: number, biome: Biome): number {
  const n = fbm(wx, wz, biome === 'himalaya' ? 42 : biome === 'thar' ? 99 : 17);
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
      return THREE.MathUtils.lerp(-0.3, n * 10, Math.max(0, Math.min(1, shore)));
    }
  }
}
