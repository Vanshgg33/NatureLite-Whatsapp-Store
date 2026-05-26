'use client';

import { useEffect, createContext, useContext, useRef } from 'react';
import Lenis from '@studio-freight/lenis';

const LenisCtx = createContext<Lenis | null>(null);

export function useLenis() {
  return useContext(LenisCtx);
}

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Skip on touch devices — native scroll is smoother there
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const lenis = new Lenis({
      duration: 1.0,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.8,
      touchMultiplier: 1.0,
    });
    lenisRef.current = lenis;

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <LenisCtx.Provider value={lenisRef.current}>
      {children}
    </LenisCtx.Provider>
  );
}
