'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView, useAnimation, Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FadeInViewProps {
  children: React.ReactNode;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  delay?: number;
  duration?: number;
  once?: boolean;
  threshold?: number;
  distance?: number;
}

const getVariants = (
  direction: FadeInViewProps['direction'],
  distance: number
): Variants => {
  const directionOffset = {
    up: { y: distance },
    down: { y: -distance },
    left: { x: distance },
    right: { x: -distance },
    none: {},
  };

  return {
    hidden: {
      opacity: 0,
      ...directionOffset[direction || 'up'],
    },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
    },
  };
};

export function FadeInView({
  children,
  className,
  direction = 'up',
  delay = 0,
  duration = 0.6,
  once = true,
  threshold = 0.2,
  distance = 30,
}: FadeInViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, amount: threshold });
  const controls = useAnimation();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPrefersReducedMotion(
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    }
  }, []);

  useEffect(() => {
    if (isInView) {
      controls.start('visible');
    } else if (!once) {
      controls.start('hidden');
    }
  }, [isInView, controls, once]);

  // If reduced motion is preferred, render without animation
  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={controls}
      variants={getVariants(direction, distance)}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

// Pre-configured variants for common use cases
export function FadeUp({
  children,
  className,
  delay = 0,
  ...props
}: Omit<FadeInViewProps, 'direction'>) {
  return (
    <FadeInView direction="up" delay={delay} className={className} {...props}>
      {children}
    </FadeInView>
  );
}

export function FadeDown({
  children,
  className,
  delay = 0,
  ...props
}: Omit<FadeInViewProps, 'direction'>) {
  return (
    <FadeInView direction="down" delay={delay} className={className} {...props}>
      {children}
    </FadeInView>
  );
}

export function FadeLeft({
  children,
  className,
  delay = 0,
  ...props
}: Omit<FadeInViewProps, 'direction'>) {
  return (
    <FadeInView direction="left" delay={delay} className={className} {...props}>
      {children}
    </FadeInView>
  );
}

export function FadeRight({
  children,
  className,
  delay = 0,
  ...props
}: Omit<FadeInViewProps, 'direction'>) {
  return (
    <FadeInView direction="right" delay={delay} className={className} {...props}>
      {children}
    </FadeInView>
  );
}

export function FadeIn({
  children,
  className,
  delay = 0,
  ...props
}: Omit<FadeInViewProps, 'direction'>) {
  return (
    <FadeInView direction="none" delay={delay} className={className} {...props}>
      {children}
    </FadeInView>
  );
}
