'use client';

import { useRef, useEffect, ReactNode } from 'react';
import { motion, useAnimationControls, useInView } from 'framer-motion';

interface InfiniteMarqueeProps {
  children: ReactNode;
  direction?: 'left' | 'right';
  speed?: number;
  pauseOnHover?: boolean;
  className?: string;
  gap?: number;
}

export function InfiniteMarquee({
  children,
  direction = 'left',
  speed = 30,
  pauseOnHover = true,
  className = '',
  gap = 40,
}: InfiniteMarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef);
  const controls = useAnimationControls();

  useEffect(() => {
    if (isInView) {
      controls.start({
        x: direction === 'left' ? '-50%' : '0%',
        transition: {
          x: {
            duration: speed,
            repeat: Infinity,
            ease: 'linear',
            repeatType: 'loop',
          },
        },
      });
    } else {
      controls.stop();
    }
  }, [isInView, controls, direction, speed]);

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden ${className}`}
      onMouseEnter={() => pauseOnHover && controls.stop()}
      onMouseLeave={() =>
        pauseOnHover &&
        controls.start({
          x: direction === 'left' ? '-50%' : '0%',
          transition: {
            x: {
              duration: speed,
              repeat: Infinity,
              ease: 'linear',
              repeatType: 'loop',
            },
          },
        })
      }
    >
      <motion.div
        className="flex"
        style={{ gap }}
        initial={{ x: direction === 'left' ? '0%' : '-50%' }}
        animate={controls}
      >
        {/* First copy */}
        <div className="flex shrink-0" style={{ gap }}>
          {children}
        </div>
        {/* Second copy for seamless loop */}
        <div className="flex shrink-0" style={{ gap }}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}

// Text marquee variant
export function TextMarquee({
  text,
  separator = '•',
  direction = 'left',
  speed = 25,
  className = '',
  textClassName = '',
}: {
  text: string;
  separator?: string;
  direction?: 'left' | 'right';
  speed?: number;
  className?: string;
  textClassName?: string;
}) {
  const items = Array(10).fill(text);

  return (
    <InfiniteMarquee direction={direction} speed={speed} className={className}>
      {items.map((item, index) => (
        <span key={index} className={`whitespace-nowrap ${textClassName}`}>
          {item} <span className="mx-8 opacity-30">{separator}</span>
        </span>
      ))}
    </InfiniteMarquee>
  );
}

// Logo marquee for brands/certifications
export function LogoMarquee({
  logos,
  direction = 'left',
  speed = 40,
  className = '',
}: {
  logos: Array<{ src: string; alt: string; width?: number }>;
  direction?: 'left' | 'right';
  speed?: number;
  className?: string;
}) {
  return (
    <InfiniteMarquee direction={direction} speed={speed} className={className} gap={60}>
      {logos.map((logo, index) => (
        <div
          key={index}
          className="flex items-center justify-center w-32 h-16 grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition-all duration-300"
        >
          <img
            src={logo.src}
            alt={logo.alt}
            className="max-w-full max-h-full object-contain"
            style={{ width: logo.width || 'auto' }}
          />
        </div>
      ))}
    </InfiniteMarquee>
  );
}
