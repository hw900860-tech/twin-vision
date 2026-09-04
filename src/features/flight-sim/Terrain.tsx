import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFlightStore, type Biome } from './flightStore';
import { terrainHeightAt, detailNoise2D, rippleBand } from './terrainMath';
import type { FlightRegion } from './regions';
import { terrainPointerDown } from './RoutePath';

const CHUNK_SIZE = 160;
const RES = 44; // Optimized grid resolution for 60+ FPS performance
const GRID_RADIUS = 1; // 3x3 chunks (9 total chunks, zero lag)

// Smooth color palette generator based on elevation & slope, with procedural
// texture detail: mottled valley grass, banded rock strata, ragged snow line,
// dune ripples and depth-graded sea bed. `wx/wz` feed the detail noise so the
// texture stays continuous across chunk boundaries.
function calculateVertexColor(y: number, ny: number, biome: Biome, wx: number, wz: number): THREE.Color {
  const isSteep = ny < 0.72;
  const d = detailNoise2D(wx, wz); // -1..1 cosmetic mottle

  switch (biome) {
    case 'himalaya': {
      if (isSteep) {
        // Bare rock faces: slate with strata banding + mossy seams in the shade
        if (y > 10.5) {
          const ice = Math.max(0, Math.min(1, (d + 1) * 0.5));
          return new THREE.Color('#e8eef6').lerp(new THREE.Color('#8b98a8'), ice * 0.9);
        }
        const band = Math.sin(y * 1.6 + d * 1.4) * 0.5 + 0.5;
        const seam = Math.max(0, Math.min(1, (d + 1) * 0.5));
        return new THREE.Color('#454e58').lerp(new THREE.Color('#7a8492'), band * 0.6 + seam * 0.2);
      }
      if (y < 3.5) {
        // Valley grass — patchy meadows with darker moss hollows
        const patch = Math.max(0, Math.min(1, Math.sin(wx * 0.016 + Math.sin(wz * 0.012) * 3.0) * 0.5 + 0.5));
        const g = Math.max(0, Math.min(1, (d + 1) * 0.5));
        return new THREE.Color('#27431f').lerp(new THREE.Color('#47693c'), patch * 0.7 + g * 0.3);
      }
      if (y < 8.0) {
        // Alpine meadow → scree transition (blend of grass, moss & broken rock)
        const g = Math.max(0, Math.min(1, (d + 1) * 0.5));
        const scree = Math.max(0, Math.min(1, (y - 5.6) / 2.4));
        return new THREE.Color('#3a5233').lerp(new THREE.Color('#6a736a'), g * 0.6 + scree * 0.4);
      }
      if (y < 12.0) {
        // Slate rock with strata banding + shadowed gullies
        const band = Math.sin(y * 1.6 + d * 1.4) * 0.5 + 0.5;
        const gully = Math.max(0, Math.min(1, (d + 1) * 0.5));
        return new THREE.Color('#4e5a66').lerp(new THREE.Color('#87929f'), band * 0.55 + gully * 0.25);
      }
      // Snow cap — ragged snow line + glacier ice veins above 14
      const rockMix = Math.max(0, Math.min(1, (d + 1) * 0.22));
      const snowMix = Math.max(0, Math.min(1, (y - 12.0) / 2.2)) * (1 - rockMix) + rockMix * 0.35;
      const iceVein = Math.max(0, Math.min(1, (y - 14.5) / 1.6));
      const base = new THREE.Color('#7f8c9c').lerp(new THREE.Color('#eef5fe'), snowMix);
      return base.lerp(new THREE.Color('#c9e0f8'), iceVein * Math.max(0, d));
    }

    case 'thar': {
      if (isSteep) {
        // Bare dune slip face / rock outcrop — wind-shadowed
        const sun = Math.max(0, Math.min(1, (d + 1) * 0.5));
        return new THREE.Color('#8a5a2c').lerp(new THREE.Color('#b8863f'), sun);
      }
      // Dune body: windward bright crest, leeward dark, rippled striping
      const ripple = rippleBand(wx, wz);
      const crest = Math.max(0, Math.min(1, Math.sin(wx * 0.018 + Math.sin(wz * 0.014) * 2.2) * 0.5 + 0.5));
      const windward = Math.max(0, Math.min(1, (d + 1) * 0.5));
      const base = new THREE.Color('#a3773d').lerp(new THREE.Color('#e6bd72'), ripple * 0.55 + crest * 0.3);
      return base.lerp(new THREE.Color('#c08d45'), windward * 0.45);
    }

    case 'coastal': {
      if (y < 0) {
        // Sea bed: pale sand shelf → deep water bands
        const depth = Math.max(0, Math.min(1, (-y) / 2.6));
        return new THREE.Color('#0c2f45').lerp(new THREE.Color('#14617c'), depth * 0.8);
      }
      if (y < 0.35) {
        // Surf line — wet gleaming sand where waves wash up
        const foam = Math.max(0, Math.min(1, (d + 1) * 0.5));
        return new THREE.Color('#b09a5e').lerp(new THREE.Color('#e6d49a'), foam);
      }
      if (y < 2.2) {
        // Dry beach — ripple mottling and darker wet streaks
        const base = new THREE.Color('#bfa262').lerp(new THREE.Color('#e0c683'), rippleBand(wx, wz));
        const streak = Math.max(0, Math.min(1, (d + 1) * 0.5));
        return base.lerp(new THREE.Color('#aa9056'), streak * 0.35);
      }
      if (isSteep) {
        // Cliff strata with vegetation seams
        const band = Math.sin(y * 1.8 + d * 1.5) * 0.5 + 0.5;
        return new THREE.Color('#3c382f').lerp(new THREE.Color('#5d5240'), band);
      }
      // Coastal grass — patchy pasture to headland scrub
      const patch = Math.max(0, Math.min(1, Math.sin(wx * 0.02 + Math.sin(wz * 0.016) * 2.4) * 0.5 + 0.5));
      const g = Math.max(0, Math.min(1, (d + 1) * 0.5));
      return new THREE.Color('#1e4a22').lerp(new THREE.Color('#4c7a36'), patch * 0.6 + g * 0.4);
    }
  }
}

const REGION_SEV_COLOR: Record<string, string> = {
  info: '#3b82f6',
  caution: '#f0a63c',
  critical: '#e2523f',
};

function RegionMarker({ region, active }: { region: FlightRegion; active: boolean }) {
  const biome = useFlightStore((s) => s.biome);
  const gy = terrainHeightAt(region.cx, region.cz, biome) + 0.25;
  const color = REGION_SEV_COLOR[region.severity] ?? '#3b82f6';
  // Live-meteo deformation: when a station is synced, regions drift downwind
  // and the rings stretch into ellipses along the flow (wind-down axis).
  const stretch = region.stretch ?? 1;
  const axisRad = ((region.axisDeg ?? 0) * Math.PI) / 180;

  return (
    <group position={[region.cx, 0, region.cz]}>
      {/* vertical beacon — visible from the chase view across the terrain */}
      <mesh position={[0, gy + 16, 0]}>
        <cylinderGeometry args={[0.5, 0.9, 32, 6, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={active ? 0.42 : 0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          fog={false}
        />
      </mesh>
      {/* pulsing beacon cap while the UAV is inside */}
      {active && (
        <mesh position={[0, gy + 33.5, 0]}>
          <sphereGeometry args={[1.1, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} fog={false} />
        </mesh>
      )}
      {/* wind-aligned stretched geometry (labels stay upright, unstretched) */}
      <group rotation={[0, axisRad, 0]}>
        <group scale={[stretch, 1, 1]}>
          {/* soft fill */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, gy - 0.05, 0]}>
            <circleGeometry args={[region.radius - 1.5, 40]} />
            <meshBasicMaterial color={color} transparent opacity={active ? 0.22 : 0.09} depthWrite={false} fog={false} />
          </mesh>
          {/* tactical boundary ring — always lit so the zone reads at distance */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, gy, 0]}>
            <ringGeometry args={[region.radius - 0.6, region.radius, 48]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={active ? 1 : 0.72}
              depthWrite={false}
              side={THREE.DoubleSide}
              fog={false}
            />
          </mesh>
          {/* dashed inner ring while active */}
          {active && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, gy + 0.02, 0]}>
              <ringGeometry args={[region.radius * 0.72, region.radius * 0.72 + 0.5, 48]} />
              <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} fog={false} />
            </mesh>
          )}
        </group>
      </group>
      {/* floating tactical label — taller, larger, always readable */}
      <Html center position={[0, 20.5, 0]} distanceFactor={95} zIndexRange={[20, 0]}>
        <div
          className="pointer-events-none whitespace-nowrap border px-1.5 py-0.5 font-mono tracking-wider"
          style={{
            fontSize: 11,
            fontWeight: 700,
            borderColor: color,
            background: 'rgba(6,10,14,0.88)',
            color: active ? '#ffffff' : color,
            boxShadow: active ? `0 0 12px ${color}88` : `0 0 4px ${color}44`,
            opacity: active ? 1 : 0.92,
          }}
        >
          {active ? '◈ ' : '◇ '}{region.name}
          <span className="ml-1 opacity-80" style={{ fontSize: 9 }}>{region.severity.toUpperCase()}</span>
        </div>
      </Html>
    </group>
  );
}

function RegionMarkers() {
  // `regions` is the ACTIVE set: static rings by default, deformed by the live
  // OpenWeather ingestion when a station is synced (shifted + ellipse-stretched).
  const regions = useFlightStore((s) => s.regions);
  const regionsInside = useFlightStore((s) => s.regionsInside);
  return (
    <group>
      {regions.map((r) => (
        <RegionMarker key={r.id} region={r} active={regionsInside.includes(r.id)} />
      ))}
    </group>
  );
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
      const wx = posAttr.getX(i) + wox;
      const wz = posAttr.getZ(i) + woz;
      const col = calculateVertexColor(h, ny, biome, wx, wz);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [cx, cz, biome]);

  return (
    <mesh
      position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}
      geometry={geometry}
      onPointerDown={terrainPointerDown}
    >
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

// Procedural biome dressing: pines + rocks (himalaya), scrub + outcrops (thar),
// palms/coastal scrub + boulders (coastal). Deterministic hashing keeps chunks stable.
type VegKind = 'tree' | 'shrub' | 'rock';

function ClusteredVegetation({ biome, cx, cz }: { biome: Biome; cx: number; cz: number }) {
  const items = useMemo(() => {
    const list: { pos: [number, number, number]; scale: number; kind: VegKind; color: string }[] = [];
    const count = biome === 'himalaya' ? 22 : biome === 'coastal' ? 18 : 14;

    for (let i = 0; i < count; i++) {
      const hash = (cx * 733 + cz * 433 + i * 197) % 10000;
      const r1 = (hash / 10000) - 0.5;
      const r2 = (((hash * 17) % 10000) / 10000) - 0.5;
      const px = cx * CHUNK_SIZE + r1 * CHUNK_SIZE * 1.8;
      const pz = cz * CHUNK_SIZE + r2 * CHUNK_SIZE * 1.8;
      const h = terrainHeightAt(px, pz, biome);
      const roll = hash % 11;
      const color = (hash % 5) === 0 ? '#163018' : (hash % 3) === 0 ? '#27491f' : '#1d3d1a';

      if (biome === 'himalaya') {
        if (roll >= 8 && h > 2.2 && h < 7.5) {
          list.push({ pos: [px, h, pz], scale: 0.6 + (hash % 5) * 0.12, kind: 'tree', color: '#1d4020' });
        } else if (roll < 3 && h > 1.2 && h < 6.2) {
          list.push({ pos: [px, h, pz], scale: 0.35 + (hash % 4) * 0.1, kind: 'rock', color: '#6a7684' });
        }
      } else if (biome === 'coastal') {
        if (roll >= 6 && h > 1.4 && h < 5.6) {
          list.push({ pos: [px, h, pz], scale: 0.5 + (hash % 5) * 0.1, kind: 'tree', color: '#245722' });
        } else if (roll < 3 && h > 0.8 && h < 4.6) {
          list.push({ pos: [px, h, pz], scale: 0.3 + (hash % 4) * 0.12, kind: 'rock', color: '#5f5847' });
        } else if (h > 0.4 && h < 3.4) {
          list.push({ pos: [px, h, pz], scale: 0.35 + (hash % 3) * 0.08, kind: 'shrub', color: '#2f5c24' });
        }
      } else {
        // thar: sparse scrub tufts + wind-carved outcrops
        if (roll < 3 && h > 1.2 && h < 4.2) {
          list.push({ pos: [px, h, pz], scale: 0.5 + (hash % 4) * 0.15, kind: 'rock', color: '#8a6238' });
        } else if (roll >= 6 && h > 0.6 && h < 3.8) {
          list.push({ pos: [px, h, pz], scale: 0.3 + (hash % 3) * 0.07, kind: 'shrub', color: '#6f6a38' });
        }
      }
    }
    return list;
  }, [biome, cx, cz]);

  return (
    <group>
      {items.map((t, i) => (
        <group key={i} position={t.pos} scale={t.scale}>
          {t.kind === 'tree' && (
            <>
              <mesh position={[0, 1.15, 0]}>
                <coneGeometry args={[0.55, 2.3, 6]} />
                <meshStandardMaterial color={t.color} roughness={0.9} />
              </mesh>
              <mesh position={[0, 0.72, 0]}>
                <coneGeometry args={[0.4, 1.6, 6]} />
                <meshStandardMaterial color={t.color} roughness={0.9} />
              </mesh>
              <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.09, 0.13, 0.4, 5]} />
                <meshStandardMaterial color="#4a321a" roughness={0.95} />
              </mesh>
            </>
          )}
          {t.kind === 'shrub' && (
            <>
              <mesh position={[0, 0.3, 0]}>
                <sphereGeometry args={[0.5, 6, 4]} />
                <meshStandardMaterial color={t.color} roughness={0.95} />
              </mesh>
              <mesh position={[0.1, 0.1, 0]}>
                <sphereGeometry args={[0.28, 6, 4]} />
                <meshStandardMaterial color={t.color} roughness={0.95} />
              </mesh>
            </>
          )}
          {t.kind === 'rock' && (
            <mesh position={[0, 0.22, 0]}>
              <dodecahedronGeometry args={[0.55, 0]} />
              <meshStandardMaterial color={t.color} roughness={0.96} flatShading />
            </mesh>
          )}
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

      {/* Tactical atmospheric-region rings + labels for the current biome */}
      <RegionMarkers />
    </group>
  );
}
