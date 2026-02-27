'use client';

import { useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, ContactShadows, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, DepthOfField, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { OilBottleGLB } from '../models/OilBottleGLB';
import { GoldenParticles } from '../effects/GoldenParticles';
import { usePerformanceTier } from '@/lib/performance-tier';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// Smoothstep interpolation for cinematic camera transitions
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Camera keyframes for dramatic choreography
const cameraKeyframes = [
  { t: 0,    pos: [0, 0.5, 5] as const,     fov: 40 },  // Wide establishing
  { t: 0.15, pos: [2, 0.8, 3.5] as const,   fov: 35 },  // Orbit right
  { t: 0.35, pos: [0.5, 0.2, 2.5] as const, fov: 30 },  // Close-up on label
  { t: 0.5,  pos: [-2, 1.5, 3] as const,    fov: 35 },  // High angle left
  { t: 0.65, pos: [0, 2, 2] as const,       fov: 28 },  // Top-down on cap
  { t: 0.8,  pos: [-1, 0, 3.5] as const,    fov: 38 },  // Pull back
  { t: 1.0,  pos: [0, 0.5, 4.5] as const,   fov: 40 },  // Return centered
];

// Keyframe-driven cinematic camera
function ScrollCamera({ progress }: { progress: number }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useFrame(() => {
    if (!cameraRef.current) return;

    // Find bracketing keyframes
    let from = cameraKeyframes[0];
    let to = cameraKeyframes[1];
    for (let i = 0; i < cameraKeyframes.length - 1; i++) {
      if (progress >= cameraKeyframes[i].t && progress <= cameraKeyframes[i + 1].t) {
        from = cameraKeyframes[i];
        to = cameraKeyframes[i + 1];
        break;
      }
    }
    // Handle end of keyframes
    if (progress >= cameraKeyframes[cameraKeyframes.length - 1].t) {
      from = cameraKeyframes[cameraKeyframes.length - 2];
      to = cameraKeyframes[cameraKeyframes.length - 1];
    }

    const range = to.t - from.t || 1;
    const localT = Math.max(0, Math.min(1, (progress - from.t) / range));
    const eased = smoothstep(localT);

    // Interpolate position
    const targetPos = new THREE.Vector3(
      THREE.MathUtils.lerp(from.pos[0], to.pos[0], eased),
      THREE.MathUtils.lerp(from.pos[1], to.pos[1], eased),
      THREE.MathUtils.lerp(from.pos[2], to.pos[2], eased),
    );

    cameraRef.current.position.lerp(targetPos, 0.08);

    // Interpolate FOV for zoom effect
    const targetFov = THREE.MathUtils.lerp(from.fov, to.fov, eased);
    cameraRef.current.fov += (targetFov - cameraRef.current.fov) * 0.08;
    cameraRef.current.updateProjectionMatrix();

    cameraRef.current.lookAt(0, 0, 0);
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 0.5, 5]} fov={40} />;
}

// Bottle with scroll-driven rotation + tilt
function ScrollBottle({ progress, tier }: { progress: number; tier: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const targetRotation = progress * Math.PI * 1.5;
    groupRef.current.rotation.y += (targetRotation - groupRef.current.rotation.y) * 0.05;

    // Tilt at pour angle (50-80%)
    const tilt = progress > 0.5 && progress < 0.8
      ? Math.sin((progress - 0.5) / 0.3 * Math.PI) * 0.2
      : 0;
    groupRef.current.rotation.z += (tilt - groupRef.current.rotation.z) * 0.05;
  });

  return (
    <group ref={groupRef}>
      <OilBottleGLB
        position={[0, -0.3, 0]}
        scale={2.2}
        autoRotate={false}
        floating={false}
        tier={tier as 'high' | 'medium' | 'low'}
        enableTransmission={tier === 'high'}
        enableEntrance={false}
        envMapIntensity={1.2}
      />
    </group>
  );
}

function SceneContent({ progress }: { progress: number }) {
  const { tier } = usePerformanceTier();

  return (
    <>
      <ScrollCamera progress={progress} />

      {/* Warm lighting */}
      <ambientLight intensity={0.4} color="#FFF5E6" />
      <directionalLight
        position={[5, 5, 5]}
        intensity={1.3}
        color="#FFE4C4"
        castShadow={tier === 'high'}
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3, 2, -3]} intensity={0.4} color="#D4A574" />
      <pointLight position={[0, -2, 3]} intensity={0.3} color="#DAA520" />
      {/* Back-rim light */}
      <pointLight position={[0, 1, -3]} intensity={0.2} color="#FFF5E6" />

      {/* City environment for dramatic reflections */}
      <Environment preset="city" environmentIntensity={0.6} />

      <ScrollBottle progress={progress} tier={tier} />

      {/* Dual-layer particles */}
      {tier !== 'low' && (
        <>
          <GoldenParticles
            count={tier === 'high' ? 50 : 25}
            spread={5}
            color="#D4A574"
            size={0.05}
            speed={0.12}
            scrollProgress={progress}
            opacity={0.5}
          />
          {tier === 'high' && (
            <GoldenParticles
              count={60}
              spread={10}
              color="#C4A35A"
              size={0.03}
              speed={0.25}
              scrollProgress={progress}
              opacity={0.25}
            />
          )}
        </>
      )}

      {tier === 'high' && (
        <Sparkles count={15} scale={5} size={1} speed={0.15} color="#DAA520" opacity={0.3} />
      )}

      {/* Contact shadows */}
      {tier !== 'low' && (
        <ContactShadows
          position={[0, -2, 0]}
          opacity={0.35}
          scale={10}
          blur={2.5}
          far={4}
          resolution={tier === 'high' ? 512 : 256}
          color="#1a1410"
        />
      )}

      {/* Post-processing: cinematic pipeline */}
      {tier === 'high' && (
        <EffectComposer multisampling={4}>
          <DepthOfField
            focusDistance={0.02}
            focalLength={0.05}
            bokehScale={3}
          />
          <Bloom
            luminanceThreshold={0.75}
            intensity={0.3}
            mipmapBlur
          />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new THREE.Vector2(0.0004, 0.0004)}
            radialModulation
            modulationOffset={0.5}
          />
        </EffectComposer>
      )}
      {tier === 'medium' && (
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.85} intensity={0.2} />
        </EffectComposer>
      )}
    </>
  );
}

// Text panels at different scroll stages
const stages = [
  {
    title: 'Pure Cold-Pressed',
    description: 'Extracted at low temperatures to preserve every nutrient, vitamin, and natural flavor.',
    range: [0, 0.3] as [number, number],
    align: 'left' as const,
  },
  {
    title: 'Traditional Wood-Pressed',
    description: 'Crafted using age-old wooden Ghani methods, just like our ancestors intended.',
    range: [0.3, 0.6] as [number, number],
    align: 'right' as const,
  },
  {
    title: 'Farm to Kitchen',
    description: 'Sourced directly from organic farms. No middlemen, no additives, just purity.',
    range: [0.6, 0.85] as [number, number],
    align: 'left' as const,
  },
];

export function ScrollShowcaseSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(section);

    const handleScroll = () => {
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const sectionHeight = section.offsetHeight - window.innerHeight;
      if (sectionHeight <= 0) return;
      const progress = Math.max(0, Math.min(1, -rect.top / sectionHeight));
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const showCTA = scrollProgress > 0.85;

  return (
    <section ref={sectionRef} className="relative h-[200vh] bg-brand-charcoal">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* 3D Canvas */}
        <div className="absolute inset-0">
          {isVisible && (
            <Canvas
              shadows
              gl={{ antialias: true, alpha: false, stencil: false }}
              dpr={[1, 1.5]}
              style={{ background: '#1a1410' }}
            >
              <Suspense fallback={null}>
                <SceneContent progress={scrollProgress} />
              </Suspense>
            </Canvas>
          )}
        </div>

        {/* Text Overlays */}
        <div className="relative z-10 h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pointer-events-none">
          {stages.map((stage, index) => {
            const stageProgress = scrollProgress >= stage.range[0] && scrollProgress < stage.range[1]
              ? (scrollProgress - stage.range[0]) / (stage.range[1] - stage.range[0])
              : scrollProgress >= stage.range[1] ? 1 : 0;

            const opacity = stageProgress > 0 && stageProgress < 1
              ? Math.sin(stageProgress * Math.PI)
              : 0;

            const translateY = stageProgress < 0.5
              ? (1 - stageProgress * 2) * 30
              : (stageProgress - 0.5) * 2 * -30;

            return (
              <div
                key={index}
                className={`absolute top-1/2 -translate-y-1/2 max-w-md ${
                  stage.align === 'left' ? 'left-4 sm:left-8 lg:left-12' : 'right-4 sm:right-8 lg:right-12'
                }`}
                style={{
                  opacity,
                  transform: `translateY(calc(-50% + ${translateY}px))`,
                  transition: 'none',
                }}
              >
                <div className="space-y-4">
                  <div className="h-px w-12 bg-brand-mustard" />
                  <h3 className="font-display text-3xl lg:text-5xl font-bold text-white">
                    {stage.title}
                  </h3>
                  <p className="text-white/60 text-lg leading-relaxed">
                    {stage.description}
                  </p>
                </div>
              </div>
            );
          })}

          {/* CTA */}
          <div
            className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center pointer-events-auto"
            style={{
              opacity: showCTA ? 1 : 0,
              transform: `translateX(-50%) translateY(${showCTA ? 0 : 20}px)`,
              transition: 'opacity 0.5s ease, transform 0.5s ease',
            }}
          >
            <Link
              href="/products"
              className="inline-flex items-center gap-2 px-10 py-5 bg-brand-mustard text-white rounded-full text-lg font-semibold hover:bg-brand-mustard/90 transition-colors shadow-brand-lg"
            >
              Shop Now
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {stages.map((stage, i) => (
            <div
              key={i}
              className="w-8 h-1 rounded-full transition-colors duration-300"
              style={{
                backgroundColor: scrollProgress >= stage.range[0]
                  ? 'rgb(var(--brand-mustard))'
                  : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
