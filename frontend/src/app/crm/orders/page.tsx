'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR, formatPhone } from '@/lib/crm/format';
import { downloadCsv } from '@/lib/crm/csv';

const STATUSES = ['', 'placed', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded'];
const istDate = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export default function CrmOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm-orders', search, status, page],
    queryFn: () => api.getCrmOrders({ search: search || undefined, status: status || undefined, page }),
  });
  const { data: health } = useQuery({ queryKey: ['crm-sync-health'], queryFn: () => api.getCrmSyncHealth() });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? 25)));

  return (
    <div className="min-h-full p-7 space-y-5" style={{ background: 'var(--crm-sand)' }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Receipt className="h-5 w-5" style={{ color: 'var(--crm-gold)' }} />
        <h1 className="text-[20px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Orders</h1>
        <div className="ml-auto flex gap-2">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
            <Search className="h-3.5 w-3.5" style={{ color: 'var(--crm-muted)' }} />
            <input aria-label="Search orders" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Order no, name, phone…" className="bg-transparent text-[13px] focus:outline-none w-48" />
          </label>
          <select aria-label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl text-[13px]" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>
      </div>

      {health && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            ['Orders (90d)', health.orders.count],
            ['Revenue (90d)', formatINR(health.orders.revenue)],
            ['Bills (90d)', health.bills.count],
            ['Orders without a customer', health.unmatchedOrders],
          ] as [string, string | number][]).map(([k, v]) => (
            <div key={k} className="rounded-[14px] p-4" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
              <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{k}</p>
              <p className="text-[20px] font-semibold crm-tabular" style={{ color: 'var(--crm-forest)' }}>{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-[14px] overflow-x-auto" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left" style={{ color: 'var(--crm-muted)' }}>
              {['Order', 'Customer', 'Status', 'Payment', 'Source', 'Total', 'Placed (IST)'].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center">Loading…</td></tr>}
            {isError && <tr><td colSpan={7} className="px-4 py-8 text-center">Could not load orders.</td></tr>}
            {!isLoading && !isError && !data?.items.length && <tr><td colSpan={7} className="px-4 py-8 text-center">No orders match.</td></tr>}
            {data?.items.map((o: any) => (
              <tr key={o._id} style={{ borderTop: '1px solid var(--crm-line)' }}>
                <td className="px-4 py-2.5 font-mono">{o.orderNumber}</td>
                <td className="px-4 py-2.5">{o.shippingAddress?.name}<br /><span style={{ color: 'var(--crm-muted)' }}>{formatPhone(o.shippingAddress?.phone)}</span></td>
                <td className="px-4 py-2.5">{o.status}</td>
                <td className="px-4 py-2.5">{o.paymentMethod} · {o.paymentStatus}</td>
                <td className="px-4 py-2.5">{o.source}</td>
                <td className="px-4 py-2.5 crm-tabular">{formatINR(o.total)}</td>
                <td className="px-4 py-2.5">{istDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3 text-[13px]">
        <button disabled={!data?.items.length} className="underline disabled:opacity-40" onClick={() => downloadCsv('crm-orders.csv', [
          ['Order', 'Customer', 'Phone', 'Status', 'Payment', 'Source', 'Total', 'Placed'],
          ...(data?.items ?? []).map((o: any) => [o.orderNumber, o.shippingAddress?.name, o.shippingAddress?.phone, o.status, `${o.paymentMethod} ${o.paymentStatus}`, o.source, o.total, o.createdAt]),
        ])}>Export this page (CSV)</button>
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ background: 'var(--crm-paper)' }}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ background: 'var(--crm-paper)' }}>Next</button>
      </div>
    </div>
  );
}
