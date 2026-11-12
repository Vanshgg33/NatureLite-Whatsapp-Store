'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/crm/format';
import { ReportPage, DataTable, Card, Stat } from '@/components/crm/ReportPage';

const STAGES = ['new', 'contacted', 'interested', 'ordered', 'lost'];
const when = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const errMsg = (e: any) => e?.response?.data?.message ?? 'Something went wrong.';

export default function CrmLeadsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [source, setSource] = useState('');
  const { data, isLoading, isError } = useQuery({ queryKey: ['crm-leads'], queryFn: () => api.getCrmLeads() });
  const refresh = () => qc.invalidateQueries({ queryKey: ['crm-leads'] });
  const add = useMutation({ mutationFn: () => api.addCrmLead({ name, phone, source }), onSuccess: () => { setName(''); setPhone(''); setSource(''); refresh(); } });
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => {
      const reason = stage === 'lost' ? window.prompt('Why was this lead lost?') ?? '' : undefined;
      return api.setCrmLeadStage(id, stage, reason);
    },
    onSuccess: refresh,
  });
  const median = data?.medianFirstContactMinutes;

  return (
    <ReportPage title="Leads" icon={UserPlus} loading={isLoading} error={isError}
      note="Manual entry. Meta Lead Ads / website form capture and the 5-minute SLA alert need integrations that are not set up.">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Median time to first contact (30d)" value={median == null ? '—' : `${median} min`} />
        {STAGES.slice(0, 3).map(s => <Stat key={s} label={s} value={(data?.items ?? []).filter((l: any) => l.stage === s).length} />)}
      </div>
      <Card>
        <form className="flex gap-2 flex-wrap" onSubmit={e => { e.preventDefault(); add.mutate(); }}>
          <input aria-label="Name" required placeholder="Name" value={name} onChange={e => setName(e.target.value)} className="px-3 py-2 rounded-xl text-[13px]" style={{ border: '1px solid var(--crm-line)' }} />
          <input aria-label="Phone" required placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} className="px-3 py-2 rounded-xl text-[13px]" style={{ border: '1px solid var(--crm-line)' }} />
          <input aria-label="Source" placeholder="Source (e.g. instagram)" value={source} onChange={e => setSource(e.target.value)} className="px-3 py-2 rounded-xl text-[13px]" style={{ border: '1px solid var(--crm-line)' }} />
          <button disabled={add.isPending} className="px-4 py-2 rounded-xl text-[13px] font-medium" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>Add lead</button>
        </form>
        {add.isError && <p className="text-[12px] mt-2" style={{ color: 'var(--crm-danger)' }}>{errMsg(add.error)}</p>}
        {add.data?.existingCustomer && <p className="text-[12px] mt-2">This phone already belongs to a customer, so the lead was marked as ordered.</p>}
      </Card>
      <DataTable head={['Name', 'Phone', 'Source', 'Created (IST)', 'Stage']} empty="No leads yet. Add one above."
        rows={(data?.items ?? []).map((l: any) => [l.name, formatPhone(l.phone), l.source, when(l.createdAt),
          <select key={l._id} aria-label={`Stage for ${l.name}`} value={l.stage} onChange={e => move.mutate({ id: l._id, stage: e.target.value })} className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--crm-line)' }}>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>])} />
      {move.isError && <p className="text-[12px]" style={{ color: 'var(--crm-danger)' }}>{errMsg(move.error)}</p>}
    </ReportPage>
  );
}
