'use client';
// Bill Edit History: who changed what on a bill, and when. One bill (invoice page) or all bills (/billing/edit-history).
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api } from '@/lib/api';

export const canEditBill = (can: (p: string) => boolean) => can('billing_new.edit') || can('billing_new.cancel');
export const isEditableBill = (b: any) => b?.status === 'active' && ['SALE', 'SALE_ORDER'].includes(b?.docType ?? 'SALE');

const when = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export function BillEditHistory({ billId, showBill = false }: { billId?: string; showBill?: boolean }) {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['billing-edit-history', billId ?? 'all'],
    queryFn: () => api.getBillingEditHistory(billId),
    staleTime: 30_000,
  });
  if (isLoading) return <p className="text-xs text-gray-400 py-3">Loading edit history…</p>;
  if (isError) return <p className="text-xs text-red-600 py-3">Could not load the edit history.</p>;
  if (!data.length) return <p className="text-xs text-gray-400 py-3">{billId ? 'This bill has not been edited.' : 'No bill has been edited yet.'}</p>;
  return (
    <ol className="space-y-3">
      {data.map((e: any) => (
        <li key={e._id} className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-b border-gray-100 text-xs">
            <History className="h-3.5 w-3.5 text-[#2d7a4f]" />
            {showBill && <Link href={`/billing/invoice/${e.billId}`} className="font-mono font-semibold text-[#2d7a4f] hover:underline">{e.invoiceNo || 'Bill'}</Link>}
            <span className="font-medium text-gray-800">{e.userName}</span>
            <span className="text-gray-500">{when(e.at)}</span>
            <span className="ml-auto text-gray-400">{e.changes.length} change{e.changes.length === 1 ? '' : 's'}</span>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {e.changes.map((c: any, i: number) => (
                <tr key={i} className="border-t border-gray-50 first:border-0 align-top">
                  <td className="px-3 py-1.5 font-medium text-gray-700 w-1/4">{c.label}</td>
                  <td className="px-3 py-1.5 text-gray-500 line-through decoration-gray-300 break-words">{c.from}</td>
                  <td className="px-3 py-1.5 text-gray-900 break-words">{c.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
      ))}
    </ol>
  );
}
