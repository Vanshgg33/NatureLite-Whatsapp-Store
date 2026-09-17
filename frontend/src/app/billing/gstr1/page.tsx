'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

function fmt(n: number) {
  return (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRs(n: number) { return '₹' + fmt(n); }

function currentMonth() { return new Date().toISOString().slice(0, 7); }

function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function downloadXlsx(filename: string, sheets: { name: string; rows: (string | number)[][] }[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, filename);
}

type GstrTab = 'b2b' | 'b2c' | 'hsn' | 'doc';

export default function Gstr1Page() {
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState<GstrTab>('hsn');

  const { data, isLoading } = useQuery({
    queryKey: ['billing-gstr1', month],
    queryFn: () => api.getBillingGstr1(month),
  });

  const b2b: any[] = data?.b2b ?? [];
  const b2cSummary: any[] = data?.b2cSummary ?? [];
  const hsnSummary: any[] = data?.hsnSummary ?? [];
  const doc = data?.docSummary ?? {};

  const hsnTotals = useMemo(() => hsnSummary.reduce((s: any, r: any) => ({
    qty: s.qty + r.qty,
    taxableAmount: s.taxableAmount + r.taxableAmount,
    gstAmount: s.gstAmount + r.gstAmount,
    totalValue: s.totalValue + r.totalValue,
    b2bTaxable: s.b2bTaxable + r.b2bTaxable,
    b2cTaxable: s.b2cTaxable + r.b2cTaxable,
  }), { qty: 0, taxableAmount: 0, gstAmount: 0, totalValue: 0, b2bTaxable: 0, b2cTaxable: 0 }), [hsnSummary]);

  const b2bTotals = useMemo(() => b2b.reduce((s: any, r: any) => ({
    subtotal: s.subtotal + r.subtotal,
    totalGst: s.totalGst + r.totalGst,
    grandTotal: s.grandTotal + r.grandTotal,
  }), { subtotal: 0, totalGst: 0, grandTotal: 0 }), [b2b]);

  const b2cTotals = useMemo(() => b2cSummary.reduce((s: any, r: any) => ({
    taxableAmount: s.taxableAmount + r.taxableAmount,
    gstAmount: s.gstAmount + r.gstAmount,
    totalValue: s.totalValue + r.totalValue,
  }), { taxableAmount: 0, gstAmount: 0, totalValue: 0 }), [b2cSummary]);

  function exportAll() {
    downloadXlsx(`gstr1-${month}.xlsx`, [
      {
        name: 'HSN Summary',
        rows: [
          ['HSN Code', 'GST Rate (%)', 'Total Qty', 'Taxable Amount', 'GST Amount', 'Total Value', 'B2B Taxable', 'B2C Taxable'],
          ...hsnSummary.map(r => [r.hsnCode || '', r.gstRate, r.qty, fmt(r.taxableAmount), fmt(r.gstAmount), fmt(r.totalValue), fmt(r.b2bTaxable), fmt(r.b2cTaxable)]),
        ],
      },
      {
        name: 'B2B Invoices',
        rows: [
          ['Invoice No', 'Date', 'Customer GSTIN', 'Customer Name', 'Taxable Value', 'CGST', 'SGST', 'Invoice Value'],
          ...b2b.map(r => [r.invoiceNo, new Date(r.createdAt).toLocaleDateString('en-IN'), r.customerGstNo, r.customerName, fmt(r.subtotal), fmt(r.totalGst / 2), fmt(r.totalGst / 2), fmt(r.grandTotal)]),
        ],
      },
      {
        name: 'B2C Summary',
        rows: [
          ['GST Rate (%)', 'Taxable Amount', 'CGST', 'SGST', 'Total Value'],
          ...b2cSummary.map(r => [r.gstRate, fmt(r.taxableAmount), fmt(r.cgst), fmt(r.sgst), fmt(r.totalValue)]),
        ],
      },
      {
        name: 'Document Summary',
        rows: [
          ['Description', 'Value'],
          ['Total Invoices', doc.totalInvoices ?? 0],
          ['Cancelled Invoices', doc.cancelledInvoices ?? 0],
          ['First Invoice', doc.firstInvoiceNo ?? ''],
          ['Last Invoice', doc.lastInvoiceNo ?? ''],
        ],
      },
    ]);
  }

  const TABS: { key: GstrTab; label: string }[] = [
    { key: 'hsn', label: 'HSN Summary' },
    { key: 'b2b', label: 'B2B Invoices' },
    { key: 'b2c', label: 'B2C Summary' },
    { key: 'doc', label: 'Document Summary' },
  ];

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header
        title="GSTR-1 Summary"
        description="GST return report for selected month"
        icon={<FileSpreadsheet className="h-6 w-6 text-[#2d7a4f]" />}
        action={
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={exportAll} disabled={!data}>
            <Download className="h-3.5 w-3.5" /> Export Excel
          </Button>
        }
      />

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Month picker */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-end gap-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Month</label>
              <input
                type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
              />
            </div>
            <div className="text-sm text-gray-500 pb-1.5">{monthLabel(month)}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-[#2d7a4f] text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >{t.label}</button>
          ))}
        </div>

        {/* Summary cards (only for hsn tab) */}
        {!isLoading && tab === 'hsn' && hsnSummary.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Taxable Value', value: fmtRs(hsnTotals.taxableAmount) },
              { label: 'Total GST', value: fmtRs(hsnTotals.gstAmount) },
              { label: 'B2B Taxable', value: fmtRs(hsnTotals.b2bTaxable) },
              { label: 'B2C Taxable', value: fmtRs(hsnTotals.b2cTaxable) },
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
          ) : (
            <>
              {/* HSN Summary */}
              {tab === 'hsn' && (
                hsnSummary.length === 0
                  ? <div className="text-center py-16 text-gray-400">No sales data for {monthLabel(month)}.</div>
                  : <div className="overflow-x-auto">
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
                        {hsnSummary.map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
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
                          <td className="px-4 py-3 text-right text-gray-700">{hsnTotals.qty}</td>
                          <td className="px-4 py-3 text-right text-gray-800">{fmtRs(hsnTotals.taxableAmount)}</td>
                          <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(hsnTotals.gstAmount)}</td>
                          <td className="px-4 py-3 text-right text-gray-800">{fmtRs(hsnTotals.totalValue)}</td>
                          <td className="px-4 py-3 text-right text-blue-600">{fmtRs(hsnTotals.b2bTaxable)}</td>
                          <td className="px-4 py-3 text-right text-pink-600">{fmtRs(hsnTotals.b2cTaxable)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
              )}

              {/* B2B Invoices */}
              {tab === 'b2b' && (
                b2b.length === 0
                  ? <div className="text-center py-16 text-gray-400">No B2B invoices for {monthLabel(month)}.</div>
                  : <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                          <th className="text-left px-4 py-3 font-medium">Invoice No</th>
                          <th className="text-left px-4 py-3 font-medium">Date</th>
                          <th className="text-left px-4 py-3 font-medium">Customer GSTIN</th>
                          <th className="text-left px-4 py-3 font-medium">Customer Name</th>
                          <th className="text-right px-4 py-3 font-medium">Taxable Value</th>
                          <th className="text-right px-4 py-3 font-medium">CGST</th>
                          <th className="text-right px-4 py-3 font-medium">SGST</th>
                          <th className="text-right px-4 py-3 font-medium">Invoice Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {b2b.map((r: any) => (
                          <tr key={r._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.invoiceNo}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                            <td className="px-4 py-3 font-mono text-blue-700 text-xs">{r.customerGstNo}</td>
                            <td className="px-4 py-3 font-medium text-gray-800">{r.customerName}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{fmtRs(r.subtotal)}</td>
                            <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(r.totalGst / 2)}</td>
                            <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(r.totalGst / 2)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmtRs(r.grandTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-xs font-semibold">
                        <tr>
                          <td className="px-4 py-3 text-gray-600" colSpan={4}>Total ({b2b.length} invoices)</td>
                          <td className="px-4 py-3 text-right text-gray-800">{fmtRs(b2bTotals.subtotal)}</td>
                          <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(b2bTotals.totalGst / 2)}</td>
                          <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(b2bTotals.totalGst / 2)}</td>
                          <td className="px-4 py-3 text-right text-gray-800">{fmtRs(b2bTotals.grandTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
              )}

              {/* B2C Summary */}
              {tab === 'b2c' && (
                b2cSummary.length === 0
                  ? <div className="text-center py-16 text-gray-400">No B2C sales for {monthLabel(month)}.</div>
                  : <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                          <th className="text-left px-4 py-3 font-medium">GST Rate</th>
                          <th className="text-right px-4 py-3 font-medium">Taxable Amount</th>
                          <th className="text-right px-4 py-3 font-medium">CGST</th>
                          <th className="text-right px-4 py-3 font-medium">SGST</th>
                          <th className="text-right px-4 py-3 font-medium">Total Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {b2cSummary.map((r: any) => (
                          <tr key={r.gstRate} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-semibold text-gray-800">{r.gstRate}%</td>
                            <td className="px-4 py-3 text-right text-gray-700">{fmtRs(r.taxableAmount)}</td>
                            <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(r.cgst)}</td>
                            <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(r.sgst)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmtRs(r.totalValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-xs font-semibold">
                        <tr>
                          <td className="px-4 py-3 text-gray-600">Total</td>
                          <td className="px-4 py-3 text-right text-gray-800">{fmtRs(b2cTotals.taxableAmount)}</td>
                          <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(b2cTotals.gstAmount / 2)}</td>
                          <td className="px-4 py-3 text-right text-[#2d7a4f]">{fmtRs(b2cTotals.gstAmount / 2)}</td>
                          <td className="px-4 py-3 text-right text-gray-800">{fmtRs(b2cTotals.totalValue)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
              )}

              {/* Document Summary */}
              {tab === 'doc' && (
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-500 font-medium">{monthLabel(month)}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Invoices Issued', value: String(doc.totalInvoices ?? 0), color: 'text-gray-800' },
                      { label: 'Cancelled', value: String(doc.cancelledInvoices ?? 0), color: 'text-red-600' },
                      { label: 'First Invoice', value: doc.firstInvoiceNo ?? '—', color: 'text-gray-600' },
                      { label: 'Last Invoice', value: doc.lastInvoiceNo ?? '—', color: 'text-gray-600' },
                    ].map(c => (
                      <div key={c.label} className="bg-gray-50 rounded-xl p-4">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">{c.label}</p>
                        <p className={`text-lg font-bold font-mono ${c.color}`}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
