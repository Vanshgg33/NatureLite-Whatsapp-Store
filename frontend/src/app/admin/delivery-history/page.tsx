'use client';

import { useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Order, DeliveryLedgerRow, AdminUser } from '@/types';
import { format, startOfDay } from 'date-fns';
import {
  Truck,
  Banknote,
  Smartphone,
  Search,
  CheckCircle2,
  Clock,
  ChevronDown,
  ExternalLink,
  Package,
} from 'lucide-react';
import Link from 'next/link';

const INR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    delivered: 'bg-green-50 text-green-700',
    out_for_delivery: 'bg-blue-50 text-blue-700',
    pending: 'bg-orange-50 text-orange-700',
    settled: 'bg-green-50 text-green-700',
    cod: 'bg-yellow-50 text-yellow-700',
    upi: 'bg-blue-50 text-blue-700',
    prepaid: 'bg-purple-50 text-purple-700',
    partial: 'bg-orange-50 text-orange-700',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${map[status] ?? 'bg-gray-50 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

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

export default function DeliveryHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = format(startOfDay(new Date()), 'yyyy-MM-dd');
  const startDate = searchParams.get('from') ?? today;
  const endDate = searchParams.get('to') ?? format(new Date(), 'yyyy-MM-dd');
  const search = searchParams.get('q') ?? '';
  const selectedBoyId = searchParams.get('boy') ?? '';

  const setParam = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value); else p.delete(key);
    router.replace(`?${p.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const setStartDate = (v: string) => setParam('from', v);
  const setEndDate = (v: string) => setParam('to', v);
  const setSearch = (v: string) => setParam('q', v);
  const setSelectedBoyId = (v: string) => setParam('boy', v);

  const startIso = `${startDate}T00:00:00`;
  const endIso = `${endDate}T23:59:59`;

  // All delivery staff — used to populate the dropdown regardless of date range
  const { data: allStaff = [] } = useQuery<AdminUser[]>({
    queryKey: ['delivery-staff'],
    queryFn: () => api.getDeliveryStaff(),
    staleTime: 5 * 60 * 1000,
  });

  // Ledger rows for the selected date range — used for name mapping + order fetching
  const { data: ledgerRows = [] } = useQuery<DeliveryLedgerRow[]>({
    queryKey: ['delivery-history-ledger', startDate, endDate],
    queryFn: () => api.getDeliveryLedger({ startDate: startIso, endDate: endIso }),
    refetchInterval: 30_000,
  });

  // Name map: prefer ledger (has delivery-period data), fall back to full staff list
  const deliveryBoyMap = useMemo(() => {
    const map = new Map<string, string>(allStaff.map((s) => [s._id, s.name]));
    ledgerRows.forEach((r) => map.set(r.deliveryUserId, r.name));
    return map;
  }, [ledgerRows, allStaff]);

  // Stable key for "all boys" mode — changes when the set of boys changes, forcing
  // the orders query to re-execute with fresh ledgerRows instead of the stale closure.
  const allBoysKey = useMemo(
    () => (selectedBoyId ? '' : ledgerRows.map((r) => r.deliveryUserId).sort().join(',')),
    [selectedBoyId, ledgerRows],
  );

  // If a specific boy is selected → getDeliveryBreakdown for that boy only
  // If "All" → fire getDeliveryBreakdown for each boy in parallel
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['delivery-history-orders', selectedBoyId, startDate, endDate, allBoysKey],
    queryFn: async () => {
      if (selectedBoyId) {
        return api.getDeliveryBreakdown(selectedBoyId, startIso, endIso);
      }
      if (ledgerRows.length === 0) return [];
      const results = await Promise.all(
        ledgerRows.map((r) => api.getDeliveryBreakdown(r.deliveryUserId, startIso, endIso)),
      );
      return results.flat();
    },
    enabled: ledgerRows.length > 0 || !!selectedBoyId,
  });

  // Client-side filter — name, phone, alternate phone, order number, user name
  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const name = (o.shippingAddress?.name ?? '').toLowerCase();
      const phone = (o.shippingAddress?.phone ?? '').toLowerCase();
      const altPhone = (o.shippingAddress?.alternatePhone ?? '').toLowerCase();
      const orderNum = (o.orderNumber ?? '').toLowerCase();
      const customerName =
        typeof o.user === 'object' && o.user !== null
          ? ((o.user as any).name ?? '').toLowerCase()
          : '';
      return name.includes(q) || phone.includes(q) || altPhone.includes(q) || orderNum.includes(q) || customerName.includes(q);
    });
  }, [orders, search]);

  const isPartialPayment = (o: Order) =>
    o.metadata?.deliveryWorkflow?.status === 'partial_payment' ||
    (!!(o.metadata?.deliveryWorkflow?.cashAmount) && !!(o.metadata?.deliveryWorkflow?.upiAmount));

  // Use metadata.deliveryWorkflow as source of truth.
  // paymentMethod is only set for single-method deliveries; partial payment has neither.
  const effectivePM = (o: Order) => {
    if (isPartialPayment(o)) return 'partial';
    return o.metadata?.deliveryWorkflow?.paymentMethod === 'upi' ? 'upi' : o.paymentMethod;
  };

  // Summary totals — partial payments split into their cash and UPI portions separately.
  const totalDeliveries = filtered.length;
  const totalCash = filtered.reduce((s, o) => {
    if (isPartialPayment(o)) return s + (o.metadata?.deliveryWorkflow?.cashAmount ?? 0);
    if (effectivePM(o) !== 'upi') return s + (o.amountCollected ?? 0);
    return s;
  }, 0);
  const totalUpi = filtered.reduce((s, o) => {
    if (isPartialPayment(o)) return s + (o.metadata?.deliveryWorkflow?.upiAmount ?? 0);
    if (effectivePM(o) === 'upi') return s + (o.amountCollected ?? 0);
    return s;
  }, 0);
  const pendingCount = filtered.filter((o) => o.collectionStatus === 'pending').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Delivery History</h1>
        <p className="text-sm text-gray-500 mt-1">View deliveries made by delivery boys with payment details</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-4">
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
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">Delivery Boy</label>
          <div className="relative">
            <select
              value={selectedBoyId}
              onChange={(e) => setSelectedBoyId(e.target.value)}
              className="border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 appearance-none bg-white min-w-[180px]"
            >
              <option value="">All Delivery Boys</option>
              {allStaff.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-gray-500 font-medium block mb-1">Search Customer</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Name, phone, or order number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard icon={Truck} label="Total Deliveries" value={String(totalDeliveries)} color="bg-green-600" />
        <SummaryCard icon={Banknote} label="Cash Collected" value={INR(totalCash)} color="bg-yellow-500" />
        <SummaryCard icon={Smartphone} label="UPI Collected" value={INR(totalUpi)} color="bg-blue-500" />
        <SummaryCard
          icon={Clock}
          label="Pending Collection"
          value={String(pendingCount)}
          color={pendingCount > 0 ? 'bg-orange-500' : 'bg-gray-400'}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">
            Delivery Records
            {!isLoading && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
              </span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <div className="text-center text-gray-400 py-16 text-sm">Loading deliveries…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No deliveries found for the selected filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium">Order</th>
                  <th className="px-4 py-3 text-left font-medium">Customer</th>
                  <th className="px-4 py-3 text-left font-medium">Phone</th>
                  <th className="px-4 py-3 text-left font-medium">Delivery Boy</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Order Total</th>
                  <th className="px-4 py-3 text-right font-medium">Collected</th>
                  <th className="px-4 py-3 text-center font-medium">Payment</th>
                  <th className="px-4 py-3 text-center font-medium">Collection</th>
                  <th className="px-4 py-3 text-center font-medium">View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const customerName =
                    order.shippingAddress?.name ||
                    (typeof order.user === 'object' && order.user !== null
                      ? (order.user as any).name
                      : '—');
                  const customerPhone = order.shippingAddress?.phone ?? '—';
                  const deliveryBoyName =
                    deliveryBoyMap.get(order.assignedDeliveryUserId ?? '') ??
                    (order as any).assignedToName ??
                    '—';
                  const deliveredDate = order.deliveredAt
                    ? format(new Date(order.deliveredAt), 'dd MMM yyyy, hh:mm a')
                    : order.updatedAt
                    ? format(new Date(order.updatedAt), 'dd MMM yyyy')
                    : '—';

                  return (
                    <tr key={order._id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-[11px] text-gray-500 uppercase">
                          #{order.orderNumber ?? order._id.slice(-6).toUpperCase()}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 truncate max-w-[130px]">{customerName}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{customerPhone}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                          {deliveryBoyName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{deliveredDate}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {INR(order.total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-medium text-gray-900">
                          {order.amountCollected != null ? INR(order.amountCollected) : '—'}
                        </p>
                        {isPartialPayment(order) && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {INR(order.metadata?.deliveryWorkflow?.cashAmount ?? 0)} cash
                            {' + '}
                            {INR(order.metadata?.deliveryWorkflow?.upiAmount ?? 0)} UPI
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={effectivePM(order)} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {order.collectionStatus === 'settled' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                            <CheckCircle2 className="h-3 w-3" />
                            Settled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded">
                            <Clock className="h-3 w-3" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/admin/orders/${order._id}`}
                          className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded-lg font-medium"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </Link>
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
  );
}
