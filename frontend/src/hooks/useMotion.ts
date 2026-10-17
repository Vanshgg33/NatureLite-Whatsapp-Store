'use client';
import { useEffect, useRef, useState } from 'react';

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

export function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    if (typeof window === 'undefined') { setVal(target); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(target); prevTarget.current = target; return;
    }
    const from = prevTarget.current;
    const start = Date.now();
    let raf: number;
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const cur = Math.round(from + (target - from) * easeOut(p));
      setVal(cur);
      if (p < 1) { raf = requestAnimationFrame(tick); } else { prevTarget.current = target; }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); prevTarget.current = Math.round(from + (target - from) * easeOut(Math.min((Date.now() - start) / duration, 1))); };
  }, [target, duration]);
  return val;
}
