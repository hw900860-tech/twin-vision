import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { useFlightStore } from './flightStore';
import { TerrainChunks } from './Terrain';
import { UAVModel } from './UAVModel';

type BiomeConfig = {
  ambient: number; ambientColor: string;
  sun: [number, number, number]; sunIntensity: number; sunColor: string;
  fog: string; fogNear: number; fogFar: number; bg: string;
};

const BIOME_LIGHTING: Record<string, BiomeConfig> = {
  himalaya: {
    ambient: 0.42, ambientColor: '#a8bcd4',
    sun: [80, 120, 60], sunIntensity: 1.4, sunColor: '#edf3fa',
    fog: '#1e2d42', fogNear: 120, fogFar: 1200, bg: '#0d1726',
  },
  thar: {
    ambient: 0.55, ambientColor: '#ebd0a0',
    sun: [90, 100, 40], sunIntensity: 1.5, sunColor: '#ffebc4',
    fog: '#302014', fogNear: 90, fogFar: 1000, bg: '#1c120a',
  },
  coastal: {
    ambient: 0.48, ambientColor: '#a4b8cc',
    sun: [70, 110, 50], sunIntensity: 1.35, sunColor: '#d8e8f8',
    fog: '#16283a', fogNear: 100, fogFar: 1100, bg: '#0a1828',
  },
};

const DEFAULT_CONFIG: BiomeConfig = { ambient: 0.42, ambientColor: '#a8bcd4', sun: [80, 120, 60], sunIntensity: 1.4, sunColor: '#edf3fa', fog: '#1e2d42', fogNear: 120, fogFar: 1200, bg: '#0d1726' };

function SceneContent() {
  const biome = useFlightStore((s) => s.biome);
  const config: BiomeConfig = BIOME_LIGHTING[biome] ?? DEFAULT_CONFIG;

  return (
    <>
      <color attach="background" args={[config.bg]} />
      <fog attach="fog" args={[config.fog, config.fogNear, config.fogFar]} />

      <ambientLight intensity={config.ambient} color={config.ambientColor} />
      <directionalLight
        position={config.sun}
        intensity={config.sunIntensity}
        color={config.sunColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={[config.ambientColor, '#12161c', 0.45]} />

      <Stars radius={300} depth={120} count={3500} factor={4} saturation={0} />

      <TerrainChunks />
      <UAVModel />
    </>
  );
}

export function FlightSimulator() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 24, 28], fov: 50, near: 0.1, far: 2000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ cursor: 'grab' }}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}
