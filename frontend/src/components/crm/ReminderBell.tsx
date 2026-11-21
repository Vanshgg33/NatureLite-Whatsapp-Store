'use client';
// Global reminder bell (every CRM page): live count, grouped dropdown, toast + chime when a reminder fires.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Volume2, VolumeX, AlarmClock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/admin-access';
import { useToast } from '@/components/ui/use-toast';
import { chime, istTime, setSound, soundOn, useNow } from '@/lib/crm/caller';

const PRE_ALERT_MS = 5 * 60_000;
const SEEN_KEY = 'crm-reminders-seen';

export function useMyReminders(enabled = true) {
  return useQuery({ queryKey: ['crm-reminders', 'mine'], queryFn: () => api.callerReminders(), refetchInterval: 30_000, enabled });
}

export function groupReminders(items: any[], now: number) {
  const open = items.filter((r) => r.status === 'pending' || r.status === 'fired');
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const g = { overdue: [] as any[], now: [] as any[], next2h: [] as any[], today: [] as any[] };
  for (const r of open.sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))) {
    const t = +new Date(r.dueAt);
    if (t < now - 15 * 60_000) g.overdue.push(r);
    else if (t <= now + PRE_ALERT_MS) g.now.push(r);
    else if (t <= now + 2 * 3_600_000) g.next2h.push(r);
    else if (t <= +endOfDay) g.today.push(r);
  }
  return g;
}

export function ReminderBell() {
  const access = useAdminAccess();
  const enabled = !access.isLoading && (!access.restricted || ['crm_caller.view', 'crm_callbacks.view', 'crm_today.view'].some((p) => access.can(p)));
  const { data } = useMyReminders(enabled);
  const qc = useQueryClient();
  const { toast } = useToast();
  const now = useNow(15_000); // local 15 s check: the toast is on time even between polls
  const [open, setOpen] = useState(false);
  const [sound, setSoundState] = useState(true);
  const seen = useRef<Set<string>>(new Set());
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSoundState(soundOn());
    try { seen.current = new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]')); } catch { /* fresh */ }
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const items: any[] = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => groupReminders(items, now), [items, now]);
  const count = groups.overdue.length + groups.now.length;

  // fire: 5 min before (callbacks) and at the time; each stage once per browser session
  useEffect(() => {
    let fired = false;
    for (const r of items) {
      if (r.status !== 'pending' && r.status !== 'fired') continue;
      const t = +new Date(r.dueAt);
      const stage = t <= now ? 'due' : r.type === 'callback' && t - now <= PRE_ALERT_MS ? 'soon' : null;
      if (!stage) continue;
      const k = `${r._id}:${stage}:${t}`;
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      if (now - t > 60 * 60_000) continue; // old ones are listed, not toasted
      fired = true;
      const who = r.customerId?.name || r.customerId?.phone || '';
      toast({ title: `${stage === 'soon' ? 'In 5 min' : 'Now'}: ${r.text || r.type}`, description: who ? `${who} · ${istTime(r.dueAt)}` : istTime(r.dueAt) });
    }
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen.current).slice(-300))); } catch { /* ignore */ }
    if (fired && sound) chime();
  }, [items, now, sound, toast]);

  const act = useMutation({
    mutationFn: (v: { id: string; action: 'done' | 'snooze'; minutes?: number }) => api.callerUpdateReminder(v.id, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-reminders'] }),
  });

  if (!enabled) return null;
  const section = (label: string, rows: any[], color: string) => rows.length ? (
    <div key={label}>
      <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color }}>{label} ({rows.length})</p>
      {rows.slice(0, 8).map((r) => (
        <div key={r._id} className="flex items-center gap-2 px-3 py-2 hover:bg-black/[0.03]">
          <AlarmClock className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium truncate" style={{ color: 'var(--crm-ink)' }}>{r.text || r.type}</p>
            <p className="text-[10px] truncate" style={{ color: 'var(--crm-muted)' }}>
              {istTime(r.dueAt)}
              {r.customerId?._id && <> · <Link href={`/crm/customers/${r.customerId._id}`} onClick={() => setOpen(false)} className="underline">{r.customerId.name || r.customerId.phone}</Link></>}
            </p>
          </div>
          <button type="button" onClick={() => act.mutate({ id: r._id, action: 'snooze', minutes: 10 })} className="text-[10px] px-1.5 py-0.5 rounded" style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-muted)' }}>10m</button>
          <button type="button" onClick={() => act.mutate({ id: r._id, action: 'done' })} aria-label="Done" className="h-6 w-6 rounded flex items-center justify-center" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}><Check className="h-3 w-3" /></button>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div className="relative" ref={boxRef}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`Reminders${count ? `: ${count} due` : ''}`}
        className="relative h-9 w-9 flex items-center justify-center rounded-lg transition-colors" style={{ background: 'var(--crm-sand)' }}>
        <Bell className="h-4 w-4" style={{ color: 'var(--crm-ink)' }} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse"
            style={{ background: groups.overdue.length ? 'var(--crm-danger)' : 'var(--crm-amber)', color: '#fff' }}>{count}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(360px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-xl shadow-xl z-50 animate-in fade-in-0 slide-in-from-top-1 duration-150"
          style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--crm-line)' }}>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Reminders</span>
            <button type="button" onClick={() => { setSound(!sound); setSoundState(!sound); }} aria-label={sound ? 'Mute reminder sound' : 'Unmute reminder sound'} style={{ color: 'var(--crm-muted)' }}>
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
          {section('Overdue', groups.overdue, 'var(--crm-danger)')}
          {section('Due now', groups.now, 'var(--crm-amber)')}
          {section('Next 2 hours', groups.next2h, 'var(--crm-blue)')}
          {section('Later today', groups.today, 'var(--crm-muted)')}
          {!groups.overdue.length && !groups.now.length && !groups.next2h.length && !groups.today.length && (
            <p className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--crm-muted)' }}>No reminders today.</p>
          )}
          <Link href="/crm/callbacks" onClick={() => setOpen(false)} className="block text-center py-2 text-[12px] font-semibold" style={{ borderTop: '1px solid var(--crm-line)', color: 'var(--crm-forest)' }}>
            All callbacks & reminders →
          </Link>
        </div>
      )}
    </div>
  );
}

/** "3 callbacks due in the next 30 min" strip for My Day and the Live Board */
export function ReminderStrip({ items, label }: { items: any[]; label?: string }) {
  const now = useNow(15_000);
  const open = items.filter((r) => r.status === 'pending' || r.status === 'fired');
  const overdue = open.filter((r) => +new Date(r.dueAt) < now).length;
  const soon = open.filter((r) => { const t = +new Date(r.dueAt); return t >= now && t <= now + 30 * 60_000; }).length;
  if (!overdue && !soon) return null;
  return (
    <Link href="/crm/callbacks" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-opacity hover:opacity-90"
      style={{ background: overdue ? 'var(--crm-danger)' : 'var(--crm-amber)', color: '#fff' }}>
      <AlarmClock className="h-4 w-4 animate-pulse" />
      <span>
        {label ? `${label}: ` : ''}
        {overdue ? `${overdue} overdue` : ''}{overdue && soon ? ' · ' : ''}{soon ? `${soon} due in the next 30 min` : ''}
      </span>
      <span className="ml-auto text-[12px] opacity-80">Open →</span>
    </Link>
  );
}
