'use client';

import { useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, PerspectiveCamera, Text } from '@react-three/drei';
import * as THREE from 'three';
import { WoodenPress3D } from '../objects/WoodenPress3D';
import { GoldenParticles, DustParticles } from '../effects/GoldenParticles';
import { usePerformanceTier } from '@/lib/performance-tier';

interface ProcessScene3DProps {
  scrollProgress?: number;
  className?: string;
}

// Camera that orbits around the press based on scroll
function OrbitCamera({ scrollProgress = 0 }: { scrollProgress: number }) {
  const { camera } = useThree();
  const targetPosition = useRef(new THREE.Vector3());
  const lookAtTarget = useRef(new THREE.Vector3(0, 0.2, 0));

  useFrame(() => {
    // Camera orbits around the press
    const angle = scrollProgress * Math.PI * 0.8 - Math.PI / 4;
    const radius = 4 - scrollProgress * 0.5;
    const height = 2 - scrollProgress * 0.5;

    targetPosition.current.set(
      Math.sin(angle) * radius,
      height,
      Math.cos(angle) * radius
    );

    camera.position.lerp(targetPosition.current, 0.05);
    camera.lookAt(lookAtTarget.current);
  });

  return null;
}

// Process stage labels that appear with scroll
function ProcessLabels({ scrollProgress = 0 }: { scrollProgress: number }) {
  const stages = [
    { text: 'Seeds are loaded', threshold: 0.1, position: [-1.5, 1.5, 0] as [number, number, number] },
    { text: 'Gentle crushing begins', threshold: 0.35, position: [1.5, 1.2, 0] as [number, number, number] },
    { text: 'Pure oil flows', threshold: 0.6, position: [1.8, 0, 0] as [number, number, number] },
    { text: 'Collected with care', threshold: 0.8, position: [1.5, -0.5, 0] as [number, number, number] },
  ];

  return (
    <>
      {stages.map((stage, i) => {
        const opacity = scrollProgress > stage.threshold
          ? Math.min(1, (scrollProgress - stage.threshold) * 5)
          : 0;

        return (
          <Text
            key={i}
            position={stage.position}
            fontSize={0.15}
            color="#E8DCC8"
            anchorX="center"
            anchorY="middle"
            fillOpacity={opacity}
          >
            {stage.text}
          </Text>
        );
      })}
    </>
  );
}

// Scene content
function SceneContent({ scrollProgress = 0 }: { scrollProgress: number }) {
  const { tier, particleCount } = usePerformanceTier();
  const groupRef = useRef<THREE.Group>(null);

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera makeDefault position={[3, 2, 3]} fov={40} />
      <OrbitCamera scrollProgress={scrollProgress} />

      {/* Warm lighting */}
      <ambientLight intensity={0.3} color="#FFF5E6" />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1}
        color="#FFE4C4"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={20}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <pointLight position={[-2, 2, -2]} intensity={0.4} color="#D4A574" />
      <pointLight position={[2, 0, 2]} intensity={0.2} color="#DAA520" />

      {/* Environment */}
      {tier !== 'low' && (
        <Environment preset="sunset" environmentIntensity={0.3} />
      )}

      {/* Main group */}
      <group ref={groupRef}>
        {/* Wooden Press */}
        <WoodenPress3D
          scrollProgress={scrollProgress}
          position={[0, 0, 0]}
          scale={1}
        />

        {/* Floating particles */}
        <GoldenParticles
          count={Math.floor(particleCount * 0.5)}
          spread={6}
          scrollProgress={scrollProgress}
          color="#D4A574"
          size={0.04}
          speed={0.2}
        />

        {/* Dust particles near the press */}
        {tier !== 'low' && (
          <DustParticles
            spread={3}
            scrollProgress={scrollProgress}
            speed={0.1}
          />
        )}

        {/* Process labels */}
        {tier !== 'low' && <ProcessLabels scrollProgress={scrollProgress} />}
      </group>

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]} receiveShadow>
        <planeGeometry args={[15, 15]} />
        <meshStandardMaterial
          color="#2D1F14"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Subtle fog for atmosphere */}
      <fog attach="fog" args={['#1a1410', 5, 15]} />
    </>
  );
}

export function ProcessScene3D({ scrollProgress = 0, className }: ProcessScene3DProps) {
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

export default ProcessScene3D;
