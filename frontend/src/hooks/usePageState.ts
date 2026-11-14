'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

const storageKey = (name: string) =>
  `ps:${typeof window === 'undefined' ? '' : window.location.pathname}:${name}`;

/**
 * useState that survives leaving and coming back to the page (same browser tab).
 * Use for list filters, search, page number and tabs so Back lands where you left.
 * Only for pages rendered after hydration (admin / billing / crm / fms / department shells gate on it).
 */
export function usePageState<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [key] = useState(() => storageKey(name));
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch { /* private mode / bad JSON: fall back */ }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/blocked */ }
  }, [key, value]);
  return [value, setValue];
}
