'use client'
/**
 * NatureLite CRM  |  Forest Night MOTION PACK v2   (Next.js 14 App Router, React 18)
 * Put this file at:  src/components/crm/forest-night-pack.tsx
 * Needs forest-night-pack.css (imported after forest-night.css). No other dependency.
 *
 *  Presence        <FxPresence show variant>      mount/unmount with enter AND exit animation
 *  Timer           <FxTimer .../>                 rolling digits, optional progress ring, appear/disappear
 *  Timer (state)   useFxTimer({running,start,direction,total})
 *  Clock           <FxClock/> <FxAnalogClock/>    live digital / analog clock, appear/disappear
 *  Time hook       useFxNow(tz?)                  second-aligned Date, pauses when tab hidden
 *  Digits          <FxDigits text="12:34"/>       rolling digit display (used by timer + clock)
 *  Tabs indicator  <FxIndicator shape="line|pill"/>  drop inside any tablist / segmented control
 *  Collapse        <FxCollapse open>              smooth open/close with child stagger
 *  Toasts          fxToast({...}) + <FxToaster/>  stack with progress bar, hover-pause, exit
 *  Lists           useFxFlip(ref, deps)           smooth re-order / insert / remove (FLIP)
 *  Celebrate       fxBurst(element)               tasteful particle burst (reorder placed etc.)
 *  Misc            FxReveal, FxSwap, FxLoader, useFxPing, FxProvider (ripple + tab-hidden pause)
 *
 * All motion respects html[data-motion] = full | lite | reduced (set by forest-night-boot.ts).
 */
import {
  createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type ElementType, type ReactNode,
} from 'react'

/* ------------------------------------------------------------------ helpers */
type Mode = 'full' | 'lite' | 'reduced'
const isBrowser = typeof window !== 'undefined'
const useIso = isBrowser ? useLayoutEffect : useEffect
export function fxMode(): Mode {
  if (!isBrowser) return 'full'
  const m = document.documentElement.getAttribute('data-motion')
  return m === 'lite' || m === 'reduced' ? m : 'full'
}
const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')
const pad2 = (n: number) => String(n).padStart(2, '0')

/* ------------------------------------------------------------- FxPresence */
export type FxVariant =
  | 'fade' | 'rise' | 'drop' | 'slide-l' | 'slide-r' | 'slide-b'
  | 'pop' | 'zoom' | 'flip' | 'swing' | 'bounce' | 'curtain' | 'morph'

interface PresenceProps {
  show: boolean
  variant?: FxVariant
  /** enter / exit duration in ms (exit defaults to 62% of enter) */
  dur?: number
  outDur?: number
  as?: ElementType
  className?: string
  style?: CSSProperties
  /** play the enter animation on first mount (default true) */
  appear?: boolean
  /** transform-origin helper: 'br' | 'bl' | 'tr' | 'tl' | 'c' */
  origin?: 'br' | 'bl' | 'tr' | 'tl' | 'c'
  /** for variant 'morph': pixel offset the element grows from (e.g. the trigger button) */
  from?: { x: number; y: number }
  onExited?: () => void
  children?: ReactNode
  [k: string]: unknown
}

/** Keeps children mounted while the exit animation plays, then unmounts them. */
export function FxPresence({
  show, variant = 'fade', dur = 320, outDur, as = 'div', className, style, appear = true,
  origin, from, onExited, children, ...rest
}: PresenceProps) {
  const [mounted, setMounted] = useState(show)
  const [phase, setPhase] = useState<'in' | 'out' | 'idle'>(show && appear ? 'in' : 'idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exitMs = outDur ?? Math.round(dur * 0.62)
  const cb = useRef(onExited); cb.current = onExited

  useIso(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (show) { setMounted(true); setPhase('in'); return }
    if (!mounted) return
    if (fxMode() === 'reduced') { setMounted(false); setPhase('idle'); cb.current?.(); return }
    setPhase('out')
    timer.current = setTimeout(() => { setMounted(false); setPhase('idle'); cb.current?.() }, exitMs + 40)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  if (!mounted) return null
  const st: CSSProperties = {
    ['--fx-dur-in' as string]: `${dur}ms`, ['--fx-dur-out' as string]: `${exitMs}ms`,
    ...(from ? { ['--fx-tx' as string]: `${from.x}px`, ['--fx-ty' as string]: `${from.y}px` } : null),
    ...style,
  }
  return createElement(as, {
    ...rest, style: st, 'data-fx-phase': phase,
    className: cx(className, phase === 'in' && `fx-in-${variant}`, phase === 'out' && `fx-out-${variant}`, origin && `fx-origin-${origin}`),
  }, children)
}

/* ------------------------------------------------------------ time hooks */
/** Calls fn on every wall-clock second boundary; pauses while the tab is hidden. */
function useSecondTick(fn: () => void, active = true) {
  const f = useRef(fn); f.current = fn
  useEffect(() => {
    if (!active) return
    let t: ReturnType<typeof setTimeout>
    const loop = () => { f.current(); t = setTimeout(loop, 1000 - (Date.now() % 1000) + 8) }
    const onVis = () => { clearTimeout(t); if (!document.hidden) loop() }
    loop(); document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVis) }
  }, [active])
}

export function useFxNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null) // null on the server => no hydration mismatch
  useSecondTick(() => setNow(new Date()))
  return now
}

interface TimerOpts { running?: boolean; start?: number; direction?: 'up' | 'down'; total?: number; onDone?: () => void }
/** Drift-free timer. up: counts 0,1,2..  down: counts total, total-1 .. 0 (then calls onDone). */
export function useFxTimer({ running = true, start = 0, direction = 'up', total = 0, onDone }: TimerOpts = {}) {
  const base = direction === 'down' ? total : start
  const [seconds, setSeconds] = useState(base)
  const acc = useRef(0) // seconds accumulated before the current run segment
  const t0 = useRef<number | null>(null)
  const done = useRef(onDone); done.current = onDone

  useEffect(() => { acc.current = 0; t0.current = null; setSeconds(base) }, [base, direction]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!running) { if (t0.current != null) { acc.current += (Date.now() - t0.current) / 1000; t0.current = null } return }
    t0.current = Date.now()
    let t: ReturnType<typeof setTimeout>
    const step = () => {
      const el = acc.current + (Date.now() - (t0.current as number)) / 1000
      const v = direction === 'down' ? Math.max(0, base - Math.floor(el)) : base + Math.floor(el)
      setSeconds(v)
      if (direction === 'down' && v === 0) { done.current?.(); return }
      const frac = el - Math.floor(el)
      t = setTimeout(step, Math.max(30, (1 - frac) * 1000 + 6))
    }
    step()
    return () => { clearTimeout(t); if (t0.current != null) { acc.current += (Date.now() - t0.current) / 1000; t0.current = null } }
  }, [running, direction, base])

  const reset = useCallback(() => { acc.current = 0; t0.current = running ? Date.now() : null; setSeconds(base) }, [base, running])
  return { seconds, reset }
}

export function useFxPing(dep: unknown): string {
  const n = useRef(0); const last = useRef(dep)
  if (last.current !== dep) { last.current = dep; n.current++ }
  return n.current === 0 ? '' : n.current % 2 ? 'fx-ping-a' : 'fx-ping-b'
}

/* --------------------------------------------------------------- digits */
function Digit({ ch, k }: { ch: string; k: number }) {
  const [s, setS] = useState({ cur: ch, prev: null as string | null, n: 0 })
  if (ch !== s.cur) setS({ cur: ch, prev: s.cur, n: s.n + 1 })
  useEffect(() => {
    if (s.prev == null) return
    const t = setTimeout(() => setS(p => (p.prev == null ? p : { ...p, prev: null })), 470)
    return () => clearTimeout(t)
  }, [s.n, s.prev])
  return (
    <span className="fx-dg" style={{ ['--k' as string]: k } as CSSProperties}>
      {s.prev != null && <span key={'o' + s.n} className="fx-d fx-d-out">{s.prev}</span>}
      <span key={'i' + s.n} className={cx('fx-d', s.n > 0 && 'fx-d-in')}>{s.cur}</span>
    </span>
  )
}

/** Rolling digit display. Digits/separators are keyed from the right so units stay aligned. */
export function FxDigits({ text, dir = 'up', running = false, className, style }: {
  text: string; dir?: 'up' | 'down'; running?: boolean; className?: string; style?: CSSProperties
}) {
  const chars = text.split('')
  return (
    <span className={cx('fx-digits', className)} data-dir={dir} data-running={running} style={style} aria-label={text} role="timer">
      {chars.map((c, i) => {
        const fromRight = chars.length - 1 - i
        return /\d/.test(c)
          ? <Digit key={'d' + fromRight} ch={c} k={i} />
          : <span key={'s' + fromRight} className="fx-sep" style={{ ['--k' as string]: i } as CSSProperties}>{c}</span>
      })}
    </span>
  )
}

/* ---------------------------------------------------------------- timer */
function fmt(sec: number, format: 'mm:ss' | 'hh:mm:ss' | 'auto') {
  const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  if (format === 'hh:mm:ss' || (format === 'auto' && h > 0)) return `${pad2(h)}:${pad2(m)}:${pad2(r)}`
  return `${pad2(Math.floor(s / 60))}:${pad2(r)}`
}

/** Shared appear/disappear phase for components that choreograph their children via data-phase. */
function usePhase(present: boolean, inMs: number, outMs: number) {
  const [mounted, setMounted] = useState(present)
  const [phase, setPhase] = useState<'in' | 'live' | 'out'>(present ? 'in' : 'out')
  useIso(() => {
    let t: ReturnType<typeof setTimeout>
    if (present) { setMounted(true); setPhase('in'); t = setTimeout(() => setPhase('live'), fxMode() === 'reduced' ? 0 : inMs) }
    else if (mounted) {
      if (fxMode() === 'reduced') { setMounted(false); return }
      setPhase('out'); t = setTimeout(() => setMounted(false), outMs)
    }
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present])
  return { mounted, phase }
}

export interface FxTimerProps {
  /** controlled value in seconds; omit to let the timer run itself */
  seconds?: number
  running?: boolean
  start?: number
  direction?: 'up' | 'down'
  /** countdown length in seconds (direction="down") */
  total?: number
  /** show a progress ring: true = one lap per minute (up) or remaining/total (down); number = lap length in seconds */
  ring?: boolean | number
  /** font-size in px of the digits (ring is sized from it) */
  size?: number
  label?: string
  format?: 'mm:ss' | 'hh:mm:ss' | 'auto'
  warnAt?: number
  dangerAt?: number
  /** show / hide the whole timer with an animation */
  present?: boolean
  variant?: FxVariant
  /** compact pill (live dot + digits) instead of the ring layout */
  pill?: boolean
  onDone?: () => void
  className?: string
}

export function FxTimer({
  seconds: controlled, running = true, start = 0, direction = 'up', total = 0, ring = false, size = 44,
  label, format = 'auto', warnAt, dangerAt, present = true, variant = 'pop', pill = false, onDone, className,
}: FxTimerProps) {
  const own = useFxTimer({ running: controlled == null && running && present, start, direction, total, onDone })
  const sec = controlled ?? own.seconds
  const { mounted, phase } = usePhase(present, 1100, 520)

  const lap = typeof ring === 'number' ? ring : 60
  const p = direction === 'down' && total > 0 ? sec / total : (sec % lap) / lap
  const prevP = useRef(p)
  const wrap = direction === 'up' ? p < prevP.current - 0.2 : p > prevP.current + 0.2
  useEffect(() => { prevP.current = p })
  const lapPop = direction === 'up' && sec > 0 && sec % lap === 0

  const tone = direction === 'down'
    ? (dangerAt != null && sec <= dangerAt ? 'danger' : warnAt != null && sec <= warnAt ? 'warn' : 'ok')
    : (dangerAt != null && sec >= dangerAt ? 'danger' : warnAt != null && sec >= warnAt ? 'warn' : 'ok')

  if (!mounted) return null
  const text = fmt(sec, format)
  const digits = <FxDigits text={text} dir={direction === 'down' ? 'down' : 'up'} running={running} />

  if (pill) {
    return (
      <FxPresence show={present} variant={variant === 'pop' ? 'drop' : variant} dur={380} outDur={420}
        className={cx('fx-timer fx-timer-pill', className)} style={{ fontSize: size }}>
        <span className="fx-live" aria-hidden />
        <span data-phase={phase} data-running={running} data-tone={tone} className="fx-timer" style={{ fontSize: size, color: 'inherit' }}>{digits}</span>
      </FxPresence>
    )
  }

  const D = ring ? Math.round(size * 4.4) : undefined
  return (
    <FxPresence show={present} variant={variant} dur={420} outDur={440} style={{ display: 'inline-block' }}>
      <div
        className={cx('fx-timer', className)}
        data-phase={phase} data-running={running} data-tone={tone} data-wrap={wrap} data-lap={lapPop}
        style={{ fontSize: size, width: D, height: D }}
      >
        {ring && (
          <>
            <span className="fx-glow" aria-hidden />
            <svg className="fx-ring" viewBox="0 0 100 100" aria-hidden>
              <circle className="fx-track" cx="50" cy="50" r="44" />
              <circle className="fx-arc" cx="50" cy="50" r="44" pathLength={1} transform="rotate(-90 50 50)" strokeDashoffset={1 - Math.max(0.001, p)} />
              <g className="fx-head" style={{ transform: `rotate(${p * 360}deg)` }}><circle cx="50" cy="6" r="3.6" /></g>
            </svg>
          </>
        )}
        <div className="fx-core">{digits}{label && <span className="fx-label">{label}</span>}</div>
      </div>
    </FxPresence>
  )
}

/* ---------------------------------------------------------------- clock */
function parts(d: Date, tz?: string, hour12 = true) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const o: Record<string, string> = {}
  f.formatToParts(d).forEach(p => { o[p.type] = p.value })
  const h24 = parseInt(o.hour, 10)
  const h = hour12 ? (h24 % 12 === 0 ? 12 : h24 % 12) : h24
  return { h24, h, m: o.minute, s: o.second, ampm: h24 >= 12 ? 'PM' : 'AM', date: `${o.weekday}, ${o.day} ${o.month} ${o.year}` }
}

export interface FxClockProps {
  size?: number; hour12?: boolean; seconds?: boolean; date?: boolean; tz?: string
  present?: boolean; variant?: FxVariant; className?: string
}
export function FxClock({ size = 34, hour12 = true, seconds = true, date = true, tz, present = true, variant = 'rise', className }: FxClockProps) {
  const now = useFxNow()
  const { mounted, phase } = usePhase(present, 1000, 420)
  if (!mounted) return null
  const pt = now ? parts(now, tz, hour12) : null
  const text = pt ? `${pad2(pt.h)}:${pt.m}${seconds ? ':' + pt.s : ''}` : `--:--${seconds ? ':--' : ''}`
  return (
    <FxPresence show={present} variant={variant} dur={380} outDur={420} style={{ display: 'inline-block' }}>
      <div className={cx('fx-clock', className)} data-phase={phase} style={{ fontSize: size }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <FxDigits text={text} running dir="up" />
          {hour12 && pt && <span className="fx-ampm" style={{ ['--k' as string]: 9 } as CSSProperties}>{pt.ampm}</span>}
        </div>
        {date && pt && <div className="fx-date"><span key={pt.date}>{pt.date}</span></div>}
      </div>
    </FxPresence>
  )
}

export function FxAnalogClock({ size = 160, tz, present = true, variant = 'zoom', className }: {
  size?: number; tz?: string; present?: boolean; variant?: FxVariant; className?: string
}) {
  const now = useFxNow()
  const { mounted, phase } = usePhase(present, 1100, 400)
  const acc = useRef({ s: 0, m: 0, h: 0, ps: -1, pm: -1, ph: -1 })
  if (!mounted) return null
  let a = { s: 0, m: 0, h: 0 }
  if (now) {
    const p = parts(now, tz, false), s = +p.s, m = +p.m, h = p.h24 % 12
    const r = acc.current
    if (r.ps >= 0 && s < r.ps) r.s += 360
    if (r.pm >= 0 && m < r.pm) r.m += 360
    if (r.ph >= 0 && h < r.ph) r.h += 360
    r.ps = s; r.pm = m; r.ph = h
    a = { s: r.s + s * 6, m: r.m + m * 6 + s * 0.1, h: r.h + h * 30 + m * 0.5 }
  }
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const big = i % 5 === 0, ang = (i * 6 * Math.PI) / 180, r1 = big ? 36 : 40, r2 = 44
    return <line key={i} className={cx('fx-tick', big && 'big')} x1={50 + r1 * Math.sin(ang)} y1={50 - r1 * Math.cos(ang)} x2={50 + r2 * Math.sin(ang)} y2={50 - r2 * Math.cos(ang)} />
  })
  const hand = (cls: string, len: number, deg: number) => (
    <line className={cx('fx-hand', cls)} x1="50" y1="50" x2="50" y2={50 - len} style={{ transform: `rotate(${deg}deg)` }} />
  )
  return (
    <FxPresence show={present} variant={variant} dur={420} outDur={280} style={{ display: 'inline-block' }}>
      <div className={cx('fx-analog', className)} data-phase={phase} data-running={!!now} style={{ width: size, height: size }} role="img" aria-label="Analog clock">
        <svg viewBox="0 0 100 100">
          <circle className="fx-face" cx="50" cy="50" r="47" />
          <circle className="fx-aura" cx="50" cy="50" r="49" />
          {ticks}
          {hand('h', 22, a.h)}{hand('m', 33, a.m)}{hand('s', 38, a.s)}
          <circle className="fx-pin" cx="50" cy="50" r="2.8" />
        </svg>
      </div>
    </FxPresence>
  )
}

/* ------------------------------------------------- tab / segmented indicator */
const ACTIVE = '[data-state="active"],[aria-selected="true"],[aria-current="page"],[data-active="true"]'
/** Place as the last child of a Tabs list / segmented control: <TabsList><TabsTrigger/>...<FxIndicator/></TabsList> */
export function FxIndicator({ shape = 'line', className }: { shape?: 'line' | 'pill'; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [ready, setReady] = useState(false)
  useIso(() => {
    const el = ref.current, host = el?.parentElement
    if (!el || !host) return
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    const place = () => {
      const act = host.querySelector<HTMLElement>(ACTIVE)
      if (!act) { el.style.opacity = '0'; return }
      const x = act.offsetLeft, w = act.offsetWidth
      el.style.opacity = ''
      if (shape === 'pill') { el.style.width = w + 'px'; el.style.transform = `translateX(${x}px)` }
      else el.style.transform = `translateX(${x}px) scaleX(${w / 100})`
      setReady(true)
    }
    place()
    const mo = new MutationObserver(place); mo.observe(host, { attributes: true, subtree: true, attributeFilter: ['data-state', 'aria-selected', 'aria-current', 'data-active', 'class'] })
    const ro = new ResizeObserver(place); ro.observe(host)
    document.fonts?.ready.then(place)
    return () => { mo.disconnect(); ro.disconnect() }
  }, [shape])
  return <span ref={ref} aria-hidden className={cx('fx-ind', className)} data-shape={shape} data-ready={ready} />
}

/* ------------------------------------------------------------- collapse */
export function FxCollapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const inert = open ? {} : { inert: '' as unknown as boolean }
  return (
    <div className={cx('fx-collapse', className)} data-open={open} aria-hidden={!open} {...inert}>
      <div className="fx-collapse-in">{children}</div>
    </div>
  )
}

/* -------------------------------------------------------------- toasts */
export type FxToastTone = 'success' | 'error' | 'warn' | 'info'
export interface FxToastInput { title: string; description?: string; tone?: FxToastTone; duration?: number }
interface ToastItem extends Required<Pick<FxToastInput, 'title' | 'tone' | 'duration'>> { id: number; description?: string; leaving?: boolean }
let toastId = 0; let toasts: ToastItem[] = []
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())
export function fxToast(t: FxToastInput): number {
  const item: ToastItem = { id: ++toastId, title: t.title, description: t.description, tone: t.tone ?? 'success', duration: t.duration ?? 4000 }
  toasts = [...toasts.slice(-4), item]; emit(); return item.id
}
export function fxToastDismiss(id: number) {
  const exit = fxMode() === 'reduced' ? 0 : 250
  toasts = toasts.map(t => (t.id === id ? { ...t, leaving: true } : t)); emit()
  setTimeout(() => { toasts = toasts.filter(t => t.id !== id); emit() }, exit)
}
const TOAST_ICON: Record<FxToastTone, ReactNode> = {
  success: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="fx-check"><polyline points="4 12 10 18 20 6" /></svg>,
  error: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v9M12 19v.01" /></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 11v7M12 6v.01" /></svg>,
}
function ToastView({ t }: { t: ToastItem }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const left = useRef(t.duration); const began = useRef(0)
  const start = () => { began.current = Date.now(); timer.current = setTimeout(() => fxToastDismiss(t.id), left.current) }
  const stop = () => { if (timer.current) clearTimeout(timer.current); left.current -= Date.now() - began.current }
  useEffect(() => { start(); return () => { if (timer.current) clearTimeout(timer.current) } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fx-toast" role="status" data-tone={t.tone} data-leaving={!!t.leaving} data-flip={t.id}
      style={{ ['--fx-life' as string]: `${t.duration}ms` } as CSSProperties} onMouseEnter={stop} onMouseLeave={start}>
      <span className="fx-t-ic">{TOAST_ICON[t.tone]}</span>
      <div><b>{t.title}</b>{t.description && <p>{t.description}</p>}</div>
      <button className="fx-t-x" aria-label="Dismiss" onClick={() => fxToastDismiss(t.id)}>&times;</button>
      <span className="fx-t-bar" />
    </div>
  )
}
export function FxToaster({ position = 'bottom-right' }: { position?: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-center' }) {
  const [list, setList] = useState<ToastItem[]>([])
  useEffect(() => { const f = () => setList(toasts); subs.add(f); f(); return () => { subs.delete(f) } }, [])
  const ref = useRef<HTMLDivElement>(null)
  useFxFlip(ref, list.length)
  return <div ref={ref} className="fx-toaster" data-pos={position} aria-live="polite">{list.map(t => <ToastView key={t.id} t={t} />)}</div>
}

/* ----------------------------------------------------------- FLIP lists */
/** Smoothly animates children (direct, keyed with data-flip or any element) to their new positions. */
export function useFxFlip(ref: { current: HTMLElement | null }, dep: unknown, duration = 340) {
  const rects = useRef(new Map<Element, DOMRect>())
  useIso(() => {
    const host = ref.current; if (!host) return
    const next = new Map<Element, DOMRect>()
    const mode = fxMode()
    Array.from(host.children).forEach(ch => {
      const r = ch.getBoundingClientRect(); next.set(ch, r)
      const old = rects.current.get(ch)
      if (old && mode !== 'reduced' && typeof (ch as HTMLElement).animate === 'function') {
        const dx = old.left - r.left, dy = old.top - r.top
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
          (ch as HTMLElement).animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration, easing: 'cubic-bezier(.22,1,.36,1)' })
      }
    })
    rects.current = next
  }, [dep])
}

/* ---------------------------------------------------------- celebrate */
const BURST = ['#7BE0A4', '#A6F0C3', '#F0C75E', '#8DB8FF', '#F5A3D0', '#FFFFFF']
let live = 0
/** Particle burst from an element (or {x,y}). Auto-cleans, capped, skipped in reduced mode. */
export function fxBurst(target: Element | { x: number; y: number }, opts: { count?: number; spread?: number; colors?: string[] } = {}) {
  if (!isBrowser || fxMode() === 'reduced' || live > 3 || typeof Element.prototype.animate !== 'function') return
  let x: number, y: number
  if ('getBoundingClientRect' in target) { const r = (target as Element).getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2 } else ({ x, y } = target)
  const n = fxMode() === 'lite' ? 9 : opts.count ?? 18, spread = opts.spread ?? 110, colors = opts.colors ?? BURST
  const box = document.createElement('div')
  box.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;z-index:9999`
  document.body.appendChild(box); live++
  let finished = 0
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i')
    const sz = 5 + Math.random() * 6, round = Math.random() > 0.45
    p.style.cssText = `position:absolute;left:-${sz / 2}px;top:-${sz / 2}px;width:${sz}px;height:${sz * (round ? 1 : 0.5)}px;border-radius:${round ? '50%' : '2px'};background:${colors[i % colors.length]}`
    box.appendChild(p)
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5, dist = spread * (0.55 + Math.random() * 0.6)
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 24
    const a = p.animate([
      { transform: 'translate(0,0) scale(.3) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(1) rotate(${Math.random() * 280}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx * 1.15}px,${dy + 46}px) scale(.6) rotate(${Math.random() * 520}deg)`, opacity: 0 },
    ], { duration: 780 + Math.random() * 380, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' })
    a.onfinish = () => { if (++finished === n) { box.remove(); live-- } }
  }
}

/* ----------------------------------------------------------------- misc */
export function FxReveal({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: ElementType }) {
  const ref = useRef<HTMLElement>(null)
  const [state, setState] = useState<'ssr' | 'pending' | 'in'>('ssr')
  useIso(() => {
    const el = ref.current; if (!el) return
    if (fxMode() === 'reduced' || typeof IntersectionObserver === 'undefined') { setState('in'); return }
    const r = el.getBoundingClientRect()
    if (r.top < innerHeight * 0.92) { setState('in'); return } // already visible: no reveal needed
    setState('pending')
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { setState('in'); io.disconnect() } }, { threshold: 0.12 })
    io.observe(el); return () => io.disconnect()
  }, [])
  return createElement(as, { ref, className: cx(className, state === 'pending' && 'fx-reveal-pending', state === 'in' && 'fx-reveal-in') }, children)
}

/** Wrap a value that changes (status text, badge): new content eases in. */
export function FxSwap({ k, children, className }: { k: string | number; children: ReactNode; className?: string }) {
  return <span className={cx('fx-swap', className)} style={{ display: 'inline-block' }}><span key={k} style={{ display: 'inline-block' }}>{children}</span></span>
}

export function FxLoader({ variant = 'orbit', className }: { variant?: 'orbit' | 'dots' | 'bars'; className?: string }) {
  if (variant === 'dots') return <span className={cx('fx-loader-dots', className)} role="status" aria-label="Loading"><i /><i /><i /></span>
  if (variant === 'bars') return <span className={cx('fx-loader-bars', className)} role="status" aria-label="Loading"><i /><i /><i /><i /><i /></span>
  return <span className={cx('fx-loader-orbit', className)} role="status" aria-label="Loading"><i /><i /><i /></span>
}

/** Mount once in the CRM layout: ripple on .fx-ripple elements, pause animations in hidden tabs, global toaster. */
export function FxProvider({ children, toaster = true }: { children?: ReactNode; toaster?: boolean }) {
  useEffect(() => {
    const root = document.documentElement
    const onVis = () => (document.hidden ? root.setAttribute('data-fx-hidden', '') : root.removeAttribute('data-fx-hidden'))
    const onDown = (e: PointerEvent) => {
      if (fxMode() === 'reduced') return
      const host = (e.target as Element | null)?.closest<HTMLElement>('.fx-ripple')
      if (!host || (host as HTMLButtonElement).disabled) return
      const r = host.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2
      const span = document.createElement('span')
      span.className = 'fx-rip'
      span.style.cssText = `--s:${s}px;--x:${e.clientX - r.left}px;--y:${e.clientY - r.top}px`
      host.appendChild(span); setTimeout(() => span.remove(), 680)
    }
    document.addEventListener('visibilitychange', onVis); document.addEventListener('pointerdown', onDown, { passive: true })
    return () => { document.removeEventListener('visibilitychange', onVis); document.removeEventListener('pointerdown', onDown) }
  }, [])
  return <>{children}{toaster && <FxToaster />}</>
}
