'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { detectPerformanceTier } from '@/lib/performance-tier';

interface WoodenPressSceneProps {
  className?: string;
}

/**
 * WoodenPressScene - CSS-based parallax wooden press illustration
 * Ready for GLTF model integration when available
 */
export function WoodenPressScene({ className }: WoodenPressSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tier = detectPerformanceTier();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const rotateSpeed = useTransform(scrollYProgress, [0, 1], [0, 360]);
  const oilLevel = useTransform(scrollYProgress, [0.2, 0.8], ['10%', '70%']);

  // Static version for low-end devices
  if (tier === 'low') {
    return (
      <div
        className={cn(
          'relative w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-900/20 to-amber-800/20 rounded-2xl',
          className
        )}
      >
        <div className="text-center">
          <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-b from-amber-700 to-amber-900 flex items-center justify-center mb-4">
            <span className="font-display text-5xl text-amber-300/50">G</span>
          </div>
          <p className="font-body text-sm text-brand-cream/60">Traditional Ghani</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full h-full flex items-center justify-center', className)}
    >
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-radial from-brand-mustard/10 via-transparent to-transparent" />

      {/* Press assembly */}
      <div className="relative w-64 h-80 lg:w-80 lg:h-96">
        {/* Main press body */}
        <div className="absolute inset-x-4 top-0 bottom-20 rounded-t-full bg-gradient-to-b from-amber-700 to-amber-900 shadow-2xl overflow-hidden">
          {/* Wood grain texture */}
          <div className="absolute inset-0">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="absolute inset-x-0 h-px bg-amber-600/20"
                style={{ top: `${8 + i * 9}%` }}
              />
            ))}
          </div>

          {/* Rotating indicator */}
          <motion.div
            className="absolute top-8 left-1/2 -translate-x-1/2 w-20 h-20"
            style={{ rotate: rotateSpeed }}
          >
            <div className="w-full h-full rounded-full border-4 border-amber-500/30 relative">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2.5 h-5 bg-brand-mustard rounded-full" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-2.5 h-5 bg-brand-mustard rounded-full" />
            </div>
          </motion.div>

          {/* Seeds */}
          <div className="absolute top-20 inset-x-8 flex flex-wrap gap-1.5 justify-center">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-yellow-600/50"
                animate={{
                  scale: [1, 0.9, 1],
                  opacity: [0.5, 0.3, 0.5],
                }}
                transition={{
                  duration: 2 + Math.random(),
                  repeat: Infinity,
                  delay: i * 0.1,
                }}
              />
            ))}
          </div>
        </div>

        {/* Oil collection container */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-36 h-28 lg:w-44 lg:h-32">
          <div className="absolute inset-0 rounded-b-2xl bg-gradient-to-b from-amber-800 to-amber-950 shadow-xl overflow-hidden">
            {/* Oil level */}
            <motion.div
              className="absolute bottom-0 left-1 right-1 rounded-b-xl bg-gradient-to-t from-amber-500 to-brand-mustard"
              style={{ height: oilLevel }}
            >
              {/* Oil shimmer */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
            </motion.div>
          </div>
        </div>

        {/* Oil drip animation */}
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-2 flex flex-col items-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-3 rounded-full bg-brand-mustard"
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: 50, opacity: 0 }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.4,
                ease: 'easeIn',
              }}
            />
          ))}
        </div>
      </div>

      {/* Ambient lighting effects */}
      <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-brand-mustard/10 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-brand-green/10 blur-2xl" />
    </div>
  );
}

/**
 * Future Three.js implementation
 * When GLTF model is ready, implement using @react-three/fiber
 */
// export function WoodenPressScene3D() {
//   const gltf = useGLTF('/models/wooden-press.glb');
//   const meshRef = useRef<THREE.Mesh>(null);
//
//   useFrame((state) => {
//     if (meshRef.current) {
//       meshRef.current.rotation.y = state.clock.elapsedTime * 0.1;
//     }
//   });
//
//   return (
//     <primitive ref={meshRef} object={gltf.scene} scale={0.5} />
//   );
// }
