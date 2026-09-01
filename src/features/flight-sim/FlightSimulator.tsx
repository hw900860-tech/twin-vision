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
    ambient: 0.35, ambientColor: '#b0c0d8',
    sun: [40, 60, 20], sunIntensity: 1.3, sunColor: '#e0e8f0',
    fog: '#1a2744', fogNear: 30, fogFar: 400, bg: '#0c1425',
  },
  thar: {
    ambient: 0.6, ambientColor: '#f0d8a0',
    sun: [30, 50, 20], sunIntensity: 1.5, sunColor: '#ffe8c0',
    fog: '#2a1a0a', fogNear: 25, fogFar: 350, bg: '#1a1008',
  },
  coastal: {
    ambient: 0.45, ambientColor: '#a0b8d0',
    sun: [35, 45, 25], sunIntensity: 1.2, sunColor: '#d0e0f0',
    fog: '#0a1a2a', fogNear: 30, fogFar: 380, bg: '#081828',
  },
};

const DEFAULT_CONFIG: BiomeConfig = { ambient: 0.35, ambientColor: "#b0c0d8", sun: [40, 60, 20] as [number, number, number], sunIntensity: 1.3, sunColor: "#e0e8f0", fog: "#1a2744", fogNear: 30, fogFar: 400, bg: "#0c1425" };

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
      <hemisphereLight args={[config.ambientColor, '#1a1a1a', 0.4]} />

      <Stars radius={200} depth={100} count={3000} factor={4} saturation={0} />

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
      camera={{ position: [0, 12, 18], fov: 55, near: 0.1, far: 800 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ cursor: 'grab' }}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}
