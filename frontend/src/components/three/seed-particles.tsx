'use client';

import { useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { detectPerformanceTier, getParticleCount } from '@/lib/performance-tier';
import { cn } from '@/lib/utils';

interface SeedParticlesProps {
  className?: string;
  count?: number;
  color?: string;
}

/**
 * SeedParticles - CSS-based floating seed animation
 * Ready for Three.js PointMaterial upgrade when GLTF models are available
 */
export function SeedParticles({
  className,
  count: propCount,
  color = 'bg-brand-mustard/30',
}: SeedParticlesProps) {
  const tier = detectPerformanceTier();
  const count = propCount ?? getParticleCount(tier);

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 4 + Math.random() * 6,
      duration: 4 + Math.random() * 4,
      delay: Math.random() * 4,
      drift: Math.random() * 20 - 10,
    }));
  }, [count]);

  // Skip animation on low tier devices
  if (tier === 'low') {
    return (
      <div className={cn('absolute inset-0 overflow-hidden', className)}>
        {particles.slice(0, 10).map((p) => (
          <div
            key={p.id}
            className={cn('absolute rounded-full opacity-30', color)}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size * 1.2,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={cn('absolute rounded-full', color)}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size * 1.2,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, p.drift, 0],
            opacity: [0.3, 0.6, 0.3],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Future Three.js implementation hook
 * When GLTF models are ready, uncomment and implement
 */
// export function SeedParticles3D({ count = 100 }: { count?: number }) {
//   const points = useRef<THREE.Points>(null);
//
//   const particles = useMemo(() => {
//     const positions = new Float32Array(count * 3);
//     for (let i = 0; i < count; i++) {
//       positions[i * 3] = (Math.random() - 0.5) * 10;
//       positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
//       positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
//     }
//     return positions;
//   }, [count]);
//
//   useFrame((state) => {
//     if (points.current) {
//       points.current.rotation.y = state.clock.elapsedTime * 0.05;
//     }
//   });
//
//   return (
//     <points ref={points}>
//       <bufferGeometry>
//         <bufferAttribute
//           attach="attributes-position"
//           count={count}
//           array={particles}
//           itemSize={3}
//         />
//       </bufferGeometry>
//       <pointsMaterial size={0.05} color="#D4A574" transparent opacity={0.6} />
//     </points>
//   );
// }
