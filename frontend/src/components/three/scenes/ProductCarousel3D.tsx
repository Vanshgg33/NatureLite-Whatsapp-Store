'use client';

import { Suspense, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, ContactShadows, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { ProductModelGLB } from '../models/ProductModelGLB';
import { GoldenParticles } from '../effects/GoldenParticles';
import { usePerformanceTier } from '@/lib/performance-tier';
import { useMouseParallax } from '../hooks/useMouseParallax';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

// Product definitions for the carousel
const carouselProducts = [
  {
    id: 'oil-bottle',
    modelPath: '/models/oil-bottle.glb',
    name: 'Cold-Pressed Oil',
    subtitle: 'Traditional Wood-Pressed',
    description: 'Pure organic oil extracted using age-old wooden Ghani methods. No chemicals, no heat — just nature.',
    link: '/products',
    tintColor: '#D4A020',
    enableTransmission: true,
    scale: 2,
    particleColor: '#D4A574',
  },
  {
    id: 'dry-fruit-box',
    modelPath: '/models/dry-fruit-box.glb',
    name: 'Premium Dry Fruits',
    subtitle: 'Handpicked & Farm-Fresh',
    description: 'Carefully selected premium dry fruits, packed in eco-friendly boxes. Perfect for gifting and daily nutrition.',
    link: '/products',
    tintColor: '#8B5E3C',
    enableTransmission: false,
    scale: 2,
    particleColor: '#C4A35A',
  },
];

// Interactive model wrapper with mouse parallax
function InteractiveModel({
  product,
  isActive,
  tier,
}: {
  product: typeof carouselProducts[0];
  isActive: boolean;
  tier: string;
}) {
  const tiltRef = useRef<THREE.Group>(null);
  useMouseParallax(tiltRef, isActive ? 0.1 : 0);

  return (
    <group ref={tiltRef}>
      <ProductModelGLB
        modelPath={product.modelPath}
        position={[0, -0.3, 0]}
        scale={product.scale}
        autoRotate
        rotateSpeed={0.3}
        floating
        tier={tier as 'high' | 'medium' | 'low'}
        enableTransmission={product.enableTransmission}
        enableEntrance={isActive}
        enablePulse={isActive && tier === 'high'}
        tintColor={product.tintColor}
        envMapIntensity={1.3}
        visible={isActive}
      />
    </group>
  );
}

function SceneContent({ activeIndex }: { activeIndex: number }) {
  const { tier } = usePerformanceTier();
  const activeProduct = carouselProducts[activeIndex];

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.5, 5]} fov={40} />

      {/* Warm lighting */}
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
      <pointLight position={[-2, 1, -3]} intensity={0.2} color="#FFF5E6" />

      <Environment preset="apartment" environmentIntensity={0.8} />

      {/* Render all models, only active one visible */}
      {carouselProducts.map((product, i) => (
        <InteractiveModel
          key={product.id}
          product={product}
          isActive={i === activeIndex}
          tier={tier}
        />
      ))}

      {/* Particles matching active product */}
      <GoldenParticles
        count={tier === 'high' ? 60 : 30}
        spread={6}
        color={activeProduct.particleColor}
        size={0.05}
        speed={0.15}
        opacity={0.5}
      />
      {tier === 'high' && (
        <GoldenParticles
          count={50}
          spread={10}
          color={activeProduct.particleColor}
          size={0.03}
          speed={0.25}
          opacity={0.25}
        />
      )}

      {tier === 'high' && (
        <Sparkles count={15} scale={5} size={1} speed={0.2} color="#DAA520" opacity={0.3} />
      )}

      {/* Contact shadows */}
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

      {/* Post-processing */}
      {tier === 'high' && (
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={0.7} luminanceSmoothing={0.9} intensity={0.4} mipmapBlur />
          <Vignette eskil={false} offset={0.1} darkness={0.3} />
        </EffectComposer>
      )}
      {tier === 'medium' && (
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.8} intensity={0.25} />
        </EffectComposer>
      )}
    </>
  );
}

export function ProductCarousel3D() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeProduct = carouselProducts[activeIndex];

  const goNext = () => setActiveIndex((i) => (i + 1) % carouselProducts.length);
  const goPrev = () => setActiveIndex((i) => (i - 1 + carouselProducts.length) % carouselProducts.length);

  return (
    <section className="relative py-24 lg:py-32 bg-gradient-to-b from-brand-cream via-white to-brand-cream overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-brand-mustard/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-green/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center justify-center gap-2 mb-4">
            <div className="h-px w-8 bg-brand-mustard" />
            <span className="text-brand-mustard font-medium text-sm tracking-[0.2em] uppercase">
              Our Products
            </span>
            <div className="h-px w-8 bg-brand-mustard" />
          </div>
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-brand-charcoal">
            Explore in 3D
          </h2>
        </motion.div>

        {/* Carousel content */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* 3D Canvas */}
          <div className="relative h-[400px] lg:h-[500px] rounded-3xl overflow-hidden">
            <Canvas
              shadows
              gl={{ antialias: true, alpha: true, stencil: false }}
              dpr={[1, 2]}
              style={{ background: 'transparent' }}
            >
              <Suspense fallback={null}>
                <SceneContent activeIndex={activeIndex} />
              </Suspense>
            </Canvas>

            {/* Navigation arrows on canvas */}
            <button
              onClick={goPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/80 backdrop-blur-sm shadow-brand-md flex items-center justify-center text-brand-charcoal hover:bg-white transition-colors z-10"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/80 backdrop-blur-sm shadow-brand-md flex items-center justify-center text-brand-charcoal hover:bg-white transition-colors z-10"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Dot indicators */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
              {carouselProducts.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    i === activeIndex
                      ? 'bg-brand-mustard w-8'
                      : 'bg-brand-charcoal/20 hover:bg-brand-charcoal/40'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Product info */}
          <div className="lg:pl-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeProduct.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4 }}
              >
                <span className="text-brand-green font-medium text-sm tracking-[0.15em] uppercase">
                  {activeProduct.subtitle}
                </span>
                <h3 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal mt-2 mb-4">
                  {activeProduct.name}
                </h3>
                <p className="text-brand-muted text-lg leading-relaxed mb-8 max-w-md">
                  {activeProduct.description}
                </p>

                {/* Features */}
                <div className="flex flex-wrap gap-3 mb-8">
                  {['100% Pure', 'Farm Fresh', 'No Additives'].map((tag) => (
                    <span
                      key={tag}
                      className="px-4 py-2 rounded-full bg-brand-green/10 text-brand-green text-sm font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <Link
                  href={activeProduct.link}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-brand-charcoal text-white rounded-full font-semibold hover:bg-brand-green transition-colors"
                >
                  Shop Now
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
