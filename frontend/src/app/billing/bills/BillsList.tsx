'use client';

import { usePageState } from '@/hooks/usePageState';
import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { canEditBill, isEditableBill } from '@/components/billing/BillEditHistory';
import { useAdminAccess } from '@/lib/admin-access';
import { useToast } from '@/components/ui/use-toast';
import { Receipt, Search, StickyNote, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { readBillsQuery, writeBillsQuery, activeFilters, DEFAULT_FILTERS, type BillFilterState, type BillView, type DatePreset } from '@/lib/billing/bill-views';
import { api } from '@/lib/api';
import { cn, useDebouncedValue } from '@/lib/utils';
import { istDateKey, istDaysAgoKey, istWeekStartKey, istMonthKey, startOfDayIST, endOfDayIST } from '@/lib/time';
import { CHANNELS, CHANNEL_COLORS } from '@/lib/billing/channel';
import { invalidateBilling } from '@/lib/billing/invalidate';
import { useCashRefund } from '@/components/billing/CashRefund';
import { PartyReport } from './PartyReport';
import { ProductReport } from './ProductReport';
import { billDate, billTime } from '@/lib/billing/datetime';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 50;
const fmt = (n: number) => '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All time' }, { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }, { key: 'custom', label: 'Custom' },
];
const STATUSES = [
  { key: '', label: 'All' }, { key: 'paid', label: 'Paid' }, { key: 'partial', label: 'Partial' }, { key: 'unpaid', label: 'Unpaid' }, { key: 'due', label: 'Unpaid + partial' },
];
const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700', partial: 'bg-amber-100 text-amber-700', unpaid: 'bg-red-100 text-red-700',
};

function getRange(preset: DatePreset, customStart: string, customEnd: string) {
  const at = (key: string) => startOfDayIST(key).toISOString();
  if (preset === 'custom') return { startDate: customStart ? at(customStart) : undefined, endDate: customEnd ? endOfDayIST(customEnd).toISOString() : undefined };
  if (preset === 'today') return { startDate: at(istDateKey()) };
  if (preset === 'yesterday') return { startDate: at(istDaysAgoKey(1)), endDate: at(istDateKey()) };
  if (preset === 'week') return { startDate: at(istWeekStartKey()) };
  if (preset === 'month') return { startDate: at(`${istMonthKey()}-01`) };
  return {};
}

const chip = (on: boolean) => cn('px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
  on ? 'bg-[#2d7a4f] text-white border-[#2d7a4f]' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50');

function CancelModal({ bill, orders, onClose }: { bill: any; orders: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const qc = useQueryClient();
  const { toast } = useToast();
  const refund = useCashRefund(bill.storeId ? String(bill.storeId) : undefined);
  const cancel = useMutation({
    mutationFn: () => api.cancelBillingBill(bill._id, reason.trim(), refund.cash),
    onSuccess: () => {
      toast({ title: `${bill.invoiceNo} cancelled`, description: orders ? undefined : 'Stock returned to the store' });
      invalidateBilling(qc);
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Failed to cancel bill', variant: refund.handleError(e) ? undefined : 'destructive' }),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-[400px] max-w-[92vw] max-h-[92vh] overflow-y-auto p-5">
        <h3 className="font-semibold text-gray-800 mb-1">Cancel {bill.invoiceNo}</h3>
        <p className="text-sm text-gray-500 mb-3">
          {orders ? 'Nothing was deducted for this order, so no stock or balance changes. ' : <>Stock goes back to the store and the unpaid amount is removed from {bill.customerName}&apos;s balance. </>}This cannot be undone.
        </p>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason (required)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
        {refund.panel}
        <div className="flex gap-2 mt-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={cancel.isPending}>Keep bill</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" disabled={!reason.trim() || cancel.isPending || refund.blocked} onClick={() => cancel.mutate()}>
            {cancel.isPending ? 'Cancelling…' : 'Cancel bill'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Bills list; with orders it lists open sale orders instead (same screen, Confirm replaces payment status) */
export function BillsList({ orders = false }: { orders?: boolean }) {
  const { can } = useAdminAccess();
  const router = useRouter();
  const [cancelBill, setCancelBill] = useState<any>(null);
  const [search, setSearch] = usePageState('BillsList.search', '');
  const dSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = usePageState('BillsList.status', '');
  const [channel, setChannel] = usePageState('BillsList.channel', '');
  const [preset, setPreset] = usePageState<DatePreset>('BillsList.preset', 'all');
  const [customStart, setCustomStart] = usePageState('BillsList.customStart', '');
  const [customEnd, setCustomEnd] = usePageState('BillsList.customEnd', '');
  const [page, setPage] = usePageState('BillsList.page', 1);
  const [hasNotes, setHasNotes] = usePageState('BillsList.hasNotes', false);
  const [report, setReport] = usePageState<'' | 'party' | 'product'>('BillsList.report', '');
  const [minAmount, setMinAmount] = usePageState('BillsList.minAmount', '');
  const [maxAmount, setMaxAmount] = usePageState('BillsList.maxAmount', '');
  const [customerId, setCustomerId] = usePageState('BillsList.customerId', '');
  const [view, setView] = useState<BillView | null>(null);
  const [ready, setReady] = useState(false);

  const range = useMemo(() => getRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const [product, setProduct] = usePageState('BillsList.product', '');
  const dProduct = useDebouncedValue(product, 300);
  const [minQty, setMinQty] = usePageState('BillsList.minQty', '');
  const dMinQty = useDebouncedValue(minQty, 300);
  const dMinAmount = useDebouncedValue(minAmount, 300);
  const dMaxAmount = useDebouncedValue(maxAmount, 300);

  const state: BillFilterState = { search, status, channel, preset, customStart, customEnd, hasNotes, product, minQty, minAmount, maxAmount, customerId };
  const applyFilters = (f: Partial<BillFilterState>) => {
    if (f.search !== undefined) setSearch(f.search);
    if (f.status !== undefined) setStatus(f.status);
    if (f.channel !== undefined) setChannel(f.channel);
    if (f.preset !== undefined) setPreset(f.preset);
    if (f.customStart !== undefined) setCustomStart(f.customStart);
    if (f.customEnd !== undefined) setCustomEnd(f.customEnd);
    if (f.hasNotes !== undefined) setHasNotes(f.hasNotes);
    if (f.product !== undefined) setProduct(f.product);
    if (f.minQty !== undefined) setMinQty(f.minQty);
    if (f.minAmount !== undefined) setMinAmount(f.minAmount);
    if (f.maxAmount !== undefined) setMaxAmount(f.maxAmount);
    if (f.customerId !== undefined) setCustomerId(f.customerId);
  };
  // a dashboard card (or a shared link) decides the starting filters and title; otherwise the last filters are kept
  useEffect(() => {
    const r = readBillsQuery(new URLSearchParams(window.location.search));
    if (r.fromUrl) { applyFilters(r.filters); setView(r.view); setPage(1); }
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // keep the URL in step, so refresh / Back / sharing reopen the same list
  const urlQuery = writeBillsQuery(view, state);
  useEffect(() => {
    if (!ready) return;
    const next = urlQuery ? `?${urlQuery}` : '';
    if (next !== window.location.search) window.history.replaceState(null, '', window.location.pathname + next);
  }, [ready, urlQuery]);
  const resetAll = () => { applyFilters(DEFAULT_FILTERS); setView(null); setReport(''); };
  // the same filters feed the list and the party report
  const filters = useMemo(() => ({
    // sale orders have no payment status filter (the shared saved status must not hide orders)
    search: dSearch || undefined, paymentStatus: (!orders && status) || undefined, orderTag: channel || undefined, hasNotes: hasNotes || undefined,
    productName: dProduct.trim() || undefined, minQty: Number(dMinQty) > 0 ? Number(dMinQty) : undefined, ...range,
    minAmount: dMinAmount || undefined, maxAmount: dMaxAmount || undefined, customerId: customerId || undefined,
  }), [dSearch, status, channel, hasNotes, dProduct, dMinQty, range, dMinAmount, dMaxAmount, customerId, orders]);
  // wait for typed filters to settle: no request with a stale value, no request per keystroke
  const settled = dSearch === search && dProduct === product && dMinQty === minQty && dMinAmount === minAmount && dMaxAmount === maxAmount;
  // reset to page 1 only when filters really change, not on mount (Back keeps the saved page)
  const filtersKey = JSON.stringify(filters);
  const prevFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (prevFiltersKey.current !== filtersKey) { prevFiltersKey.current = filtersKey; setPage(1); }
  }, [filtersKey]);

  const { data, isPending: isLoading, isError, isFetching, refetch } = useQuery({
    enabled: ready && settled,
    queryKey: ['billing-bills', orders, filters, page],
    queryFn: () => api.getBillingBills({ docType: orders ? 'SALE_ORDER' : undefined, ...filters, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const bills: any[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summary = data?.summary;
  const chips = activeFilters(orders ? { ...state, status: '' } : state, bills[0]?.customerName);
  const badAmount = !!minAmount && !!maxAmount && Number(minAmount) > Number(maxAmount);

  return (
    <div className="min-h-full bg-[#faf9f6]">
      <Header
        title={orders ? 'Sale Orders' : view ? (view.key === 'channel' && channel ? `${channel} · this month` : view.title) : 'Bills'}
        description={orders ? 'Open orders: no stock or balance effect until confirmed' : view ? `${view.description} · from the dashboard` : 'Every bill with search and filters'}
        icon={<Receipt className="h-5 w-5 text-[#2d7a4f]" />}
      />

      <div className="p-4 md:p-5 space-y-3">
        {orders && (
          <div className="flex justify-end">
            <Link href="/billing/orders/new" className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#2d7a4f] text-white hover:bg-[#245f3e]">+ New Sale Order</Link>
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice no, customer name or phone…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!orders && STATUSES.map(s => <button key={s.key} onClick={() => setStatus(s.key)} className={chip(status === s.key)}>{s.label}</button>)}
            {!orders && <span className="w-px bg-gray-200 mx-1" />}
            <select value={channel} onChange={e => setChannel(e.target.value)}
              className="border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white text-gray-600">
              <option value="">All channels</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => setHasNotes(v => !v)} className={chip(hasNotes)}>Internal notes</button>
            <input value={product} onChange={e => setProduct(e.target.value)} placeholder="Product name…"
              className="border border-gray-200 rounded-md px-2 py-1.5 text-xs w-40" />
            <input type="number" min="0" value={minQty} onChange={e => setMinQty(e.target.value)} placeholder="Min qty" aria-label="Minimum quantity of the product"
              className="border border-gray-200 rounded-md px-2 py-1.5 text-xs w-20" />
            <input type="number" min="0" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="Min ₹" aria-label="Minimum bill total"
              className={cn('border rounded-md px-2 py-1.5 text-xs w-24', badAmount ? 'border-red-400' : 'border-gray-200')} />
            <input type="number" min="0" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="Max ₹" aria-label="Maximum bill total"
              className={cn('border rounded-md px-2 py-1.5 text-xs w-24', badAmount ? 'border-red-400' : 'border-gray-200')} />
            {!orders && (
              <div className="ml-auto flex gap-1.5">
                {([['party', 'Party report'], ['product', 'Product report']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setReport(r => r === k ? '' : k)}
                    className={cn('px-3 py-1.5 text-xs font-medium rounded-md border border-[#2d7a4f]', report === k ? 'bg-[#2d7a4f] text-white' : 'text-[#2d7a4f] hover:bg-[#e8f5ee]')}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map(p => <button key={p.key} onClick={() => setPreset(p.key)} className={chip(preset === p.key)}>{p.label}</button>)}
            {preset === 'custom' && (
              <>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs" />
                <span className="text-xs text-gray-400">to</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs" />
              </>
            )}
          </div>
        </div>

        {(chips.length > 0 || view) && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Active filters">
            <span className="text-gray-400">Showing:</span>
            {chips.map(c => (
              <button key={c.key} onClick={() => applyFilters(c.clear)} aria-label={`Remove filter ${c.label}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#e8f5ee] text-[#2d7a4f] hover:bg-[#d6eedf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/40 transition-colors">
                {c.label} <X className="h-3 w-3" />
              </button>
            ))}
            {!chips.length && <span className="text-gray-500">all bills</span>}
            <button onClick={resetAll} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/40">
              <RotateCcw className="h-3 w-3" /> Reset filters
            </button>
            {badAmount && <span className="text-red-600">Min ₹ is above max ₹, so nothing can match.</span>}
          </div>
        )}

        {!orders && summary && (
          <div className={cn('grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 transition-opacity duration-200 motion-reduce:transition-none', isFetching && 'opacity-60')} aria-live="polite" aria-busy={isFetching}>
            {([
              ['total', 'Billed', fmt(summary.total)],
              ['collected', 'Collected', fmt(summary.collected)],
              ['due', 'Due', fmt(summary.due)],
              ['', 'Bills', String(summary.count)],
              ['', 'Customers', String(summary.customers)],
              ['', 'Average bill', fmt(summary.avgBill)],
              ['', 'Collected %', summary.collectionRate === null ? '—' : `${summary.collectionRate}%`],
            ] as const).map(([focus, label, value]) => (
              <div key={label} className={cn('bg-white border rounded-lg px-3 py-2', focus && view?.focus === focus ? 'border-[#2d7a4f] ring-1 ring-[#2d7a4f]/30' : 'border-gray-200')}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
                <p className={cn('text-sm font-bold tabular-nums', focus === 'due' && summary.due > 0 ? 'text-red-600' : focus === 'collected' ? 'text-green-700' : 'text-gray-800')}>{value}</p>
              </div>
            ))}
            {summary.byChannel.length > 1 && (
              <div className="col-span-full flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                By channel:
                {summary.byChannel.map((c: any) => (
                  <button key={c.channel} disabled={c.channel === 'No channel'} onClick={() => setChannel(c.channel)}
                    className="px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/40"
                    title={`Show only ${c.channel}`}>
                    {c.channel}: {fmt(c.total)} · {c.count}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!orders && report === 'party' && <PartyReport filters={filters} onClose={() => setReport('')} />}
        {!orders && report === 'product' && <ProductReport filters={filters} onClose={() => setReport('')} />}

        <div className={cn('bg-white border border-gray-200 rounded-xl overflow-x-auto transition-opacity duration-200 motion-reduce:transition-none', isFetching && !isLoading && 'opacity-60')}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="text-left px-3 py-2">Invoice</th><th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Customer</th><th className="text-left px-3 py-2">Channel</th>
                <th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">Paid</th>
                <th className="text-right px-3 py-2">Due</th><th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b._id} onClick={() => router.push(`/billing/invoice/${b._id}`)} className="border-t border-gray-100 hover:bg-[#f7faf8] cursor-pointer">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/billing/invoice/${b._id}`} onClick={e => e.stopPropagation()} className="text-[#2d7a4f] hover:underline">{b.invoiceNo}</Link>
                    {b.notes?.trim() && <span title={b.notes}><StickyNote className="inline h-3.5 w-3.5 ml-1.5 text-amber-500" /></span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {billDate(b.invoiceDate ?? b.createdAt)}
                    <div className="text-[11px] text-gray-400">{billTime(b.createdAt)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-gray-800">{b.customerName}</div>
                    <div className="text-[11px] text-gray-400 font-mono">{b.customerPhone}</div>
                  </td>
                  <td className="px-3 py-2">
                    {b.orderTag && <span className={cn('text-[10px] px-1.5 py-0.5 rounded', CHANNEL_COLORS[b.orderTag] ?? 'bg-gray-100 text-gray-600')}>{b.orderTag}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(b.grandTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmt(b.amountPaid)}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', b.amountDue > 0 && 'text-red-600 font-medium')}>{orders ? '—' : fmt(b.amountDue)}</td>
                  <td className="px-3 py-2">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full capitalize', orders ? 'bg-blue-100 text-blue-700' : STATUS_STYLE[b.paymentStatus] ?? 'bg-gray-100 text-gray-600')}>{orders ? 'open' : b.paymentStatus}</span>
                  </td>
                  <td onClick={e => e.stopPropagation()} className="px-3 py-2 text-right whitespace-nowrap space-x-3 cursor-default">
                    {canEditBill(can) && isEditableBill(b) && (
                      <Link href={`/billing/bills/${b._id}/edit`} className="text-xs text-[#2d7a4f] hover:underline">Edit</Link>
                    )}
                    {orders && can('billing_new.create') && (
                      <Link href={`/billing/new?convert=${b._id}`} className="text-xs font-medium text-blue-600 hover:underline">Confirm</Link>
                    )}
                    {can('billing_new.cancel') && (
                      <button onClick={() => setCancelBill(b)} className="text-xs text-red-500 hover:text-red-700 hover:underline">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && !isError && bills.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-gray-400">
                  No bills match these filters.{chips.length > 0 && <> <button onClick={resetAll} className="underline text-[#2d7a4f]">Reset filters</button></>}
                </td></tr>
              )}
              {isError && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-red-600">
                  <AlertTriangle className="inline h-4 w-4 mr-1" />Could not load bills. <button onClick={() => refetch()} className="underline">Try again</button>
                </td></tr>
              )}
              {(isLoading || !ready) && !isError && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-gray-100"><td colSpan={9} className="px-3 py-3"><div className="h-4 rounded bg-gray-100 animate-pulse motion-reduce:animate-none" /></td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{total} bill{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span>Page {page} of {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
      {cancelBill && <CancelModal bill={cancelBill} orders={orders} onClose={() => setCancelBill(null)} />}
    </div>
  );
}
