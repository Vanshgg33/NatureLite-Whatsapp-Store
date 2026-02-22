'use client';

import { useEffect, useState, useRef, RefObject } from 'react';
import { gsap, ScrollTrigger } from '@/lib/animation-controller';

interface UseScrollProgressOptions {
  start?: string;
  end?: string;
  scrub?: boolean | number;
  pin?: boolean;
  markers?: boolean;
  onUpdate?: (progress: number) => void;
}

/**
 * Hook to get scroll progress (0-1) for a section
 * Integrates GSAP ScrollTrigger with React Three Fiber
 */
export function useScrollProgress(
  triggerRef: RefObject<HTMLElement>,
  options: UseScrollProgressOptions = {}
): number {
  const [progress, setProgress] = useState(0);
  const scrollTriggerRef = useRef<ScrollTrigger | null>(null);

  const {
    start = 'top top',
    end = 'bottom bottom',
    scrub = 1,
    pin = false,
    markers = false,
    onUpdate,
  } = options;

  useEffect(() => {
    if (!triggerRef.current) return;

    // Create ScrollTrigger
    scrollTriggerRef.current = ScrollTrigger.create({
      trigger: triggerRef.current,
      start,
      end,
      scrub,
      pin,
      markers,
      onUpdate: (self) => {
        const newProgress = self.progress;
        setProgress(newProgress);
        onUpdate?.(newProgress);
      },
    });

    return () => {
      scrollTriggerRef.current?.kill();
    };
  }, [triggerRef, start, end, scrub, pin, markers, onUpdate]);

  return progress;
}

/**
 * Hook for scroll-driven timeline animations
 */
export function useScrollTimeline(
  triggerRef: RefObject<HTMLElement>,
  options: UseScrollProgressOptions & {
    duration?: number;
  } = {}
) {
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const [isActive, setIsActive] = useState(false);

  const {
    start = 'top center',
    end = 'bottom center',
    scrub = 1,
    pin = false,
    markers = false,
    duration = 1,
  } = options;

  useEffect(() => {
    if (!triggerRef.current) return;

    // Create timeline
    timelineRef.current = gsap.timeline({
      scrollTrigger: {
        trigger: triggerRef.current,
        start,
        end,
        scrub,
        pin,
        markers,
        onEnter: () => setIsActive(true),
        onLeave: () => setIsActive(false),
        onEnterBack: () => setIsActive(true),
        onLeaveBack: () => setIsActive(false),
      },
    });

    return () => {
      timelineRef.current?.scrollTrigger?.kill();
      timelineRef.current?.kill();
    };
  }, [triggerRef, start, end, scrub, pin, markers, duration]);

  return {
    timeline: timelineRef.current,
    isActive,
  };
}

/**
 * Hook for viewport-based scroll progress (not tied to a specific element)
 */
export function useGlobalScrollProgress(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const newProgress = docHeight > 0 ? scrollTop / docHeight : 0;
      setProgress(Math.min(1, Math.max(0, newProgress)));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial call

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return progress;
}

/**
 * Hook to detect if an element is in viewport
 */
export function useInViewport(
  ref: RefObject<HTMLElement>,
  options: { threshold?: number; once?: boolean } = {}
): boolean {
  const [isInView, setIsInView] = useState(false);
  const { threshold = 0.1, once = false } = options;

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setIsInView(false);
        }
      },
      { threshold }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref, threshold, once]);

  return isInView;
}
