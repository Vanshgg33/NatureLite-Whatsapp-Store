'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/crm/format';
import { ReportPage, Card, pctText } from '@/components/crm/ReportPage';

const LABEL: Record<string, string> = { revenue: 'Revenue', orders: 'Orders', calls: 'Calls', newCustomers: 'New customers' };
const STATUS: Record<string, string> = { done: 'Reached', on_track: 'On track', behind: 'Behind' };
const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);

function GoalCard({ g, month }: { g: any; month: string }) {
  const qc = useQueryClient();
  const [val, setVal] = useState(String(g.target || ''));
  const save = useMutation({
    mutationFn: () => api.setCrmGoal({ month, metric: g.metric, target: Number(val) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-goals'] }),
  });
  const fmt = (n: number) => (g.metric === 'revenue' ? formatINR(n) : n.toLocaleString('en-IN'));
  const width = Math.min(100, g.progressPct ?? 0);
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold" style={{ color: 'var(--crm-ink)' }}>{LABEL[g.metric]}</h2>
        <span className="text-[12px] font-medium" style={{ color: g.status === 'behind' ? 'var(--crm-danger)' : 'var(--crm-success)' }}>
          {g.target > 0 ? STATUS[g.status] : 'No target set'}
        </span>
      </div>
      <p className="text-[20px] font-semibold crm-tabular" style={{ color: 'var(--crm-forest)' }}>
        {fmt(g.actual)} <span className="text-[12px] font-normal" style={{ color: 'var(--crm-muted)' }}>of {g.target > 0 ? fmt(g.target) : '—'} ({pctText(g.progressPct)})</span>
      </p>
      <div className="relative h-2 rounded-full my-2" style={{ background: 'var(--crm-sand)' }} role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-2 rounded-full" style={{ width: `${width}%`, background: 'var(--crm-forest)' }} />
        <div className="absolute top-[-2px] h-3 w-0.5" style={{ left: `${g.elapsedPct}%`, background: 'var(--crm-gold)' }} title="Where you should be today" />
      </div>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (val !== '' && Number(val) >= 0) save.mutate(); }}>
        <input aria-label={`${LABEL[g.metric]} target`} type="number" min={0} value={val} onChange={e => setVal(e.target.value)} placeholder="Target" className="px-3 py-1.5 rounded-xl text-[13px] w-36" style={{ border: '1px solid var(--crm-line)' }} />
        <button disabled={save.isPending} className="px-3 py-1.5 rounded-xl text-[13px] font-medium" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>Save target</button>
      </form>
      {save.isError && <p className="text-[12px]" style={{ color: 'var(--crm-danger)' }}>Could not save.</p>}
    </Card>
  );
}

export default function CrmGoalsPage() {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading, isError } = useQuery({ queryKey: ['crm-goals', month], queryFn: () => api.getCrmGoals(month) });
  return (
    <ReportPage title="Goals" icon={Target} loading={isLoading} error={isError} note="The gold marker shows where you should be today. CAC cap goal needs spend data and is not included.">
      <label className="text-[13px] flex items-center gap-2">Month <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--crm-line)' }} /></label>
      <div className="grid gap-3 md:grid-cols-2">{(data?.goals ?? []).map((g: any) => <GoalCard key={g.metric + month} g={g} month={month} />)}</div>
    </ReportPage>
  );
}
