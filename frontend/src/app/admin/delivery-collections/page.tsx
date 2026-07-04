'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DeliveryLedgerRow, Order } from '@/types';
import { format, startOfDay } from 'date-fns';
import {
  Banknote,
  Smartphone,
  AlertCircle,
  Eye,
  CheckCircle2,
  X,
} from 'lucide-react';

const INR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
      <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function BreakdownDialog({
  row,
  startDate,
  endDate,
  onClose,
}: {
  row: DeliveryLedgerRow;
  startDate: string;
  endDate: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['delivery-breakdown', row.deliveryUserId, startDate, endDate],
    queryFn: () => api.getDeliveryBreakdown(row.deliveryUserId, startDate, endDate),
  });

  const settle = useMutation({
    mutationFn: (ids: string[]) => api.settleDeliveryCollection(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['delivery-breakdown', row.deliveryUserId, startDate, endDate] });
      const prev = qc.getQueryData(['delivery-breakdown', row.deliveryUserId, startDate, endDate]);
      qc.setQueryData(['delivery-breakdown', row.deliveryUserId, startDate, endDate], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((o: any) => ids.includes(o._id) ? { ...o, collectionStatus: 'settled' } : o);
      });
      return { prev };
    },
    onError: (_err: unknown, _ids, context: any) => {
      if (context?.prev) qc.setQueryData(['delivery-breakdown', row.deliveryUserId, startDate, endDate], context.prev);
    },
    onSuccess: () => {
      onClose();
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['delivery-ledger'] });
      qc.invalidateQueries({ queryKey: ['delivery-summary'] });
      qc.invalidateQueries({ queryKey: ['delivery-breakdown', row.deliveryUserId] });
    },
  });

  const pending = useMemo(() => orders.filter((o) => o.collectionStatus === 'pending'), [orders]);
  const allPendingIds = pending.map((o) => o._id);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === allPendingIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allPendingIds));
    }
  };

  const handleSettle = () => {
    if (selected.size === 0) return;
    settle.mutate(Array.from(selected));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900 text-base">{row.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {format(new Date(startDate), 'dd MMM')} – {format(new Date(endDate), 'dd MMM yyyy')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="text-center text-gray-400 py-10 text-sm">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-sm">No orders in this period</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="py-2 text-left font-medium w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === allPendingIds.length && allPendingIds.length > 0}
                      onChange={toggleAll}
                      className="accent-green-600"
                    />
                  </th>
                  <th className="py-2 text-left font-medium">Order</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                  <th className="py-2 text-right font-medium">Method</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const isPending = o.collectionStatus === 'pending';
                  const pm = o.metadata?.deliveryWorkflow?.paymentMethod === 'upi' ? 'upi' : o.paymentMethod;
                  return (
                    <tr key={o._id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2.5">
                        {isPending ? (
                          <input
                            type="checkbox"
                            checked={selected.has(o._id)}
                            onChange={() => toggle(o._id)}
                            className="accent-green-600"
                          />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        )}
                      </td>
                      <td className="py-2.5">
                        <p className="text-gray-900 text-xs font-medium truncate max-w-[180px]">
                          {o.shippingAddress?.name || (typeof o.user === 'object' ? (o.user as any).name : '—')}
                        </p>
                        <p className="font-mono text-[10px] text-gray-400 mt-0.5">
                          {o.orderNumber || `#${o._id.slice(-6).toUpperCase()}`}
                          {o.shippingAddress?.city ? ` · ${o.shippingAddress.city}` : ''}
                        </p>
                      </td>
                      <td className="py-2.5 text-right font-medium text-gray-900">
                        {INR(o.amountCollected ?? 0)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            pm === 'upi'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-yellow-50 text-yellow-700'
                          }`}
                        >
                          {pm?.toUpperCase() ?? '—'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            isPending
                              ? 'bg-orange-50 text-orange-700'
                              : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {isPending ? 'Pending' : 'Settled'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {allPendingIds.length > 0 && (
          <div className="border-t px-6 py-4 flex items-center justify-between bg-gray-50 rounded-b-2xl">
            <p className="text-xs text-gray-500">
              {selected.size} of {allPendingIds.length} pending selected
            </p>
            <button
              onClick={handleSettle}
              disabled={selected.size === 0 || settle.isPending}
              className="bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {settle.isPending ? 'Settling…' : 'Mark as Settled'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeliveryCollectionsPage() {
  const [startDate, setStartDate] = useState(() => format(startOfDay(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [breakdown, setBreakdown] = useState<DeliveryLedgerRow | null>(null);

  const startIso = `${startDate}T00:00:00`;
  const endIso = `${endDate}T23:59:59`;

  const { data: summary } = useQuery({
    queryKey: ['delivery-summary', startDate, endDate],
    queryFn: () => api.getDeliveryLedgerSummary(startIso, endIso),
    refetchInterval: 30_000,
  });

  const { data: rows = [], isLoading } = useQuery<DeliveryLedgerRow[]>({
    queryKey: ['delivery-ledger', startDate, endDate],
    queryFn: () => api.getDeliveryLedger({ startDate: startIso, endDate: endIso }),
    refetchInterval: 30_000,
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cash Ledger</h1>
        <p className="text-sm text-gray-500 mt-1">Delivery boy payment collection & reconciliation</p>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-3">
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={Banknote}
          label="Cash Collected (Period)"
          value={INR(summary?.totalCashToday ?? 0)}
          color="bg-yellow-500"
        />
        <SummaryCard
          icon={Smartphone}
          label="UPI Collected (Period)"
          value={INR(summary?.totalUpiToday ?? 0)}
          color="bg-blue-500"
        />
        <SummaryCard
          icon={AlertCircle}
          label="Outstanding (All Time)"
          value={INR(summary?.totalOutstandingAllTime ?? 0)}
          color="bg-red-500"
        />
      </div>

      {/* Main table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900 text-sm">Delivery Boys</h2>
        </div>

        {isLoading ? (
          <div className="text-center text-gray-400 py-16 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-gray-400 py-16 text-sm">
            No delivery activity in this period
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b bg-gray-50">
                <th className="px-5 py-3 text-left font-medium">Name</th>
                <th className="px-5 py-3 text-right font-medium">Orders</th>
                <th className="px-5 py-3 text-right font-medium">Cash</th>
                <th className="px-5 py-3 text-right font-medium">UPI</th>
                <th className="px-5 py-3 text-right font-medium">Pending Cash</th>
                <th className="px-5 py-3 text-right font-medium">Outstanding</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.deliveryUserId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{row.name}</p>
                    {row.email && <p className="text-xs text-gray-400 mt-0.5">{row.email}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-right text-gray-700">{row.totalOrders}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-gray-900">
                    {INR(row.totalCashCollected)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-blue-700 font-medium">
                    {INR(row.totalUpiCollected)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        row.pendingCashInPeriod > 0
                          ? 'bg-orange-50 text-orange-700'
                          : 'bg-green-50 text-green-700'
                      }`}
                    >
                      {INR(row.pendingCashInPeriod)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        row.totalOutstandingAllTime > 0
                          ? 'bg-red-50 text-red-700'
                          : 'bg-green-50 text-green-700'
                      }`}
                    >
                      {INR(row.totalOutstandingAllTime)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => setBreakdown(row)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {breakdown && (
        <BreakdownDialog
          row={breakdown}
          startDate={startIso}
          endDate={endIso}
          onClose={() => setBreakdown(null)}
        />
      )}
    </div>
  );
}
