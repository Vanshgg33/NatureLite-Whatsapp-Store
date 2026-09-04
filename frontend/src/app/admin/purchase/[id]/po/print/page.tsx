'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';

function fmtIST(d: string | Date) {
  return new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }) + ' IST';
}

export default function PrintPOPage() {
  const params = useParams<{ id: string }>();
  const { data: req, isLoading } = useQuery({
    queryKey: ['purchase-request', params.id],
    queryFn: () => api.getPurchaseRequest(params.id),
  });

  useEffect(() => {
    if (req?.po) setTimeout(() => window.print(), 800);
  }, [req]);

  if (isLoading) return <div className="flex items-center justify-center h-screen text-sm text-gray-500">Loading PO…</div>;
  if (!req?.po) return <div className="flex items-center justify-center h-screen text-sm text-gray-500">No PO found for this request.</div>;

  const { po } = req;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 20mm; }
          body * { visibility: hidden; }
          #po-print-content, #po-print-content * { visibility: visible; }
          #po-print-content { position: fixed; top: 0; left: 0; width: 100%; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        body { font-family: Arial, sans-serif; }
      `}</style>

      {/* Print button */}
      <div className="no-print fixed top-4 right-4 flex gap-2">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-[#1E3D2B] text-white text-sm rounded-lg shadow"
        >
          Print / Save PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg shadow"
        >
          Close
        </button>
      </div>

      <div id="po-print-content" className="max-w-[210mm] mx-auto p-8 text-sm text-gray-800">
        {/* Header */}
        <div className="bg-[#1E3D2B] text-white px-8 py-5 -mx-8 -mt-8 mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-wide">NATURE LITE FOODS</h1>
            <p className="text-[#E8A838] text-xs mt-0.5 italic">Sehat ka Vaada Swaad ke Saath</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/70">Purchase Order</p>
            <p className="text-lg font-bold text-[#E8A838]">{po.poNo}</p>
          </div>
        </div>

        {/* PO meta */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Vendor</p>
            <p className="font-semibold">{po.vendorName}</p>
            {po.vendorPhone && <p className="text-gray-600">{po.vendorPhone}</p>}
            {po.vendorAddress && <p className="text-gray-600 whitespace-pre-line">{po.vendorAddress}</p>}
          </div>
          <div className="text-right">
            <div className="mb-2">
              <p className="text-xs text-gray-500">Ref Request</p>
              <p className="font-mono font-semibold">{req.reqNo}</p>
            </div>
            <div className="mb-2">
              <p className="text-xs text-gray-500">PO Date</p>
              <p>{po.createdAt ? fmtIST(po.createdAt) : '—'}</p>
            </div>
            {po.expectedDelivery && (
              <div className="mb-2">
                <p className="text-xs text-gray-500">Expected Delivery</p>
                <p>{fmtIST(po.expectedDelivery)}</p>
              </div>
            )}
            {po.terms && (
              <div>
                <p className="text-xs text-gray-500">Payment Terms</p>
                <p>{po.terms}</p>
              </div>
            )}
          </div>
        </div>

        {/* Requested by */}
        <div className="mb-4 text-xs text-gray-500">
          Requested by: <span className="text-gray-700 font-medium">{req.requestedByName}</span>
          {req.note && <span className="ml-4">Note: <em>{req.note}</em></span>}
        </div>

        {/* Items table */}
        <table className="w-full border-collapse mb-6">
          <thead>
            <tr className="bg-[#1E3D2B] text-white text-xs">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Material</th>
              <th className="px-3 py-2 text-right">Qty (KG)</th>
              <th className="px-3 py-2 text-right">Rate/KG (₹)</th>
              <th className="px-3 py-2 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {(po.items || req.items).map((item: any, i: number) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                <td className="px-3 py-2 border border-gray-200 text-gray-500">{i + 1}</td>
                <td className="px-3 py-2 border border-gray-200 font-medium">{item.materialName}</td>
                <td className="px-3 py-2 border border-gray-200 text-right font-mono">{item.qtyKg}</td>
                <td className="px-3 py-2 border border-gray-200 text-right font-mono">
                  {item.ratePerKg ? item.ratePerKg.toLocaleString('en-IN') : '—'}
                </td>
                <td className="px-3 py-2 border border-gray-200 text-right font-mono font-semibold">
                  {item.amount ? item.amount.toLocaleString('en-IN') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#1E3D2B] text-white">
              <td colSpan={4} className="px-3 py-2 text-right font-semibold">Grand Total</td>
              <td className="px-3 py-2 text-right font-bold font-mono text-[#E8A838]">
                ₹{po.totalAmount?.toLocaleString('en-IN')}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-8 mt-10">
          {['Prepared By', 'Approved By', 'Received By'].map((label) => (
            <div key={label} className="text-center">
              <div className="border-t border-gray-400 pt-2 mt-8">
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          Generated by Nature Lite Purchase FMS · {fmtIST(new Date())}
        </div>
      </div>
    </>
  );
}
