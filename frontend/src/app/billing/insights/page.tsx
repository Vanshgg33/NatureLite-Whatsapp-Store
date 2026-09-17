'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, TrendingUp, AlertCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TAG_COLORS: Record<string, string> = {
  B2B: 'bg-blue-100 text-blue-700',
  Transport: 'bg-orange-100 text-orange-700',
  'Home Delivery': 'bg-teal-100 text-teal-700',
  'Store/Retail': 'bg-purple-100 text-purple-700',
  Wholesale: 'bg-amber-100 text-amber-700',
  Retail: 'bg-pink-100 text-pink-700',
};

const MEDALS = ['🥇', '🥈', '🥉'];

type DatePreset = 'all' | 'month' | 'last30' | 'week' | 'custom';

function getRange(preset: DatePreset, customStart: string, customEnd: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'all') return {};
  if (preset === 'custom') return { startDate: customStart || undefined, endDate: customEnd ? customEnd + 'T23:59:59' : undefined };
  if (preset === 'month') return { startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
  if (preset === 'last30') { const d = new Date(today); d.setDate(d.getDate() - 30); return { startDate: d.toISOString() }; }
  if (preset === 'week') {
    const w = new Date(today); w.setDate(w.getDate() - w.getDay() + (w.getDay() === 0 ? -6 : 1));
    return { startDate: w.toISOString() };
  }
  return {};
}

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: 'month', label: 'This Month' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'week', label: 'This Week' },
  { key: 'custom', label: 'Custom' },
];

function Podium({ data, valueKey, fmtFn }: { data: any[]; valueKey: string; fmtFn: (v: number) => string }) {
  if (data.length < 3) return null;
  return (
    <div className="grid grid-cols-3 gap-3">
      {[data[1], data[0], data[2]].map((c, i) => {
        const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
        return (
          <div key={c._id ?? c.customerId} className={`bg-white rounded-2xl shadow-sm p-4 text-center ${rank === 1 ? '' : rank === 2 ? 'mt-4' : 'mt-8'}`}>
            <div className="text-2xl mb-1">{MEDALS[rank - 1]}</div>
            <div className="h-10 w-10 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-sm mx-auto mb-2">
              {c.name?.[0]?.toUpperCase() ?? c.customerName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="font-semibold text-gray-800 text-sm truncate">{c.name ?? c.customerName}</div>
            <div className="text-xs text-gray-400 mt-0.5">{c.phone ?? c.customerPhone}</div>
            <div className="font-bold text-[#2d7a4f] mt-1 text-sm">{fmtFn(c[valueKey])}</div>
          </div>
        );
      })}
    </div>
  );
}

function BillHistoryModal({ customer, onClose }: { customer: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['billing-bills-customer', customer._id ?? customer.customerId],
    queryFn: () => api.getBillingBills({ customerId: customer._id ?? customer.customerId, limit: 100 }),
  });
  const bills = data?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="font-semibold text-gray-800">{customer.name ?? customer.customerName}</h3>
            <p className="text-xs text-gray-400">{customer.phone ?? customer.customerPhone} · {bills.length} bills</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 border-2 border-[#2d7a4f] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : bills.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No bills found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr className="text-[11px] text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-semibold">Invoice</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Total</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bills.map((b: any) => (
                  <tr key={b._id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{b.invoiceNo}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-800 tabular-nums">{fmt(b.grandTotal)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : b.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {b.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

type Tab = 'orders' | 'value' | 'product';

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [preset, setPreset] = useState<DatePreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const range = useMemo(() => getRange(preset, customStart, customEnd), [preset, customStart, customEnd]);

  const { data: byValue = [], isLoading: loadingValue } = useQuery({
    queryKey: ['billing-insights-value', range],
    queryFn: () => api.getBillingTopCustomers(200, 'totalPurchase', range.startDate, range.endDate),
  });

  const { data: byOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['billing-insights-orders', range],
    queryFn: () => api.getBillingTopCustomers(200, 'orderCount', range.startDate, range.endDate),
  });

  const { data: byProduct = [], isLoading: loadingProduct } = useQuery({
    queryKey: ['billing-insights-products', range],
    queryFn: () => api.getBillingTopProductPerCustomer(range.startDate, range.endDate),
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: 'orders', label: 'Most Orders' },
    { key: 'value', label: 'Highest Value' },
    { key: 'product', label: 'Top Product' },
  ];

  const isLoading = tab === 'value' ? loadingValue : tab === 'orders' ? loadingOrders : loadingProduct;

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header
        title="Customer Insights"
        description="Rankings by value, orders, and top products"
        icon={<Trophy className="h-6 w-6 text-amber-500" />}
      />

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Date filter */}
        <div className="flex flex-wrap items-center gap-2">
          {DATE_PRESETS.map(p => (
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

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-[#2d7a4f] text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >{t.label}</button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 border-2 border-[#2d7a4f] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Podium */}
            {tab === 'value' && byValue.length >= 3 && (
              <Podium data={byValue} valueKey="totalPurchase" fmtFn={fmt} />
            )}
            {tab === 'orders' && byOrders.length >= 3 && (
              <Podium data={byOrders} valueKey="orderCount" fmtFn={n => `${n} orders`} />
            )}
            {tab === 'product' && byProduct.length >= 3 && (
              <Podium data={byProduct} valueKey="topProductQty" fmtFn={n => `${n} units`} />
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {tab === 'value' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-medium">#</th>
                        <th className="text-left px-4 py-3 font-medium">Customer</th>
                        <th className="text-left px-4 py-3 font-medium">Tags</th>
                        <th className="text-right px-4 py-3 font-medium">Orders</th>
                        <th className="text-right px-4 py-3 font-medium">Total Purchased</th>
                        <th className="text-right px-4 py-3 font-medium">Avg Order</th>
                        <th className="text-right px-4 py-3 font-medium">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {byValue.length === 0
                        ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No data for this period</td></tr>
                        : byValue.map((c: any, i: number) => (
                        <tr key={c._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCustomer(c)}>
                          <td className="px-4 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-xs shrink-0">{c.name?.[0]?.toUpperCase() ?? '?'}</div>
                              <div>
                                <div className="font-medium text-gray-800">{c.name}</div>
                                <div className="text-xs text-gray-400">{c.phone}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(c.tags ?? []).map((t: string) => (
                                <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TAG_COLORS[t] ?? 'bg-gray-100 text-gray-600'}`}>{t}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{c.orderCount}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800 flex items-center justify-end gap-1">
                            {i < 3 && <TrendingUp className="h-3 w-3 text-green-500" />}
                            {fmt(c.totalPurchase)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">{fmt(c.orderCount > 0 ? c.totalPurchase / c.orderCount : 0)}</td>
                          <td className="px-4 py-3 text-right">
                            {c.outstanding > 0
                              ? <span className="text-red-600 font-medium flex items-center justify-end gap-1"><AlertCircle className="h-3 w-3" />{fmt(c.outstanding)}</span>
                              : <span className="text-green-500 text-xs">Nil</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'orders' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-medium">#</th>
                        <th className="text-left px-4 py-3 font-medium">Customer</th>
                        <th className="text-left px-4 py-3 font-medium">Tags</th>
                        <th className="text-right px-4 py-3 font-medium">Orders</th>
                        <th className="text-right px-4 py-3 font-medium">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {byOrders.length === 0
                        ? <tr><td colSpan={5} className="text-center py-12 text-gray-400">No data for this period</td></tr>
                        : byOrders.map((c: any, i: number) => (
                        <tr key={c._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCustomer(c)}>
                          <td className="px-4 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-xs shrink-0">{c.name?.[0]?.toUpperCase() ?? '?'}</div>
                              <div>
                                <div className="font-medium text-gray-800">{c.name}</div>
                                <div className="text-xs text-gray-400">{c.phone}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(c.tags ?? []).map((t: string) => (
                                <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TAG_COLORS[t] ?? 'bg-gray-100 text-gray-600'}`}>{t}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-[#2d7a4f] text-base">{c.orderCount}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmt(c.totalPurchase)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'product' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-medium">#</th>
                        <th className="text-left px-4 py-3 font-medium">Customer</th>
                        <th className="text-left px-4 py-3 font-medium">Top Product</th>
                        <th className="text-right px-4 py-3 font-medium">Qty</th>
                        <th className="text-right px-4 py-3 font-medium">% of Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {byProduct.length === 0
                        ? <tr><td colSpan={5} className="text-center py-12 text-gray-400">No data for this period</td></tr>
                        : byProduct.map((c: any, i: number) => (
                        <tr key={c.customerId} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCustomer({ _id: c.customerId, name: c.customerName, phone: c.customerPhone })}>
                          <td className="px-4 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-xs shrink-0">{c.customerName?.[0]?.toUpperCase() ?? '?'}</div>
                              <div>
                                <div className="font-medium text-gray-800">{c.customerName}</div>
                                <div className="text-xs text-gray-400">{c.customerPhone}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{c.topProductName}</div>
                            <div className="text-xs text-gray-400 font-mono">{c.topSku}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">{c.topProductQty}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                <div className="bg-[#2d7a4f] h-1.5 rounded-full" style={{ width: `${Math.min(c.pct, 100)}%` }} />
                              </div>
                              <span className="text-gray-500 text-xs w-10 text-right">{c.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selectedCustomer && <BillHistoryModal customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />}
    </div>
  );
}
