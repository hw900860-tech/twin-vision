import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useFlightStore } from './flightStore';

/** GLB UAV model with engine glow + nav lights */
function UAVGLB() {
  const propRef = useRef<THREE.Group>(null);
  const rpm = useFlightStore((s) => s.rpm);
  const faults = useFlightStore((s) => s.faults);
  const { scene } = useGLTF('/uav.glb');

  // Clone scene so each instance has independent materials
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Keep original material but ensure it's a MeshStandardMaterial
        if (mesh.material) {
          const old = mesh.material as THREE.Material;
          mesh.material = new THREE.MeshStandardMaterial({
            color: (old as any).color ?? '#c0c8d0',
            roughness: 0.4,
            metalness: 0.6,
            emissive: new THREE.Color('#000000'),
            emissiveIntensity: 0,
          });
        }
      }
    });
    return clone;
  }, [scene]);

  // Engine glow based on CHT
  const chtMax = Math.max(...useFlightStore((s) => s.cht));
  const engineGlow = chtMax > 200 ? '#ff3300' : chtMax > 160 ? '#ff8800' : '#3366ff';

  // Spin propeller
  useFrame((_, delta) => {
    if (propRef.current) {
      propRef.current.rotation.z += (rpm / 60) * Math.PI * 2 * delta;
    }
  });

  return (
    <group>
      {/* GLB model — scaled 5x for visibility, rotated to face -Z (forward) */}
      <primitive object={clonedScene} scale={[5, 5, 5]} rotation={[0, Math.PI, 0]} />

      {/* Propeller disc — visible spinning effect */}
      <group ref={propRef} position={[0, 0, -5.2]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0, 1.2, 16]} />
          <meshStandardMaterial
            color="#3a3a4a"
            transparent
            opacity={0.15 + (rpm / 4000) * 0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[2.4, 0.04, 0.08]} />
          <meshStandardMaterial color="#3a3a4a" roughness={0.6} metalness={0.7} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0]}>
          <boxGeometry args={[2.4, 0.04, 0.08]} />
          <meshStandardMaterial color="#3a3a4a" roughness={0.6} metalness={0.7} />
        </mesh>
      </group>

      {/* Engine exhaust glow — at nose (GLB nose is at +Z after rotation) */}
      <mesh position={[0, 0, 5.0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial
          color={engineGlow}
          emissive={engineGlow}
          emissiveIntensity={faults.c2Overheat ? 2.5 : 0.8}
        />
      </mesh>

      {/* Navigation lights — green (right wingtip) */}
      <mesh position={[5.5, 0.1, 0.5]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={3} />
      </mesh>

      {/* Navigation lights — red (left wingtip) */}
      <mesh position={[-5.5, 0.1, 0.5]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial color="#ff0044" emissive="#ff0044" emissiveIntensity={3} />
      </mesh>

      {/* Tail strobe */}
      <mesh position={[0, 0.3, -4.5]}>
        <sphereGeometry args={[0.06, 6, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

useGLTF.preload('/uav.glb');

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
      <UAVGLB />
    </group>
  );
}
