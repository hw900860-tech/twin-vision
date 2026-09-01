import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { EngineModel, type PartHighlights } from './EngineModel';

export type EngineCameraView = 'overview' | 'intake' | 'exhaust' | 'thermal' | 'core' | 'oil' | 'gcs';

const CAMERA_POSITIONS: Record<EngineCameraView, [number, number, number]> = {
  overview: [1.6, 1.5, 7.2],
  intake: [-4.4, 1.8, 3.8],
  exhaust: [3.9, 0.8, 3.9],
  thermal: [0, 4.2, 4.5],
  core: [0, -1.1, 3.8],
  oil: [-2.3, -2.4, 4.1],
  gcs: [0, 0.75, 8.3],
};

export type EngineCanvasProps = {
  interactive?: boolean;
  spin?: boolean;
  fault?: number;
  highlights?: PartHighlights;
  exploded?: boolean;
  cameraZ?: number;
  cameraView?: EngineCameraView;
  showLabels?: boolean;
  modelScale?: number;
  modelPosition?: [number, number, number];
  autoRotate?: boolean;
};

function CameraRig({ view, cameraZ }: { view: EngineCameraView; cameraZ: number }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const lastView = useRef(view);
  const transition = useRef(0);

  if (lastView.current !== view) {
    lastView.current = view;
    transition.current = 0;
  }

  useFrame((_, delta) => {
    if (transition.current >= 1) return;
    const [x, y, z] = CAMERA_POSITIONS[view];
    target.set(x, y, view === 'overview' ? cameraZ : z);
    camera.position.lerp(target, 1 - Math.exp(-delta * 4));
    camera.lookAt(0, 0.1, 0);
    transition.current = Math.min(1, transition.current + delta / 0.8);
  });

  return null;
}

export default function EngineCanvas({
  interactive = false,
  spin = true,
  fault = 0,
  highlights,
  exploded = false,
  cameraZ = 7.2,
  cameraView = 'overview',
  showLabels = true,
  modelScale = 1,
  modelPosition = [0, -0.35, 0],
  autoRotate = false,
}: EngineCanvasProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [1.6, 1.5, cameraZ], fov: 42 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <fog attach="fog" args={['#0b0e11', 9, 20]} />
      <CameraRig view={cameraView} cameraZ={cameraZ} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 6]} intensity={1.5} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-6, 2, -4]} intensity={0.5} color="#6fd8e8" />
      <pointLight position={[0, -2, 3]} intensity={12} color="#f0a63c" distance={9} />
      <Suspense fallback={null}>
        <Environment>
          <Lightformer intensity={1.6} position={[0, 5, 2]} scale={[10, 6, 1]} />
          <Lightformer intensity={0.9} color="#7fd6e8" position={[-6, 1, -2]} rotation-y={Math.PI / 2} scale={[16, 2, 1]} />
          <Lightformer intensity={0.5} color="#f0a63c" position={[6, 0, 2]} rotation-y={-Math.PI / 2} scale={[12, 2, 1]} />
        </Environment>
        <EngineModel
          spin={spin}
          fault={fault}
          {...(highlights !== undefined ? { highlights } : {})}
          exploded={exploded}
          showLabels={showLabels}
          modelScale={modelScale}
          modelPosition={modelPosition}
        />
      </Suspense>
      {interactive && (
        <OrbitControls
          autoRotate={autoRotate}
          autoRotateSpeed={0.7}
          enablePan={false}
          minDistance={5}
          maxDistance={10}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.85}
          enableDamping
          dampingFactor={0.08}
        />
      )}
    </Canvas>
  );
}
