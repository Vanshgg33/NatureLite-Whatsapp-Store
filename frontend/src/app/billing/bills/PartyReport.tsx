'use client';

import { useQuery } from '@tanstack/react-query';
import { FileDown, X } from 'lucide-react';
import { api } from '@/lib/api';
import { billDate, billTime } from '@/lib/billing/datetime';

const fmt = (n: number) => '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const productsOf = (b: any): string[] => (b.items ?? []).map((i: any) => `${i.name} × ${i.qty}${i.unit ? ' ' + i.unit : ''}`);
const addressOf = (b: any) => b.shippingAddress || b.billingAddress || '';

/** Every bill the filters match (the API caps a page at 200, so walk the pages). Shared by the party and product reports. */
export async function fetchAllBills(filters: Record<string, any>) {
  const all: any[] = [];
  for (let page = 1; ; page++) {
    const r = await api.getBillingBills({ ...filters, page, limit: 200 });
    all.push(...r.items);
    if (all.length >= r.total || !r.items.length) return all;
  }
}

/** Party report: one row per bill (name, phone, address, products with qty, amount) for whatever the Bills filters currently match. */
export function PartyReport({ filters, onClose }: { filters: Record<string, any>; onClose: () => void }) {
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['billing-bills-party', filters],
    queryFn: () => fetchAllBills(filters),
  });

  const exportCSV = () => {
    const headers = ['DATE', 'TIME', 'CUSTOMER NAME', 'PHONE NO.', 'ADDRESS', 'PRODUCT NAME & QUANTITY', 'BILL AMOUNT'];
    const rows = bills.map((b: any) =>
      [billDate(b.invoiceDate ?? b.createdAt), billTime(b.createdAt), b.customerName ?? '—', b.customerPhone ?? '—', addressOf(b), productsOf(b).join('; '), b.grandTotal ?? 0]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\r\n');
    // BOM ensures Google Sheets reads UTF-8 correctly (Indian names, special chars)
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `party-report-${filters.startDate?.slice(0, 10) ?? 'all'}-to-${filters.endDate?.slice(0, 10) ?? 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900 text-sm">
          Party Report
          {!isLoading && <span className="ml-2 text-xs font-normal text-gray-400">{bills.length} {bills.length === 1 ? 'bill' : 'bills'} (current filters)</span>}
        </h2>
        <div className="flex items-center gap-2">
          {bills.length > 0 && (
            <button onClick={exportCSV}
              className="inline-flex items-center gap-2 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors">
              <FileDown className="h-3.5 w-3.5" /> Export to Google Sheets
            </button>
          )}
          <button onClick={onClose} aria-label="Close party report" className="p-1.5 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="text-left px-3 py-2">Date &amp; Time</th><th className="text-left px-3 py-2">Customer</th><th className="text-left px-3 py-2">Phone</th>
              <th className="text-left px-3 py-2">Address</th><th className="text-left px-3 py-2">Product &amp; Quantity</th>
              <th className="text-right px-3 py-2">Bill Amount</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b: any) => (
              <tr key={b._id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{billDate(b.invoiceDate ?? b.createdAt)}<div className="text-[11px] text-gray-400">{billTime(b.createdAt)}</div></td>
                <td className="px-3 py-2 text-gray-800">{b.customerName}</td>
                <td className="px-3 py-2 text-xs font-mono text-gray-500 whitespace-nowrap">{b.customerPhone}</td>
                <td className="px-3 py-2 text-xs text-gray-600 min-w-[180px]">{addressOf(b) || '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-700">{productsOf(b).map((p, i) => <div key={i}>{p}</div>)}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(b.grandTotal)}</td>
              </tr>
            ))}
            {isLoading && <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-gray-400">Loading…</td></tr>}
            {!isLoading && bills.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-gray-400">No bills match these filters</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
