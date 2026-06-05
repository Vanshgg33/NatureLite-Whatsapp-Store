'use client';

import { useRef, ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  magneticStrength?: number;
  onClick?: () => void;
  href?: string;
  as?: 'button' | 'a' | 'div';
}

export function MagneticButton({
  children,
  className = '',
  magneticStrength = 0.4,
  onClick,
  href,
  as = 'button',
}: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 300, mass: 0.5 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);
  const scale = useSpring(1, springConfig);
  const glowOpacity = useTransform(scale, [1, 1.05], [0, 0.3]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * magneticStrength);
    y.set((e.clientY - rect.top - rect.height / 2) * magneticStrength);
  };

  const handleMouseEnter = () => scale.set(1.05);

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    scale.set(1);
  };

  return (
    <motion.div
      ref={ref}
      className={`relative cursor-pointer ${className}`}
      style={{ x: springX, y: springY, scale }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <motion.div
        className="absolute -inset-4 rounded-full bg-gradient-to-r from-brand-mustard/30 to-brand-green/30 blur-2xl pointer-events-none"
        style={{ opacity: glowOpacity }}
      />
      <div className="relative">
        {as === 'a' && href ? (
          <a href={href} className="block">
            {children}
          </a>
        ) : (
          children
        )}
      </div>
    </motion.div>
  );
}
