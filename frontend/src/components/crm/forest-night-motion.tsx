'use client'
/**
 * NatureLite CRM  |  Forest Night motion helpers   (Next.js 14 App Router, React 18)
 * Put this file at:  src/components/crm/forest-night-motion.tsx
 *
 * Exports
 *   (boot script: see forest-night-boot.ts, sets theme + motion mode before first paint)
 *   setFnMotion(mode)    switch 'full' | 'lite' | 'reduced' (saved in localStorage)
 *   getFnMotion()        read the current mode
 *   FnPage               wrapper that replays the page entrance on every navigation
 *   FnRouteProgress      thin mint progress bar at the top while a route loads
 *   FnCountUp            number that counts up on mount and flashes when it changes
 *   useFnFlash(dep)      returns a class name that flashes when dep changes
 *   FnSkeleton / FnSkeletonRows / FnKpiSkeleton   shimmer placeholders
 *   fnIndex(i)           style helper for CSS --i stagger
 *
 * No runtime dependency other than React and next/navigation. All motion is
 * skipped when data-motion="reduced" or the tab is hidden.
 */
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/* The boot script lives in forest-night-boot.ts (it must be importable from a server component). */

export type FnMotionMode = 'full' | 'lite' | 'reduced'

export function getFnMotion(): FnMotionMode {
  if (typeof document === 'undefined') return 'full'
  const m = document.documentElement.getAttribute('data-motion')
  return m === 'lite' || m === 'reduced' ? m : 'full'
}

export function setFnMotion(mode: FnMotionMode) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-motion', mode)
  try { localStorage.setItem('fn-motion', mode) } catch { /* private mode */ }
}

const reduced = () => typeof document !== 'undefined' && getFnMotion() === 'reduced'

/* ------------------------------------------------------------------ */
/* Page wrapper: use in src/app/crm/template.tsx                       */
/* ------------------------------------------------------------------ */
export function FnPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`fn-page ${className}`.trim()}>{children}</div>
}

/* ------------------------------------------------------------------ */
/* Route progress bar: put once in the CRM layout                      */
/* ------------------------------------------------------------------ */
export function FnRouteProgress() {
  const path = usePathname()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const idleTimer = useRef<number>()
  const failSafe = useRef<number>()

  // start on an internal link click that will change the pathname
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      let u: URL
      try { u = new URL(a.href, location.href) } catch { return }
      if (u.origin !== location.origin || u.pathname === location.pathname) return
      setState('loading')
      window.clearTimeout(failSafe.current)
      failSafe.current = window.setTimeout(() => setState('idle'), 10000) // never get stuck
    }
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.clearTimeout(failSafe.current)
    }
  }, [])

  // finish when the new pathname is in
  useEffect(() => {
    setState(s => (s === 'loading' ? 'done' : s))
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setState('idle'), 520)
    return () => window.clearTimeout(idleTimer.current)
  }, [path])

  return <div aria-hidden="true" className="fn-route-bar" data-state={state} />
}

/* ------------------------------------------------------------------ */
/* Count-up number                                                     */
/* ------------------------------------------------------------------ */
type CountFormat = 'int' | 'inr' | 'inr-compact' | 'dec1' | 'pct'

function makeFormatter(format: CountFormat): (n: number) => string {
  switch (format) {
    case 'inr': {
      const f = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
      return n => '₹' + f.format(Math.round(n))
    }
    case 'inr-compact': {
      return n => {
        const a = Math.abs(n)
        if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr'
        if (a >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L'
        if (a >= 1e3) return '₹' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
        return '₹' + Math.round(n)
      }
    }
    case 'dec1': {
      const f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      return n => f.format(n)
    }
    case 'pct': {
      return n => Math.round(n) + '%'
    }
    default: {
      const f = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
      return n => f.format(Math.round(n))
    }
  }
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

export function FnCountUp({
  value, format = 'int', prefix = '', suffix = '', duration = 700, className = '', flash = true,
}: {
  value: number | null | undefined
  format?: CountFormat
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
  flash?: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef<number | null>(null)       // the number currently displayed
  const raf = useRef(0)
  const flashToggle = useRef(false)
  const fmt = useMemo(() => makeFormatter(format), [format])
  const target = typeof value === 'number' && Number.isFinite(value) ? value : 0
  const text = (n: number) => prefix + fmt(n) + suffix

  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const first = shown.current === null
    const from = first ? 0 : (shown.current as number)
    if (reduced() || document.hidden || (!first && from === target)) {
      shown.current = target
      el.textContent = text(target)
      return
    }
    cancelAnimationFrame(raf.current)
    const t0 = performance.now()
    const dur = first ? duration : Math.min(duration, 500)
    el.textContent = text(from)
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const v = from + (target - from) * easeOutExpo(p)
      shown.current = v
      el.textContent = text(p === 1 ? target : v)
      if (p < 1) raf.current = requestAnimationFrame(step)
      else shown.current = target
    }
    raf.current = requestAnimationFrame(step)
    if (flash && !first && el.classList) {
      el.classList.remove('fn-flash-a', 'fn-flash-b')
      flashToggle.current = !flashToggle.current
      el.classList.add(flashToggle.current ? 'fn-flash-a' : 'fn-flash-b')
    }
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, format, prefix, suffix])

  // server render and no-JS show the final value
  return <span ref={ref} className={`fn-num ${className}`.trim()} data-value={target} suppressHydrationWarning>{text(target)}</span>
}

/* ------------------------------------------------------------------ */
/* Flash hook for values you cannot wrap (third-party chart labels etc) */
/* ------------------------------------------------------------------ */
export function useFnFlash(dep: unknown): string {
  const first = useRef(true)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (reduced()) return
    setN(x => x + 1)
  }, [dep])
  return n === 0 ? '' : n % 2 ? 'fn-flash-a' : 'fn-flash-b'   // use with className="fn-num ..."
}

/* ------------------------------------------------------------------ */
/* Skeletons (replace "Loading..." text and spinners)                  */
/* ------------------------------------------------------------------ */
export function FnSkeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`fn-skel ${className}`.trim()} style={style} />
}

export function FnSkeletonRows({ rows = 6, cols = 5, height = 18 }: { rows?: number; cols?: number; height?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" style={{ display: 'grid', gap: 12, padding: 16 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${Math.max(1, cols - 1)}, 1fr)`, gap: 16 }}>
          {Array.from({ length: cols }).map((__, c) => (
            <FnSkeleton key={c} style={{ height, width: c === 0 ? '80%' : `${55 + ((r * 7 + c * 13) % 35)}%`, opacity: 1 - r * 0.07 }} />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  )
}

export function FnKpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, minmax(0,1fr))`, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="crm-card-v2" style={{ padding: 16, display: 'grid', gap: 10 }}>
          <FnSkeleton style={{ height: 12, width: '45%' }} />
          <FnSkeleton style={{ height: 30, width: '65%' }} />
          <FnSkeleton style={{ height: 12, width: '35%' }} />
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export const fnIndex = (i: number): CSSProperties => ({ ['--i' as string]: i } as CSSProperties)
