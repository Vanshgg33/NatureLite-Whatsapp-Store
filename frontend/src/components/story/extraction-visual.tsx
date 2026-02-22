'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import dynamic from 'next/dynamic';
import { usePerformanceTier } from '@/lib/performance-tier';

// Dynamically import 3D scene to avoid SSR issues
const ProcessScene3D = dynamic(
  () => import('@/components/three/scenes/ProcessScene3D').then((mod) => mod.ProcessScene3D),
  { ssr: false }
);

// CSS Fallback component for low-tier devices
function CSSWoodenPress({ scrollProgress }: { scrollProgress: number }) {
  const oilHeight = `${Math.min(scrollProgress * 150, 100)}%`;

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative w-64 h-80 lg:w-80 lg:h-96">
        {/* Wooden press body */}
        <div className="absolute inset-x-4 top-0 bottom-20 rounded-t-full bg-gradient-to-b from-brand-brown-light to-amber-900 shadow-brand-xl">
          {/* Wood grain texture lines */}
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute inset-x-0 h-px bg-amber-700/30"
              style={{ top: `${10 + i * 10}%` }}
            />
          ))}

          {/* Rotating indicator */}
          <motion.div
            className="absolute top-8 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border-4 border-brand-mustard/30"
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-4 bg-brand-mustard rounded-full" />
          </motion.div>
        </div>

        {/* Oil collection container */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-24 lg:w-40 lg:h-28">
          <div className="absolute inset-0 rounded-b-2xl bg-gradient-to-b from-amber-800 to-amber-950 shadow-brand-lg overflow-hidden">
            {/* Oil inside */}
            <motion.div
              className="absolute bottom-0 left-2 right-2 rounded-b-xl bg-gradient-to-b from-brand-mustard to-amber-500"
              style={{ height: oilHeight }}
            />
          </div>
        </div>

        {/* Oil drip animation */}
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-1">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-3 rounded-full bg-brand-mustard"
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: 40, opacity: 0 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.5,
                ease: 'easeIn',
              }}
            />
          ))}
        </div>

        {/* Seeds representation */}
        <div className="absolute top-16 inset-x-12 flex flex-wrap gap-1 justify-center">
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-yellow-600/60"
              style={{
                transform: `scale(${1 - scrollProgress * 0.5})`,
                opacity: 0.6 - scrollProgress * 0.3,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ExtractionVisual() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });
  const [scrollProgress, setScrollProgress] = useState(0);
  const { shouldRender3D } = usePerformanceTier();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  // Update scroll progress for 3D scene
  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (value) => {
      setScrollProgress(value);
    });
    return () => unsubscribe();
  }, [scrollYProgress]);

  return (
    <section
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-brand-brown overflow-hidden"
    >
      {/* Background texture */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[url('/images/textures/grain.png')] bg-repeat" />
      </div>

      <div className="brand-container">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-block px-4 py-1.5 mb-4 text-sm font-body tracking-wider text-brand-mustard bg-brand-mustard/20 rounded-full">
              The Extraction
            </span>
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-brand-cream mb-6">
              Where Patience Meets Purity
            </h2>
            <div className="space-y-4 font-body text-brand-cream/80 text-lg leading-relaxed">
              <p>
                In our traditional ghani, wooden logs press the seeds slowly and
                steadily. No heat, no chemicals, no rush. Just the gentle art of
                extraction that has been perfected over centuries.
              </p>
              <p>
                The wooden mortar and pestle work in harmony, rotating at just 4-6
                RPM. This slow dance between wood and seed ensures that every
                precious nutrient remains intact.
              </p>
              <p>
                What emerges is not just oil—it&apos;s liquid gold, carrying the
                essence of the earth and the wisdom of our ancestors.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 mt-10 pt-10 border-t border-brand-cream/10">
              {[
                { value: '4-6', label: 'RPM Speed' },
                { value: '<40°C', label: 'Temperature' },
                { value: '100%', label: 'Pure' },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                >
                  <div className="font-display text-3xl font-bold text-brand-mustard">
                    {stat.value}
                  </div>
                  <div className="font-body text-sm text-brand-cream/60 mt-1">
                    {stat.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* 3D Visual or CSS Fallback */}
          <motion.div
            className="relative h-[500px] lg:h-[600px]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <ProcessScene3D
            scrollProgress={scrollProgress}
            className="w-full h-full rounded-2xl overflow-hidden"
          />

            {/* Decorative elements */}
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-brand-mustard/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-brand-green/10 blur-2xl pointer-events-none" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
