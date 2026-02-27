'use client';

import { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { OilBottleGLB } from '../models/OilBottleGLB';
import { usePerformanceTier } from '@/lib/performance-tier';

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Camera stays at safe distance (z >= 4.5), gentle orbit
const cameraKeyframes = [
  { t: 0,    pos: [0, 0.3, 5.5] as const,    fov: 36 },
  { t: 0.12, pos: [1.5, 0.3, 5] as const,    fov: 35 },
  { t: 0.25, pos: [0.2, 0.1, 4.8] as const,  fov: 34 },
  { t: 0.4,  pos: [-1, 0.4, 5] as const,     fov: 35 },
  { t: 0.5,  pos: [-1.2, 1, 5] as const,     fov: 36 },
  { t: 0.65, pos: [0, 1, 4.8] as const,      fov: 34 },
  { t: 0.75, pos: [0.8, 0.3, 5] as const,    fov: 35 },
  { t: 0.9,  pos: [-0.3, 0.3, 5.2] as const, fov: 36 },
  { t: 1.0,  pos: [0, 0.3, 5.5] as const,    fov: 36 },
];

function ScrollCamera({ progress }: { progress: number }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useFrame(() => {
    if (!cameraRef.current) return;

    let from = cameraKeyframes[0];
    let to = cameraKeyframes[1];
    for (let i = 0; i < cameraKeyframes.length - 1; i++) {
      if (progress >= cameraKeyframes[i].t && progress <= cameraKeyframes[i + 1].t) {
        from = cameraKeyframes[i];
        to = cameraKeyframes[i + 1];
        break;
      }
    }
    if (progress >= cameraKeyframes[cameraKeyframes.length - 1].t) {
      from = cameraKeyframes[cameraKeyframes.length - 2];
      to = cameraKeyframes[cameraKeyframes.length - 1];
    }

    const range = to.t - from.t || 1;
    const localT = Math.max(0, Math.min(1, (progress - from.t) / range));
    const eased = smoothstep(localT);

    const targetPos = new THREE.Vector3(
      THREE.MathUtils.lerp(from.pos[0], to.pos[0], eased),
      THREE.MathUtils.lerp(from.pos[1], to.pos[1], eased),
      THREE.MathUtils.lerp(from.pos[2], to.pos[2], eased),
    );

    cameraRef.current.position.lerp(targetPos, 0.06);

    const targetFov = THREE.MathUtils.lerp(from.fov, to.fov, eased);
    cameraRef.current.fov += (targetFov - cameraRef.current.fov) * 0.06;
    cameraRef.current.updateProjectionMatrix();

    cameraRef.current.lookAt(0, 0, 0);
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 0.3, 5.5]} fov={36} />;
}

function ScrollBottle({ progress, tier }: { progress: number; tier: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const targetRotation = progress * Math.PI * 1.5;
    groupRef.current.rotation.y += (targetRotation - groupRef.current.rotation.y) * 0.04;

    // Subtle tilt during extraction stage
    const tilt = progress > 0.25 && progress < 0.5
      ? Math.sin((progress - 0.25) / 0.25 * Math.PI) * 0.1
      : 0;
    groupRef.current.rotation.z += (tilt - groupRef.current.rotation.z) * 0.04;
  });

  return (
    <group ref={groupRef}>
      <OilBottleGLB
        position={[0, -0.4, 0]}
        scale={1.4}
        autoRotate={false}
        floating={false}
        tier={tier as 'high' | 'medium' | 'low'}
        enableTransmission={false}
        enableEntrance={false}
        enablePulse={false}
        envMapIntensity={1}
      />
    </group>
  );
}

function SceneContent({ progress }: { progress: number }) {
  const { tier } = usePerformanceTier();

  return (
    <>
      <ScrollCamera progress={progress} />

      <ambientLight intensity={0.6} color="#ffffff" />
      <directionalLight
        position={[5, 5, 5]}
        intensity={1.2}
        color="#FFF8F0"
        castShadow={tier === 'high'}
        shadow-mapSize={[512, 512]}
      />
      <directionalLight position={[-3, 2, -3]} intensity={0.3} color="#E8F5E9" />
      <pointLight position={[0, -2, 3]} intensity={0.2} color="#FFF5E6" />

      <Environment preset="apartment" environmentIntensity={0.5 + progress * 0.2} />

      <ScrollBottle progress={progress} tier={tier} />

      {tier !== 'low' && (
        <ContactShadows
          position={[0, -2, 0]}
          opacity={0.2}
          scale={8}
          blur={2.5}
          far={3}
          resolution={256}
          color="#2D4A3C"
        />
      )}

      {tier === 'high' && (
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.8} intensity={0.2} mipmapBlur />
        </EffectComposer>
      )}
    </>
  );
}

export function StoryProcessScene({ progress }: { progress: number }) {
  const { tier } = usePerformanceTier();

  return (
    <Canvas
      shadows={tier === 'high'}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'default',
        stencil: false,
      }}
      dpr={[1, 1.5]}
      style={{ background: '#1A2E23' }}
    >
      <Suspense fallback={null}>
        <SceneContent progress={progress} />
      </Suspense>
    </Canvas>
  );
}

export default StoryProcessScene;
