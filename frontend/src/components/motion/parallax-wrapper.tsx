'use client';

import { useRef, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue } from 'framer-motion';

interface ParallaxWrapperProps {
  children: React.ReactNode;
  className?: string;
  speed?: number; // Negative = slower, Positive = faster
  direction?: 'vertical' | 'horizontal';
  springConfig?: {
    stiffness?: number;
    damping?: number;
    mass?: number;
  };
}

export function ParallaxWrapper({
  children,
  className,
  speed = 0.5,
  direction = 'vertical',
  springConfig = { stiffness: 100, damping: 30, mass: 1 },
}: ParallaxWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [prefersReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const zero = useMotionValue(0);
  const distance = 100 * speed;

  // Only the active axis tracks scrollYProgress; the idle axis stays at 0
  const activeScrollY = direction === 'vertical'   ? scrollYProgress : zero;
  const activeScrollX = direction === 'horizontal' ? scrollYProgress : zero;

  const rawY = useTransform(activeScrollY, [0, 1], [-distance, distance]);
  const rawX = useTransform(activeScrollX, [0, 1], [-distance, distance]);

  const y = useSpring(rawY, springConfig);
  const x = useSpring(rawX, springConfig);

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div ref={ref} className={className} style={{ y, x }}>
      {children}
    </motion.div>
  );
}

// Variant for background parallax (slower movement)
export function ParallaxBackground({
  children,
  className,
  ...props
}: Omit<ParallaxWrapperProps, 'speed'>) {
  return (
    <ParallaxWrapper speed={0.3} className={className} {...props}>
      {children}
    </ParallaxWrapper>
  );
}

// Variant for foreground parallax (faster movement)
export function ParallaxForeground({
  children,
  className,
  ...props
}: Omit<ParallaxWrapperProps, 'speed'>) {
  return (
    <ParallaxWrapper speed={-0.2} className={className} {...props}>
      {children}
    </ParallaxWrapper>
  );
}
