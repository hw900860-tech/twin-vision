import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type Subsystem = "CYLINDER" | "EXHAUST" | "INTAKE" | "OIL" | "FUEL" | "VIBRATION" | "ELECTRICAL";

const CYAN = "#6fd8e8";
const AMBER = "#f0a63c";
const CRITICAL = "#e2523f";

function metal(color: string, rough = 0.45, metalness = 0.9) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metalness} />;
}

function Cylinder({
  index,
  x,
  selected,
  degraded,
  onSelect,
}: {
  index: number;
  x: number;
  selected: boolean;
  degraded: boolean;
  onSelect: (i: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const emissive = selected ? CYAN : degraded ? AMBER : "#000000";
  const intensity = selected ? 0.9 : degraded ? 0.45 : 0;

  return (
    <group
      position={[x, 0.62, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "auto";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(index);
      }}
    >
      {/* barrel with cooling fins */}
      <mesh castShadow>
        <cylinderGeometry args={[0.29, 0.32, 0.78, 24]} />
        <meshStandardMaterial
          color={hover ? "#8a9198" : "#6b7278"}
          roughness={0.55}
          metalness={0.85}
          emissive={emissive}
          emissiveIntensity={intensity}
        />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={i} position={[0, -0.32 + i * 0.1, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.022, 24]} />
          <meshStandardMaterial
            color="#565c62"
            roughness={0.6}
            metalness={0.8}
            emissive={emissive}
            emissiveIntensity={intensity * 0.6}
          />
        </mesh>
      ))}
      {/* head */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.7, 0.26, 0.62]} />
        {metal("#7d848a", 0.4)}
      </mesh>
      {/* rocker cover */}
      <mesh position={[0, 0.68, 0]}>
        <boxGeometry args={[0.5, 0.12, 0.44]} />
        <meshStandardMaterial color="#3d4348" roughness={0.35} metalness={0.75} />
      </mesh>
      {/* spark plug */}
      <mesh position={[0.3, 0.5, 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 0.22, 10]} />
        <meshStandardMaterial color="#c9ccd0" roughness={0.3} metalness={1} />
      </mesh>
    </group>
  );
}

function SensorNode({ position, tone = CYAN, active }: { position: [number, number, number]; tone?: string; active?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 2.2 + position[0]) * 0.22;
    ref.current.scale.setScalar(active ? s : 0.7);
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.045, 12, 12]} />
      <meshBasicMaterial color={tone} toneMapped={false} />
    </mesh>
  );
}

export function EngineModel({
  selectedCylinder,
  onSelectCylinder,
  degradedCylinder = 3,
  spin = true,
  fault = 0,
}: {
  selectedCylinder?: number | null | undefined;
  onSelectCylinder?: ((i: number) => void) | undefined;
  degradedCylinder?: number | null | undefined;
  spin?: boolean | undefined;
  fault?: number | undefined;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current && spin) group.current.rotation.y += delta * 0.14;
  });

  const xs = useMemo(() => [-1.35, -0.45, 0.45, 1.35], []);

  return (
    <group ref={group} position={[0, -0.35, 0]}>
      {/* crankcase */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.5, 0.72, 1.15]} />
        <meshStandardMaterial color="#4a5055" roughness={0.42} metalness={0.92} />
      </mesh>
      <mesh position={[0, -0.46, 0]}>
        <boxGeometry args={[3.2, 0.26, 0.98]} />
        <meshStandardMaterial color="#2f3438" roughness={0.5} metalness={0.8} />
      </mesh>
      {/* oil sump */}
      <mesh position={[0, -0.72, 0]}>
        <boxGeometry args={[2.1, 0.3, 0.8]} />
        <meshStandardMaterial color="#262b2f" roughness={0.6} metalness={0.7} />
      </mesh>

      {/* crankshaft / prop flange */}
      <mesh position={[2.05, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.8, 20]} />
        {metal("#9aa0a5", 0.25, 1)}
      </mesh>
      <mesh position={[2.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.42, 0.42, 0.1, 28]} />
        {metal("#7f868c", 0.3, 1)}
      </mesh>

      {/* accessory / alternator */}
      <mesh position={[-1.95, -0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.55, 20]} />
        {metal("#3a4045", 0.5, 0.85)}
      </mesh>

      {/* cylinders */}
      {xs.map((x, i) => (
        <Cylinder
          key={i}
          index={i + 1}
          x={x}
          selected={selectedCylinder === i + 1}
          degraded={degradedCylinder === i + 1 && fault > 0.05}
          onSelect={(n) => onSelectCylinder?.(n)}
        />
      ))}

      {/* intake manifold (rear) */}
      <mesh position={[0, 0.9, -0.55]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.11, 0.11, 3.1, 16]} />
        {metal("#5c6369", 0.4)}
      </mesh>
      {xs.map((x, i) => (
        <mesh key={`in-${i}`} position={[x, 0.9, -0.36]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.4, 12]} />
          {metal("#5c6369", 0.4)}
        </mesh>
      ))}

      {/* exhaust (front) */}
      <mesh position={[0, 0.05, 0.86]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.14, 0.14, 3.2, 18]} />
        <meshStandardMaterial color="#6e6259" roughness={0.7} metalness={0.85} />
      </mesh>
      {xs.map((x, i) => (
        <mesh key={`ex-${i}`} position={[x, 0.45, 0.6]} rotation={[Math.PI / 3.2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.85, 14]} />
          <meshStandardMaterial
            color={degradedCylinder === i + 1 && fault > 0.3 ? "#8a5a3c" : "#6e6259"}
            roughness={0.7}
            metalness={0.85}
          />
        </mesh>
      ))}

      {/* oil lines */}
      <mesh position={[-0.9, -0.5, 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 1.6, 10]} />
        <meshStandardMaterial color="#2c3134" roughness={0.9} metalness={0.2} />
      </mesh>

      {/* sensor hotspots */}
      {xs.map((x, i) => (
        <SensorNode key={`s-${i}`} position={[x, 1.22, 0]} tone={degradedCylinder === i + 1 && fault > 0.4 ? (fault > 0.75 ? CRITICAL : AMBER) : CYAN} active />
      ))}
      <SensorNode position={[-1.95, 0.32, 0.3]} active />
      <SensorNode position={[0, -0.9, 0.42]} active />
      <SensorNode position={[1.6, 0.15, 0.86]} active />
    </group>
  );
}
