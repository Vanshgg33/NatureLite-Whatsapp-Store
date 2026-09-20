// frontend/src/app/crm/customers/[id]/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Phone, MessageCircle, ChevronLeft, ShoppingBag, PhoneCall } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const SEGMENT_COLORS: Record<string, string> = {
  'New': 'bg-blue-50 text-blue-700',
  'Active': 'bg-green-50 text-green-700',
  'Due Soon': 'bg-amber-50 text-amber-700',
  'Overdue': 'bg-red-50 text-red-700',
  'At Risk': 'bg-orange-50 text-orange-700',
  'Dormant': 'bg-gray-100 text-gray-600',
  'Lost': 'bg-gray-50 text-gray-400',
};

const OUTCOME_OPTIONS = ['connected', 'ordered', 'no_answer', 'not_interested', 'callback'];

function HealthGauge({ segment }: { segment: string }) {
  const color = ['Active', 'New'].includes(segment) ? 'bg-green-400'
    : ['Due Soon', 'Overdue'].includes(segment) ? 'bg-amber-400'
    : 'bg-red-400';
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full', color)} />;
}

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN'); }
function fmtDate(d: string | Date) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

export default function Customer360Page() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'timeline' | 'orders'>('timeline');
  const [callOutcome, setCallOutcome] = useState('');
  const [callNotes, setCallNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['crm-customer360', id],
    queryFn: () => api.getCrmCustomer360(id),
  });

  const { mutate: logCall, isPending: logging } = useMutation({
    mutationFn: () => api.logCrmCall({ customerId: id, outcome: callOutcome, notes: callNotes }),
    onSuccess: () => {
      toast({ title: 'Call logged' });
      setCallOutcome('');
      setCallNotes('');
      qc.invalidateQueries({ queryKey: ['crm-customer360', id] });
    },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });

  if (isLoading) return (
    <div className="flex justify-center py-24">
      <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { user, stats, calls = [], orders = [] } = data ?? {};

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b bg-white px-5 py-4">
        <Link href="/crm/customers" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ChevronLeft className="h-4 w-4" /> Customers
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-[#D4A017]/10 flex items-center justify-center text-[#7C5C1E] font-bold text-base">
            {(user?.name ?? user?.phone ?? '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold text-gray-900">{user?.name ?? user?.phone}</h1>
              {stats?.isVip && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">VIP</span>}
              {stats?.segment && (
                <span className={cn('flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium', SEGMENT_COLORS[stats.segment] ?? 'bg-gray-100')}>
                  <HealthGauge segment={stats.segment} />
                  {stats.segment}
                </span>
              )}
            </div>
            <p className="text-[12px] text-gray-500 mt-0.5">{user?.phone}</p>
          </div>
          <div className="flex gap-2">
            {user?.phone && <a href={`tel:${user.phone}`} className="h-9 w-9 rounded-full bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center"><Phone className="h-4 w-4" /></a>}
            {user?.phone && <a href={`https://wa.me/91${user.phone}`} target="_blank" rel="noreferrer" className="h-9 w-9 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center"><MessageCircle className="h-4 w-4" /></a>}
          </div>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: stats + log call */}
        <div className="space-y-4">
          {/* Stats card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 gap-3">
            {[
              { label: 'LTV', value: fmt(stats?.ltv ?? 0) },
              { label: 'AOV', value: fmt(stats?.aov ?? 0) },
              { label: 'Orders', value: String(user?.totalOrders ?? 0) },
              { label: 'Cycle', value: `${stats?.personalCycle ?? '—'}d` },
              { label: 'Top Product', value: stats?.topProduct || '—' },
              { label: 'Top Category', value: stats?.topCategory || '—' },
              { label: 'Last Order', value: fmtDate(user?.lastOrderAt) },
              { label: 'Next Due', value: fmtDate(stats?.predictedReorderDate) },
            ].map(s => (
              <div key={s.label}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
                <p className="text-sm font-semibold text-gray-800 truncate">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Log call */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><PhoneCall className="h-4 w-4 text-[#D4A017]" /> Log Call</h3>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOME_OPTIONS.map(o => (
                <button
                  key={o}
                  onClick={() => setCallOutcome(o)}
                  className={cn(
                    'text-[11px] py-1.5 px-2 rounded-md border font-medium transition-colors',
                    callOutcome === o ? 'bg-[#1A3625] text-white border-transparent' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {o.replace('_', ' ')}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Notes…"
              value={callNotes}
              onChange={e => setCallNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
            />
            <button
              onClick={() => callOutcome && logCall()}
              disabled={!callOutcome || logging}
              className="w-full py-2 rounded-md bg-[#1A3625] text-white text-sm font-medium hover:bg-[#1A3625]/90 disabled:opacity-40 transition-colors"
            >
              {logging ? 'Saving…' : 'Save Call'}
            </button>
          </div>
        </div>

        {/* Right: timeline */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl">
          <div className="flex border-b">
            {(['timeline', 'orders'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  'flex-1 py-3 text-[12px] font-medium capitalize transition-colors',
                  activeTab === t ? 'text-[#7C5C1E] border-b-2 border-[#D4A017]' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {t === 'timeline' ? 'Call History' : 'Orders'}
              </button>
            ))}
          </div>
          <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {activeTab === 'timeline' ? (
              calls.length ? calls.map((c: any) => (
                <div key={c._id} className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-[#D4A017]/10 flex items-center justify-center text-[#7C5C1E] text-[10px] font-bold flex-shrink-0 mt-0.5">
                    {(c.agentId?.name ?? 'A')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-medium capitalize text-gray-800">{c.outcome.replace('_', ' ')}</span>
                      <span className="text-[10px] text-gray-400">{fmtDate(c.createdAt)}</span>
                      {c.agentId?.name && <span className="text-[10px] text-gray-400">· {c.agentId.name}</span>}
                    </div>
                    {c.notes && <p className="text-[11px] text-gray-500 mt-0.5">{c.notes}</p>}
                  </div>
                </div>
              )) : <p className="text-sm text-gray-400 text-center py-8">No calls logged yet</p>
            ) : (
              orders.length ? orders.map((o: any) => (
                <div key={o._id} className="flex items-center gap-3">
                  <ShoppingBag className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-gray-800">#{o.orderNumber}</p>
                    <p className="text-[11px] text-gray-500">{fmtDate(o.createdAt)} · {fmt(o.total)}</p>
                  </div>
                </div>
              )) : <p className="text-sm text-gray-400 text-center py-8">No orders found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
