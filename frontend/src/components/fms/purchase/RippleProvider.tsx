'use client';
import { useEffect } from 'react';

export function RippleProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const handler = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-ripple]') as HTMLElement | null;
      if (!el) return;
      el.classList.add('pf-ripple-origin');
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const wave = document.createElement('span');
      wave.className = 'pf-ripple-wave';
      wave.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
      el.appendChild(wave);
      wave.addEventListener('animationend', () => wave.remove(), { once: true });
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);
  return null;
}
