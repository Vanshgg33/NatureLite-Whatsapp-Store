'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, IndianRupee, Clock, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysSince(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function PayModal({ bill, onClose }: { bill: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(bill.amountDue));
  const [err, setErr] = useState('');

  const pay = useMutation({
    mutationFn: () => api.recordBillingPayment(bill._id, Number(amount)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-dues'] });
      onClose();
    },
    onError: () => setErr('Payment failed'),
  });

  const max = bill.amountDue;
  const val = Number(amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-sm mx-4 p-5">
        <h3 className="font-semibold text-gray-800 mb-1">Record Payment</h3>
        <p className="text-sm text-gray-500 mb-4">{bill.customerName} · {bill.invoiceNo}</p>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-gray-500">Amount due:</span>
          <span className="font-semibold text-red-600">{fmt(bill.amountDue)}</span>
        </div>
        <input
          type="number"
          value={amount}
          min={0.01}
          max={max}
          step={0.01}
          onChange={e => { setAmount(e.target.value); setErr(''); }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
        />
        {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={pay.isPending}>Cancel</Button>
          <Button
            className="flex-1 bg-[#2d7a4f] hover:bg-[#245f3d] text-white"
            onClick={() => {
              if (!val || val <= 0 || val > max) { setErr(`Enter amount between ₹0.01 and ${fmt(max)}`); return; }
              pay.mutate();
            }}
            disabled={pay.isPending}
          >
            {pay.isPending ? 'Saving…' : 'Record'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DuesPage() {
  const [payBill, setPayBill] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['billing-dues'],
    queryFn: () => api.getBillingDues(),
  });

  const bills = data?.bills ?? [];

  return (
    <div className="min-h-full">
      <Header
        title="Unpaid Dues"
        description="Outstanding and partially paid bills"
        icon={<AlertCircle className="h-5 w-5 text-red-500" />}
      />

      <div className="p-4 md:p-5 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Outstanding', value: fmt(data?.totalDue ?? 0), icon: IndianRupee, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Fully Unpaid', value: String(data?.unpaid ?? 0), icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Partially Paid', value: String(data?.partial ?? 0), icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          ].map(c => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 border-2 border-[#2d7a4f] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : bills.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">All clear — no outstanding dues</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-semibold">Invoice</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Customer</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Total</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Paid</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Due</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Age</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bills.map((b: any) => {
                    const days = daysSince(b.createdAt);
                    return (
                      <tr key={b._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{b.invoiceNo}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-800 text-sm">{b.customerName}</div>
                          <div className="text-xs text-gray-400 font-mono">{b.customerPhone}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums text-sm">{fmt(b.grandTotal)}</td>
                        <td className="px-4 py-2.5 text-right text-green-600 tabular-nums text-sm">{fmt(b.amountPaid)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-red-600 tabular-nums text-sm">{fmt(b.amountDue)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${days > 30 ? 'bg-red-100 text-red-700' : days > 7 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {days}d
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button size="sm" variant="outline" className="text-xs h-7 border-[#2d7a4f] text-[#2d7a4f] hover:bg-[#f0faf5]" onClick={() => setPayBill(b)}>
                            Pay
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {payBill && <PayModal bill={payBill} onClose={() => setPayBill(null)} />}
    </div>
  );
}
