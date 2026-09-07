'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

function fmt(n: number) {
  return (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRs(n: number) { return '₹' + fmt(n); }

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportGstr1(data: any[], month: string) {
  const rows: (string | number)[][] = [
    ['HSN Code', 'GST Rate (%)', 'Total Qty', 'Taxable Amount', 'GST Amount', 'Total Value', 'B2B Taxable', 'B2B GST', 'B2C Taxable', 'B2C GST'],
    ...data.map(r => [r.hsnCode || '', r.gstRate, r.qty, fmt(r.taxableAmount), fmt(r.gstAmount), fmt(r.totalValue), fmt(r.b2bTaxable), fmt(r.b2bGst), fmt(r.b2cTaxable), fmt(r.b2cGst)]),
  ];
  downloadCSV(`gstr1-${month}.csv`, rows);
}

export default function Gstr1Page() {
  const [month, setMonth] = useState(currentMonth());

  const { data = [], isLoading } = useQuery({
    queryKey: ['billing-gstr1', month],
    queryFn: () => api.getBillingGstr1(month),
  });

  const totals = useMemo(() => data.reduce((s: any, r: any) => ({
    taxableAmount: s.taxableAmount + r.taxableAmount,
    gstAmount: s.gstAmount + r.gstAmount,
    totalValue: s.totalValue + r.totalValue,
    b2bTaxable: s.b2bTaxable + r.b2bTaxable,
    b2cTaxable: s.b2cTaxable + r.b2cTaxable,
    qty: s.qty + r.qty,
  }), { taxableAmount: 0, gstAmount: 0, totalValue: 0, b2bTaxable: 0, b2cTaxable: 0, qty: 0 }), [data]);

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header
        title="GSTR-1 Summary"
        description="HSN-wise sales summary for GST filing"
        icon={<FileSpreadsheet className="h-6 w-6 text-[#2d7a4f]" />}
        action={
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5"
            onClick={() => exportGstr1(data, month)}
            disabled={data.length === 0}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Month picker + summary */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-end gap-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Month</label>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
              />
            </div>
            <div className="text-sm text-gray-500 pb-1.5">{monthLabel(month)}</div>
          </div>
        </div>

        {/* Summary cards */}
        {!isLoading && data.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Taxable Value', value: fmtRs(totals.taxableAmount) },
              { label: 'Total GST', value: fmtRs(totals.gstAmount) },
              { label: 'B2B Taxable', value: fmtRs(totals.b2bTaxable) },
              { label: 'B2C Taxable', value: fmtRs(totals.b2cTaxable) },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">{c.label}</p>
                <p className="text-lg font-bold text-gray-800">{c.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 border-2 border-[#2d7a4f] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-16 text-gray-400">No sales data for {monthLabel(month)}.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">HSN</th>
                    <th className="text-right px-4 py-3 font-medium">GST %</th>
                    <th className="text-right px-4 py-3 font-medium">Qty</th>
                    <th className="text-right px-4 py-3 font-medium">Taxable</th>
                    <th className="text-right px-4 py-3 font-medium">GST</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                    <th className="text-right px-4 py-3 font-medium">B2B Taxable</th>
                    <th className="text-right px-4 py-3 font-medium">B2C Taxable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-gray-700">{r.hsnCode || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{r.gstRate}%</td>
                      <td className="px-4 py-3 text-right text-gray-600">{r.qty}</td>
                      <td className="px-4 py-3 text-right text-gray-800">{fmtRs(r.taxableAmount)}</td>
                      <td className="px-4 py-3 text-right font-medium text-[#2d7a4f]">{fmtRs(r.gstAmount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmtRs(r.totalValue)}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{fmtRs(r.b2bTaxable)}</td>
                      <td className="px-4 py-3 text-right text-pink-600">{fmtRs(r.b2cTaxable)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-xs font-semibold">
                  <tr>
                    <td className="px-4 py-3 text-gray-600" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-right text-gray-700">{totals.qty}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{fmtRs(totals.taxableAmount)}</td>
                    <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(totals.gstAmount)}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{fmtRs(totals.totalValue)}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{fmtRs(totals.b2bTaxable)}</td>
                    <td className="px-4 py-3 text-right text-pink-600">{fmtRs(totals.b2cTaxable)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
