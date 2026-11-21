'use client';
// Caller Command Center: shared UI definitions (outcomes, chips, presence) and small timer hooks.
import { useEffect, useState } from 'react';

export type OutcomeDef = { value: string; label: string; group: 'connected' | 'not_connected'; color: string; asks?: 'time' | 'reason' };

export const OUTCOMES: OutcomeDef[] = [
  { value: 'interested', label: 'Interested', group: 'connected', color: 'var(--crm-blue)' },
  { value: 'ordered', label: 'Ordered ✓', group: 'connected', color: 'var(--crm-success)' },
  { value: 'callback', label: 'Callback', group: 'connected', color: 'var(--crm-amber)', asks: 'time' },
  { value: 'connected', label: 'Spoke · follow up', group: 'connected', color: 'var(--crm-ink-2)' },
  { value: 'not_interested', label: 'Not interested', group: 'connected', color: 'var(--crm-danger)', asks: 'reason' },
  { value: 'wrong_number', label: 'Wrong number', group: 'connected', color: 'var(--crm-muted)' },
  { value: 'complaint', label: 'Complaint', group: 'connected', color: '#C05621' },
  { value: 'no_answer', label: 'No answer', group: 'not_connected', color: 'var(--crm-muted)' },
  { value: 'busy', label: 'Busy', group: 'not_connected', color: 'var(--crm-muted)' },
  { value: 'switched_off', label: 'Switched off', group: 'not_connected', color: 'var(--crm-muted)' },
  { value: 'call_dropped', label: 'Call dropped', group: 'not_connected', color: 'var(--crm-muted)' },
];
export const outcomeLabel = (v?: string | null) => OUTCOMES.find((o) => o.value === v)?.label ?? (v === 'unlogged' ? 'Unlogged' : v ?? '—');

export const NOT_INTERESTED_REASONS = ['Price', 'Buys elsewhere', 'No need now', 'Quality concern', 'Other'];
export const SKIP_REASONS = ['Bad time to call', 'Needs a manager', 'Duplicate customer', 'Language barrier', 'Other'];
export const BREAK_REASONS = ['Tea', 'Lunch', 'Meeting'];

/** quick callback chips → ISO time (local clock is IST for the team) */
export function callbackChips(now = new Date()): { label: string; at: Date }[] {
  const at = (days: number, h: number, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
  const chips = [{ label: 'In 1 h', at: new Date(+now + 3_600_000) }];
  if (now.getHours() < 18) chips.push({ label: 'Evening 6 pm', at: at(0, 18) });
  chips.push({ label: 'Tomorrow 11 am', at: at(1, 11) });
  return chips;
}

export const PRESENCE: Record<string, { label: string; color: string; pulse?: boolean }> = {
  on_call: { label: 'On call', color: '#16a34a', pulse: true },
  wrap_up: { label: 'Wrap-up', color: '#2563eb' },
  ready: { label: 'Ready', color: '#6b7280' },
  idle: { label: 'Idle', color: '#d97706' },
  break: { label: 'Break', color: '#7c3aed' },
  offline: { label: 'Offline', color: '#1f2937' },
};

export const BADGES: Record<string, string> = {
  early_bird: '🐦 Early Bird', closer: '🏆 Closer', callback_king: '👑 Callback King', zero_left: '🧹 Zero Left', streak_10: '🔥 Streak 10',
};

export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
export const istTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : '—');
export const istDateTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—');
/** value for <input type="datetime-local"> from a Date (local time) */
export const toLocalInput = (d: Date) => new Date(+d - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** re-renders every `ms` so live timers tick */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** soft two-tone chime, no audio file needed; silently does nothing where audio is blocked */
export function chime() {
  try {
    if (typeof window === 'undefined' || localStorage.getItem('crm-sound') === 'off') return;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t); o.stop(t + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch { /* audio blocked */ }
}
export const soundOn = () => { try { return localStorage.getItem('crm-sound') !== 'off'; } catch { return true; } };
export const setSound = (on: boolean) => { try { localStorage.setItem('crm-sound', on ? 'on' : 'off'); } catch { /* private mode */ } };
