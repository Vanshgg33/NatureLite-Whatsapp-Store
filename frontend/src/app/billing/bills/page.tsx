'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Receipt, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, useDebouncedValue } from '@/lib/utils';
import { istDateKey, istDaysAgoKey, istWeekStartKey, istMonthKey, startOfDayIST, endOfDayIST } from '@/lib/time';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/billing/channel';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 50;
const fmt = (n: number) => '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DatePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';
const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All time' }, { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }, { key: 'custom', label: 'Custom' },
];
const STATUSES = [
  { key: '', label: 'All' }, { key: 'paid', label: 'Paid' }, { key: 'partial', label: 'Partial' }, { key: 'unpaid', label: 'Unpaid' },
];
const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700', partial: 'bg-amber-100 text-amber-700', unpaid: 'bg-red-100 text-red-700',
};

function getRange(preset: DatePreset, customStart: string, customEnd: string) {
  const at = (key: string) => startOfDayIST(key).toISOString();
  if (preset === 'custom') return { startDate: customStart ? at(customStart) : undefined, endDate: customEnd ? endOfDayIST(customEnd).toISOString() : undefined };
  if (preset === 'today') return { startDate: at(istDateKey()) };
  if (preset === 'yesterday') return { startDate: at(istDaysAgoKey(1)), endDate: at(istDateKey()) };
  if (preset === 'week') return { startDate: at(istWeekStartKey()) };
  if (preset === 'month') return { startDate: at(`${istMonthKey()}-01`) };
  return {};
}

const chip = (on: boolean) => cn('px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
  on ? 'bg-[#2d7a4f] text-white border-[#2d7a4f]' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50');

export default function BillsPage() {
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [preset, setPreset] = useState<DatePreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [page, setPage] = useState(1);

  const range = useMemo(() => getRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  useEffect(() => { setPage(1); }, [dSearch, status, channel, range]);

  const { data, isLoading } = useQuery({
    queryKey: ['billing-bills', dSearch, status, channel, range, page],
    queryFn: () => api.getBillingBills({
      search: dSearch || undefined, paymentStatus: status || undefined, orderTag: channel || undefined,
      ...range, page, limit: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });

  const bills: any[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-full bg-[#faf9f6]">
      <Header title="Bills" description="Every bill with search and filters" icon={<Receipt className="h-5 w-5 text-[#2d7a4f]" />} />

      <div className="p-4 md:p-5 space-y-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice no, customer name or phone…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map(s => <button key={s.key} onClick={() => setStatus(s.key)} className={chip(status === s.key)}>{s.label}</button>)}
            <span className="w-px bg-gray-200 mx-1" />
            <select value={channel} onChange={e => setChannel(e.target.value)}
              className="border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white text-gray-600">
              <option value="">All channels</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map(p => <button key={p.key} onClick={() => setPreset(p.key)} className={chip(preset === p.key)}>{p.label}</button>)}
            {preset === 'custom' && (
              <>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs" />
                <span className="text-xs text-gray-400">to</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs" />
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="text-left px-3 py-2">Invoice</th><th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Customer</th><th className="text-left px-3 py-2">Channel</th>
                <th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">Paid</th>
                <th className="text-right px-3 py-2">Due</th><th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b._id} className="border-t border-gray-100 hover:bg-[#f7faf8]">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/billing/invoice/${b._id}`} className="text-[#2d7a4f] hover:underline">{b.invoiceNo}</Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(b.invoiceDate ?? b.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-gray-800">{b.customerName}</div>
                    <div className="text-[11px] text-gray-400 font-mono">{b.customerPhone}</div>
                  </td>
                  <td className="px-3 py-2">
                    {b.orderTag && <span className={cn('text-[10px] px-1.5 py-0.5 rounded', CHANNEL_COLORS[b.orderTag] ?? 'bg-gray-100 text-gray-600')}>{b.orderTag}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(b.grandTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmt(b.amountPaid)}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', b.amountDue > 0 && 'text-red-600 font-medium')}>{fmt(b.amountDue)}</td>
                  <td className="px-3 py-2">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full capitalize', STATUS_STYLE[b.paymentStatus] ?? 'bg-gray-100 text-gray-600')}>{b.paymentStatus}</span>
                  </td>
                </tr>
              ))}
              {!isLoading && bills.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-400">No bills match these filters</td></tr>
              )}
              {isLoading && <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-400">Loading…</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{total} bill{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span>Page {page} of {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
