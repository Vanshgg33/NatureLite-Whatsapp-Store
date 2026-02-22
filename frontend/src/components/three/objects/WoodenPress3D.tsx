'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePerformanceTier } from '@/lib/performance-tier';

interface WoodenPress3DProps {
  scrollProgress?: number;
  position?: [number, number, number];
  scale?: number;
}

// Seed pile component with instanced meshes
function SeedPile({
  scrollProgress = 0,
  position = [0, 0, 0] as [number, number, number],
}: {
  scrollProgress: number;
  position?: [number, number, number];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { particleCount } = usePerformanceTier();
  const count = Math.min(particleCount, 80);

  const seedData = useMemo(() => {
    const data: { position: THREE.Vector3; scale: number; rotation: number }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 0.6;
      data.push({
        position: new THREE.Vector3(
          Math.cos(angle) * radius,
          Math.random() * 0.3,
          Math.sin(angle) * radius
        ),
        scale: 0.03 + Math.random() * 0.02,
        rotation: Math.random() * Math.PI,
      });
    }
    return data;
  }, [count]);

  useFrame(() => {
    if (!meshRef.current) return;

    const matrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempRotation = new THREE.Euler();
    const tempScale = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion();

    // Seeds get compressed as scroll progresses
    const compression = 1 - scrollProgress * 0.6;

    seedData.forEach((seed, i) => {
      tempPosition.copy(seed.position);
      tempPosition.y *= compression;
      tempPosition.add(new THREE.Vector3(...position));

      tempRotation.set(seed.rotation, seed.rotation * 0.5, 0);
      tempQuaternion.setFromEuler(tempRotation);

      const scaleValue = seed.scale * (0.8 + compression * 0.2);
      tempScale.set(scaleValue, scaleValue * compression, scaleValue);

      matrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current!.setMatrixAt(i, matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial color="#C4A35A" roughness={0.8} metalness={0.1} />
    </instancedMesh>
  );
}

// Oil drip animation
function OilDrip({
  scrollProgress = 0,
  position = [0, 0, 0] as [number, number, number],
}: {
  scrollProgress: number;
  position?: [number, number, number];
}) {
  const dripRefs = useRef<THREE.Mesh[]>([]);
  const dripCount = 5;

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    dripRefs.current.forEach((drip, i) => {
      if (!drip) return;

      // Only show drips after 30% scroll progress
      const dripPhase = (time * 0.5 + i * 0.4) % 1;
      const shouldShow = scrollProgress > 0.3;

      if (shouldShow) {
        drip.visible = true;
        drip.position.y = position[1] - dripPhase * 1.5;
        drip.scale.setScalar(0.03 * (1 - dripPhase * 0.5));
        (drip.material as THREE.MeshStandardMaterial).opacity = 1 - dripPhase;
      } else {
        drip.visible = false;
      }
    });
  });

  return (
    <group position={position}>
      {Array.from({ length: dripCount }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) dripRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial
            color="#DAA520"
            transparent
            opacity={0.9}
            metalness={0.3}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

// Oil collection bowl
function OilBowl({
  scrollProgress = 0,
  position = [0, 0, 0] as [number, number, number],
}: {
  scrollProgress: number;
  position?: [number, number, number];
}) {
  const oilRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!oilRef.current) return;

    // Oil level rises with scroll progress
    const fillLevel = Math.max(0, (scrollProgress - 0.3) * 1.5);
    oilRef.current.scale.y = Math.min(fillLevel, 0.8);
    oilRef.current.position.y = -0.3 + fillLevel * 0.15;
  });

  return (
    <group position={position}>
      {/* Bowl container */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.4, 0.4, 32, 1, true]} />
        <meshStandardMaterial
          color="#8B4513"
          roughness={0.7}
          metalness={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Bowl bottom */}
      <mesh position={[0, -0.2, 0]} receiveShadow>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial color="#654321" roughness={0.8} />
      </mesh>

      {/* Oil inside */}
      <mesh ref={oilRef} position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.38, 0.35, 0.3, 32]} />
        <meshPhysicalMaterial
          color="#DAA520"
          metalness={0.1}
          roughness={0.1}
          transmission={0.5}
          thickness={0.3}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}

export function WoodenPress3D({
  scrollProgress = 0,
  position = [0, 0, 0],
  scale = 1,
}: WoodenPress3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const armRef = useRef<THREE.Group>(null);
  const { tier } = usePerformanceTier();

  useFrame(() => {
    if (!armRef.current) return;

    // Rotate arm based on scroll progress
    armRef.current.rotation.y = scrollProgress * Math.PI * 4;
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Base platform */}
      <mesh position={[0, -0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.2, 1.3, 0.2, 32]} />
        <meshStandardMaterial color="#5D4037" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Main mortar (ghani body) */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.8, 0.9, 1.2, 32]} />
        <meshStandardMaterial color="#6D4C3D" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Inner cavity */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.65, 0.7, 0.6, 32, 1, true]} />
        <meshStandardMaterial
          color="#4A3728"
          roughness={0.9}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Seeds inside */}
      <SeedPile scrollProgress={scrollProgress} position={[0, 0.35, 0]} />

      {/* Rotating arm assembly */}
      <group ref={armRef} position={[0, 0.8, 0]}>
        {/* Central shaft */}
        <mesh castShadow>
          <cylinderGeometry args={[0.08, 0.08, 1.5, 16]} />
          <meshStandardMaterial color="#5D4037" roughness={0.8} />
        </mesh>

        {/* Horizontal beam */}
        <mesh position={[0.6, 0.6, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.4, 12]} />
          <meshStandardMaterial color="#6D4C3D" roughness={0.8} />
        </mesh>

        {/* Pestle (grinding element) */}
        <mesh position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.2, 0.8, 16]} />
          <meshStandardMaterial color="#5D4037" roughness={0.7} metalness={0.2} />
        </mesh>
      </group>

      {/* Spout for oil */}
      <mesh position={[0.9, 0, 0]} rotation={[0, 0, -Math.PI / 6]}>
        <cylinderGeometry args={[0.08, 0.05, 0.4, 12]} />
        <meshStandardMaterial color="#5D4037" roughness={0.8} />
      </mesh>

      {/* Oil drips */}
      {tier !== 'low' && (
        <OilDrip scrollProgress={scrollProgress} position={[1.1, 0, 0]} />
      )}

      {/* Collection bowl */}
      <OilBowl scrollProgress={scrollProgress} position={[1.1, -0.7, 0]} />

      {/* Wood grain detail rings */}
      {[0.1, 0.3, 0.5].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <torusGeometry args={[0.82 - i * 0.02, 0.01, 8, 32]} />
          <meshStandardMaterial color="#4A3728" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export default WoodenPress3D;
