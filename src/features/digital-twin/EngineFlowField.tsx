import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlightStore } from '../flight-sim/flightStore';

interface Particle {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  life: number;
  maxLife: number;
  pathType: 'air' | 'oil' | 'aero';
}

export const EngineFlowField: React.FC = () => {
  const dynamicPressure = useFlightStore((s) => s.dynamicPressure);
  const loadVector = useFlightStore((s) => s.loadVector);
  const rpm = useFlightStore((s) => s.rpm);
  const throttle = useFlightStore((s) => s.throttle);
  const vizMode = useFlightStore((s) => s.vizMode);

  const count = 120;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());

  // Dynamic particle path generators
  const particles = useRef<Particle[]>(
    Array.from({ length: count }, (_, i) => {
      const isAir = i < 60;
      const isOil = i >= 60 && i < 90;
      const type: 'air' | 'oil' | 'aero' = isAir ? 'air' : isOil ? 'oil' : 'aero';
      return {
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * (type === 'aero' ? 6 : 2),
          (Math.random() - 0.5) * (type === 'aero' ? 4 : 2),
          (Math.random() - 0.5) * (type === 'aero' ? 6 : 2)
        ),
        dir: new THREE.Vector3(0, 0, -1),
        speed: 0.05 + Math.random() * 0.1,
        life: Math.random() * 2,
        maxLife: 2 + Math.random() * 2,
        pathType: type,
      };
    })
  );

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const currentDummy = dummy.current;
    const normRpm = rpm / 2800;

    particles.current.forEach((p, idx) => {
      p.life += delta;
      if (p.life > p.maxLife) {
        p.life = 0;
        if (p.pathType === 'aero') {
          p.pos.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, 3);
        } else if (p.pathType === 'air') {
          // Intake start
          p.pos.set(-0.6, 0.4, 0.8);
        } else {
          // Oil sump start
          p.pos.set(0, -0.8, -0.2);
        }
      }

      if (p.pathType === 'aero') {
        // Streamlines react to pitch, roll, dynamic pressure q
        const speedScale = 0.5 + dynamicPressure * 0.8;
        p.dir.set(loadVector[0] * 0.2, loadVector[1] * 0.1, -1.0).normalize();
        p.pos.addScaledVector(p.dir, p.speed * speedScale * delta * 20);
        currentDummy.scale.set(0.04, 0.04, 0.2 * speedScale);
      } else if (p.pathType === 'air') {
        // Air Intake -> Compressor -> Cylinders -> Exhaust
        const progress = p.life / p.maxLife;
        if (progress < 0.3) {
          // Intake to manifold
          p.pos.lerpVectors(new THREE.Vector3(-0.6, 0.4, 0.8), new THREE.Vector3(0, 0.3, 0.2), progress / 0.3);
        } else if (progress < 0.7) {
          // Manifold into Cylinders
          const cylX = (Math.floor(idx % 4) - 1.5) * 0.6;
          p.pos.lerpVectors(new THREE.Vector3(0, 0.3, 0.2), new THREE.Vector3(cylX, 0.4, 0), (progress - 0.3) / 0.4);
        } else {
          // Cylinders to Exhaust Outflow
          const cylX = (Math.floor(idx % 4) - 1.5) * 0.6;
          p.pos.lerpVectors(new THREE.Vector3(cylX, 0.4, 0), new THREE.Vector3(cylX * 1.2, -0.4, -1.5), (progress - 0.7) / 0.3);
        }
        const airScale = 0.05 + (throttle / 100) * 0.05;
        currentDummy.scale.set(airScale, airScale, airScale);
      } else {
        // Oil Sump -> Pump -> Bearings
        const progress = p.life / p.maxLife;
        p.pos.set(
          Math.sin(progress * Math.PI * 2) * 0.5,
          -0.8 + progress * 0.8,
          Math.cos(progress * Math.PI * 2) * 0.3
        );
        currentDummy.scale.set(0.04, 0.04, 0.04);
      }

      currentDummy.position.copy(p.pos);
      currentDummy.rotation.set(0, 0, 0);
      currentDummy.updateMatrix();

      meshRef.current?.setMatrixAt(idx, currentDummy.matrix);

      // Dynamic color per particle
      let color = new THREE.Color('#38bdf8'); // cyan aero
      if (p.pathType === 'air') {
        color = new THREE.Color(p.life / p.maxLife > 0.6 ? '#f97316' : '#60a5fa'); // blue air -> orange exhaust
      } else if (p.pathType === 'oil') {
        color = new THREE.Color('#facc15'); // yellow oil
      }

      meshRef.current?.setColorAt(idx, color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      visible={vizMode !== 'XRAY'}
    >
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshBasicMaterial transparent opacity={0.65} depthWrite={false} />
    </instancedMesh>
  );
};
