'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, IndianRupee, Clock, CheckCircle, ArrowDownUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysSince(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
type SortMode = 'amount' | 'alpha';

function getRange(preset: DatePreset, customStart: string, customEnd: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'custom') return { startDate: customStart || undefined, endDate: customEnd ? customEnd + 'T23:59:59' : undefined };
  if (preset === 'today') return { startDate: today.toISOString(), endDate: undefined };
  if (preset === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { startDate: y.toISOString(), endDate: today.toISOString() };
  }
  if (preset === 'week') {
    const w = new Date(today); w.setDate(w.getDate() - w.getDay() + (w.getDay() === 0 ? -6 : 1));
    return { startDate: w.toISOString(), endDate: undefined };
  }
  if (preset === 'month') {
    return { startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), endDate: undefined };
  }
  return {};
}

function PayModal({ bill, onClose }: { bill: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(bill.amountDue));
  const [err, setErr] = useState('');

  const pay = useMutation({
    mutationFn: () => api.recordBillingPayment(bill._id, Number(amount)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-dues'] }); onClose(); },
    onError: () => setErr('Payment failed'),
  });

  const max = bill.amountDue;
  const val = Number(amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl border border-gray-200 shadow-2xl w-full max-w-sm mx-4 p-5">
        <h3 className="font-semibold text-gray-800 mb-1">Record Payment</h3>
        <p className="text-sm text-gray-500 mb-3">{bill.customerName} · <span className="font-mono text-xs">{bill.invoiceNo}</span></p>
        <div className="bg-red-50 rounded-lg p-3 mb-3 flex justify-between items-center">
          <span className="text-sm text-red-700 font-medium">Amount Due</span>
          <span className="text-xl font-bold text-red-600 tabular-nums">{fmt(bill.amountDue)}</span>
        </div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Payment Amount</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
          <input
            type="number" value={amount} min={0.01} max={max} step={0.01}
            onChange={e => { setAmount(e.target.value); setErr(''); }}
            className="w-full pl-7 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
            autoFocus
          />
        </div>
        {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={pay.isPending}>Cancel</Button>
          <Button
            className="flex-1 bg-[#2d7a4f] hover:bg-[#245f3d] text-white"
            onClick={() => {
              if (!val || val <= 0 || val > max) { setErr(`Enter between ₹0.01 and ${fmt(max)}`); return; }
              pay.mutate();
            }}
            disabled={pay.isPending}
          >{pay.isPending ? 'Saving…' : 'Record Payment'}</Button>
        </div>
      </div>
    </div>
  );
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
];

export default function DuesPage() {
  const [preset, setPreset] = useState<DatePreset>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('amount');
  const [payBill, setPayBill] = useState<any>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  const range = useMemo(() => getRange(preset, customStart, customEnd), [preset, customStart, customEnd]);

  const { data, isLoading } = useQuery({
    queryKey: ['billing-dues', range],
    queryFn: () => api.getBillingDues(range as any),
  });

  const bills = data?.bills ?? [];

  const byCustomer = useMemo(() => {
    const map: Record<string, { name: string; phone: string; outstanding: number; bills: any[] }> = {};
    for (const b of bills) {
      const key = b.customerId;
      if (!map[key]) map[key] = { name: b.customerName, phone: b.customerPhone, outstanding: 0, bills: [] };
      map[key].outstanding += b.amountDue;
      map[key].bills.push(b);
    }
    const list = Object.values(map);
    return sortMode === 'alpha'
      ? list.sort((a, b) => a.name.localeCompare(b.name))
      : list.sort((a, b) => b.outstanding - a.outstanding);
  }, [bills, sortMode]);

  const PRESET_LABEL = PRESETS.find(p => p.key === preset)?.label ?? '';

  return (
    <div className="min-h-full bg-[#faf9f6]">
      <Header
        title="Unpaid Dues"
        description="Outstanding and partially paid bills"
        icon={<AlertCircle className="h-5 w-5 text-red-500" />}
      />

      <div className="p-4 md:p-5 space-y-4">

        {/* ── Hero total ─────────────────────────────────────────────────────── */}
        <div className="bg-white border border-red-100 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
              Total Outstanding · {PRESET_LABEL}
            </p>
            <p className="text-4xl font-extrabold text-red-600 tabular-nums leading-none">
              {fmt(data?.totalDue ?? 0)}
            </p>
          </div>
          <div className="flex gap-4 sm:gap-6 shrink-0">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-500 tabular-nums">{data?.unpaid ?? 0}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mt-0.5">Unpaid</p>
            </div>
            <div className="w-px bg-gray-100 hidden sm:block" />
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-500 tabular-nums">{data?.partial ?? 0}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mt-0.5">Partial</p>
            </div>
            <div className="w-px bg-gray-100 hidden sm:block" />
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-700 tabular-nums">{byCustomer.length}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mt-0.5">Customers</p>
            </div>
          </div>
        </div>

        {/* ── Date filters ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 items-center">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p.key
                  ? 'bg-[#2d7a4f] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-[#2d7a4f] hover:text-[#2d7a4f]'
              }`}
            >{p.label}</button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]" />
            </div>
          )}
        </div>

        {/* ── Customer list ──────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* List header with sort toggle */}
          {byCustomer.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                {byCustomer.length} Customer{byCustomer.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={() => setSortMode(m => m === 'amount' ? 'alpha' : 'amount')}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#2d7a4f] transition-colors"
              >
                <ArrowDownUp className="h-3 w-3" />
                Sort: {sortMode === 'amount' ? 'Highest Due' : 'A → Z'}
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 border-2 border-[#2d7a4f] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : byCustomer.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-2" />
              <p className="text-gray-600 font-medium">No outstanding dues for this period</p>
              <p className="text-gray-400 text-sm mt-1">Try a wider date range</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {byCustomer.map(c => {
                const key = c.name + c.phone;
                const open = expandedCustomer === key;
                return (
                  <div key={key}>
                    {/* Customer row */}
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                      onClick={() => setExpandedCustomer(open ? null : key)}
                    >
                      <div className="h-9 w-9 rounded-full bg-red-50 flex items-center justify-center text-red-500 font-bold text-sm shrink-0">
                        {c.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 text-sm">{c.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {c.phone} · {c.bills.length} bill{c.bills.length > 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0 mr-2">
                        <div className="text-lg font-bold text-red-600 tabular-nums">{fmt(c.outstanding)}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">pending</div>
                      </div>
                      <span className="text-gray-300 text-xs">{open ? '▲' : '▼'}</span>
                    </button>

                    {/* Expanded bill list */}
                    {open && (
                      <div className="bg-gray-50 border-t border-gray-100 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[11px] text-gray-500 uppercase tracking-wide">
                              <th className="text-left px-5 py-2 font-semibold">Invoice</th>
                              <th className="text-left px-4 py-2 font-semibold">Date</th>
                              <th className="text-right px-4 py-2 font-semibold">Total</th>
                              <th className="text-right px-4 py-2 font-semibold">Paid</th>
                              <th className="text-right px-4 py-2 font-semibold">Due</th>
                              <th className="text-right px-4 py-2 font-semibold">Age</th>
                              <th className="px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {c.bills.map((b: any) => {
                              const days = daysSince(b.createdAt);
                              return (
                                <tr key={b._id} className="hover:bg-white transition-colors">
                                  <td className="px-5 py-2.5 font-mono text-xs text-gray-500">{b.invoiceNo}</td>
                                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                                    {new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums text-xs">{fmt(b.grandTotal)}</td>
                                  <td className="px-4 py-2.5 text-right text-green-600 tabular-nums text-xs">{fmt(b.amountPaid)}</td>
                                  <td className="px-4 py-2.5 text-right font-bold text-red-600 tabular-nums">{fmt(b.amountDue)}</td>
                                  <td className="px-4 py-2.5 text-right">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                      days > 30 ? 'bg-red-100 text-red-700'
                                      : days > 7 ? 'bg-orange-100 text-orange-700'
                                      : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                      {days}d
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <Button
                                      size="sm"
                                      className="text-xs h-7 bg-[#2d7a4f] hover:bg-[#245f3d] text-white"
                                      onClick={e => { e.stopPropagation(); setPayBill(b); }}
                                    >
                                      Pay
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {/* Customer subtotal */}
                          <tfoot className="border-t border-gray-200">
                            <tr className="bg-red-50/60">
                              <td colSpan={4} className="px-5 py-2 text-xs font-semibold text-gray-500">
                                Total for {c.name}
                              </td>
                              <td className="px-4 py-2 text-right font-bold text-red-600 tabular-nums">
                                {fmt(c.outstanding)}
                              </td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {payBill && <PayModal bill={payBill} onClose={() => setPayBill(null)} />}
    </div>
  );
}
