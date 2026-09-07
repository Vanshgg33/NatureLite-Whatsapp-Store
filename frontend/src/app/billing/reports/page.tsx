'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Download, ChevronDown, ChevronRight, ArrowUpDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

// ── Constants ────────────────────────────────────────────────────────────────

const ORDER_TAGS = ['B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Wholesale', 'Retail'];

const TAG_COLORS: Record<string, string> = {
  B2B: 'bg-blue-100 text-blue-700',
  Transport: 'bg-orange-100 text-orange-700',
  'Home Delivery': 'bg-teal-100 text-teal-700',
  'Store/Retail': 'bg-purple-100 text-purple-700',
  Wholesale: 'bg-amber-100 text-amber-700',
  Retail: 'bg-pink-100 text-pink-700',
};

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function startOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function toISO(date: string, time: string, sec = '00') {
  return date ? `${date}T${time}:${sec}+05:30` : undefined;
}

// ── CSV export ───────────────────────────────────────────────────────────────

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r =>
    r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportProducts(data: any[]) {
  const rows: (string | number)[][] = [
    ['SKU', 'Product Name', 'HSN', 'Qty Sold', 'Sale Value (₹)', 'Unique Customers', 'Avg Rate (₹)'],
    ...data.map(r => [r.sku, r.name, r.hsnCode || '', r.totalQty, r.totalValue, r.uniqueCustomerCount, Number((r.avgRate ?? 0).toFixed(2))]),
  ];
  downloadCSV(`product-sales-${today()}.csv`, rows);
}

function exportCustomers(data: any[]) {
  const rows: (string | number)[][] = [
    ['Customer', 'Phone', 'Address', 'SKU', 'Product', 'Qty', 'Value (₹)'],
  ];
  for (const c of data) {
    for (const p of c.products) {
      rows.push([c.customerName, c.customerPhone, c.billingAddress || '', p.sku, p.name, p.qty, p.value]);
    }
  }
  downloadCSV(`customer-sales-${today()}.csv`, rows);
}

// ── Filter bar ───────────────────────────────────────────────────────────────

interface FilterState {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  orderTag: string;
  productSku: string;
}

const PRESETS = [
  { label: 'All time', start: '', end: '' },
  { label: 'Today', start: today(), end: today() },
  { label: 'This week', start: startOfWeek(), end: today() },
  { label: 'This month', start: startOfMonth(), end: today() },
  { label: 'Last 30 days', start: daysAgo(30), end: today() },
];

function FilterBar({ filters, onChange }: { filters: FilterState; onChange: (f: FilterState) => void }) {
  const set = (k: keyof FilterState, v: string) => onChange({ ...filters, [k]: v });

  const activePreset = PRESETS.find(p => p.start === filters.startDate && p.end === filters.endDate)?.label;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      {/* Quick presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => onChange({ ...filters, startDate: p.start, endDate: p.end, startTime: '00:00', endTime: '23:59' })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activePreset === p.label
                ? 'bg-[#2d7a4f] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date/filter row */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">From date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={e => set('startDate', e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Time from</label>
          <input
            type="time"
            value={filters.startTime}
            onChange={e => set('startTime', e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">To date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={e => set('endDate', e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Time to</label>
          <input
            type="time"
            value={filters.endTime}
            onChange={e => set('endTime', e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Order tag</label>
          <select
            value={filters.orderTag}
            onChange={e => set('orderTag', e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f] bg-white"
          >
            <option value="">All tags</option>
            {ORDER_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Filter by SKU</label>
          <input
            type="text"
            value={filters.productSku}
            onChange={e => set('productSku', e.target.value)}
            placeholder="e.g. NL-001"
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f] w-32"
          />
        </div>
      </div>
    </div>
  );
}

// ── Product table ─────────────────────────────────────────────────────────────

function ProductReport({ data, loading }: { data: any[]; loading: boolean }) {
  const [sortBy, setSortBy] = useState<'totalValue' | 'totalQty'>('totalValue');

  const sorted = useMemo(() =>
    [...data].sort((a, b) => b[sortBy] - a[sortBy]),
    [data, sortBy],
  );

  const totalValue = data.reduce((s, r) => s + r.totalValue, 0);
  const totalQty = data.reduce((s, r) => s + r.totalQty, 0);

  if (loading) return <Spinner />;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* summary strip */}
      <div className="flex gap-6 px-5 py-3 border-b bg-gray-50 text-sm">
        <span className="text-gray-500">{data.length} products</span>
        <span className="font-semibold text-gray-800">{fmt(totalValue)} total</span>
        <span className="text-gray-500">{totalQty.toLocaleString('en-IN')} units</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">#</th>
              <th className="text-left px-4 py-3 font-medium">Product</th>
              <th className="text-left px-4 py-3 font-medium">SKU</th>
              <th className="text-left px-4 py-3 font-medium">HSN</th>
              <th className="text-right px-4 py-3 font-medium">
                <button
                  onClick={() => setSortBy('totalQty')}
                  className={`flex items-center gap-1 ml-auto ${sortBy === 'totalQty' ? 'text-[#2d7a4f]' : ''}`}
                >
                  Qty <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="text-right px-4 py-3 font-medium">
                <button
                  onClick={() => setSortBy('totalValue')}
                  className={`flex items-center gap-1 ml-auto ${sortBy === 'totalValue' ? 'text-[#2d7a4f]' : ''}`}
                >
                  Value <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="text-right px-4 py-3 font-medium">Customers</th>
              <th className="text-right px-4 py-3 font-medium">Avg Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-gray-400 py-12">No sales in this period.</td>
              </tr>
            )}
            {sorted.map((r, i) => (
              <tr key={`${r.sku}:${r.name}`} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{r.sku}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{r.hsnCode || '—'}</td>
                <td className="px-4 py-3 text-right font-mono">{r.totalQty.toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmt(r.totalValue)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{r.uniqueCustomerCount}</td>
                <td className="px-4 py-3 text-right text-gray-500">{fmt(r.avgRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Customer table ────────────────────────────────────────────────────────────

function CustomerReport({ data, loading }: { data: any[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const totalValue = data.reduce((s, r) => s + r.totalValue, 0);

  if (loading) return <Spinner />;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex gap-6 px-5 py-3 border-b bg-gray-50 text-sm">
        <span className="text-gray-500">{data.length} customers</span>
        <span className="font-semibold text-gray-800">{fmt(totalValue)} total</span>
      </div>

      <div className="divide-y divide-gray-50">
        {data.length === 0 && (
          <div className="text-center text-gray-400 py-12">No sales in this period.</div>
        )}
        {data.map((c, i) => {
          const isOpen = expanded.has(c._id?.toString() ?? i.toString());
          const key = c._id?.toString() ?? i.toString();
          return (
            <div key={key}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                onClick={() => toggle(key)}
              >
                <span className="text-xs text-gray-400 w-6 shrink-0">{i + 1}</span>
                <div className="h-8 w-8 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-sm shrink-0">
                  {c.customerName?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 text-sm">{c.customerName}</div>
                  <div className="text-xs text-gray-400">{c.customerPhone}{c.billingAddress ? ` · ${c.billingAddress}` : ''}</div>
                </div>
                <div className="text-right shrink-0 mr-2">
                  <div className="font-semibold text-gray-800 text-sm">{fmt(c.totalValue)}</div>
                  <div className="text-xs text-gray-400">{c.totalQty} units</div>
                </div>
                {isOpen
                  ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                }
              </button>

              {isOpen && (
                <div className="bg-gray-50 border-t border-gray-100 px-4 pb-3 pt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 uppercase tracking-wide">
                        <th className="text-left pb-1.5 font-medium pr-4">SKU</th>
                        <th className="text-left pb-1.5 font-medium pr-4">Product</th>
                        <th className="text-right pb-1.5 font-medium pr-4">Qty</th>
                        <th className="text-right pb-1.5 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {c.products.map((p: any, pi: number) => (
                        <tr key={pi}>
                          <td className="py-1.5 pr-4 font-mono text-gray-500">{p.sku}</td>
                          <td className="py-1.5 pr-4 text-gray-700">{p.name}</td>
                          <td className="py-1.5 pr-4 text-right text-gray-600">{p.qty}</td>
                          <td className="py-1.5 text-right font-semibold text-gray-800">{fmt(p.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 border-2 border-[#2d7a4f] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SalesReportsPage() {
  const [tab, setTab] = useState<'product' | 'customer'>('product');
  const [filters, setFilters] = useState<FilterState>({
    startDate: '',
    endDate: '',
    startTime: '00:00',
    endTime: '23:59',
    orderTag: '',
    productSku: '',
  });

  const productParams = useMemo(() => ({
    startDate: toISO(filters.startDate, filters.startTime),
    endDate: toISO(filters.endDate, filters.endTime, '59'),
    orderTag: filters.orderTag || undefined,
  }), [filters]);

  const customerParams = useMemo(() => ({
    ...productParams,
    productSku: filters.productSku || undefined,
  }), [productParams, filters.productSku]);

  const productQuery = useQuery({
    queryKey: ['billing-report-products', productParams],
    queryFn: () => api.getBillingProductReport(productParams),
    enabled: tab === 'product',
  });

  const customerQuery = useQuery({
    queryKey: ['billing-report-customers', customerParams],
    queryFn: () => api.getBillingCustomerReport(customerParams),
    enabled: tab === 'customer',
  });

  const productData: any[] = productQuery.data ?? [];
  const customerData: any[] = customerQuery.data ?? [];

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header
        title="Sales Reports"
        description="Product-wise and customer-wise sales analysis"
        icon={<BarChart3 className="h-6 w-6 text-[#2d7a4f]" />}
        action={
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5"
            onClick={() => {
              if (tab === 'product') exportProducts(productData);
              else exportCustomers(customerData);
            }}
            disabled={tab === 'product' ? productData.length === 0 : customerData.length === 0}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <FilterBar filters={filters} onChange={setFilters} />

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm w-fit">
          {(['product', 'customer'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-[#2d7a4f] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t === 'product' ? 'By Product' : 'By Customer'}
            </button>
          ))}
        </div>

        {/* Active tag badge */}
        {filters.orderTag && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Filtered by:</span>
            <span className={`px-2.5 py-0.5 rounded-full font-medium ${TAG_COLORS[filters.orderTag] ?? 'bg-gray-100 text-gray-600'}`}>
              {filters.orderTag}
            </span>
          </div>
        )}

        {tab === 'product' && (
          <ProductReport data={productData} loading={productQuery.isLoading} />
        )}
        {tab === 'customer' && (
          <CustomerReport data={customerData} loading={customerQuery.isLoading} />
        )}
      </div>
    </div>
  );
}
