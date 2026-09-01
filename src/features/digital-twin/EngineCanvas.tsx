import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { EngineModel, type PartHighlights } from './EngineModel';
import { Expand, Shrink } from 'lucide-react';

export type EngineCanvasProps = {
  interactive?: boolean;
  spin?: boolean;
  fault?: number;
  highlights?: PartHighlights;
  exploded?: boolean;
  selectedCylinder?: number | null;
  onSelectCylinder?: (i: number) => void;
  cameraZ?: number;
};

export default function EngineCanvas({
  interactive = false,
  spin = true,
  fault = 0,
  highlights,
  exploded = false,
  selectedCylinder = null,
  onSelectCylinder,
  cameraZ = 7.2,
}: EngineCanvasProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [1.6, 1.5, cameraZ], fov: 42 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <fog attach="fog" args={['#0b0e11', 9, 20]} />
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
          {...(selectedCylinder !== null ? { selectedCylinder } : {})}
          {...(onSelectCylinder !== undefined ? { onSelectCylinder } : {})}
        />
      </Suspense>
      {interactive && (
        <OrbitControls
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
