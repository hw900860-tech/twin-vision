import * as THREE from 'three';
import type { Biome } from './flightStore';

// ============================================================================
// Ultra-Fast 2D Simplex Noise for Smooth, Lag-Free Terrain Generation
// ============================================================================

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

const grad2: [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

const perm = new Uint8Array(512);

function buildPermutationTable(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = Math.floor((s / 2147483647) * (i + 1));
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;
}

buildPermutationTable(1337);

export function simplex2D(xin: number, yin: number): number {
  let n0 = 0, n1 = 0, n2 = 0;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;

  let i1 = 0, j1 = 0;
  if (x0 > y0) { i1 = 1; j1 = 0; }
  else { i1 = 0; j1 = 1; }

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    const gi0 = perm[ii + perm[jj]!]! % 8;
    const g = grad2[gi0]!;
    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    const gi1 = perm[ii + i1 + perm[jj + j1]!]! % 8;
    const g = grad2[gi1]!;
    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    const gi2 = perm[ii + 1 + perm[jj + 1]!]! % 8;
    const g = grad2[gi2]!;
    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
  }

  return 70.0 * (n0 + n1 + n2);
}

// 3-octave FBM for optimal performance and smooth curves
export function fbm2D(x: number, z: number): number {
  const n1 = simplex2D(x, z);
  const n2 = simplex2D(x * 2.1, z * 2.1) * 0.5;
  const n3 = simplex2D(x * 4.2, z * 4.2) * 0.25;
  return (n1 + n2 + n3) / 1.75;
}

// Calibrated Height Function (Prevents Overlapping & Aircraft Collision)
export function terrainHeightAt(wx: number, wz: number, biome: Biome): number {
  const sx = wx * 0.0025;
  const sz = wz * 0.0025;
  const n = fbm2D(sx, sz);

  switch (biome) {
    case 'himalaya': {
      // Smooth alpine landscape (Heights between 1.0 and 15.0 max)
      const baseVal = (n + 1) * 0.5; // [0, 1]
      const smoothElevation = Math.pow(baseVal, 1.2) * 14.0;
      return Math.max(0.5, smoothElevation);
    }
    case 'thar': {
      // Smooth rolling desert dunes (Heights between 1.0 and 6.0 max)
      const duneWave = Math.sin(wx * 0.012 + wz * 0.006) * 2.5 + Math.cos(wx * 0.02) * 1.5;
      const height = 2.5 + duneWave + n * 1.5;
      return Math.max(0.5, height);
    }
    case 'coastal': {
      // Smooth shoreline to coastal hills (Heights between -2.0 and 10.0)
      const shoreDist = (wz + 120) * 0.005;
      if (shoreDist < -0.2) return -2.0;
      if (shoreDist < 0.1) return THREE.MathUtils.lerp(-2.0, 1.0, (shoreDist + 0.2) / 0.3);
      const hill = (n + 1) * 4.5;
      return Math.max(0, 1.0 + hill);
    }
  }
}
