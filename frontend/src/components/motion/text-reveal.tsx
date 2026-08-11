'use client';

import { useRef, useEffect, ReactNode } from 'react';
import { motion, useInView, Variants } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface TextRevealProps {
  children: ReactNode;
  className?: string;
  variant?: 'fade-up' | 'split-chars' | 'mask' | 'typewriter' | 'gradient-wipe';
  delay?: number;
  duration?: number;
  staggerChildren?: number;
  once?: boolean;
}

// Character split animation for dramatic reveals
export function SplitTextReveal({
  text,
  className = '',
  variant = 'chars',
  staggerDelay = 0.03,
  animateOnScroll = true,
}: {
  text: string;
  className?: string;
  variant?: 'chars' | 'words' | 'lines';
  staggerDelay?: number;
  animateOnScroll?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.5 });

  const items = variant === 'chars'
    ? text.split('')
    : variant === 'words'
    ? text.split(' ')
    : [text];

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: {
      y: 120,
      opacity: 0,
      rotateX: -90,
    },
    visible: {
      y: 0,
      opacity: 1,
      rotateX: 0,
      transition: {
        type: 'spring',
        damping: 20,
        stiffness: 100,
      },
    },
  };

  return (
    <motion.div
      ref={containerRef}
      className={`overflow-hidden ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate={animateOnScroll ? (isInView ? 'visible' : 'hidden') : 'visible'}
      style={{ perspective: 1000 }}
    >
      {items.map((item, index) => (
        <motion.span
          key={index}
          className="inline-block"
          variants={itemVariants}
          style={{ transformOrigin: 'top center' }}
        >
          {item === ' ' ? '\u00A0' : item}
          {variant === 'words' && index < items.length - 1 ? '\u00A0' : ''}
        </motion.span>
      ))}
    </motion.div>
  );
}

// Gradient wipe text reveal
export function GradientWipeText({
  text,
  className = '',
  gradientColors = ['#d4a574', '#2a5a3a', '#3d2e1f'],
}: {
  text: string;
  className?: string;
  gradientColors?: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.5 });

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* Base text */}
      <span className="text-brand-charcoal/20">{text}</span>

      {/* Gradient overlay text */}
      <motion.span
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${gradientColors.join(', ')})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
        initial={{ clipPath: 'inset(0 100% 0 0)' }}
        animate={isInView ? { clipPath: 'inset(0 0% 0 0)' } : {}}
        transition={{ duration: 1.2, ease: [0.77, 0, 0.175, 1] }}
      >
        {text}
      </motion.span>
    </div>
  );
}

// Mask reveal with sliding cover
export function MaskReveal({
  children,
  className = '',
  direction = 'up',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.3 });

  const directions = {
    up: { initial: 'translateY(100%)', animate: 'translateY(0%)' },
    down: { initial: 'translateY(-100%)', animate: 'translateY(0%)' },
    left: { initial: 'translateX(100%)', animate: 'translateX(0%)' },
    right: { initial: 'translateX(-100%)', animate: 'translateX(0%)' },
  };

  const maskDirections = {
    up: { initial: 'translateY(0%)', animate: 'translateY(-101%)' },
    down: { initial: 'translateY(0%)', animate: 'translateY(101%)' },
    left: { initial: 'translateX(0%)', animate: 'translateX(-101%)' },
    right: { initial: 'translateX(0%)', animate: 'translateX(101%)' },
  };

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* Content */}
      <motion.div
        initial={{ transform: directions[direction].initial }}
        animate={isInView ? { transform: directions[direction].animate } : {}}
        transition={{ duration: 0.8, ease: [0.77, 0, 0.175, 1], delay }}
      >
        {children}
      </motion.div>

      {/* Mask cover */}
      <motion.div
        className="absolute inset-0 bg-brand-charcoal z-10"
        initial={{ transform: 'translateY(0%)' }}
        animate={isInView ? { transform: maskDirections[direction].animate } : {}}
        transition={{ duration: 0.8, ease: [0.77, 0, 0.175, 1], delay }}
      />
    </div>
  );
}

// GSAP-powered parallax text
export function ParallaxText({
  children,
  className = '',
  speed = 1,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const element = containerRef.current;
    const tween = gsap.fromTo(
      element,
      { y: 100 * speed },
      {
        y: -100 * speed,
        ease: 'none',
        scrollTrigger: {
          trigger: element,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      }
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [speed]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}

// Combined reveal component
export function TextReveal({
  children,
  className = '',
  variant = 'fade-up',
  delay = 0,
  duration = 0.6,
  once = true,
}: TextRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once, amount: 0.3 });

  const variants: Record<string, Variants> = {
    'fade-up': {
      hidden: { opacity: 0, y: 40 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration, delay, ease: [0.22, 1, 0.36, 1] }
      },
    },
    mask: {
      hidden: { clipPath: 'inset(100% 0 0 0)' },
      visible: {
        clipPath: 'inset(0% 0 0 0)',
        transition: { duration, delay, ease: [0.77, 0, 0.175, 1] }
      },
    },
  };

  return (
    <motion.div
      ref={containerRef}
      className={className}
      variants={variants[variant]}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
    >
      {children}
    </motion.div>
  );
}
