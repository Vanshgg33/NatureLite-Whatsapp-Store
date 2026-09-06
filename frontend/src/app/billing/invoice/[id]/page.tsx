'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Printer, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'text-green-700 bg-green-50 border-green-200',
  partial: 'text-amber-700 bg-amber-50 border-amber-200',
  unpaid: 'text-red-700 bg-red-50 border-red-200',
};

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoPrint = searchParams.get('print') === '1';

  const { data: bill, isLoading, isError } = useQuery({
    queryKey: ['billing-bill', id],
    queryFn: () => api.getBillingBill(id),
  });

  useEffect(() => {
    if (bill && autoPrint) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [bill, autoPrint]);

  if (isLoading) return <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center text-gray-400">Loading invoice…</div>;
  if (isError || !bill) return <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center text-red-500">Invoice not found.</div>;

  return (
    <>
      {/* Print controls — hidden when printing */}
      <div className="print:hidden flex items-center gap-3 p-4 border-b bg-white">
        <Button variant="ghost" size="sm" onClick={() => router.push('/billing/customers')} className="text-gray-600">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button size="sm" onClick={() => window.print()} className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white">
          <Printer className="h-4 w-4 mr-1.5" /> Print Invoice
        </Button>
        <span className={`ml-auto text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_STYLE[bill.paymentStatus]}`}>
          {bill.paymentStatus === 'paid' ? 'Paid' : bill.paymentStatus === 'partial' ? 'Partially Paid' : 'Unpaid'}
        </span>
      </div>

      {/* Invoice — printed */}
      <div className="min-h-screen bg-[#faf9f6] print:bg-white flex justify-center py-8 print:py-0">
        <div
          id="invoice"
          className="bg-white w-[210mm] min-h-[297mm] p-10 print:p-8 shadow-sm print:shadow-none"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-2xl font-bold text-[#1E3D2B]">Nature Lite Foods</h1>
              <p className="text-sm text-gray-500 mt-0.5">Experience Centre, Bilaspur</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-800">TAX INVOICE</p>
              <p className="text-sm text-gray-500 mt-1">#{bill.invoiceNo}</p>
              <p className="text-sm text-gray-500">{fmtDate(bill.createdAt)}</p>
            </div>
          </div>

          {/* Bill to / Bill tag */}
          <div className="flex justify-between gap-8 mb-8">
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bill To</p>
              <p className="font-semibold text-gray-800">{bill.customerName}</p>
              <p className="text-sm text-gray-600">{bill.customerPhone}</p>
              {bill.customerGstNo && <p className="text-sm text-gray-600">GSTIN: {bill.customerGstNo}</p>}
              {bill.billingAddress && <p className="text-sm text-gray-600 mt-1">{bill.billingAddress}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Order Type</p>
              <span className="text-sm font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-700">{bill.orderTag}</span>
            </div>
          </div>

          {/* Items table */}
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="bg-[#1E3D2B] text-white">
                <th className="text-left px-3 py-2 rounded-l-lg font-medium">#</th>
                <th className="text-left px-3 py-2 font-medium">Product</th>
                <th className="text-left px-3 py-2 font-medium">HSN</th>
                <th className="text-center px-3 py-2 font-medium">Qty</th>
                <th className="text-right px-3 py-2 font-medium">Price</th>
                <th className="text-right px-3 py-2 font-medium">GST%</th>
                <th className="text-right px-3 py-2 font-medium">Taxable</th>
                <th className="text-right px-3 py-2 rounded-r-lg font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((item: any, i: number) => (
                <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800">{item.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{item.sku}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{item.hsnCode || '—'}</td>
                  <td className="px-3 py-2 text-center">{item.qty}</td>
                  <td className="px-3 py-2 text-right">{fmt(item.unitPrice)}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{item.gstRate}%</td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmt(item.taxableAmount)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal (taxable)</span>
                <span>{fmt(bill.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>GST</span>
                <span>{fmt(bill.totalGst)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2 text-gray-900">
                <span>Grand Total</span>
                <span>{fmt(bill.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Amount Paid</span>
                <span className="text-green-600">{fmt(bill.amountPaid)}</span>
              </div>
              {bill.amountDue > 0 && (
                <div className="flex justify-between text-sm font-semibold text-red-600">
                  <span>Balance Due</span>
                  <span>{fmt(bill.amountDue)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {bill.notes && (
            <div className="border-t pt-4 mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-600">{bill.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t pt-6 flex justify-between items-end text-xs text-gray-400">
            <div>
              <p className="font-medium text-gray-600 mb-0.5">Thank you for your purchase!</p>
              <p>Nature Lite Foods · Experience Centre · Bilaspur</p>
            </div>
            <div className="text-right">
              <p>For Nature Lite Foods</p>
              <div className="h-10 mt-2 border-b border-gray-300 w-28"></div>
              <p className="mt-1">Authorised Signatory</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 0; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
