'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/crm/format';
import { ReportPage, DataTable, Card } from '@/components/crm/ReportPage';

const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);

export default function CrmAcquisitionPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(thisMonth());
  const [channel, setChannel] = useState('');
  const [amount, setAmount] = useState('');
  const { data, isLoading, isError } = useQuery({ queryKey: ['crm-acquisition', month], queryFn: () => api.getCrmAcquisition(month) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['crm-acquisition'] });
  const add = useMutation({
    mutationFn: () => api.addCrmSpend({ channel, month, amount: Number(amount) }),
    onSuccess: () => { setChannel(''); setAmount(''); refresh(); },
  });
  const del = useMutation({ mutationFn: (id: string) => api.deleteCrmSpend(id), onSuccess: refresh });
  const valid = channel.trim() && amount !== '' && Number(amount) >= 0;

  return (
    <ReportPage title="Acquisition & CAC" icon={TrendingUp} loading={isLoading} error={isError}
      note="A customer's channel is the source of their first order. Spend is entered by hand. Lead funnel needs the Leads module (not built).">
      <label className="text-[13px] flex items-center gap-2">
        Month <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--crm-line)' }} />
      </label>
      <DataTable head={['Channel', 'Spend', 'New customers', 'CAC', 'Avg LTV', 'LTV : CAC']} csv="acquisition" empty="No spend or new customers this month."
        rows={(data?.channels ?? []).map((c: any) => [c.channel, formatINR(c.spend), c.newCustomers, c.cac == null ? '—' : formatINR(c.cac), formatINR(c.avgLtv), c.ltvToCac ?? '—'])} />
      <Card>
        <h2 className="font-semibold mb-2" style={{ color: 'var(--crm-ink)' }}>Spend entries for {month}</h2>
        {(data?.spend ?? []).map((s: any) => (
          <p key={s._id} className="text-[13px] flex gap-3">
            <span>{s.channel}</span><span className="crm-tabular">{formatINR(s.amount)}</span>
            <button onClick={() => del.mutate(s._id)} className="underline" style={{ color: 'var(--crm-danger)' }}>Remove</button>
          </p>
        ))}
        <form className="flex gap-2 mt-3 flex-wrap" onSubmit={e => { e.preventDefault(); if (valid) add.mutate(); }}>
          <input aria-label="Channel" placeholder="Channel (e.g. instagram)" value={channel} onChange={e => setChannel(e.target.value)} className="px-3 py-2 rounded-xl text-[13px]" style={{ border: '1px solid var(--crm-line)' }} />
          <input aria-label="Amount" type="number" min={0} placeholder="₹ amount" value={amount} onChange={e => setAmount(e.target.value)} className="px-3 py-2 rounded-xl text-[13px] w-32" style={{ border: '1px solid var(--crm-line)' }} />
          <button disabled={!valid || add.isPending} className="px-4 py-2 rounded-xl text-[13px] font-medium disabled:opacity-40" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>Add spend</button>
        </form>
        {add.isError && <p className="text-[12px] mt-2" style={{ color: 'var(--crm-danger)' }}>Could not save spend.</p>}
      </Card>
    </ReportPage>
  );
}
