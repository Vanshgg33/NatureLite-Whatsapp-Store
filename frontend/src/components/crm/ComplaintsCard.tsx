'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Pill } from '@/components/crm/Pill';

const CATEGORIES: Record<string, string> = {
  damaged: 'Damaged / leaked', wrong_item: 'Wrong item', missing_item: 'Missing item', quality: 'Quality / expiry',
  late_delivery: 'Late delivery', delivery_behaviour: 'Delivery behaviour', payment: 'Payment / billing', other: 'Other',
};
const OPEN = ['new', 'investigating', 'awaiting_customer', 'reopened'];

/** Complaint history for a customer plus a form to log one taken over the phone or in store. */
export function ComplaintsCard({ customerId, orders }: { customerId: string; orders: any[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState('damaged');
  const [orderId, setOrderId] = useState('');
  const [description, setDescription] = useState('');

  const { data: complaints = [] } = useQuery({
    queryKey: ['crm-complaints', 'customer', customerId],
    queryFn: () => api.getCrmCustomerComplaints(customerId),
  });
  const { mutate: create, isPending } = useMutation({
    mutationFn: () => api.createCrmComplaint({ customerId, orderId: orderId || undefined, category, description }),
    onSuccess: (c: any) => {
      toast({ title: `Ticket ${c.ticketNo} created` });
      setAdding(false); setDescription(''); setOrderId('');
      qc.invalidateQueries({ queryKey: ['crm-complaints'] });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  });

  const openCount = complaints.filter((c: any) => OPEN.includes(c.status)).length;

  return (
    <div className="crm-card-v2 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--crm-ink)' }}>
          Complaints {openCount > 0 && <Pill variant="danger" className="ml-1">{openCount} open</Pill>}
        </p>
        <button onClick={() => setAdding(a => !a)} className="text-[12px] font-semibold" style={{ color: 'var(--crm-blue)' }}>
          {adding ? 'Cancel' : '+ Log complaint'}
        </button>
      </div>

      {adding && (
        <div className="space-y-2">
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--crm-line)' }}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={orderId} onChange={e => setOrderId(e.target.value)} className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--crm-line)' }}>
            <option value="">No specific order</option>
            {orders.map((o: any) => <option key={o._id} value={o._id}>{o.orderNumber}</option>)}
          </select>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What did the customer say?"
            className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--crm-line)' }} />
          <button disabled={isPending} onClick={() => create()} className="w-full py-2 rounded-xl text-[12px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>
            {isPending ? 'Saving…' : 'Create ticket'}
          </button>
        </div>
      )}

      {complaints.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>No complaints on record.</p>
      ) : (
        <ul className="space-y-1.5">
          {complaints.slice(0, 5).map((c: any) => (
            <li key={c._id} className="text-[12px] flex items-center justify-between gap-2">
              <Link href="/crm/complaints" className="font-semibold hover:underline" style={{ color: 'var(--crm-ink)' }}>{c.ticketNo}</Link>
              <span className="truncate flex-1" style={{ color: 'var(--crm-muted)' }}>{CATEGORIES[c.category]}</span>
              <Pill variant={OPEN.includes(c.status) ? 'warn' : 'success'}>{c.status.replace(/_/g, ' ')}</Pill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
