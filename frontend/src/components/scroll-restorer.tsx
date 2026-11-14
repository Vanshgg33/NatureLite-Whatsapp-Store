'use client';

import { useEffect } from 'react';

// The admin/billing/crm/fms shells scroll inside <main class="overflow-auto">, which the
// browser never restores on Back. This saves that scroll per URL and puts it back on Back/Forward.
function scroller(): HTMLElement {
  const main = document.querySelector('main');
  if (main && /(auto|scroll)/.test(getComputedStyle(main).overflowY)) return main;
  return document.scrollingElement as HTMLElement;
}
const keyFor = () => `scroll:${location.pathname}${location.search}`;

export function ScrollRestorer() {
  useEffect(() => {
    let restoring = false;
    let saveFrame = 0;

    const onScroll = () => {
      if (restoring || saveFrame) return;
      saveFrame = requestAnimationFrame(() => {
        saveFrame = 0;
        try { sessionStorage.setItem(keyFor(), String(scroller().scrollTop)); } catch { /* blocked */ }
      });
    };

    const onPop = () => {
      let target = 0;
      try { target = Number(sessionStorage.getItem(keyFor())) || 0; } catch { /* blocked */ }
      if (!target) return;
      restoring = true;
      const started = performance.now();
      const stop = () => {
        restoring = false;
        ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(e => window.removeEventListener(e, stop, true));
      };
      ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(e => window.addEventListener(e, stop, true));
      // The list may still be loading, so keep re-applying while it grows (max 2.5s or until the user scrolls).
      const tick = () => {
        if (!restoring) return;
        const el = scroller();
        el.scrollTop = target;
        if (performance.now() - started > 2500) return stop();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('popstate', onPop);
    };
  }, []);
  return null;
}
