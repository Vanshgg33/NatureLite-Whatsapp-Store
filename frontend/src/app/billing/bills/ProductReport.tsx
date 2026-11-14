'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, X } from 'lucide-react';
import { fetchAllBills } from './PartyReport';

/** Product report: total quantity sold per product across the bills the current filters match. */
export function ProductReport({ filters, onClose }: { filters: Record<string, any>; onClose: () => void }) {
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['billing-bills-party', filters], // same data as the party report, so it is fetched once
    queryFn: () => fetchAllBills(filters),
  });

  const rows = useMemo(() => {
    const prod = String(filters.productName ?? '').toLowerCase();
    const minQty = Number(filters.minQty) || 0;
    const byProduct = new Map<string, { name: string; unit: string; qty: number; bills: number }>();
    for (const b of bills) {
      const seen = new Set<string>();
      for (const i of b.items ?? []) {
        // with a product / min-qty filter on, count only the lines that matched it (the bill matched because of one of them)
        if (prod && !String(i.name).toLowerCase().includes(prod)) continue;
        if (minQty && !(i.qty >= minQty)) continue;
        const unit = i.unit ?? '';
        const key = `${i.name}|${unit}`;
        const r = byProduct.get(key) ?? { name: i.name, unit, qty: 0, bills: 0 };
        r.qty += Number(i.qty) || 0;
        if (!seen.has(key)) { r.bills++; seen.add(key); }
        byProduct.set(key, r);
      }
    }
    return Array.from(byProduct.values()).sort((a, b) => b.qty - a.qty);
  }, [bills, filters.productName, filters.minQty]);

  const q = (n: number) => String(Math.round(n * 1000) / 1000); // no float noise like 0.30000000000000004

  const exportCSV = () => {
    const headers = ['PRODUCT NAME', 'QUANTITY', 'UNIT', 'NO. OF BILLS'];
    const lines = rows.map(r => [r.name, q(r.qty), r.unit, r.bills].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...lines].join('\r\n');
    // BOM ensures Google Sheets reads UTF-8 correctly (Indian names, special chars)
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-report-${filters.startDate?.slice(0, 10) ?? 'all'}-to-${filters.endDate?.slice(0, 10) ?? 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900 text-sm">
          Product Report
          {!isLoading && <span className="ml-2 text-xs font-normal text-gray-400">{rows.length} products from {bills.length} bills (current filters)</span>}
        </h2>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button onClick={exportCSV}
              className="inline-flex items-center gap-2 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors">
              <FileDown className="h-3.5 w-3.5" /> Export to Google Sheets
            </button>
          )}
          <button onClick={onClose} aria-label="Close product report" className="p-1.5 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Quantity</th>
              <th className="text-right px-3 py-2">Bills</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.name}|${r.unit}`} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-800">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{q(r.qty)} <span className="text-xs text-gray-400">{r.unit}</span></td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.bills}</td>
              </tr>
            ))}
            {isLoading && <tr><td colSpan={3} className="px-3 py-10 text-center text-sm text-gray-400">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={3} className="px-3 py-10 text-center text-sm text-gray-400">No products match these filters</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
