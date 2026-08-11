'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

interface CustomCursorProps {
  color?: string;
  size?: number;
  trailSize?: number;
}

export function CustomCursor({
  color = '#d4a574',
  size = 12,
  trailSize = 40,
}: CustomCursorProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [cursorText, setCursorText] = useState('');

  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  const springConfig = { damping: 25, stiffness: 400 };
  const trailX = useSpring(cursorX, springConfig);
  const trailY = useSpring(cursorY, springConfig);

  useEffect(() => {
    if ('ontouchstart' in window) return;

    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX - size / 2);
      cursorY.set(e.clientY - size / 2);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive =
        target.tagName === 'A' || target.tagName === 'BUTTON' ||
        target.closest('a') || target.closest('button') || target.dataset.cursorHover;
      const hoverText = target.dataset.cursorText || target.closest('[data-cursor-text]')?.getAttribute('data-cursor-text');
      setIsHovering(!!isInteractive);
      setCursorText(hoverText || '');
    };

    const handleMouseOut = (e: MouseEvent) => {
      const rel = e.relatedTarget as HTMLElement | null;
      if (!rel || !(rel.tagName === 'A' || rel.tagName === 'BUTTON' || rel.closest?.('a') || rel.closest?.('button') || rel.dataset?.cursorHover)) {
        setIsHovering(false);
        setCursorText('');
      }
    };

    const handleMouseEnter = () => setIsVisible(true);
    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.body.addEventListener('mouseenter', handleMouseEnter);
    document.body.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.body.removeEventListener('mouseenter', handleMouseEnter);
      document.body.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [cursorX, cursorY, size]);

  return (
    <>
      {/* Main cursor dot */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] mix-blend-difference"
        style={{
          x: cursorX,
          y: cursorY,
        }}
        animate={{
          scale: isClicking ? 0.8 : isHovering ? 0.5 : 1,
          opacity: isVisible ? 1 : 0,
        }}
        transition={{ duration: 0.15 }}
      >
        <div
          className="rounded-full"
          style={{
            width: size,
            height: size,
            backgroundColor: color,
          }}
        />
      </motion.div>

      {/* Trailing circle */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9998]"
        style={{
          x: trailX,
          y: trailY,
          translateX: -(trailSize - size) / 2,
          translateY: -(trailSize - size) / 2,
        }}
        animate={{
          scale: isClicking ? 0.9 : isHovering ? 1.5 : 1,
          opacity: isVisible ? (isHovering ? 0.8 : 0.3) : 0,
        }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="rounded-full border-2"
          style={{
            width: trailSize,
            height: trailSize,
            borderColor: color,
          }}
        />

        {/* Cursor text */}
        {cursorText && (
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-medium"
            style={{ color }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            {cursorText}
          </motion.div>
        )}
      </motion.div>
    </>
  );
}
