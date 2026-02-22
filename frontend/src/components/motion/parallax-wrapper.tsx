'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';

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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPrefersReducedMotion(
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    }
  }, []);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  // Calculate the parallax distance based on speed
  const distance = 100 * speed;

  const rawY = useTransform(scrollYProgress, [0, 1], [-distance, distance]);
  const rawX = useTransform(scrollYProgress, [0, 1], [-distance, distance]);

  // Apply spring physics for smoother movement
  const y = useSpring(rawY, springConfig);
  const x = useSpring(rawX, springConfig);

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        y: direction === 'vertical' ? y : 0,
        x: direction === 'horizontal' ? x : 0,
      }}
    >
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
