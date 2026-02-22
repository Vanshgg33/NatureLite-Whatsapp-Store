'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { usePerformanceTier } from '@/lib/performance-tier';

interface GoldenParticlesProps {
  count?: number;
  spread?: number;
  size?: number;
  color?: string;
  speed?: number;
  scrollProgress?: number;
}

export function GoldenParticles({
  count: customCount,
  spread = 15,
  size = 0.08,
  color = '#D4A574',
  speed = 0.3,
  scrollProgress = 0,
}: GoldenParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const { particleCount, shouldAnimate } = usePerformanceTier();

  const count = customCount ?? particleCount;

  // Generate particle positions
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Random position in a sphere/box distribution
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.5;

      // Random velocities for floating motion
      velocities[i * 3] = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 1] = Math.random() * 0.01 + 0.005; // Slight upward bias
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;

      // Random scale variation
      scales[i] = 0.5 + Math.random() * 0.5;
    }

    return { positions, velocities, scales };
  }, [count, spread]);

  // Animate particles
  useFrame((state) => {
    if (!pointsRef.current || !shouldAnimate) return;

    const time = state.clock.elapsedTime;
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Floating motion with sine waves
      positions[i3] += Math.sin(time * 0.5 + i) * 0.001 * speed;
      positions[i3 + 1] += Math.cos(time * 0.3 + i * 0.5) * 0.002 * speed + 0.001;
      positions[i3 + 2] += Math.sin(time * 0.4 + i * 0.7) * 0.001 * speed;

      // Wrap around when particles go too far
      if (positions[i3 + 1] > spread / 2) {
        positions[i3 + 1] = -spread / 2;
      }
      if (Math.abs(positions[i3]) > spread / 2) {
        positions[i3] = -positions[i3] * 0.9;
      }
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    // Gentle rotation based on scroll
    pointsRef.current.rotation.y = scrollProgress * Math.PI * 0.5 + time * 0.02;
  });

  return (
    <Points ref={pointsRef} positions={particles.positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={color}
        size={size}
        sizeAttenuation
        depthWrite={false}
        opacity={0.6}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// Preset variations
export function SeedParticles(props: Omit<GoldenParticlesProps, 'color' | 'size'>) {
  return <GoldenParticles {...props} color="#C4A35A" size={0.12} />;
}

export function DustParticles(props: Omit<GoldenParticlesProps, 'color' | 'size'>) {
  return <GoldenParticles {...props} color="#E8DCC8" size={0.04} count={50} />;
}
