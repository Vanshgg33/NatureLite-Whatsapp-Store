'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Wallet, ShieldCheck, Download, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useCashDrawer, cashDrawerKey } from '@/lib/billing/cash/useCashDrawer';
import { denomLabel, fmtCounts, toQty, type DrawerDenom } from '@/lib/billing/cash/drawer';
import { sumCounts, type Counts } from '@/lib/billing/cash/cashChange';
import { cn, useDebouncedValue } from '@/lib/utils';

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
const when = (d?: string) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—');
// ledger: seconds, so two sales a moment apart are told apart
const whenExact = (d?: string) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' }) : '—');
const NO_FILTER = { type: '', from: '', to: '', user: '', ref: '', low: false };
const panelMotion = { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.15 } };
const TXN_LABEL: Record<string, string> = {
  OPENING_COUNT: 'Opening count', BILL_SALE: 'Bill', BILL_PAYMENT: 'Payment on dues', BILL_REFUND: 'Refund (cancel)',
  UNCOUNTED_SALE: 'Uncounted cash', DEPOSIT: 'Deposit to bank', WITHDRAWAL: 'Withdrawal', REPLENISH: 'Change from bank',
  RECONCILE: 'End-of-day count', ADJUSTMENT: 'Adjustment',
};
const sorted = (d: DrawerDenom[]) => [...d].sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === 'note' ? -1 : 1));

/** quantity grid used by opening count, add/remove cash and end-of-day count */
function CountGrid({ denoms, value, onChange, hint }: { denoms: DrawerDenom[]; value: Counts; onChange: (c: Counts) => void; hint?: (d: DrawerDenom) => React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {sorted(denoms).map(d => (
        <label key={d.id} className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <span className="text-sm font-semibold w-20 shrink-0">{denomLabel(d)}</span>
          <input inputMode="numeric" value={value[d.id] || ''} placeholder="0" onFocus={e => e.currentTarget.select()}
            onChange={e => onChange({ ...value, [d.id]: toQty(e.target.value) })}
            className="w-16 h-8 border border-gray-200 rounded text-center tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30" />
          {hint?.(d)}
        </label>
      ))}
    </div>
  );
}

export default function CashDrawerPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isSuper = useAdminAuthStore(s => s.user?.role) === 'superadmin';
  const { data: stores = [] } = useQuery({ queryKey: ['billing-stores'], queryFn: () => api.getBillingStores(), staleTime: 60_000 });
  const [storeId, setStoreId] = useState('');
  useEffect(() => { if (!storeId && stores.length) setStoreId((stores.find(s => s.isMainStore) ?? stores[0])._id); }, [stores, storeId]);

  const dq = useCashDrawer(storeId);
  const drawer = dq.drawer;
  const denoms = useMemo(() => (drawer?.denoms ?? dq.data?.defaultDenoms ?? []).filter(d => d.active), [drawer, dq.data]);
  const reqId = useRef(crypto.randomUUID()); // one key per form submit: a double click writes one ledger row
  const done = (title: string) => {
    reqId.current = crypto.randomUUID();
    qc.invalidateQueries({ queryKey: cashDrawerKey(storeId) });
    qc.invalidateQueries({ queryKey: ['cash-drawer-txns', storeId] });
    toast({ title });
  };
  const fail = (e: unknown) => toast({ title: getApiError(e), variant: 'destructive' });

  // ── forms ──
  const [opening, setOpening] = useState<Counts>({});
  const [panel, setPanel] = useState<'' | 'adjust' | 'reconcile' | 'settings'>('');
  const [adjType, setAdjType] = useState('DEPOSIT');
  const [adjCounts, setAdjCounts] = useState<Counts>({});
  const [adjDir, setAdjDir] = useState<'in' | 'out'>('out');
  const [reason, setReason] = useState('');
  const [counted, setCounted] = useState<Counts>({});
  const [verify, setVerify] = useState<any>(null);
  useEffect(() => { setPanel(''); setVerify(null); setOpening({}); setFlt(NO_FILTER); }, [storeId]);

  const openM = useMutation({
    mutationFn: () => api.cashDrawerOpeningCount({ storeId, counts: opening, clientRequestId: reqId.current }),
    onSuccess: () => { setOpening({}); done('Opening count saved. Switch the mode to Soft to start counting on bills.'); }, onError: fail,
  });
  const out = adjType === 'DEPOSIT' || adjType === 'WITHDRAWAL' || (adjType === 'ADJUSTMENT' && adjDir === 'out');
  const adjM = useMutation({
    mutationFn: () => api.adjustCashDrawer({ storeId, type: adjType, [out ? 'returned' : 'received']: adjCounts, reason, clientRequestId: reqId.current }),
    onSuccess: () => { setAdjCounts({}); setReason(''); setPanel(''); done('Drawer updated'); },
    onError: e => { fail(e); dq.refresh(); },
  });
  const recM = useMutation({
    mutationFn: () => api.reconcileCashDrawer({ storeId, counted, note: reason, clientRequestId: reqId.current }),
    onSuccess: r => { setCounted({}); setReason(''); setPanel(''); done(`Counted. Variance ${r.varianceRupees >= 0 ? '+' : ''}${inr(r.varianceRupees)}`); },
    onError: fail,
  });
  const setM = useMutation({
    mutationFn: (b: { mode?: string; denoms?: any[] }) => api.updateCashDrawerSettings({ storeId, ...b }),
    onSuccess: () => done('Settings saved'), onError: fail,
  });
  const verifyM = useMutation({ mutationFn: () => api.verifyCashDrawer(storeId), onSuccess: setVerify, onError: fail });

  // ── ledger ──
  const [flt, setFlt] = useState(NO_FILTER);
  const filtered = JSON.stringify(flt) !== JSON.stringify(NO_FILTER);
  const user = useDebouncedValue(flt.user.trim(), 300);
  const ref = useDebouncedValue(flt.ref.trim(), 300);
  // datetime-local is the cashier's local time: send it as an instant; "to" includes the whole chosen minute
  const iso = (v: string, plus = 0) => (v && !isNaN(+new Date(v)) ? new Date(+new Date(v) + plus).toISOString() : undefined);
  const params = {
    storeId, type: flt.type || undefined, from: iso(flt.from), to: iso(flt.to, 60_000),
    user: user || undefined, ref: ref || undefined, low: flt.low ? '1' as const : undefined,
  };
  const txq = useInfiniteQuery({
    queryKey: ['cash-drawer-txns', storeId, params],
    queryFn: ({ pageParam }) => api.cashDrawerTxns({ ...params, cursor: pageParam ?? undefined, limit: 50 }),
    initialPageParam: null as number | null,
    getNextPageParam: (p: any) => p.nextCursor,
    enabled: !!drawer?.initialised,
  });
  const rows = txq.data?.pages.flatMap((p: any) => p.rows) ?? [];
  const exportCsv = async () => {
    try {
      const csv: string = await api.cashDrawerTxns({ ...params, format: 'csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `cash-drawer-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { fail(e); }
  };

  const allDenoms = drawer ? sorted(drawer.denoms) : [];
  const [draft, setDraft] = useState<Record<string, { active: boolean; par: number; minLevel: number }>>({});
  useEffect(() => { if (panel === 'settings' && drawer) setDraft(Object.fromEntries(drawer.denoms.map(d => [d.id, { active: d.active, par: d.par, minLevel: d.minLevel }]))); }, [panel]); // eslint-disable-line react-hooks/exhaustive-deps

  const variance = drawer ? Object.fromEntries(drawer.denoms.map(d => [d.id, (counted[d.id] || 0) - (drawer.counts[d.id] || 0)])) : {};
  const varianceRupees = drawer ? sumCounts(variance, drawer.denoms) : 0;
  const field = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30';

  return (
    <div className="min-h-full bg-[#faf9f6]">
      <Header title="Cash Drawer" description="Notes and coins in the store's cash drawer, and every movement" icon={<Wallet className="h-5 w-5 text-[#2d7a4f]" />} />
      <div className="p-4 md:p-5 space-y-4 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <select value={storeId} onChange={e => setStoreId(e.target.value)} className={field} aria-label="Store">
            {stores.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          {drawer?.initialised && (
            <>
              <span className="text-xs text-gray-500">Mode</span>
              {(['OFF', 'SOFT', 'HARD'] as const).map(m => (
                <button key={m} type="button" disabled={!isSuper || setM.isPending} onClick={() => m !== drawer.mode && setM.mutate({ mode: m })}
                  title={m === 'OFF' ? 'Bills ignore the drawer' : m === 'SOFT' ? 'Count on every cash bill; skipping allowed with a reason' : 'Counting required on every cash bill'}
                  className={cn('px-3 py-1.5 text-xs font-semibold rounded-md border', drawer.mode === m ? 'bg-[#2d7a4f] text-white border-[#2d7a4f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50', !isSuper && 'opacity-60')}>
                  {m === 'OFF' ? 'Off' : m === 'SOFT' ? 'Soft' : 'Strict'}
                </button>
              ))}
            </>
          )}
        </div>

        {dq.isLoading ? <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />
        : dq.isError ? <p className="text-sm text-red-600">{getApiError(dq.error)} <button className="underline" onClick={() => dq.refresh()}>Retry</button></p>
        : !drawer?.initialised ? (
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-gray-800">Opening count</h2>
            <p className="text-sm text-gray-500">Count every note and coin in the drawer now. Bills keep working as today until you switch the mode on.</p>
            {isSuper ? (
              <>
                <CountGrid denoms={denoms} value={opening} onChange={setOpening} />
                <div className="flex items-center gap-3">
                  <span className="text-sm">Total <b className="tabular-nums">{inr(sumCounts(opening, denoms))}</b></span>
                  <Button className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white" disabled={openM.isPending}
                    onClick={() => window.confirm(`Save the opening count of ${inr(sumCounts(opening, denoms))}?`) && openM.mutate()}>
                    {openM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save opening count'}
                  </Button>
                </div>
              </>
            ) : <p className="text-sm text-amber-700">Only a super admin can record the opening count.</p>}
          </section>
        ) : (
          <>
            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Cash in drawer</p>
                  <p className="text-2xl font-bold text-[#2d7a4f] tabular-nums">{inr(drawer.totalRupees)}</p>
                </div>
                <div className="text-xs text-gray-500">Last counted {when(drawer.lastReconciledAt)}</div>
                {drawer.uncountedSales > 0 && <span className="text-xs bg-amber-100 text-amber-800 rounded px-2 py-1">{drawer.uncountedSales} uncounted cash {drawer.uncountedSales === 1 ? 'sale' : 'sales'} since the last count</span>}
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => verifyM.mutate()} disabled={verifyM.isPending}><ShieldCheck className="h-4 w-4 mr-1" />Verify integrity</Button>
                  {isSuper && <>
                    <Button size="sm" variant="outline" onClick={() => setPanel(panel === 'adjust' ? '' : 'adjust')}>Add / remove cash</Button>
                    <Button size="sm" variant="outline" onClick={() => setPanel(panel === 'reconcile' ? '' : 'reconcile')}>End-of-day count</Button>
                    <Button size="sm" variant="outline" onClick={() => setPanel(panel === 'settings' ? '' : 'settings')}>Settings</Button>
                  </>}
                </div>
              </div>
              {verify && (
                <p className={cn('px-4 py-2 text-sm', verify.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')}>
                  {verify.ok ? `Ledger matches the drawer (${verify.txnCount} entries).` : `Mismatch! ${verify.mismatches.length ? `Counts differ for ${verify.mismatches.join(', ')}. ` : ''}${verify.gaps.length ? `Gaps at #${verify.gaps.join(', #')}.` : ''}${verify.versionOk ? '' : ' Version out of step.'}`}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                    <th className="text-left px-4 py-2">Note / coin</th><th className="text-right px-3">Count</th><th className="text-right px-3">Value</th>
                    <th className="text-right px-3">Par</th><th className="text-right px-3">Min</th><th className="text-left px-3">Status</th>
                  </tr></thead>
                  <tbody>
                    {allDenoms.filter(d => d.active || drawer.counts[d.id]).map(d => {
                      const n = drawer.counts[d.id] || 0;
                      return (
                        <tr key={d.id} className="border-t border-gray-100">
                          <td className="px-4 py-1.5 font-medium">{denomLabel(d)}</td>
                          <td className="text-right px-3 tabular-nums">{n}</td>
                          <td className="text-right px-3 tabular-nums">{inr(n * d.value)}</td>
                          <td className="text-right px-3 tabular-nums text-gray-500">{d.par}</td>
                          <td className="text-right px-3 tabular-nums text-gray-500">{d.minLevel}</td>
                          <td className="px-3">{n === 0 ? <span className="text-red-600 text-xs">Empty</span> : n <= d.minLevel ? <span className="text-amber-700 text-xs">Low</span> : <span className="text-green-700 text-xs">OK</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <AnimatePresence initial={false} mode="wait">
            {panel === 'adjust' && (
              <motion.section key="adjust" {...panelMotion} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <h2 className="font-semibold text-gray-800">Add / remove cash</h2>
                <div className="flex flex-wrap gap-2">
                  <select value={adjType} onChange={e => setAdjType(e.target.value)} className={field} aria-label="Type">
                    <option value="DEPOSIT">Deposit to bank (out)</option>
                    <option value="WITHDRAWAL">Petty cash / expense / owner (out)</option>
                    <option value="REPLENISH">Change brought from bank (in)</option>
                    <option value="ADJUSTMENT">Correction</option>
                  </select>
                  {adjType === 'ADJUSTMENT' && (
                    <select value={adjDir} onChange={e => setAdjDir(e.target.value as 'in' | 'out')} className={field} aria-label="Direction">
                      <option value="out">Remove from drawer</option><option value="in">Add to drawer</option>
                    </select>
                  )}
                </div>
                <CountGrid denoms={denoms} value={adjCounts} onChange={setAdjCounts}
                  hint={d => out ? <span className="text-[10px] text-gray-400">has {drawer.counts[d.id] || 0}</span> : null} />
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)" className={cn(field, 'w-full')} />
                <div className="flex items-center gap-3">
                  <span className="text-sm">{out ? 'Removing' : 'Adding'} <b className="tabular-nums">{inr(sumCounts(adjCounts, denoms))}</b></span>
                  <Button className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white" disabled={adjM.isPending || !reason.trim() || !sumCounts(adjCounts, denoms)} onClick={() => adjM.mutate()}>Save</Button>
                </div>
              </motion.section>
            )}

            {panel === 'reconcile' && (
              <motion.section key="reconcile" {...panelMotion} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <h2 className="font-semibold text-gray-800">End-of-day count</h2>
                <p className="text-sm text-gray-500">Count what is physically in the drawer. Any difference is recorded as a variance and the drawer is set to what you counted.</p>
                <CountGrid denoms={allDenoms.filter(d => d.active || drawer.counts[d.id])} value={counted} onChange={setCounted}
                  hint={d => variance[d.id] ? <span className={cn('text-[11px] tabular-nums', variance[d.id] > 0 ? 'text-green-700' : 'text-red-600')}>{variance[d.id] > 0 ? '+' : ''}{variance[d.id]}</span> : null} />
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Note (why it differs, if it does)" className={cn(field, 'w-full')} />
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm">Counted <b className="tabular-nums">{inr(sumCounts(counted, drawer.denoms))}</b> · system {inr(drawer.totalRupees)} · variance <b className={cn('tabular-nums', varianceRupees < 0 ? 'text-red-600' : varianceRupees > 0 ? 'text-green-700' : '')}>{varianceRupees > 0 ? '+' : ''}{inr(varianceRupees)}</b></span>
                  <Button className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white" disabled={recM.isPending}
                    onClick={() => window.confirm(`Set the drawer to the counted ${inr(sumCounts(counted, drawer.denoms))}? Anything not typed counts as 0.`) && recM.mutate()}>Confirm count</Button>
                </div>
              </motion.section>
            )}

            {panel === 'settings' && (
              <motion.section key="settings" {...panelMotion} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <h2 className="font-semibold text-gray-800">Notes and coins</h2>
                <p className="text-sm text-gray-500">Par = how many you like to keep (the change suggestion spares notes below par). Min = warn when at or below. A note still in the drawer can&apos;t be switched off.</p>
                <table className="text-sm">
                  <thead className="text-xs text-gray-500"><tr><th className="text-left pr-4">Note / coin</th><th className="px-2">On</th><th className="px-2">Par</th><th className="px-2">Min</th></tr></thead>
                  <tbody>
                    {allDenoms.map(d => draft[d.id] && (
                      <tr key={d.id}>
                        <td className="pr-4 py-1">{denomLabel(d)}</td>
                        <td className="px-2 text-center"><input type="checkbox" checked={draft[d.id].active} onChange={e => setDraft({ ...draft, [d.id]: { ...draft[d.id], active: e.target.checked } })} className="accent-[#2d7a4f]" /></td>
                        {(['par', 'minLevel'] as const).map(k => (
                          <td key={k} className="px-2"><input inputMode="numeric" aria-label={`${k === 'par' ? 'Par' : 'Min'} for ${denomLabel(d)}`} value={draft[d.id][k]} onChange={e => setDraft({ ...draft, [d.id]: { ...draft[d.id], [k]: toQty(e.target.value) } })}
                            className="w-16 h-8 border border-gray-200 rounded text-center tabular-nums" /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white" disabled={setM.isPending}
                  onClick={() => setM.mutate({ denoms: Object.entries(draft).map(([id, v]) => ({ id, ...v })) }, { onSuccess: () => setPanel('') })}>Save settings</Button>
              </motion.section>
            )}

            </AnimatePresence>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 mr-auto">Ledger</h2>
                <select value={flt.type} onChange={e => setFlt({ ...flt, type: e.target.value })} className={field} aria-label="Filter by movement type">
                  <option value="">All movements</option>
                  {Object.entries(TXN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />CSV</Button>
              </div>
              <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60 text-xs">
                <label className="flex flex-col gap-1 text-gray-500">From
                  <input type="datetime-local" value={flt.from} onChange={e => setFlt({ ...flt, from: e.target.value })} className={cn(field, 'py-1.5')} />
                </label>
                <label className="flex flex-col gap-1 text-gray-500">To
                  <input type="datetime-local" value={flt.to} onChange={e => setFlt({ ...flt, to: e.target.value })} className={cn(field, 'py-1.5')} />
                </label>
                <label className="flex flex-col gap-1 text-gray-500">User
                  <input value={flt.user} onChange={e => setFlt({ ...flt, user: e.target.value })} placeholder="Name or email" className={cn(field, 'py-1.5 w-36')} />
                </label>
                <label className="flex flex-col gap-1 text-gray-500">Bill / reference
                  <input value={flt.ref} onChange={e => setFlt({ ...flt, ref: e.target.value })} placeholder="Invoice no." className={cn(field, 'py-1.5 w-36')} />
                </label>
                <label className="flex items-center gap-2 h-9 px-2 text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={flt.low} onChange={e => setFlt({ ...flt, low: e.target.checked })} className="accent-[#2d7a4f] h-4 w-4" />
                  Left a note/coin at or below Min
                </label>
                {filtered && (
                  <button type="button" onClick={() => setFlt(NO_FILTER)} className="h-9 inline-flex items-center gap-1 px-2 rounded-md text-[#2d7a4f] hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/40">
                    <X className="h-3.5 w-3.5" />Reset filters
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className={cn('w-full text-sm min-w-[860px] transition-opacity', txq.isFetching && !txq.isFetchingNextPage && 'opacity-60')}>
                  <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                    <th className="text-left px-4 py-2">#</th><th className="text-left px-3">When</th><th className="text-left px-3">What</th>
                    <th className="text-left px-3">In (received)</th><th className="text-left px-3">Out (change / removed)</th>
                    <th className="text-right px-3">Net</th><th className="text-left px-3">Left low</th><th className="text-left px-3">By / reason</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r: any) => {
                      const hasIn = Object.values(r.received ?? {}).some(Boolean), hasOut = Object.values(r.returned ?? {}).some(Boolean);
                      return (
                        <tr key={r._id} className={cn('border-t border-gray-100 align-top', r.type === 'UNCOUNTED_SALE' && 'bg-amber-50')}>
                          <td className="px-4 py-2 text-gray-400 tabular-nums">{r.seq}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums">{whenExact(r.createdAt)}</td>
                          <td className="px-3 py-2">
                            {TXN_LABEL[r.type] ?? r.type}{r.billId && <> · <Link href={`/billing/invoice/${r.billId}`} className="text-[#2d7a4f] hover:underline">{r.invoiceNo ?? 'bill'}</Link></>}
                            {(r.billTotalRupees != null || r.cashDueRupees != null) && (
                              <p className="text-[11px] text-gray-500 tabular-nums">
                                {r.billTotalRupees != null && <>Bill {inr(r.billTotalRupees)}</>}
                                {r.billTotalRupees != null && r.cashDueRupees != null && ' · '}
                                {r.cashDueRupees != null && <>cash due {inr(r.cashDueRupees)}</>}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {hasIn && <><b className="block text-green-700 tabular-nums">{inr(r.receivedRupees)}</b>{fmtCounts(r.received, drawer.denoms)}</>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {hasOut && <><b className="block text-red-600 tabular-nums">{inr(r.returnedRupees)}{r.type.startsWith('BILL_') && r.type !== 'BILL_REFUND' ? ' change' : ''}</b>{fmtCounts(r.returned, drawer.denoms)}</>}
                          </td>
                          <td className={cn('text-right px-3 py-2 tabular-nums', r.netRupees < 0 ? 'text-red-600' : 'text-green-700')}>{r.netRupees > 0 ? '+' : ''}{inr(r.netRupees)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {(r.lowAfter ?? []).map((id: string) => {
                                const d = drawer.denoms.find(x => x.id === id);
                                return <span key={id} className="text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5" title={`${r.balanceAfter?.[id] || 0} left, Min ${d?.minLevel ?? 0}`}>{d ? denomLabel(d) : id} · {r.balanceAfter?.[id] || 0}</span>;
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{r.operator || r.createdBy?.name || ''}{r.reason ? ` · ${r.reason}` : ''}</td>
                        </tr>
                      );
                    })}
                    {!rows.length && !txq.isLoading && (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                        {txq.isError ? <span className="text-red-600">{getApiError(txq.error)}</span>
                          : filtered ? <>No movements match these filters. <button type="button" className="text-[#2d7a4f] underline" onClick={() => setFlt(NO_FILTER)}>Reset filters</button></>
                          : 'No movements yet'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">Times are store time (IST). &ldquo;Left low&rdquo; is judged against today&apos;s Min, showing how many were left after that movement.</p>
              {txq.hasNextPage && (
                <div className="p-3 text-center"><Button size="sm" variant="outline" disabled={txq.isFetchingNextPage} onClick={() => txq.fetchNextPage()}>Load more</Button></div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
