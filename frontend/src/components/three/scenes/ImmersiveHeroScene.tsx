'use client';

import { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { OilBottleGLB } from '../models/OilBottleGLB';
import { usePerformanceTier } from '@/lib/performance-tier';
import { useMouseParallax } from '../hooks/useMouseParallax';

function Bottle({ tier }: { tier: string }) {
  const groupRef = useRef<THREE.Group>(null);
  useMouseParallax(groupRef, 0.06);

  return (
    <group ref={groupRef}>
      <OilBottleGLB
        position={[0, -0.5, 0]}
        scale={1.4}
        autoRotate
        rotateSpeed={0.2}
        floating
        tier={tier as 'high' | 'medium' | 'low'}
        enableTransmission={false}
        enableEntrance
        enablePulse={false}
        envMapIntensity={1.2}
      />
    </group>
  );
}

function SceneContent() {
  const { tier } = usePerformanceTier();

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.3, 5.5]} fov={35} />

      {/* Clean natural lighting */}
      <ambientLight intensity={0.8} color="#ffffff" />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.2}
        color="#FFF8F0"
        castShadow={tier === 'high'}
        shadow-mapSize={[512, 512]}
      />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} color="#E8F5E9" />
      <pointLight position={[0, -1, 3]} intensity={0.3} color="#FFF5E6" />

      <Environment preset="apartment" environmentIntensity={0.6} />

      <Bottle tier={tier} />

      {/* Subtle ground shadow */}
      {tier !== 'low' && (
        <ContactShadows
          position={[0, -2, 0]}
          opacity={0.25}
          scale={6}
          blur={2.5}
          far={3}
          resolution={256}
          color="#4A7A5C"
        />
      )}
    </>
  );
}

export function ImmersiveHeroScene() {
  const { tier } = usePerformanceTier();

  return (
    <Canvas
      shadows={tier === 'high'}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'default',
        stencil: false,
      }}
      dpr={[1, 1.5]}
      style={{ background: 'transparent' }}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}

export default ImmersiveHeroScene;
