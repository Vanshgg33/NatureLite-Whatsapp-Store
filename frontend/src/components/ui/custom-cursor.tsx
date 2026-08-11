'use client';

import { useEffect, useRef } from 'react';

export function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    dot.style.opacity  = '1';
    ring.style.opacity = '1';

    let mx = -100, my = -100;
    let rx = -100, ry = -100;
    let targetScale = 1, currentScale = 1;
    let raf = 0;
    let settled = false;

    const ease = 0.12;

    const startRaf = () => {
      if (!settled) return;
      settled = false;
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      startRaf();
    };

    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('a, button, [data-cursor]') as HTMLElement | null;
      if (!el) return;
      targetScale = 1.625;
      const label = el.dataset.cursor ?? '';
      ring.querySelector('span')!.textContent = label;
      startRaf();
    };

    const onOut = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('a, button, [data-cursor]');
      if (!el) return;
      targetScale = 1;
      ring.querySelector('span')!.textContent = '';
      startRaf();
    };

    const tick = () => {
      dot.style.transform = `translate(${mx - 4}px, ${my - 4}px)`;
      rx += (mx - rx) * ease;
      ry += (my - ry) * ease;
      currentScale += (targetScale - currentScale) * ease;
      ring.style.transform = `translate(${rx - 16}px, ${ry - 16}px) scale(${currentScale.toFixed(3)})`;

      const posOk   = Math.abs(mx - rx) < 0.1 && Math.abs(my - ry) < 0.1;
      const scaleOk = Math.abs(targetScale - currentScale) < 0.001;
      if (posOk && scaleOk) { settled = true; return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseover', onOver, { passive: true });
    window.addEventListener('mouseout',  onOut,  { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onOver);
      window.removeEventListener('mouseout',  onOut);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999] rounded-full"
        style={{
          width: 8, height: 8,
          background: '#0d2b0a',
          opacity: 0,
          mixBlendMode: 'difference',
          willChange: 'transform',
        }}
      />
      <div
        ref={ringRef}
        className="pointer-events-none fixed top-0 left-0 z-[9998] rounded-full flex items-center justify-center"
        style={{
          width: 32, height: 32,
          border: '1.5px solid #0d2b0a',
          opacity: 0,
          mixBlendMode: 'difference',
          willChange: 'transform',
        }}
      >
        <span style={{ fontSize: 8, fontWeight: 700, color: '#0d2b0a', letterSpacing: '0.08em', textTransform: 'uppercase' }} />
      </div>
    </>
  );
}
