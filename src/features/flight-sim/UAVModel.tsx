import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useFlightStore } from './flightStore';

/** GLB UAV model — TAPAS BH-201 with proper orientation, colors, and lighting */
function UAVGLB() {
  const propRef = useRef<THREE.Mesh>(null);
  const exhaustRef = useRef<THREE.PointLight>(null);
  const rpm = useFlightStore((s) => s.rpm);
  const cht = useFlightStore((s) => s.cht);
  const faults = useFlightStore((s) => s.faults);
  const { scene } = useGLTF('/uav.glb');

  // Clone scene so each instance has independent materials
  // Apply military TAPAS BH-201 colors:
  // - Upper fuselage: military gray (#7b8794)
  // - Lower fuselage: lighter gray (#a8b4bf)
  // - Wings: darker gray (#5a6570)
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Apply military gray material with proper shading
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#8090a0'),    // Military airframe gray
          roughness: 0.55,
          metalness: 0.35,
          emissive: new THREE.Color('#000000'),
          emissiveIntensity: 0,
          envMapIntensity: 0.8,
        });
        mesh.material = mat;
      }
    });
    return clone;
  }, [scene]);

  // Engine glow color based on max CHT
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
      // Propeller disc spin rate proportional to RPM
      propRef.current.rotation.z += (rpm / 60) * Math.PI * 2 * delta;
    }
    // Pulse exhaust glow
    if (exhaustRef.current) {
      exhaustRef.current.intensity = exhaustIntensity + Math.sin(Date.now() * 0.008) * 0.3;
    }
  });

  return (
    <group>
      {/* 
        GLB model analysis:
        - BBox: X [-0.58, 0.56] (wingspan 1.14), Y [-0.18, 0.17] (height 0.35), Z [-1.00, 0.99] (fuselage 1.99)
        - The model's Z-axis is the fuselage. We need to determine which end is nose.
        - Typically GLB exports have +Z as front. After rotation [0, PI, 0], +Z faces -Z (forward flight direction).
        - Scale: 8x for clear visibility on the 120-unit terrain.
      */}
      <primitive
        object={clonedScene}
        scale={[8, 8, 8]}
        rotation={[0, Math.PI, 0]}
      />

      {/* === PROPELLER DISC (TAPAS BH-201 is pusher-config, prop at rear) === */}
      <group ref={propRef} position={[0, 0, -7.2]}>
        {/* Disc blur effect — opacity scales with RPM */}
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
        {/* Blade 2 (perpendicular) */}
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

      {/* === ENGINE EXHAUST GLOW (at rear, near propeller) === */}
      <group position={[0, -0.3, -7.0]}>
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
      {/* Green — right wingtip (+X side) */}
      <group position={[5.0, 0.0, 0.8]}>
        <mesh>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial
            color="#00ff44"
            emissive="#00ff44"
            emissiveIntensity={4}
          />
        </mesh>
        <pointLight color="#00ff44" intensity={2} distance={6} decay={2} />
      </group>

      {/* Red — left wingtip (-X side) */}
      <group position={[-5.0, 0.0, 0.8]}>
        <mesh>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial
            color="#ff0033"
            emissive="#ff0033"
            emissiveIntensity={4}
          />
        </mesh>
        <pointLight color="#ff0033" intensity={2} distance={6} decay={2} />
      </group>

      {/* === TAIL STROBE (white, pulsing) === */}
      <mesh position={[0, 0.5, -6.8]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={3}
        />
      </mesh>
      <pointLight
        color="#ffffff"
        intensity={1.5}
        distance={10}
        decay={2}
      />

      {/* === SENSOR TURRET (nose-mounted EO/IR ball, TAPAS BH-201 signature) === */}
      <mesh position={[0, -0.5, 7.5]}>
        <sphereGeometry args={[0.35, 12, 12]} />
        <meshStandardMaterial
          color="#2a3040"
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>

      {/* === LANDING GEAR (retracted in flight, shown as subtle lines) === */}
      {/* Nose gear */}
      <mesh position={[0, -1.2, 5.5]}>
        <cylinderGeometry args={[0.04, 0.04, 1.0, 6]} />
        <meshStandardMaterial color="#404852" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Main gear left */}
      <mesh position={[-1.5, -1.2, -1.0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.0, 6]} />
        <meshStandardMaterial color="#404852" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Main gear right */}
      <mesh position={[1.5, -1.2, -1.0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.0, 6]} />
        <meshStandardMaterial color="#404852" roughness={0.6} metalness={0.5} />
      </mesh>
    </group>
  );
}

useGLTF.preload('/uav.glb');

export function UAVModel() {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const store = useFlightStore;

  // Mouse drag controls — drag to steer heading and altitude
  const handlePointerDown = useCallback((e: THREE.Event) => {
    const me = e as unknown as PointerEvent;
    store.getState().setDragging(true, me.clientX, me.clientY);
    (gl.domElement as HTMLElement).style.cursor = 'grabbing';
  }, [gl]);

  const handlePointerUp = useCallback(() => {
    store.getState().setDragging(false);
    (gl.domElement as HTMLElement).style.cursor = 'grab';
  }, []);

  const handlePointerMove = useCallback((e: THREE.Event) => {
    const state = store.getState();
    if (!state.isDragging) return;
    const me = e as unknown as PointerEvent;
    const dx = me.clientX - state.dragStartX;
    const dy = me.clientY - state.dragStartY;
    state.setTargetHeading(state.targetHeading + dx * 0.5);
    state.setTargetAltitude(state.targetAltitude - dy * 20);
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

    if (groupRef.current) {
      groupRef.current.position.x = s.x;
      groupRef.current.position.z = s.z;
      groupRef.current.position.y = s.altitude * 0.0015 + 2.5;
      groupRef.current.rotation.y = -(s.heading * Math.PI) / 180;
      groupRef.current.rotation.z = (s.bankAngle * Math.PI) / 180;
      groupRef.current.rotation.x = s.pitchAngle * 0.3;
    }

    // Chase camera — follows behind/above UAV relative to heading
    const headingRad = (s.heading * Math.PI) / 180;
    const camDist = 20;
    const camHeight = 7;
    const targetCamX = s.x + Math.sin(headingRad) * camDist;
    const targetCamZ = s.z + Math.cos(headingRad) * camDist;
    const targetCamY = s.altitude * 0.0015 + 2.5 + camHeight;

    camera.position.x += (targetCamX - camera.position.x) * 0.05;
    camera.position.y += (targetCamY - camera.position.y) * 0.05;
    camera.position.z += (targetCamZ - camera.position.z) * 0.05;
    camera.lookAt(s.x, s.altitude * 0.0015 + 2.5, s.z);
  });

  return (
    <group
      ref={groupRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
    >
      <UAVGLB />
    </group>
  );
}
