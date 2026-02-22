'use client';

import { useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Sparkles, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { OilBottle3D } from '../objects/OilBottle3D';
import { GoldenParticles } from '../effects/GoldenParticles';
import { usePerformanceTier } from '@/lib/performance-tier';

interface HeroScene3DProps {
  scrollProgress?: number;
  className?: string;
}

// Camera controller that responds to scroll
function ScrollCamera({ scrollProgress = 0 }: { scrollProgress: number }) {
  const { camera } = useThree();
  const initialPosition = useRef(new THREE.Vector3(0, 0, 6));
  const targetPosition = useRef(new THREE.Vector3());

  useFrame(() => {
    // Smooth camera movement based on scroll
    // Start far, zoom in as user scrolls
    const zoomProgress = Math.min(scrollProgress * 2, 1); // First 50% of scroll
    const rotateProgress = Math.max(0, (scrollProgress - 0.3) * 1.4); // After 30%

    // Position: start at z=8, move to z=4
    targetPosition.current.set(
      Math.sin(rotateProgress * Math.PI * 0.3) * 2,
      0.5 - scrollProgress * 0.5,
      8 - zoomProgress * 4
    );

    // Smooth interpolation
    camera.position.lerp(targetPosition.current, 0.05);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// Main 3D scene content
function SceneContent({ scrollProgress = 0 }: { scrollProgress: number }) {
  const { tier, particleCount } = usePerformanceTier();
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;

    // Subtle scene rotation
    const time = state.clock.elapsedTime;
    groupRef.current.rotation.y = time * 0.05;
  });

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={35} />
      <ScrollCamera scrollProgress={scrollProgress} />

      {/* Lighting */}
      <ambientLight intensity={0.4} color="#FFF5E6" />
      <directionalLight
        position={[5, 5, 5]}
        intensity={1.2}
        color="#FFE4C4"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight
        position={[-3, 3, -3]}
        intensity={0.4}
        color="#D4A574"
      />
      <pointLight position={[0, -2, 2]} intensity={0.3} color="#8B6914" />

      {/* Environment for reflections */}
      {tier !== 'low' && (
        <Environment preset="studio" environmentIntensity={0.5} />
      )}

      {/* Main content group */}
      <group ref={groupRef}>
        {/* Central Oil Bottle */}
        <OilBottle3D
          position={[0, -0.3, 0]}
          scale={1.8}
          scrollProgress={scrollProgress}
          floating={true}
          oilColor="#DAA520"
          bottleColor="#8B7355"
        />

        {/* Golden seed particles */}
        <GoldenParticles
          count={particleCount}
          spread={12}
          scrollProgress={scrollProgress}
          color="#D4A574"
          size={0.06}
        />

        {/* Sparkles for extra magic */}
        {tier === 'high' && (
          <Sparkles
            count={30}
            scale={8}
            size={2}
            speed={0.3}
            color="#DAA520"
            opacity={0.5}
          />
        )}
      </group>

      {/* Ground reflection plane (subtle) */}
      {tier !== 'low' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial
            color="#1a1410"
            metalness={0.8}
            roughness={0.3}
            transparent
            opacity={0.3}
          />
        </mesh>
      )}
    </>
  );
}

// Main exported component
export function HeroScene3D({ scrollProgress = 0, className }: HeroScene3DProps) {
  const { tier } = usePerformanceTier();

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        shadows={tier === 'high'}
        gl={{
          antialias: tier === 'high',
          alpha: true,
          powerPreference: tier === 'high' ? 'high-performance' : 'low-power',
          stencil: false,
        }}
        dpr={tier === 'high' ? [1, 2] : [1, 1.5]}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <SceneContent scrollProgress={scrollProgress} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default HeroScene3D;
