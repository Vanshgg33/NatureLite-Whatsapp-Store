import { useEffect, useState } from 'react';

/** Verdant Glass KPI count-up (presentational): eases 0 → target over `ms`; the exact value is shown once it ends. */
export function useCountUp(target: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-motion') === 'reduced') { setV(target); return; }
    let raf = 0; const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(p === 1 ? target : target * (1 - Math.pow(1 - p, 3))); // last frame lands exactly on target (paise kept)
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
