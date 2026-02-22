'use client';

import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ScrollProgressProps {
  className?: string;
  color?: string;
  height?: number;
  position?: 'top' | 'bottom';
  showPercentage?: boolean;
}

export function ScrollProgress({
  className,
  color = 'hsl(var(--brand-mustard))',
  height = 3,
  position = 'top',
  showPercentage = false,
}: ScrollProgressProps) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    return scrollYProgress.on('change', (latest) => {
      setProgress(Math.round(latest * 100));
    });
  }, [scrollYProgress]);

  return (
    <>
      <motion.div
        className={cn(
          'fixed left-0 right-0 z-50 origin-left',
          position === 'top' ? 'top-0' : 'bottom-0',
          className
        )}
        style={{
          scaleX,
          height,
          backgroundColor: color,
        }}
      />
      {showPercentage && (
        <div
          className={cn(
            'fixed right-4 z-50 bg-brand-charcoal text-brand-cream px-2 py-1 rounded text-xs font-mono',
            position === 'top' ? 'top-4' : 'bottom-4'
          )}
        >
          {progress}%
        </div>
      )}
    </>
  );
}

// Section-specific scroll progress
interface SectionProgressProps {
  children: React.ReactNode;
  className?: string;
  onProgressChange?: (progress: number) => void;
}

export function SectionProgress({
  children,
  className,
  onProgressChange,
}: SectionProgressProps) {
  const { scrollYProgress } = useScroll();

  useEffect(() => {
    if (onProgressChange) {
      return scrollYProgress.on('change', onProgressChange);
    }
  }, [scrollYProgress, onProgressChange]);

  return <div className={className}>{children}</div>;
}

// Scroll indicator arrow
interface ScrollIndicatorProps {
  className?: string;
  text?: string;
}

export function ScrollIndicator({
  className,
  text = 'Scroll to explore',
}: ScrollIndicatorProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY < 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <motion.div
      className={cn(
        'absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2',
        className
      )}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1, duration: 0.6 }}
    >
      <span className="text-sm font-body text-brand-cream/70">{text}</span>
      <motion.div
        className="w-6 h-10 rounded-full border-2 border-brand-cream/30 flex justify-center"
        animate={{ y: [0, 5, 0] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      >
        <motion.div
          className="w-1.5 h-3 bg-brand-cream/50 rounded-full mt-2"
          animate={{ y: [0, 8, 0], opacity: [1, 0.5, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />
      </motion.div>
    </motion.div>
  );
}
