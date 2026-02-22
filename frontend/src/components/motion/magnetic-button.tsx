'use client';

import { useRef, useState, ReactNode } from 'react';
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
  const [isHovered, setIsHovered] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 300, mass: 0.5 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  // Scale and glow effects
  const scale = useSpring(1, springConfig);
  const glowOpacity = useTransform(scale, [1, 1.05], [0, 0.3]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const distanceX = e.clientX - centerX;
    const distanceY = e.clientY - centerY;

    x.set(distanceX * magneticStrength);
    y.set(distanceY * magneticStrength);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    scale.set(1.05);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
    scale.set(1);
  };

  const Component = motion.div;

  return (
    <Component
      ref={ref}
      className={`relative cursor-pointer ${className}`}
      style={{ x: springX, y: springY, scale }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {/* Magnetic glow effect */}
      <motion.div
        className="absolute -inset-4 rounded-full bg-gradient-to-r from-brand-mustard/30 to-brand-green/30 blur-2xl pointer-events-none"
        style={{ opacity: glowOpacity }}
      />

      {/* Inner content with separate magnetic effect */}
      <motion.div
        className="relative"
        animate={{
          x: isHovered ? x.get() * 0.2 : 0,
          y: isHovered ? y.get() * 0.2 : 0,
        }}
        transition={{ type: 'spring', ...springConfig }}
      >
        {as === 'a' && href ? (
          <a href={href} className="block">
            {children}
          </a>
        ) : (
          children
        )}
      </motion.div>
    </Component>
  );
}
