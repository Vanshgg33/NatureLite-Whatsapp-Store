'use client';
// Per-customer reminders: next reminder, history, add, snooze, done (profile and caller cockpit).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Check, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { istDateTime, toLocalInput } from '@/lib/crm/caller';

export function CustomerReminders({ customerId, compact = false }: { customerId: string; compact?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [due, setDue] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000)));
  const key = ['crm-reminders', 'customer', customerId];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.callerReminders(undefined, customerId), refetchInterval: 30_000, enabled: !!customerId });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['crm-reminders'] }); };
  const onError = (e: unknown) => toast({ title: 'Could not update reminder', description: getApiError(e), variant: 'destructive' });
  const add = useMutation({
    mutationFn: () => api.callerAddReminder({ customerId, text: text.trim(), dueAt: new Date(due).toISOString() }),
    onSuccess: () => { setText(''); setAdding(false); refresh(); toast({ title: 'Reminder set' }); }, onError,
  });
  const act = useMutation({ mutationFn: (v: { id: string; action: 'done' | 'snooze'; minutes?: number }) => api.callerUpdateReminder(v.id, v), onSuccess: refresh, onError });

  const items: any[] = data?.items ?? [];
  const open = items.filter((r) => r.status === 'pending' || r.status === 'fired').sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  const past = items.filter((r) => r.status === 'done' || r.status === 'missed').slice(0, compact ? 2 : 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--crm-muted)' }}>Reminders</p>
        <button type="button" onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--crm-forest)' }}>
          <Plus className="h-3 w-3" /> Remind me
        </button>
      </div>
      {adding && (
        <div className="space-y-2 p-3 rounded-xl" style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)' }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What to do…" maxLength={300}
            className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }} />
          <div className="flex gap-2">
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg text-[13px] focus:outline-none" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }} />
            <button type="button" disabled={!text.trim() || !due || add.isPending} onClick={() => add.mutate()}
              className="px-3 rounded-lg text-[12px] font-semibold disabled:opacity-40" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>Save</button>
          </div>
        </div>
      )}
      {!open.length && !adding && <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>Nothing scheduled.</p>}
      {open.map((r) => {
        const overdue = +new Date(r.dueAt) < Date.now();
        return (
          <div key={r._id} className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: overdue ? 'var(--crm-danger-bg, #fde8e8)' : 'var(--crm-sand)', border: '1px solid var(--crm-line)' }}>
            <AlarmClock className={`h-4 w-4 flex-shrink-0 ${overdue ? 'animate-pulse' : ''}`} style={{ color: overdue ? 'var(--crm-danger)' : 'var(--crm-amber)' }} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium truncate" style={{ color: 'var(--crm-ink)' }}>{r.text || r.type}</p>
              <p className="text-[10px]" style={{ color: overdue ? 'var(--crm-danger)' : 'var(--crm-muted)' }}>
                {istDateTime(r.dueAt)}{r.callerId?.name ? ` · ${r.callerId.name}` : ''}
              </p>
            </div>
            {[10, 30, 60].map((m) => (
              <button key={m} type="button" onClick={() => act.mutate({ id: r._id, action: 'snooze', minutes: m })}
                className="hidden sm:block text-[10px] px-1.5 py-1 rounded" style={{ color: 'var(--crm-muted)', border: '1px solid var(--crm-line)' }} title={`Snooze ${m} min`}>{m}m</button>
            ))}
            <button type="button" onClick={() => act.mutate({ id: r._id, action: 'done' })} className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }} title="Done" aria-label="Mark done"><Check className="h-3.5 w-3.5" /></button>
          </div>
        );
      })}
      {!!past.length && (
        <div className="pt-1 space-y-1">
          {past.map((r) => (
            <p key={r._id} className="text-[11px] flex justify-between gap-2" style={{ color: 'var(--crm-muted)' }}>
              <span className="truncate line-through">{r.text || r.type}</span>
              <span className="flex-shrink-0">{r.keptOnTime === true ? 'on time' : r.keptOnTime === false ? 'late' : 'done'}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
