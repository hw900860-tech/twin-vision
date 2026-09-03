import { Suspense, useMemo, useRef, useEffect, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { EngineModel, type PartHighlights } from './EngineModel';
import { EngineFlowField } from './EngineFlowField';
import { useFlightStore } from '../flight-sim/flightStore';

export type EngineCameraView = 'overview' | 'intake' | 'exhaust' | 'thermal' | 'core' | 'oil' | 'gcs';

export const ZONE_CAMERA_FOCUS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  "CYLINDER HEAD (ROTAX RED)": { pos: [-1.98, 3.8, 7.2], target: [-1.98, 3.0, 1.1] },
  "CYLINDER HEAD": { pos: [-1.98, 3.8, 7.2], target: [-1.98, 3.0, 1.1] },
  "EXHAUST MANIFOLD": { pos: [-6.8, 1.2, 2.8], target: [-2.97, 0.7, -1.1] },
  "INTAKE / TURBO & CARBS": { pos: [6.8, 1.5, 4.2], target: [2.97, 0.9, 1.2] },
  "INTAKE / TURBO": { pos: [6.8, 1.5, 4.2], target: [2.97, 0.9, 1.2] },
  "CRANKCASE BLOCK": { pos: [0, 0.6, 7.5], target: [0, -0.1, 0] },
  "CRANKCASE": { pos: [0, 0.6, 7.5], target: [0, -0.1, 0] },
  "OIL SUMP & FILTER": { pos: [0, -3.5, 6.8], target: [0, -3.0, 0.2] },
  "OIL SUMP": { pos: [0, -3.5, 6.8], target: [0, -3.0, 0.2] },
  "GEARBOX & PROP FLANGE": { pos: [0, 0.8, 11.2], target: [0, 0.6, 4.5] },
  "PROP FLANGE": { pos: [0, 0.8, 11.2], target: [0, 0.6, 4.5] },
};

function EngineLoadVectorArrow() {
  const loadVector = useFlightStore((s) => s.loadVector);
  const arrowRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!arrowRef.current) return;
    const dir = new THREE.Vector3(loadVector[0], loadVector[1], loadVector[2]);
    const len = dir.length();
    if (len > 0.01) {
      dir.normalize();
      arrowRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
  });

  return (
    <group position={[-2.4, 2.0, -1.0]} ref={arrowRef}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.6, 8]} />
        <meshBasicMaterial color="#06b6d4" />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <coneGeometry args={[0.07, 0.18, 8]} />
        <meshBasicMaterial color="#06b6d4" />
      </mesh>
    </group>
  );
}

const CAMERA_POSITIONS: Record<EngineCameraView, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [1.6, 1.5, 7.2], target: [0, 0, 0] },
  intake: ZONE_CAMERA_FOCUS["INTAKE / TURBO"],
  exhaust: ZONE_CAMERA_FOCUS["EXHAUST MANIFOLD"],
  thermal: ZONE_CAMERA_FOCUS["CYLINDER HEAD"],
  core: ZONE_CAMERA_FOCUS["CRANKCASE"],
  oil: ZONE_CAMERA_FOCUS["OIL SUMP"],
  gcs: { pos: [0, 0.75, 8.3], target: [0, 0, 0] },
};

export type EngineCanvasProps = {
  interactive?: boolean;
  spin?: boolean;
  fault?: number;
  highlights?: PartHighlights;
  exploded?: boolean;
  wireframe?: boolean;
  /** Physical look: opaque materials with real Rotax colours — data-viz glow only on hover/select/extreme load. */
  physicalTone?: boolean;
  /** 1 = engine rendered in the cinematic's X-ray look … 0 = physical. Only meaningful with physicalTone. */
  xrayReveal?: number;
  explodeAmount?: number;
  cameraZ?: number;
  cameraView?: EngineCameraView;
  showLabels?: boolean;
  modelScale?: number;
  modelPosition?: [number, number, number];
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  onSelectZone?: (zoneName: string | null) => void;
  selectedZone?: string | null;
  /** External deterministic rotation clock — keeps the spin continuous across scenes. */
  rotationSync?: { angle: number };
};

function CameraRig({ view, cameraZ, disabled }: { view: EngineCameraView; cameraZ: number; disabled: boolean }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const lastView = useRef(view);
  const transition = useRef(0);

  if (lastView.current !== view) {
    lastView.current = view;
    transition.current = 0;
  }

  useFrame((_, delta) => {
    if (disabled) return;
    if (transition.current >= 1) return;
    const v = CAMERA_POSITIONS[view];
    const [x, y, z] = v.pos;
    const [tx, ty, tz] = v.target;
    target.set(x, y, view === 'overview' ? cameraZ : z);
    lookTarget.set(tx, ty, tz);
    camera.position.lerp(target, 1 - Math.exp(-delta * 4));
    camera.lookAt(lookTarget);
    transition.current = Math.min(1, transition.current + delta / 0.8);
  });

  return null;
}

function CameraZoneFocusRig({ selectedZone, controlsRef }: { selectedZone?: string | null; controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();
  const prevZone = useRef<string | null>(null);
  const animProgress = useRef<number>(1);
  const startCamPos = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const endCamPos = useRef(new THREE.Vector3());
  const endTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    if (selectedZone && selectedZone !== prevZone.current && ZONE_CAMERA_FOCUS[selectedZone]) {
      prevZone.current = selectedZone;
      const f = ZONE_CAMERA_FOCUS[selectedZone];

      startCamPos.current.copy(camera.position);
      startTarget.current.copy(controlsRef.current ? controlsRef.current.target : new THREE.Vector3(0, 0, 0));

      endCamPos.current.set(...f.pos);
      endTarget.current.set(...f.target);

      animProgress.current = 0;
    } else if (!selectedZone && prevZone.current) {
      prevZone.current = null;
      startCamPos.current.copy(camera.position);
      startTarget.current.copy(controlsRef.current ? controlsRef.current.target : new THREE.Vector3(0, 0, 0));

      endCamPos.current.set(1.6, 1.5, 7.2);
      endTarget.current.set(0, 0, 0);

      animProgress.current = 0;
    }
  }, [selectedZone, camera, controlsRef]);

  useFrame((_, delta) => {
    if (animProgress.current < 1) {
      animProgress.current = Math.min(1, animProgress.current + delta * 2.8);
      const t = animProgress.current;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      camera.position.lerpVectors(startCamPos.current, endCamPos.current, ease);

      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(startTarget.current, endTarget.current, ease);
        controlsRef.current.update();
      } else {
        camera.lookAt(endTarget.current);
      }
    }
  });

  return null;
}

function EngineCanvas({
  interactive = false,
  spin = true,
  fault = 0,
  highlights,
  exploded = false,
  wireframe = false,
  physicalTone = false,
  xrayReveal = 0,
  explodeAmount = 1.0,
  cameraZ = 7.2,
  cameraView = 'overview',
  showLabels = true,
  modelScale = 1,
  modelPosition = [0, -0.35, 0],
  autoRotate = false,
  autoRotateSpeed = 0.6,
  onSelectZone,
  selectedZone,
  rotationSync,
}: EngineCanvasProps) {
  const controlsRef = useRef<any>(null);
  const setFocusedComponent = useFlightStore((s) => s.setFocusedComponent);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSelectZone?.(null);
        setFocusedComponent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectZone, setFocusedComponent]);

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

      {/* Studio lighting — neutral key + cyan brand rim. Materials are now
          physical (red covers, silver alloy) so the wash is kept neutral. */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[6, 9, 7]} intensity={2.6} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-6, 3, -5]} intensity={1.0} color="#06b6d4" />
      <directionalLight position={[0, -5, 4]} intensity={0.9} color="#f8fafc" />
      <pointLight position={[2, -3.5, 4]} intensity={4.5} color="#ffe9cf" distance={16} />

      <Suspense fallback={null}>
        <Environment>
          <Lightformer intensity={2.6} position={[0, 5, 2]} scale={[12, 6, 1]} />
          <Lightformer intensity={1.2} color="#06b6d4" position={[-6, 1, -2]} rotation-y={Math.PI / 2} scale={[16, 2, 1]} />
          <Lightformer intensity={0.5} color="#fff3e2" position={[6, 0, 2]} rotation-y={-Math.PI / 2} scale={[12, 2, 1]} />
        </Environment>

        <EngineFlowField />
        <EngineLoadVectorArrow />

        <EngineModel
          spin={spin}
          fault={fault}
          {...(highlights !== undefined ? { highlights } : {})}
          exploded={exploded}
          wireframe={wireframe}
          physicalTone={physicalTone}
          xrayReveal={xrayReveal}
          explodeAmount={explodeAmount}
          showLabels={showLabels}
          modelScale={modelScale}
          modelPosition={modelPosition}
          onSelectZone={onSelectZone}
          selectedZone={selectedZone}
          rotationSync={rotationSync}
        />
      </Suspense>
      {interactive && (
        <OrbitControls
          ref={controlsRef}
          autoRotate={autoRotate}
          autoRotateSpeed={autoRotateSpeed}
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

// Memoized: per-frame parents (e.g. the landing hero's rAF clock) must not
// re-render and re-reconcile the whole R3F scene every frame once the props
// have stopped changing. That reconciliation is what made the video→twin
// handoff stutter.
export default memo(EngineCanvas);
