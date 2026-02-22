'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial, Float } from '@react-three/drei';
import * as THREE from 'three';

interface OilBottle3DProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  oilColor?: string;
  bottleColor?: string;
  scrollProgress?: number;
  floating?: boolean;
}

export function OilBottle3D({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  oilColor = '#D4A020',
  bottleColor = '#8B6914',
  scrollProgress = 0,
  floating = true,
}: OilBottle3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const oilRef = useRef<THREE.Mesh>(null);

  // Create bottle shape using lathe geometry for realistic curves
  const bottleShape = useMemo(() => {
    const points: THREE.Vector2[] = [];

    // Bottom curve
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(0.4, 0));
    points.push(new THREE.Vector2(0.45, 0.05));
    points.push(new THREE.Vector2(0.5, 0.15));

    // Body
    points.push(new THREE.Vector2(0.5, 0.8));
    points.push(new THREE.Vector2(0.48, 0.9));

    // Shoulder curve
    points.push(new THREE.Vector2(0.4, 1.0));
    points.push(new THREE.Vector2(0.25, 1.1));

    // Neck
    points.push(new THREE.Vector2(0.18, 1.2));
    points.push(new THREE.Vector2(0.15, 1.5));

    // Lip
    points.push(new THREE.Vector2(0.18, 1.55));
    points.push(new THREE.Vector2(0.18, 1.6));
    points.push(new THREE.Vector2(0.12, 1.6));
    points.push(new THREE.Vector2(0.12, 1.55));
    points.push(new THREE.Vector2(0, 1.55));

    return new THREE.LatheGeometry(points, 32);
  }, []);

  // Create oil liquid inside (slightly smaller)
  const oilShape = useMemo(() => {
    const points: THREE.Vector2[] = [];
    const fillLevel = 0.75; // Oil fill level

    points.push(new THREE.Vector2(0, 0.05));
    points.push(new THREE.Vector2(0.35, 0.05));
    points.push(new THREE.Vector2(0.4, 0.1));
    points.push(new THREE.Vector2(0.45, 0.2));
    points.push(new THREE.Vector2(0.45, 0.8 * fillLevel));

    // Top surface of oil (flat with slight curve)
    points.push(new THREE.Vector2(0.4, 0.85 * fillLevel));
    points.push(new THREE.Vector2(0.2, 0.87 * fillLevel));
    points.push(new THREE.Vector2(0, 0.88 * fillLevel));

    return new THREE.LatheGeometry(points, 32);
  }, []);

  // Animate based on scroll
  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.elapsedTime;

    // Scroll-driven rotation
    groupRef.current.rotation.y = scrollProgress * Math.PI * 2 + time * 0.1;

    // Subtle wobble for the oil inside
    if (oilRef.current) {
      oilRef.current.rotation.z = Math.sin(time * 2) * 0.02;
    }
  });

  const bottleContent = (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      {/* Glass bottle - outer */}
      <mesh geometry={bottleShape} castShadow receiveShadow>
        <MeshTransmissionMaterial
          color={bottleColor}
          thickness={0.2}
          roughness={0.05}
          transmission={0.95}
          ior={1.5}
          chromaticAberration={0.02}
          backside
          backsideThickness={0.2}
        />
      </mesh>

      {/* Oil liquid inside */}
      <mesh ref={oilRef} geometry={oilShape} position={[0, 0.02, 0]}>
        <meshPhysicalMaterial
          color={oilColor}
          metalness={0.1}
          roughness={0.1}
          transmission={0.6}
          thickness={0.5}
          ior={1.4}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Cork/Cap */}
      <mesh position={[0, 1.65, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.15, 16]} />
        <meshStandardMaterial
          color="#8B4513"
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Label band */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.51, 0.51, 0.3, 32, 1, true]} />
        <meshStandardMaterial
          color="#F5E6D3"
          roughness={0.9}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );

  if (floating) {
    return (
      <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
        {bottleContent}
      </Float>
    );
  }

  return bottleContent;
}

// Product variations
export function MustardOilBottle(props: Omit<OilBottle3DProps, 'oilColor'>) {
  return <OilBottle3D {...props} oilColor="#DAA520" bottleColor="#8B7355" />;
}

export function SesameOilBottle(props: Omit<OilBottle3DProps, 'oilColor'>) {
  return <OilBottle3D {...props} oilColor="#8B4513" bottleColor="#654321" />;
}

export function GroundnutOilBottle(props: Omit<OilBottle3DProps, 'oilColor'>) {
  return <OilBottle3D {...props} oilColor="#F0E68C" bottleColor="#9E8B6E" />;
}

export function CoconutOilBottle(props: Omit<OilBottle3DProps, 'oilColor'>) {
  return <OilBottle3D {...props} oilColor="#FFFAF0" bottleColor="#F5F5DC" />;
}
