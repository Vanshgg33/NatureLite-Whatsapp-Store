'use client';

import { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ProductModelGLB } from '../models/ProductModelGLB';
import { usePerformanceTier } from '@/lib/performance-tier';

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Camera stays at safe distance — never gets closer than z=4.5
const allKeyframes = [
  { t: 0,    pos: [0, 0.3, 5.5] as const,    fov: 36 },
  { t: 0.15, pos: [1.2, 0.4, 5] as const,    fov: 35 },
  { t: 0.3,  pos: [0.3, 0.2, 4.8] as const,  fov: 34 },
  { t: 0.45, pos: [0, 0.3, 5.5] as const,    fov: 36 },
  { t: 0.55, pos: [0, 0.3, 5.5] as const,    fov: 36 },
  { t: 0.7,  pos: [-1, 0.5, 5] as const,     fov: 35 },
  { t: 0.85, pos: [0.3, 0.6, 4.8] as const,  fov: 34 },
  { t: 1.0,  pos: [0, 0.3, 5.5] as const,    fov: 36 },
];

function ScrollCamera({ progress }: { progress: number }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useFrame(() => {
    if (!cameraRef.current) return;

    let from = allKeyframes[0];
    let to = allKeyframes[1];
    for (let i = 0; i < allKeyframes.length - 1; i++) {
      if (progress >= allKeyframes[i].t && progress <= allKeyframes[i + 1].t) {
        from = allKeyframes[i];
        to = allKeyframes[i + 1];
        break;
      }
    }
    if (progress >= allKeyframes[allKeyframes.length - 1].t) {
      from = allKeyframes[allKeyframes.length - 2];
      to = allKeyframes[allKeyframes.length - 1];
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

function ScrollModel({
  modelPath,
  progress,
  activeRange,
  tier,
  tintColor,
}: {
  modelPath: string;
  progress: number;
  activeRange: [number, number];
  tier: string;
  tintColor: string;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;

    const [start, end] = activeRange;
    const fadeIn = start > 0 ? Math.min(1, (progress - start) / 0.05) : 1;
    const fadeOut = end < 1 ? Math.min(1, (end - progress) / 0.05) : 1;
    const visible = progress >= start - 0.05 && progress <= end + 0.05;

    groupRef.current.visible = visible && fadeIn > 0 && fadeOut > 0;

    if (visible) {
      const scale = Math.min(fadeIn, fadeOut);
      // Fixed scale — no zoom effect
      groupRef.current.scale.setScalar(1.3 * (0.9 + scale * 0.1));

      const localProgress = (progress - start) / (end - start);
      groupRef.current.rotation.y = localProgress * Math.PI * 0.8;
    }
  });

  return (
    <group ref={groupRef}>
      <ProductModelGLB
        modelPath={modelPath}
        position={[0, -0.4, 0]}
        scale={1.3}
        autoRotate={false}
        floating={false}
        tier={tier as 'high' | 'medium' | 'low'}
        enableTransmission={false}
        enableEntrance={false}
        tintColor={tintColor}
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

      {/* Clean natural lighting */}
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

      <Environment preset="city" environmentIntensity={0.5} />

      <ScrollModel
        modelPath="/models/oil-bottle.glb"
        progress={progress}
        activeRange={[0, 0.45]}
        tier={tier}
        tintColor="#D4A020"
      />

      <ScrollModel
        modelPath="/models/dry-fruit-box.glb"
        progress={progress}
        activeRange={[0.55, 1.0]}
        tier={tier}
        tintColor="#8B5E3C"
      />

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

export function ProductShowcaseScene({ progress }: { progress: number }) {
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

export default ProductShowcaseScene;
