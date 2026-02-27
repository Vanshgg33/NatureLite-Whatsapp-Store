'use client';

import { useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Sparkles, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { OilBottleGLB } from '../models/OilBottleGLB';
import { GoldenParticles } from '../effects/GoldenParticles';
import { usePerformanceTier } from '@/lib/performance-tier';
import { useMouseParallax } from '../hooks/useMouseParallax';

// Interactive bottle wrapper with mouse-follow tilt
function InteractiveBottle({ tier }: { tier: string }) {
  const tiltGroupRef = useRef<THREE.Group>(null);
  useMouseParallax(tiltGroupRef, 0.12);

  return (
    <group ref={tiltGroupRef}>
      <OilBottleGLB
        position={[0, -0.3, 0]}
        scale={2}
        autoRotate
        rotateSpeed={0.3}
        floating
        tier={tier as 'high' | 'medium' | 'low'}
        enableTransmission={tier === 'high'}
        enableEntrance
        enablePulse={tier === 'high'}
        envMapIntensity={1.5}
      />
    </group>
  );
}

function SceneContent() {
  const { tier } = usePerformanceTier();

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.5, 5]} fov={40} />

      {/* Warm 3-point lighting */}
      <ambientLight intensity={0.5} color="#FFF5E6" />
      <directionalLight
        position={[5, 5, 5]}
        intensity={1.5}
        color="#FFE4C4"
        castShadow={tier === 'high'}
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3, 3, -3]} intensity={0.5} color="#D4A574" />
      <pointLight position={[0, -2, 3]} intensity={0.4} color="#DAA520" />
      {/* Rim light for edge definition */}
      <pointLight position={[-2, 1, -3]} intensity={0.3} color="#FFF5E6" />

      {/* Environment — apartment preset for warm window reflections */}
      <Environment preset="apartment" environmentIntensity={0.8} />

      {/* Interactive bottle with mouse parallax */}
      <InteractiveBottle tier={tier} />

      {/* Dual-layer particles for depth */}
      {/* Near layer — larger, slower, more visible */}
      <GoldenParticles
        count={tier === 'high' ? 60 : 30}
        spread={5}
        color="#D4A574"
        size={0.06}
        speed={0.15}
        opacity={0.6}
      />
      {/* Far layer — smaller, faster, more spread */}
      {tier !== 'low' && (
        <GoldenParticles
          count={tier === 'high' ? 80 : 40}
          spread={12}
          color="#C4A35A"
          size={0.03}
          speed={0.3}
          opacity={0.3}
        />
      )}

      {/* Extra sparkles on high-end */}
      {tier === 'high' && (
        <Sparkles
          count={25}
          scale={6}
          size={1.5}
          speed={0.2}
          color="#DAA520"
          opacity={0.4}
        />
      )}

      {/* Contact shadows — soft, realistic */}
      {tier !== 'low' && (
        <ContactShadows
          position={[0, -2, 0]}
          opacity={0.4}
          scale={10}
          blur={2.5}
          far={4}
          resolution={tier === 'high' ? 512 : 256}
          color="#1a1410"
        />
      )}

      {/* Subtle reflection plane under contact shadows */}
      {tier === 'high' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.01, 0]}>
          <planeGeometry args={[15, 15]} />
          <meshStandardMaterial
            color="#2a2015"
            metalness={0.95}
            roughness={0.1}
            transparent
            opacity={0.08}
          />
        </mesh>
      )}

      {/* Post-processing — high tier: full premium pipeline */}
      {tier === 'high' && (
        <EffectComposer multisampling={4}>
          <Bloom
            luminanceThreshold={0.7}
            luminanceSmoothing={0.9}
            intensity={0.5}
            mipmapBlur
          />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new THREE.Vector2(0.0005, 0.0005)}
            radialModulation
            modulationOffset={0.5}
          />
          <Vignette eskil={false} offset={0.1} darkness={0.4} />
        </EffectComposer>
      )}

      {/* Medium tier: basic post-processing */}
      {tier === 'medium' && (
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.8} intensity={0.3} />
          <Vignette eskil={false} offset={0.1} darkness={0.3} />
        </EffectComposer>
      )}
    </>
  );
}

export function HeroBottleScene({ className }: { className?: string }) {
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
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default HeroBottleScene;
