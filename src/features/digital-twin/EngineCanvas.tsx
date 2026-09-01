import { Suspense, useMemo, useRef, useEffect } from 'react';
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

export const ZONE_CAMERA_FOCUS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  "CYLINDER HEAD (ROTAX RED)": { pos: [-2.8, 3.4, 3.2], target: [-1.2, 1.8, 0.4] },
  "CYLINDER HEAD": { pos: [-2.8, 3.4, 3.2], target: [-1.2, 1.8, 0.4] },
  "EXHAUST MANIFOLD": { pos: [-4.2, 1.4, -2.2], target: [-1.8, 0.4, -0.8] },
  "INTAKE / TURBO & CARBS": { pos: [4.2, 1.8, 2.2], target: [1.8, 0.5, 0.6] },
  "INTAKE / TURBO": { pos: [4.2, 1.8, 2.2], target: [1.8, 0.5, 0.6] },
  "CRANKCASE BLOCK": { pos: [0, 0.6, 3.8], target: [0, -0.05, 0] },
  "CRANKCASE": { pos: [0, 0.6, 3.8], target: [0, -0.05, 0] },
  "OIL SUMP & FILTER": { pos: [0, -3.8, 2.8], target: [0, -1.8, 0] },
  "OIL SUMP": { pos: [0, -3.8, 2.8], target: [0, -1.8, 0] },
  "GEARBOX & PROP FLANGE": { pos: [0, 1.2, 5.2], target: [0, 0.3, 2.0] },
  "PROP FLANGE": { pos: [0, 1.2, 5.2], target: [0, 0.3, 2.0] },
};

export type EngineCanvasProps = {
  interactive?: boolean;
  spin?: boolean;
  fault?: number;
  highlights?: PartHighlights;
  exploded?: boolean;
  wireframe?: boolean;
  explodeAmount?: number;
  cameraZ?: number;
  cameraView?: EngineCameraView;
  showLabels?: boolean;
  modelScale?: number;
  modelPosition?: [number, number, number];
  autoRotate?: boolean;
  onSelectZone?: (zoneName: string) => void;
  selectedZone?: string | null;
};

function CameraRig({ view, cameraZ, disabled }: { view: EngineCameraView; cameraZ: number; disabled: boolean }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const lastView = useRef(view);
  const transition = useRef(0);

  if (lastView.current !== view) {
    lastView.current = view;
    transition.current = 0;
  }

  useFrame((_, delta) => {
    if (disabled) return;
    if (transition.current >= 1) return;
    const [x, y, z] = CAMERA_POSITIONS[view];
    target.set(x, y, view === 'overview' ? cameraZ : z);
    camera.position.lerp(target, 1 - Math.exp(-delta * 4));
    camera.lookAt(0, 0.1, 0);
    transition.current = Math.min(1, transition.current + delta / 0.8);
  });

  return null;
}

// Camera zone focus rig — smoothly flies camera to inspect selected component exclusively
function CameraZoneFocusRig({ selectedZone, controlsRef }: { selectedZone?: string | null; controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();
  const activeZoneRef = useRef<string | null>(null);
  const transitioningRef = useRef(false);
  const targetCamPos = useRef<THREE.Vector3>(new THREE.Vector3());
  const targetLookAt = useRef<THREE.Vector3>(new THREE.Vector3());

  useEffect(() => {
    if (selectedZone && ZONE_CAMERA_FOCUS[selectedZone]) {
      activeZoneRef.current = selectedZone;
      const f = ZONE_CAMERA_FOCUS[selectedZone];
      targetCamPos.current.set(...f.pos);
      targetLookAt.current.set(...f.target);
      transitioningRef.current = true;
    }
  }, [selectedZone]);

  useFrame((_, delta) => {
    if (transitioningRef.current) {
      camera.position.lerp(targetCamPos.current, Math.min(1, delta * 4.5));
      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetLookAt.current, Math.min(1, delta * 4.5));
        controlsRef.current.update();
      }
      if (camera.position.distanceTo(targetCamPos.current) < 0.05) {
        transitioningRef.current = false;
      }
    }
  });

  return null;
}

export default function EngineCanvas({
  interactive = false,
  spin = true,
  fault = 0,
  highlights,
  exploded = false,
  wireframe = false,
  explodeAmount = 1.0,
  cameraZ = 7.2,
  cameraView = 'overview',
  showLabels = true,
  modelScale = 1,
  modelPosition = [0, -0.35, 0],
  autoRotate = false,
  onSelectZone,
  selectedZone,
}: EngineCanvasProps) {
  const controlsRef = useRef<any>(null);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [1.6, 1.5, cameraZ], fov: 42 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      className="cursor-grab active:cursor-grabbing"
    >
      <fog attach="fog" args={['#070a0d', 12, 35]} />
      <CameraRig view={cameraView} cameraZ={cameraZ} disabled={interactive} />
      <CameraZoneFocusRig selectedZone={selectedZone} controlsRef={controlsRef} />

      {/* Rich studio lighting */}
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 9, 7]} intensity={2.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-6, 3, -5]} intensity={0.9} color="#06b6d4" />
      <directionalLight position={[0, -5, 4]} intensity={0.6} color="#f8fafc" />
      <pointLight position={[0, -2, 3]} intensity={14} color="#f59e0b" distance={10} />

      <Suspense fallback={null}>
        <Environment>
          <Lightformer intensity={2.0} position={[0, 5, 2]} scale={[12, 6, 1]} />
          <Lightformer intensity={1.2} color="#06b6d4" position={[-6, 1, -2]} rotation-y={Math.PI / 2} scale={[16, 2, 1]} />
          <Lightformer intensity={0.8} color="#f59e0b" position={[6, 0, 2]} rotation-y={-Math.PI / 2} scale={[12, 2, 1]} />
        </Environment>
        <EngineModel
          spin={spin}
          fault={fault}
          {...(highlights !== undefined ? { highlights } : {})}
          exploded={exploded}
          wireframe={wireframe}
          explodeAmount={explodeAmount}
          showLabels={showLabels}
          modelScale={modelScale}
          modelPosition={modelPosition}
          onSelectZone={onSelectZone}
          selectedZone={selectedZone}
        />
      </Suspense>
      {interactive && (
        <OrbitControls
          ref={controlsRef}
          autoRotate={autoRotate}
          autoRotateSpeed={0.6}
          enablePan={true}
          enableZoom={true}
          minDistance={0.5}
          maxDistance={50}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          enableDamping
          dampingFactor={0.06}
        />
      )}
    </Canvas>
  );
}
