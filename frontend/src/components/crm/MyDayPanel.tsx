'use client';
// My Day (Caller Command Center 8.1): live, every tile opens the filtered list behind it.
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/admin-access';
import { useAdminAuthStore } from '@/lib/admin-store';
import { BADGES, fmtClock } from '@/lib/crm/caller';
import { ReminderStrip, useMyReminders } from './ReminderBell';

function Tile({ href, label, value, sub, tone }: { href: string; label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <Link href={href} className="crm-card-v2 p-4 block transition-all duration-150 hover:-translate-y-0.5" style={tone ? { borderTop: `3px solid ${tone}` } : undefined}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: tone ?? 'var(--crm-muted)' }}>{label}</p>
      <p className="text-[26px] font-semibold leading-none tabular-nums" style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-1.5" style={{ color: 'var(--crm-muted)' }}>{sub}</p>}
    </Link>
  );
}

export function MyDayPanel() {
  const access = useAdminAccess();
  const isCaller = useAdminAuthStore((s) => s.user?.departmentType === 'crm_senior');
  const enabled = !access.isLoading && (!access.restricted || access.can('crm_caller.view'));
  const { data } = useQuery({ queryKey: ['caller-me'], queryFn: () => api.callerMe(), refetchInterval: 15_000, enabled });
  const { data: rem } = useMyReminders(enabled);
  // admins who never take a shift do not need an empty panel
  if (!enabled || !data || (!isCaller && !data.shift && !data.day.assigned)) return null;
  const d = data.day;
  const list = (view: string, extra = '') => `/crm/caller/day?view=${view}${extra}`;
  const maxHour = Math.max(1, ...d.hourly.map((h: any) => h.calls));
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--crm-ink)' }}>My Day</h2>
        <Link href="/crm/caller" className="text-[12px] font-semibold" style={{ color: 'var(--crm-forest)' }}>Open cockpit →</Link>
      </div>
      <ReminderStrip items={rem?.items ?? []} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Tile href={list('assigned')} label="Assigned today" value={d.assigned} sub={data.shift ? `Shift ${data.presence}` : 'Shift not started'} tone="var(--crm-forest)" />
        <Tile href={list(d.remaining ? 'remaining' : 'done')} label="Done / remaining" value={`${d.done} / ${d.remaining}`} sub={d.assigned ? `${Math.round((d.done / d.assigned) * 100)}% done` : '—'} />
        <Tile href={list('calls')} label="Calls made" value={d.calls} sub={`target ${data.target} · ${fmtClock(d.talkSec)} talk`} />
        <Tile href={list('connected')} label="Connected" value={d.connected} sub={`${d.connectPct}% connect rate`} tone="var(--crm-success)" />
        <Tile href={list('wa')} label="WhatsApp sent" value={d.wa} tone="#25D366" />
        <Tile href={list('callbacks')} label="Callbacks due" value={d.callbacksDue} sub={d.callbacksOverdue ? `${d.callbacksOverdue} overdue` : 'none overdue'} tone={d.callbacksOverdue ? 'var(--crm-danger)' : 'var(--crm-amber)'} />
        <Tile href={list('orders')} label="Orders won" value={d.orders} tone="var(--crm-gold)" />
        <Tile href={list('calls')} label="Points · streak" value={d.points} sub={`streak ${d.streak} · best ${d.bestStreak}${d.badges.length ? ` · ${d.badges.map((b: string) => BADGES[b] ?? b).join(' ')}` : ''}`} />
        <Tile href={list('remaining')} label="Pace" value={`${data.pace.actualPerHour}/h`} sub={`need ${data.pace.requiredPerHour}/h to finish`} tone={data.pace.actualPerHour < data.pace.requiredPerHour ? 'var(--crm-danger)' : 'var(--crm-success)'} />
        <div className="crm-card-v2 p-4 col-span-2 sm:col-span-3 lg:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--crm-muted)' }}>Calls by hour</p>
          <div className="flex items-end gap-1 h-12">
            {d.hourly.map((h: any) => (
              <Link key={h.hour} href={list('calls', `&hour=${h.hour}`)} title={`${h.hour}:00 · ${h.calls} calls, ${h.connected} connected`} className="flex-1 flex flex-col justify-end h-full">
                <span className="block rounded-sm" style={{ height: `${(h.calls / maxHour) * 100}%`, minHeight: h.calls ? 3 : 1, background: h.calls ? 'var(--crm-gold)' : 'var(--crm-line)' }} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
