'use client';

// Reminders & callbacks: list, calendar-day view with drag-to-reschedule, snooze, done, adherence %.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, GripVertical } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/crm/format';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { useAdminAccess } from '@/lib/admin-access';
import { useAdminAuthStore } from '@/lib/admin-store';
import { ReportPage, DataTable, Stat } from '@/components/crm/ReportPage';
import { istDateTime, istTime, fmtClock, useNow } from '@/lib/crm/caller';
import { FxDigits } from '@/components/crm/forest-night-pack';

/** Live countdown for a callback due within the hour (amber under 10 min); "late" once it is past. */
function DueIn({ at }: { at: string }) {
  const sec = (+new Date(at) - useNow(1000)) / 1000;
  if (sec < 0) return <span className="text-[11px] font-semibold" style={{ color: 'var(--crm-danger)' }}>late</span>;
  if (sec > 3600) return null;
  return (
    <span className="text-[12px] font-semibold" style={{ color: sec < 600 ? 'var(--crm-amber)' : 'var(--crm-success)' }}>
      in <FxDigits text={fmtClock(sec)} dir="down" running />
    </span>
  );
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00–20:00
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

export default function CrmCallbacksPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const access = useAdminAccess();
  const dept = useAdminAuthStore((s) => s.user?.departmentType);
  const manager = !['crm_senior', 'crm_viewer'].includes(dept ?? '');
  const [view, setView] = useState<'list' | 'day'>('list');
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [dragId, setDragId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm-reminders', manager ? 'all' : 'mine'],
    queryFn: () => api.callerReminders(manager ? 'all' : undefined),
    refetchInterval: 30_000,
    enabled: !access.isLoading,
  });
  const act = useMutation({
    mutationFn: (v: { id: string; action: 'done' | 'snooze' | 'reschedule'; minutes?: number; dueAt?: string }) => api.callerUpdateReminder(v.id, v),
    onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: ['crm-reminders'] }); qc.invalidateQueries({ queryKey: ['crm-callbacks'] }); if (v.action === 'reschedule') toast({ title: `Moved to ${istDateTime(v.dueAt)}` }); },
    onError: (e) => toast({ title: 'Could not update', description: getApiError(e), variant: 'destructive' }),
  });

  const items: any[] = useMemo(() => (data?.items ?? []).filter((r: any) => r.status === 'pending' || r.status === 'fired'), [data]);
  const now = Date.now();
  const overdue = items.filter((r) => +new Date(r.dueAt) < now);
  const upcoming = items.filter((r) => +new Date(r.dueAt) >= now);
  const ofDay = items.filter((r) => dayKey(new Date(r.dueAt)) === day);

  const who = (r: any) => r.customerId?._id
    ? <Link href={`/crm/customers/${r.customerId._id}`} className="underline">{r.customerId.name || formatPhone(r.customerId.phone) || 'Unnamed'}</Link>
    : <span style={{ color: 'var(--crm-muted)' }}>{r.type === 'system' ? 'Team alert' : '—'}</span>;
  const actions = (r: any) => (
    <span key={r._id} className="flex gap-1">
      {[10, 30, 60].map((m) => <button key={m} onClick={() => act.mutate({ id: r._id, action: 'snooze', minutes: m })} className="text-[11px] px-1.5 py-0.5 rounded" style={{ border: '1px solid var(--crm-line)' }}>{m}m</button>)}
      <button onClick={() => act.mutate({ id: r._id, action: 'done' })} aria-label="Done" className="h-6 w-6 rounded flex items-center justify-center" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}><Check className="h-3 w-3" /></button>
    </span>
  );
  const table = (rows: any[], empty: string) => (
    <DataTable head={['Customer', 'Phone', 'Due (IST)', 'What', ...(manager ? ['Caller'] : []), '']} empty={empty}
      rows={rows.map((r) => [who(r), formatPhone(r.customerId?.phone), <span key="due" className="inline-flex items-center gap-2">{istDateTime(r.dueAt)}<DueIn at={r.dueAt} /></span>, r.text || r.type, ...(manager ? [r.callerId?.name ?? 'Managers'] : []), actions(r)])} />
  );

  const drop = (hour: number) => {
    const r = items.find((x) => x._id === dragId);
    setDragId(null);
    if (!r) return;
    const old = new Date(r.dueAt);
    const mins = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', minute: '2-digit' }).format(old);
    const at = new Date(`${day}T${String(hour).padStart(2, '0')}:${mins.padStart(2, '0')}:00+05:30`);
    if (+at <= Date.now()) { toast({ title: 'Pick a time in the future', variant: 'destructive' }); return; }
    act.mutate({ id: r._id, action: 'reschedule', dueAt: at.toISOString() });
  };

  return (
    <ReportPage title="Callbacks & reminders" icon={CalendarClock} loading={isLoading} error={isError}
      note="Callbacks fire 5 min before and on time; unhandled for 30 min they escalate to managers.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Overdue" value={overdue.length} />
        <Stat label="Upcoming" value={upcoming.length} />
        <Stat label="Adherence (30 days)" value={data?.adherence === null || data?.adherence === undefined ? '—' : `${data.adherence}%`} />
        <Stat label="Callbacks promised (30 days)" value={data?.promised30d ?? 0} />
      </div>
      <div className="flex gap-1">
        {(['list', 'day'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
            style={view === v ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)' } : { color: 'var(--crm-muted)', border: '1px solid var(--crm-line)' }}>
            {v === 'list' ? 'List' : 'Day view (drag to reschedule)'}
          </button>
        ))}
      </div>
      {view === 'list' ? (
        <>
          <h2 className="font-semibold" style={{ color: 'var(--crm-danger)' }}>Overdue ({overdue.length})</h2>
          {table(overdue, 'No overdue callbacks.')}
          <h2 className="font-semibold" style={{ color: 'var(--crm-ink)' }}>Upcoming ({upcoming.length})</h2>
          {table(upcoming, 'Nothing scheduled.')}
        </>
      ) : (
        <div className="space-y-2">
          <input type="date" value={day} min={dayKey(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day"
            className="px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }} />
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }}>
            {HOURS.map((h) => {
              const rows = ofDay.filter((r) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date(r.dueAt))) === h);
              return (
                <div key={h} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={() => drop(h)}
                  className="flex gap-3 px-3 py-2 min-h-[44px] transition-colors" style={{ borderTop: '1px solid var(--crm-line)', background: dragId ? 'rgba(201,160,74,0.06)' : undefined }}>
                  <span className="w-12 text-[12px] tabular-nums pt-1" style={{ color: 'var(--crm-muted)' }}>{h}:00</span>
                  <div className="flex-1 flex flex-wrap gap-2">
                    {rows.map((r) => (
                      <div key={r._id} draggable onDragStart={(e) => { setDragId(r._id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragId(null)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] cursor-grab active:cursor-grabbing"
                        style={{ background: +new Date(r.dueAt) < now ? 'var(--crm-danger)' : 'var(--crm-amber)', color: '#fff' }}
                        title="Drag to another hour to reschedule">
                        <GripVertical className="h-3 w-3 opacity-70" />
                        {istTime(r.dueAt)} · {r.customerId?.name || r.customerId?.phone || r.text}
                        {manager && r.callerId?.name ? ` · ${r.callerId.name}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>On a phone, use the list view’s snooze buttons or the customer profile to change a time.</p>
        </div>
      )}
    </ReportPage>
  );
}
