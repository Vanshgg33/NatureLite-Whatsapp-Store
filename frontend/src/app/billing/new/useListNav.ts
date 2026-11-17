import { useEffect, useState } from 'react';

/** ↑/↓ move, Enter picks, Esc closes, for a search box with a dropdown of `count` options. */
export function useListNav(count: number, onPick: (i: number) => void, onClose: () => void) {
  const [active, setActive] = useState(0);
  useEffect(() => { setActive(0); }, [count]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && count) { e.preventDefault(); setActive(a => (a + 1) % count); }
    else if (e.key === 'ArrowUp' && count) { e.preventDefault(); setActive(a => (a - 1 + count) % count); }
    else if (e.key === 'Enter' && count) { e.preventDefault(); onPick(Math.min(active, count - 1)); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  return { active, setActive, onKeyDown };
}
