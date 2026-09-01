import { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlightStore } from './flightStore';

function TAPASBH201() {
  const propRef = useRef<THREE.Group>(null);
  const rpm = useFlightStore((s) => s.rpm);
  const faults = useFlightStore((s) => s.faults);

  useFrame((_, delta) => {
    if (propRef.current) {
      propRef.current.rotation.z += (rpm / 60) * Math.PI * 2 * delta;
    }
  });

  const chtMax = Math.max(...useFlightStore((s) => s.cht));
  const engineGlow = chtMax > 200 ? '#ff3300' : chtMax > 160 ? '#ff8800' : '#3366ff';

  return (
    <group>
      {/* Fuselage - streamlined along Z axis */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 3.5, 12]} />
        <meshStandardMaterial color="#c0c8d0" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Nose cone - sensor turret */}
      <mesh position={[0, -0.08, -1.9]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.22, 0.7, 12]} />
        <meshStandardMaterial color="#1a1a2a" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Belly sensor pod */}
      <mesh position={[0, -0.35, -1.2]}>
        <sphereGeometry args={[0.18, 10, 10]} />
        <meshStandardMaterial color="#2a2a3a" roughness={0.3} metalness={0.7} />
      </mesh>

      {/* Wings */}
      <mesh position={[0, 0.05, 0.1]} castShadow>
        <boxGeometry args={[7.5, 0.06, 0.9]} />
        <meshStandardMaterial color="#b0b8c0" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* Wing tips */}
      <mesh position={[3.8, 0.08, 0.1]}>
        <boxGeometry args={[0.15, 0.1, 0.6]} />
        <meshStandardMaterial color="#a0a8b0" />
      </mesh>
      <mesh position={[-3.8, 0.08, 0.1]}>
        <boxGeometry args={[0.15, 0.1, 0.6]} />
        <meshStandardMaterial color="#a0a8b0" />
      </mesh>

      {/* Tail booms */}
      <mesh position={[0.5, 0.05, 1.2]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 1.8, 6]} />
        <meshStandardMaterial color="#a0a8b0" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[-0.5, 0.05, 1.2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 1.8, 6]} />
        <meshStandardMaterial color="#a0a8b0" roughness={0.5} metalness={0.5} />
      </mesh>

      {/* Horizontal stabilizer */}
      <mesh position={[0, 0.15, 2.1]} castShadow>
        <boxGeometry args={[2.2, 0.04, 0.5]} />
        <meshStandardMaterial color="#b0b8c0" roughness={0.4} />
      </mesh>

      {/* Vertical stabilizer */}
      <mesh position={[0, 0.45, 2.0]} castShadow>
        <boxGeometry args={[0.04, 0.6, 0.5]} />
        <meshStandardMaterial color="#b0b8c0" roughness={0.4} />
      </mesh>

      {/* Pusher propeller */}
      <group ref={propRef} position={[0, 0.05, -0.15]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[1.8, 0.04, 0.12]} />
          <meshStandardMaterial color="#3a3a4a" roughness={0.6} metalness={0.7} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0]}>
          <boxGeometry args={[1.8, 0.04, 0.12]} />
          <meshStandardMaterial color="#3a3a4a" roughness={0.6} metalness={0.7} />
        </mesh>
      </group>

      {/* Engine exhaust glow */}
      <mesh position={[0, 0.05, -1.8]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial
          color={engineGlow}
          emissive={engineGlow}
          emissiveIntensity={faults.c2Overheat ? 2.5 : 0.8}
        />
      </mesh>

      {/* Navigation lights */}
      <mesh position={[3.8, 0.08, 0.1]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={3} />
      </mesh>
      <mesh position={[-3.8, 0.08, 0.1]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color="#ff0044" emissive="#ff0044" emissiveIntensity={3} />
      </mesh>
      <mesh position={[0, 0.15, 2.2]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
      </mesh>

      {/* Engine block visible through fuselage */}
      <mesh position={[0, 0, -0.5]}>
        <boxGeometry args={[0.4, 0.35, 0.6]} />
        <meshStandardMaterial color="#5a5a6a" roughness={0.5} metalness={0.8} />
      </mesh>
    </group>
  );
}

export function UAVModel() {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const store = useFlightStore;

  // Mouse drag controls
  const handlePointerDown = useCallback((e: THREE.Event) => {
    const me = e as unknown as PointerEvent;
    store.getState().setDragging(true, me.clientX, me.clientY);
    (gl.domElement as HTMLElement).style.cursor = 'grabbing';
  }, [gl]);

  const handlePointerUp = useCallback(() => {
    store.getState().setDragging(false);
    (gl.domElement as HTMLElement).style.cursor = 'grab';
  }, [gl]);

  const handlePointerMove = useCallback((e: THREE.Event) => {
    const state = store.getState();
    if (!state.isDragging) return;
    const me = e as unknown as PointerEvent;
    const dx = me.clientX - state.dragStartX;
    const dy = me.clientY - state.dragStartY;
    // Horizontal drag = heading change
    state.setTargetHeading(state.targetHeading + dx * 0.5);
    // Vertical drag = altitude change
    state.setTargetAltitude(state.targetAltitude - dy * 20);
    state.setDragging(true, me.clientX, me.clientY);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const keys = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
    };
    const onUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
    };

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

  // Animation loop
  useFrame((_, delta) => {
    const s = store.getState();
    s.tick(delta);

    if (groupRef.current) {
      groupRef.current.position.x = s.x;
      groupRef.current.position.z = s.z;
      groupRef.current.position.y = s.altitude * 0.0015 + 2.5;

      // Heading rotation
      groupRef.current.rotation.y = -(s.heading * Math.PI) / 180;
      // Bank
      groupRef.current.rotation.z = (s.bankAngle * Math.PI) / 180;
      // Pitch
      groupRef.current.rotation.x = s.pitchAngle * 0.3;
    }

    // Chase camera
    const headingRad = (s.heading * Math.PI) / 180;
    const camDist = 18;
    const camHeight = 6;
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
      <TAPASBH201 />
    </group>
  );
}
