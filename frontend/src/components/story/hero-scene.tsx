'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ScrollIndicator } from '@/components/motion/scroll-progress';
import { usePerformanceTier } from '@/lib/performance-tier';

// Dynamically import 3D scene to avoid SSR issues
const HeroScene3D = dynamic(
  () => import('@/components/three/scenes/HeroScene3D').then((mod) => mod.HeroScene3D),
  { ssr: false }
);

interface HeroSceneProps {
  title?: string;
  subtitle?: string;
  ctaText?: string;
  ctaHref?: string;
}

// CSS Fallback particles for low-tier devices
function CSSParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-3 rounded-full bg-brand-mustard/30"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, Math.random() * 20 - 10, 0],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 4 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export function HeroScene({
  title = 'From Seed to Soul',
  subtitle = 'Experience the purest wood-pressed oils and traditional bilona ghee, crafted with centuries-old wisdom',
  ctaText = 'Explore Our Collection',
  ctaHref = '/products',
}: HeroSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const { shouldRender3D } = usePerformanceTier();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  // Update scroll progress for 3D scene
  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (value) => {
      setScrollProgress(value);
    });
    return () => unsubscribe();
  }, [scrollYProgress]);

  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Background with gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-brown via-brand-brown-light to-brand-green" />

      {/* 3D Scene - always render for now */}
      <div className="absolute inset-0 z-0">
        <HeroScene3D scrollProgress={scrollProgress} className="w-full h-full" />
      </div>

      {/* Grain overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/images/textures/grain.png')] bg-repeat" />

      {/* Content - positioned above 3D scene */}
      <motion.div
        className="relative z-10 text-center px-4 max-w-4xl mx-auto"
        style={{ y, opacity, scale }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-block px-4 py-1.5 mb-6 text-sm font-body tracking-wider text-brand-cream/80 border border-brand-cream/20 rounded-full backdrop-blur-sm">
            Traditional Indian Purity
          </span>
        </motion.div>

        <motion.h1
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-brand-cream leading-tight mb-6 drop-shadow-lg"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {title}
        </motion.h1>

        <motion.p
          className="font-body text-lg sm:text-xl text-brand-cream/90 max-w-2xl mx-auto mb-10 leading-relaxed drop-shadow-md"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href={ctaHref}>
            <Button
              size="lg"
              className="bg-brand-mustard hover:bg-brand-mustard-dark text-white font-body text-base px-8 py-6 rounded-full transition-all duration-normal hover:scale-105 shadow-lg"
            >
              {ctaText}
            </Button>
          </Link>
          <Link href="/about">
            <Button
              variant="outline"
              size="lg"
              className="border-brand-cream/30 text-brand-cream hover:bg-brand-cream/10 font-body text-base px-8 py-6 rounded-full backdrop-blur-sm"
            >
              Our Story
            </Button>
          </Link>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <ScrollIndicator />

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-brand-cream to-transparent z-20" />
    </section>
  );
}
