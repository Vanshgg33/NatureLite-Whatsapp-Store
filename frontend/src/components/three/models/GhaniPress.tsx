'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface GhaniPressProps {
  position?: [number, number, number];
  scale?: number;
  progress?: number;
  isActive?: boolean;
}

export function GhaniPress({
  position = [0, 0, 0],
  scale = 1,
  progress = 0.5,
  isActive = true,
}: GhaniPressProps) {
  const groupRef = useRef<THREE.Group>(null);
  const armRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!armRef.current || !isActive) return;
    armRef.current.rotation.y += 0.008;
  });

  // Seed positions - deterministic
  const seedPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 0.25 + (i % 3) * 0.08;
      positions.push([Math.cos(angle) * r, -0.05, Math.sin(angle) * r]);
    }
    return positions;
  }, []);

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Base */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <cylinderGeometry args={[1.2, 1.3, 0.12, 24]} />
        <meshStandardMaterial color="#5d3a1a" roughness={0.85} />
      </mesh>

      {/* Main bowl */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.7, 0.85, 0.6, 24]} />
        <meshStandardMaterial color="#6b4423" roughness={0.8} />
      </mesh>

      {/* Inner cavity */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.55, 0.65, 0.5, 24]} />
        <meshStandardMaterial color="#3d2815" roughness={0.9} side={THREE.BackSide} />
      </mesh>

      {/* Rotating arm */}
      <group ref={armRef} position={[0, 0.7, 0]}>
        <mesh>
          <cylinderGeometry args={[0.05, 0.05, 1.2, 12]} />
          <meshStandardMaterial color="#4a3520" roughness={0.85} />
        </mesh>
        <mesh position={[0.5, 0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 1.1, 8]} />
          <meshStandardMaterial color="#5d3a1a" roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.25, 0]}>
          <cylinderGeometry args={[0.12, 0.18, 0.5, 12]} />
          <meshStandardMaterial color="#4a3520" roughness={0.85} />
        </mesh>
      </group>

      {/* Spout */}
      <mesh position={[0.9, 0.15, 0]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.05, 0.03, 0.3, 8]} />
        <meshStandardMaterial color="#5d3a1a" roughness={0.8} />
      </mesh>

      {/* Collection bowl */}
      <group position={[1.1, -0.02, 0]}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.22, 0.2, 16]} />
          <meshStandardMaterial color="#6b4423" roughness={0.8} />
        </mesh>
        {progress > 0.3 && (
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.22, 0.18, 0.08 * Math.min(1, (progress - 0.3) * 3), 16]} />
            <meshStandardMaterial color="#d4a012" roughness={0.2} metalness={0.3} />
          </mesh>
        )}
      </group>

      {/* Seeds */}
      {progress < 0.5 && (
        <group position={[0, 0.5, 0]}>
          {seedPositions.map((pos, i) => (
            <mesh key={i} position={pos} scale={0.04}>
              <sphereGeometry args={[1, 8, 8]} />
              <meshStandardMaterial color="#c4a35a" roughness={0.7} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

export default GhaniPress;
