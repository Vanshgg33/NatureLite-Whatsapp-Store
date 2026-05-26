'use client';

import { useRef, useState } from 'react';
import { motion, useSpring } from 'framer-motion';

interface MagneticProps {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}

export function Magnetic({ children, strength = 0.35, className }: MagneticProps) {
  const ref    = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const mx = useSpring(0, { stiffness: 220, damping: 22, mass: 0.5 });
  const my = useSpring(0, { stiffness: 220, damping: 22, mass: 0.5 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r  = el.getBoundingClientRect();
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    mx.set((e.clientX - cx) * strength);
    my.set((e.clientY - cy) * strength);
  };

  const onLeave = () => {
    mx.set(0);
    my.set(0);
    setActive(false);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: mx, y: my }}
      onMouseMove={onMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={onLeave}
      data-magnetic={active ? 'true' : undefined}
    >
      {children}
    </motion.div>
  );
}
