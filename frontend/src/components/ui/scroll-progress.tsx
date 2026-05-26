'use client';

import { useScroll, useSpring, motion } from 'framer-motion';

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-[9997] h-[2.5px] origin-left"
      style={{
        scaleX,
        background: 'linear-gradient(90deg,#1a5210,#b8860b,#1a5210)',
      }}
    />
  );
}
