import { Component, Suspense, useCallback, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { useFlightStore } from './flightStore';
import { TerrainChunks } from './Terrain';
import { UAVModel } from './UAVModel';
import { RoutePath, RoutePlannerInteraction } from './RoutePath';

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
      <RoutePath />
      <RoutePlannerInteraction />
      <UAVModel />
    </>
  );
}

/**
 * Scene error boundary — a crash inside the 3D tree (e.g. during a WebGL
 * context-loss recovery) must never take the DOM HUD / control panels down.
 * On failure it asks the parent to remount the canvas fresh.
 */
class SceneErrorBoundary extends Component<
  { onReset: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(err: unknown) {
    console.warn('[scene] 3D scene crashed — remounting canvas', err);
    this.props.onReset();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function FlightSimulator() {
  const [epoch, setEpoch] = useState(0);
  const lastRecover = useRef(0);

  // Bump the key → React unmounts the broken canvas and mounts a fresh one.
  // Cooldown stops remount storms if the context keeps dying.
  const recover = useCallback(() => {
    const now = Date.now();
    if (now - lastRecover.current < 4000) return;
    lastRecover.current = now;
    setEpoch((e) => e + 1);
  }, []);

  return (
    <Canvas
      key={epoch}
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 24, 28], fov: 50, near: 0.1, far: 2000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ cursor: 'grab' }}
      onCreated={({ gl }) => {
        const el = gl.domElement;
        const onLost = (e: Event) => {
          // preventDefault lets the browser attempt restore — but we remount
          // cleanly instead, which avoids R3F committing against dead objects.
          e.preventDefault();
          console.warn('[scene] WebGL context lost — remounting canvas');
          recover();
        };
        el.addEventListener('webglcontextlost', onLost, false);
      }}
    >
      <Suspense fallback={null}>
        <SceneErrorBoundary onReset={recover}>
          <SceneContent />
        </SceneErrorBoundary>
      </Suspense>
    </Canvas>
  );
}
