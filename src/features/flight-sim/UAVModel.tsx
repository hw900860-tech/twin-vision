import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useFlightStore } from './flightStore';

function dampAngle(current: number, target: number, lambda: number, delta: number) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-lambda * delta));
}

function FaultHighlight({
  active,
  position,
  label,
  detail,
  color,
}: {
  active: boolean;
  position: [number, number, number];
  label: string;
  detail: string;
  color: string;
}) {
  const markerRef = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (markerRef.current) {
      const pulse = 1 + Math.sin(elapsed.current * 7) * 0.12;
      markerRef.current.scale.setScalar(pulse);
    }
  });

  if (!active) return null;

  return (
    <group position={position}>
      <mesh ref={markerRef}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} transparent opacity={0.9} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.035, 8, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
      <pointLight color={color} intensity={2.5} distance={5} decay={2} />
      <Html position={[0, 0.5, 0]} center distanceFactor={9}>
        <div className="border border-current bg-[#0b0e11]/95 px-2 py-1 text-center font-mono text-[8px] tracking-[0.12em] whitespace-nowrap" style={{ color }}>
          <div>{label}</div>
          <div className="mt-0.5 text-[7px] text-slate-300">{detail}</div>
        </div>
      </Html>
    </group>
  );
}

/**
 * GLB UAV model — TAPAS BH-201 with correct orientation and military colors.
 *
 * MODEL ANALYSIS (from vertex distribution):
 *   - Model +X = NOSE (front) — 22,911 verts in +X half vs 6,931 in -X
 *   - Model -X = TAIL (rear)
 *   - Model ±Z = WINGSPAN — symmetric ~15K verts each half
 *   - Model Y = height (0.353 units)
 *
 * ROTATION: [0, PI/2, 0] rotates model so:
 *   +X (nose) → -Z (forward flight direction) ✓
 *   -X (tail) → +Z (backward) ✓
 *   +Z (right wing) → +X (world right) ✓
 *   -Z (left wing) → -X (world left) ✓
 */
function UAVGLB() {
  const propRef = useRef<THREE.Mesh>(null);
  const exhaustRef = useRef<THREE.PointLight>(null);
  const rpm = useFlightStore((s) => s.rpm);
  const cht = useFlightStore((s) => s.cht);
  const vibrationRMS = useFlightStore((s) => s.vibrationRMS);
  const faults = useFlightStore((s) => s.faults);
  const emergencyState = useFlightStore((s) => s.emergencyState);
  const { scene } = useGLTF('/uav.glb');

  // Clone scene with military TAPAS BH-201 colors
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#8090a0'),    // Military airframe gray
          roughness: 0.55,
          metalness: 0.35,
          emissive: new THREE.Color('#000000'),
          emissiveIntensity: 0,
          envMapIntensity: 0.8,
        });
      }
    });
    return clone;
  }, [scene]);

  // Engine glow based on max CHT
  const chtMax = Math.max(...cht);
  const engineGlowColor = useMemo(() => {
    if (chtMax > 220) return new THREE.Color('#ff2200');
    if (chtMax > 180) return new THREE.Color('#ff6600');
    if (chtMax > 150) return new THREE.Color('#ffaa00');
    return new THREE.Color('#4488ff');
  }, [chtMax]);

  const exhaustIntensity = faults.c2Overheat ? 3.0 : chtMax > 180 ? 1.5 : 0.6;

  // Spin propeller
  useFrame((_, delta) => {
    if (propRef.current) {
      propRef.current.rotation.z += (rpm / 60) * Math.PI * 2 * delta;
    }
    if (exhaustRef.current) {
      exhaustRef.current.intensity = exhaustIntensity + Math.sin(Date.now() * 0.008) * 0.3;
    }
  });

  return (
    <group>
      {/*
        After rotation [0, PI/2, 0]:
        - Model +X (nose) → world -Z (forward)
        - Model -X (tail) → world +Z (backward)
        - Model +Z (right wing) → world +X (right)
        - Model -Z (left wing) → world -X (left)
        Scale 8x: fuselage ≈ ±4.5 in Z, wingspan ≈ ±8.0 in X
      */}
      <primitive
        object={clonedScene}
        scale={[8, 8, 8]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* === PROPELLER DISC — pusher-config at rear (+Z) === */}
      <group ref={propRef} position={[0, 0, 5.2]}>
        {/* Disc blur — opacity scales with RPM */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 1.6, 24]} />
          <meshStandardMaterial
            color="#c0c8d4"
            transparent
            opacity={0.08 + (rpm / 4000) * 0.25}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        {/* Blade 1 */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[3.2, 0.06, 0.1]} />
          <meshStandardMaterial color="#b0b8c4" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* Blade 2 */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[3.2, 0.06, 0.1]} />
          <meshStandardMaterial color="#b0b8c4" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* Hub */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.12, 12]} />
          <meshStandardMaterial color="#505862" roughness={0.4} metalness={0.7} />
        </mesh>
      </group>

      {/* === ENGINE EXHAUST GLOW — at rear near propeller (+Z) === */}
      <group position={[0, -0.3, 5.0]}>
        <mesh>
          <sphereGeometry args={[0.2, 8, 8]} />
          <meshStandardMaterial
            color={engineGlowColor}
            emissive={engineGlowColor}
            emissiveIntensity={exhaustIntensity}
            transparent
            opacity={0.9}
          />
        </mesh>
        <pointLight
          ref={exhaustRef}
          color={engineGlowColor}
          intensity={exhaustIntensity}
          distance={8}
          decay={2}
        />
      </group>

      {/* === NAVIGATION LIGHTS === */}
      {/* Green — right wingtip (+X after rotation) */}
      <group position={[8.0, 0.0, 0.0]}>
        <mesh>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={4} />
        </mesh>
        <pointLight color="#00ff44" intensity={2} distance={6} decay={2} />
      </group>

      {/* Red — left wingtip (-X after rotation) */}
      <group position={[-8.0, 0.0, 0.0]}>
        <mesh>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#ff0033" emissive="#ff0033" emissiveIntensity={4} />
        </mesh>
        <pointLight color="#ff0033" intensity={2} distance={6} decay={2} />
      </group>

      {/* === TAIL STROBE — at tail (+Z) === */}
      <mesh position={[0, 0.5, 4.5]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={3} />
      </mesh>
      <pointLight color="#ffffff" intensity={1.5} distance={10} decay={2} />

      {/* === SENSOR TURRET — nose-mounted EO/IR ball (-Z) === */}
      <mesh position={[0, -0.5, -5.5]}>
        <sphereGeometry args={[0.35, 12, 12]} />
        <meshStandardMaterial color="#2a3040" roughness={0.3} metalness={0.6} />
      </mesh>

      {/* === LANDING GEAR === */}
      {/* Nose gear */}
      <mesh position={[0, -1.2, -3.5]}>
        <cylinderGeometry args={[0.04, 0.04, 1.0, 6]} />
        <meshStandardMaterial color="#404852" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Main gear left */}
      <mesh position={[-2.0, -1.2, 1.0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.0, 6]} />
        <meshStandardMaterial color="#404852" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Main gear right */}
      <mesh position={[2.0, -1.2, 1.0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.0, 6]} />
        <meshStandardMaterial color="#404852" roughness={0.6} metalness={0.5} />
      </mesh>

      <FaultHighlight
        active={faults.c2Overheat}
        position={[-0.85, 0.35, 3.8]}
        label="CYLINDER 2 / CHT"
        detail={`${cht[1]?.toFixed(0) ?? '—'}°C · OVERHEAT`}
        color="#ff4d35"
      />
      <FaultHighlight
        active={faults.turboFail}
        position={[0, 0.2, 3.35]}
        label="TURBO / MAP"
        detail="BOOST COLLAPSE · THRUST REDUCED"
        color="#f0a63c"
      />
      {emergencyState === 'crashed' && (
        <group position={[0, -2, 0]}>
          <pointLight color="#ff3d1f" intensity={5} distance={8} />
          <mesh>
            <sphereGeometry args={[0.5, 12, 12]} />
            <meshStandardMaterial color="#ff3d1f" emissive="#ff3d1f" emissiveIntensity={3} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <sphereGeometry args={[0.28, 10, 10]} />
            <meshStandardMaterial color="#343434" emissive="#171717" transparent opacity={0.75} />
          </mesh>
        </group>
      )}
      <FaultHighlight
        active={faults.bearingFail}
        position={[0, -0.35, 4.55]}
        label="REAR BEARING"
        detail={`${vibrationRMS.toFixed(2)} m/s² · BPFO PEAK`}
        color="#e2523f"
      />
      <FaultHighlight
        active={faults.injectorClog}
        position={[0.75, 0.25, 3.9]}
        label="INJECTOR BANK"
        detail="EGT IMBALANCE · CHECK FLOW"
        color="#f0a63c"
      />
    </group>
  );
}

useGLTF.preload('/uav.glb');

export function UAVModel() {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const store = useFlightStore;
  const cameraGoal = useRef(new THREE.Vector3());
  const cameraLookAt = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const viewAzimuth = useRef(0);
  const viewElevation = useRef(0.95);

  // Mouse drag controls
  const handlePointerDown = useCallback((e: THREE.Event) => {
    const me = e as unknown as PointerEvent;
    store.getState().setDragging(true, me.clientX, me.clientY);
    (gl.domElement as HTMLElement).style.cursor = 'grabbing';
  }, [gl]);

  const handlePointerUp = useCallback(() => {
    store.getState().setDragging(false);
    (gl.domElement as HTMLElement).style.cursor = 'grab';
  }, []);

  useEffect(() => {
    const releaseDrag = () => {
      store.getState().setDragging(false);
      (gl.domElement as HTMLElement).style.cursor = 'grab';
    };
    window.addEventListener('pointerup', releaseDrag);
    window.addEventListener('pointercancel', releaseDrag);
    return () => {
      window.removeEventListener('pointerup', releaseDrag);
      window.removeEventListener('pointercancel', releaseDrag);
    };
  }, [gl]);

  const handlePointerMove = useCallback((e: THREE.Event) => {
    const state = store.getState();
    if (!state.isDragging) return;
    const me = e as unknown as PointerEvent;
    const dx = me.clientX - state.dragStartX;
    const dy = me.clientY - state.dragStartY;
    if (state.cameraMode === 'birdseye') {
      viewAzimuth.current -= dx * 0.008;
      viewElevation.current = Math.max(0.45, Math.min(1.4, viewElevation.current + dy * 0.006));
    } else {
      state.setTargetHeading(state.targetHeading + dx * 0.5);
      state.setTargetAltitude(state.targetAltitude - dy * 20);
    }
    state.setDragging(true, me.clientX, me.clientY);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const keys = new Set<string>();
    const onDown = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); };
    const onUp = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); };

    const loop = setInterval(() => {
      const s = store.getState();
      if (keys.has('w') || keys.has('arrowup')) s.setThrottle(s.throttle + 2);
      if (keys.has('s') || keys.has('arrowdown')) s.setThrottle(s.throttle - 2);
      if (keys.has('q') || keys.has('arrowleft')) s.setTargetHeading(s.targetHeading - 3);
      if (keys.has('e') || keys.has('arrowright')) s.setTargetHeading(s.targetHeading + 3);
      if (keys.has('a')) s.setTargetAltitude(s.targetAltitude + 200);
      if (keys.has('d')) s.setTargetAltitude(s.targetAltitude - 200);
    }, 30);

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      clearInterval(loop);
    };
  }, []);

  // Animation loop — flight physics + chase camera
  useFrame((_, delta) => {
    const s = store.getState();
    s.tick(delta);
    const smoothing = 1 - Math.exp(-delta * 5);

    if (groupRef.current) {
      groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, s.x, 5, delta);
      groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, s.z, 5, delta);
      groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, s.altitude * 0.0015 + 2.5, 5, delta);
      groupRef.current.rotation.y = dampAngle(groupRef.current.rotation.y, -(s.heading * Math.PI) / 180, 5, delta);
      groupRef.current.rotation.z = THREE.MathUtils.damp(groupRef.current.rotation.z, (s.bankAngle * Math.PI) / 180, 5, delta);
      // The model nose points toward -Z, so positive X rotation climbs.
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, s.pitchAngle, 5, delta);
    }

    // Chase camera — follows behind/above UAV
    const headingRad = (s.heading * Math.PI) / 180;
    const camDist = s.cameraMode === 'birdseye' ? 30 : 24;
    const horizontalDistance = s.cameraMode === 'birdseye' ? Math.cos(viewElevation.current) * camDist : camDist;
    const targetCamX = s.x + (s.cameraMode === 'birdseye' ? Math.sin(viewAzimuth.current) * horizontalDistance : Math.sin(headingRad) * camDist);
    const targetCamZ = s.z + (s.cameraMode === 'birdseye' ? Math.cos(viewAzimuth.current) * horizontalDistance : Math.cos(headingRad) * camDist);
    const targetCamY = s.altitude * 0.0015 + 2.5 + (s.cameraMode === 'birdseye' ? Math.sin(viewElevation.current) * camDist : 11);

    cameraGoal.current.set(targetCamX, targetCamY, targetCamZ);
    camera.position.lerp(cameraGoal.current, smoothing);
    targetLookAt.current.set(s.x, s.altitude * 0.0015 + 2.5, s.z);
    cameraLookAt.current.lerp(targetLookAt.current, smoothing);
    camera.lookAt(cameraLookAt.current);
  });

  return (
    <group
      ref={groupRef}
      position={[0, 11.5, 0]}
      rotation={[0, 0, 0]}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerMove={handlePointerMove}
    >
      <UAVGLB />
    </group>
  );
}
