'use client';
// CRM Settings → Calling: score weights, attempt ladder, calling hours, targets (Caller Command Center). Saved separately.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PhoneCall } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

const FIELDS: [string, string, string][] = [
  ['leadsPerCaller', 'Leads per caller per day', 'leads'], ['targetCalls', 'Daily call target', 'calls'], ['maxAttempts', 'No-answer attempts before parking', 'tries'],
  ['maxDialsPerDay', 'Max dials per lead per day', 'dials'], ['shortCallSec', 'Flag connected calls shorter than', 'sec'], ['callbackGraceMin', 'Callback kept-on-time window', 'min'],
  ['callbackEscalateMin', 'Escalate unhandled callbacks after', 'min'], ['idleNudgeMin', 'Idle nudge after', 'min'], ['idleAlertMin', 'Idle alert to managers after', 'min'], ['hotScore', 'Hot lead score from', 'pts'],
];
const WEIGHTS: [string, string][] = [
  ['callbackDue', 'Callback due'], ['repurchaseOverdue', 'Refill overdue'], ['abandonedOrEnquiry', 'Abandoned cart'], ['newLead', 'New lead (<24 h)'], ['waEngaged', 'WhatsApp active (3 days)'],
  ['highValue', 'High value (top 20%)'], ['atRisk', 'At risk'], ['failedAttempt', 'Each missed call in a row'], ['notInterested', 'Said not interested'], ['rollover', 'Each rollover'],
];

export function CallerSettingsSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ['caller-settings'], queryFn: () => api.callerSettings() });
  const [cfg, setCfg] = useState<any>(null);
  useEffect(() => { if (data) setCfg(data); }, [data]);
  const save = useMutation({
    mutationFn: () => api.callerSaveSettings(cfg),
    onSuccess: (r) => { setCfg((c: any) => ({ ...c, ...r })); qc.invalidateQueries({ queryKey: ['caller-settings'] }); toast({ title: 'Calling settings saved' }); },
    onError: (e) => toast({ title: 'Could not save', description: getApiError(e), variant: 'destructive' }),
  });
  if (!cfg) return null;
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const field = (label: string, value: number, onChange: (v: number) => void, suffix: string, min = -100) => (
    <label key={label} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)' }}>
      <span className="flex-1 text-[13px]" style={{ color: 'var(--crm-ink)' }}>{label}</span>
      <input type="number" min={min} value={value} onChange={(e) => onChange(num(e.target.value))} className="w-20 px-2 py-1 rounded-lg text-[13px] text-right" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }} />
      <span className="text-[11px] w-10" style={{ color: 'var(--crm-muted)' }}>{suffix}</span>
    </label>
  );
  return (
    <div className="crm-card-v2 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(201,160,74,0.12)' }}><PhoneCall className="h-4 w-4" style={{ color: 'var(--crm-gold)' }} /></div>
        <div className="flex-1">
          <h2 className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>Calling (Caller Command Center)</h2>
          <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>Lead score weights, attempt ladder, calling hours and targets. Changes apply to the next distribution and call.</p>
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="px-4 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-40" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>
          {save.isPending ? 'Saving…' : 'Save calling'}
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {field('Calling hours from (IST)', cfg.callingHours.from, (v) => setCfg({ ...cfg, callingHours: { ...cfg.callingHours, from: v } }), ':00', 0)}
        {field('Calling hours until (IST)', cfg.callingHours.to, (v) => setCfg({ ...cfg, callingHours: { ...cfg.callingHours, to: v } }), ':00', 1)}
        {FIELDS.map(([k, l, s]) => field(l, cfg[k], (v) => setCfg({ ...cfg, [k]: v }), s, 0))}
        {(['shiftStartBy', 'dayEndAlertAt'] as const).map((k) => (
          <label key={k} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)' }}>
            <span className="flex-1 text-[13px]" style={{ color: 'var(--crm-ink)' }}>{k === 'shiftStartBy' ? 'Alert if shift not started by' : 'Alert on untouched leads at'}</span>
            <input type="time" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} className="px-2 py-1 rounded-lg text-[13px]" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }} />
          </label>
        ))}
      </div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--crm-muted)' }}>Lead score weights (0–100 total, negative lowers priority)</p>
      <div className="grid gap-2 md:grid-cols-2">
        {WEIGHTS.map(([k, l]) => field(l, cfg.weights[k], (v) => setCfg({ ...cfg, weights: { ...cfg.weights, [k]: v } }), 'pts'))}
      </div>
    </div>
  );
}
