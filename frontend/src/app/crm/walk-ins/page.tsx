'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/crm/format';
import { ReportPage, DataTable, Card, Stat, pctText } from '@/components/crm/ReportPage';

const when = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export default function CrmWalkinsPage() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(''); const [name, setName] = useState(''); const [interest, setInterest] = useState('');
  const { data, isLoading, isError } = useQuery({ queryKey: ['crm-walkins'], queryFn: () => api.getCrmWalkinStats() });
  const add = useMutation({
    mutationFn: () => api.addCrmWalkin({ phone, name, interest }),
    onSuccess: () => { setPhone(''); setName(''); setInterest(''); qc.invalidateQueries({ queryKey: ['crm-walkins'] }); },
  });
  const input = { border: '1px solid var(--crm-line)', minHeight: 44 }; // 44px touch target for counter staff
  return (
    <ReportPage title="Walk-ins" icon={Store} loading={isLoading} error={isError} note="Experience Centre visitors. Matching an existing customer is by phone. Linking a visit to its bill is not built.">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Today" value={data?.today ?? 0} />
        <Stat label="Last 30 days" value={data?.last30Days ?? 0} />
        <Stat label="Already customers" value={pctText(data?.existingCustomersPct)} />
      </div>
      <Card>
        <form className="flex gap-2 flex-wrap" onSubmit={e => { e.preventDefault(); add.mutate(); }}>
          <input aria-label="Phone" required inputMode="tel" placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} className="px-3 rounded-xl text-[15px]" style={input} />
          <input aria-label="Name" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} className="px-3 rounded-xl text-[15px]" style={input} />
          <input aria-label="Interest" placeholder="Interested in" value={interest} onChange={e => setInterest(e.target.value)} className="px-3 rounded-xl text-[15px]" style={input} />
          <button disabled={add.isPending} className="px-6 rounded-xl text-[15px] font-medium" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)', minHeight: 44 }}>Log walk-in</button>
        </form>
        {add.isError && <p className="text-[12px] mt-2" style={{ color: 'var(--crm-danger)' }}>{(add.error as any)?.response?.data?.message ?? 'Could not save.'}</p>}
      </Card>
      <DataTable head={['Phone', 'Name', 'Interest', 'Existing customer', 'When (IST)']} empty="No walk-ins logged yet."
        rows={(data?.recent ?? []).map((w: any) => [formatPhone(w.phone), w.name || '—', w.interest || '—', w.customerId ? 'Yes' : 'No', when(w.createdAt)])} />
    </ReportPage>
  );
}
