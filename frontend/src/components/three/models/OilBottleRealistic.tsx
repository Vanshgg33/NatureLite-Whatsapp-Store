'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OilBottleRealisticProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  oilColor?: string;
  oilLevel?: number;
  autoRotate?: boolean;
}

export function OilBottleRealistic({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  oilColor = '#d4a012',
  oilLevel = 0.75,
  autoRotate = true,
}: OilBottleRealisticProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Bottle geometry
  const bottleGeometry = useMemo(() => {
    const points: THREE.Vector2[] = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.4, 0),
      new THREE.Vector2(0.48, 0.05),
      new THREE.Vector2(0.5, 0.12),
      new THREE.Vector2(0.5, 0.7),
      new THREE.Vector2(0.45, 0.82),
      new THREE.Vector2(0.35, 0.9),
      new THREE.Vector2(0.2, 0.98),
      new THREE.Vector2(0.15, 1.1),
      new THREE.Vector2(0.15, 1.3),
      new THREE.Vector2(0.12, 1.3),
      new THREE.Vector2(0.12, 1.05),
      new THREE.Vector2(0.18, 0.96),
      new THREE.Vector2(0.32, 0.88),
      new THREE.Vector2(0.42, 0.8),
      new THREE.Vector2(0.42, 0.12),
      new THREE.Vector2(0.38, 0.05),
      new THREE.Vector2(0, 0.05),
    ];
    return new THREE.LatheGeometry(points, 32);
  }, []);

  // Oil geometry
  const oilGeometry = useMemo(() => {
    const height = 0.65 * oilLevel;
    const points: THREE.Vector2[] = [
      new THREE.Vector2(0, 0.08),
      new THREE.Vector2(0.38, 0.08),
      new THREE.Vector2(0.4, 0.12),
      new THREE.Vector2(0.4, 0.12 + height),
      new THREE.Vector2(0.35, 0.15 + height),
      new THREE.Vector2(0, 0.17 + height),
    ];
    return new THREE.LatheGeometry(points, 24);
  }, [oilLevel]);

  useFrame(() => {
    if (!groupRef.current || !autoRotate) return;
    groupRef.current.rotation.y += 0.003;
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      {/* Glass bottle */}
      <mesh geometry={bottleGeometry}>
        <meshPhysicalMaterial
          color="#d4c4a8"
          transparent
          opacity={0.35}
          roughness={0.05}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Oil */}
      <mesh geometry={oilGeometry}>
        <meshStandardMaterial
          color={oilColor}
          transparent
          opacity={0.85}
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>

      {/* Cork */}
      <group position={[0, 1.35, 0]}>
        <mesh>
          <cylinderGeometry args={[0.1, 0.12, 0.15, 16]} />
          <meshStandardMaterial color="#8b6914" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.05, 16]} />
          <meshStandardMaterial color="#6b4423" roughness={0.8} />
        </mesh>
      </group>

      {/* Label */}
      <mesh position={[0, 0.45, 0.48]}>
        <planeGeometry args={[0.5, 0.3]} />
        <meshStandardMaterial color="#fdf5e6" roughness={0.95} />
      </mesh>
    </group>
  );
}

// Preset variants
export function MustardOil(props: Omit<OilBottleRealisticProps, 'oilColor'>) {
  return <OilBottleRealistic {...props} oilColor="#e6b422" />;
}

export function SesameOil(props: Omit<OilBottleRealisticProps, 'oilColor'>) {
  return <OilBottleRealistic {...props} oilColor="#8b6914" />;
}

export function GroundnutOil(props: Omit<OilBottleRealisticProps, 'oilColor'>) {
  return <OilBottleRealistic {...props} oilColor="#e8d878" />;
}

export function CoconutOil(props: Omit<OilBottleRealisticProps, 'oilColor'>) {
  return <OilBottleRealistic {...props} oilColor="#fffef0" oilLevel={0.8} />;
}

export default OilBottleRealistic;
