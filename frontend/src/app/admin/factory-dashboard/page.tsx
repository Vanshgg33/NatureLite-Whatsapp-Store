'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  Boxes, Cog, FlaskConical, AlertTriangle, ArrowRight, PackageCheck, PackageX, Droplets,
  Gauge, ClipboardCheck, TrendingUp, Layers, Factory,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { getStoreItemTotalStock } from '@/lib/utils';
import { istDateKey, istFullDate } from '@/lib/time';
import { Header } from '@/components/layout/header';
import type { Store, RawMaterial, StoreStockItem } from '@/types';

const nf = (n: number, d = 0) => (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: d });

// One accent per system so the three are told apart at a glance.
const THEME = {
  ims: { name: 'IMS', sub: 'Finished-goods inventory', icon: Boxes, href: '/admin/ims', grad: 'from-emerald-600 to-teal-500', soft: 'bg-emerald-50 text-emerald-700 ring-emerald-100', hex: '#059669' },
  rms: { name: 'RMS', sub: 'Raw-material stock', icon: FlaskConical, href: '/admin/rms', grad: 'from-amber-500 to-orange-500', soft: 'bg-amber-50 text-amber-700 ring-amber-100', hex: '#d97706' },
  prod: { name: 'Production Ledger', sub: 'Receipts, issues, returns, output & packing', icon: Factory, href: '/admin/production', grad: 'from-slate-700 to-slate-500', soft: 'bg-slate-50 text-slate-700 ring-slate-100', hex: '#475569' },
  pms: { name: 'PMS', sub: 'Production & yield', icon: Cog, href: '/admin/pms', grad: 'from-indigo-600 to-violet-500', soft: 'bg-indigo-50 text-indigo-700 ring-indigo-100', hex: '#4f46e5' },
} as const;
type Sys = keyof typeof THEME;

function Section({ sys, children }: { sys: Sys; children: ReactNode }) {
  const t = THEME[sys];
  const Icon = t.icon;
  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className={`flex items-center justify-between bg-gradient-to-r ${t.grad} px-5 py-4 text-white`}>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-white/20 p-2"><Icon className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold leading-tight">{t.name}</h2>
            <p className="text-xs text-white/80">{t.sub}</p>
          </div>
        </div>
        <Link href={t.href} className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30">
          Open <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint, tone = 'default', icon: Icon }: {
  label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'warn' | 'bad'; icon: typeof Boxes;
}) {
  const tones = { default: 'text-gray-900', good: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-red-600' };
  return (
    <div className="rounded-xl border bg-gray-50/60 p-4">
      <div className="flex items-center justify-between text-xs font-medium text-gray-500">{label}<Icon className="h-4 w-4 text-gray-400" /></div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

function Attention({ title, rows, empty }: { title: string; rows: { key: string; left: ReactNode; right: ReactNode }[]; empty: string }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800"><AlertTriangle className="h-4 w-4 text-amber-500" />{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">{r.left}{r.right}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const Pill = ({ children, cls }: { children: ReactNode; cls: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
);

export default function FactoryDashboardPage() {
  const { user } = useAdminAuthStore();
  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');
  const [storeId, setStoreId] = useState<string>(user?.storeId || '');

  const { data: stores = [] } = useQuery<Store[]>({ queryKey: ['stores'], queryFn: () => api.getStores(), enabled: isSuperadmin });
  useEffect(() => {
    if (!storeId && isSuperadmin && stores.length) setStoreId(stores[0]._id);
  }, [storeId, isSuperadmin, stores]);

  const on = !!storeId;
  const { data: summary } = useQuery({ queryKey: ['fd-stock-summary', storeId], queryFn: () => api.getStoreStockSummary(storeId), enabled: on, refetchInterval: 60_000 });
  const { data: lowItems = [] } = useQuery<StoreStockItem[]>({ queryKey: ['fd-low', storeId], queryFn: () => api.getLowStockByStore(storeId), enabled: on, refetchInterval: 60_000 });
  const { data: stock } = useQuery({ queryKey: ['fd-stock', storeId], queryFn: () => api.getStoreStock(storeId, { page: 1, limit: 200 }), enabled: on, refetchInterval: 60_000 });
  const { data: materials = [] } = useQuery<RawMaterial[]>({ queryKey: ['fd-materials', storeId], queryFn: () => api.getRawMaterials(storeId), enabled: on, refetchInterval: 60_000 });
  // Production ledger overview (today). Needs production.view; the section hides itself if the role lacks it.
  const { data: ov, isError: ovDenied } = useQuery<any>({
    queryKey: ['fd-prod-overview', storeId, istDateKey()],
    queryFn: () => api.prod('get', 'reports/overview', { storeId, date: istDateKey() }),
    enabled: on, retry: false, refetchInterval: 60_000,
  });
  const { data: dates } = useQuery({ queryKey: ['fd-dates', storeId], queryFn: () => api.getRawMaterialAnalytics(storeId), enabled: on });

  // Last 7 logged days for the PMS trend (dates come newest-first from the API).
  const last7 = useMemo(() => ((dates?.dates ?? []) as string[]).slice(0, 7).reverse(), [dates]);
  const dayQs = useQueries({
    queries: last7.map((d) => ({ queryKey: ['fd-day', storeId, d], queryFn: () => api.getRawMaterialAnalytics(storeId, { date: d }), staleTime: 5 * 60_000 })),
  });
  const trend = last7.map((d, i) => {
    const items = ((dayQs[i]?.data?.items ?? []) as { processed?: number; outputLitres?: number; stockIn?: number }[]);
    return {
      day: d.slice(5),
      Processed: items.reduce((s, x) => s + (x.processed || 0), 0),
      Output: items.reduce((s, x) => s + (x.outputLitres || 0), 0),
      StockIn: items.reduce((s, x) => s + (x.stockIn || 0), 0),
    };
  });

  // ── derived ──
  const today = istDateKey();
  const total = summary?.total ?? 0;
  const out = summary?.outOfStock ?? 0;
  const low = summary?.lowStock ?? 0;
  const healthy = summary?.healthyStock ?? 0;
  const items = stock?.items ?? [];
  const activity = items.reduce((a, i) => ({ stockIn: a.stockIn + (i.stockIn || 0), returned: a.returned + (i.returned || 0), damaged: a.damaged + (i.damaged || 0), sold: a.sold + (i.saleLog || 0) }), { stockIn: 0, returned: 0, damaged: 0, sold: 0 });
  const donut = [
    { name: 'Healthy', value: healthy, color: '#10b981' },
    { name: 'Low', value: low, color: '#f59e0b' },
    { name: 'Out of stock', value: out, color: '#ef4444' },
  ].filter((d) => d.value > 0);
  const worst = [...lowItems].sort((a, b) => getStoreItemTotalStock(a) - getStoreItemTotalStock(b)).slice(0, 6);

  const todays = materials.filter((m) => m.todayEntry && m.todayEntry.date?.slice(0, 10) === today);
  const notLogged = materials.filter((m) => !todays.includes(m));
  const crit = materials.filter((m) => m.totalStock <= 0);
  const lowRm = materials.filter((m) => m.totalStock > 0 && m.totalStock < 20);
  const sum = (f: (m: RawMaterial) => number) => todays.reduce((s, m) => s + f(m), 0);
  const stockInToday = sum((m) => m.todayEntry!.stockIn || 0);
  const processedToday = sum((m) => m.todayEntry!.processed || 0);
  const outputToday = sum((m) => m.todayEntry!.outputLitres || 0);
  const yieldPct = processedToday > 0 ? (outputToday / processedToday) * 100 : 0;
  const topRm = [...materials].sort((a, b) => b.totalStock - a.totalStock).slice(0, 8).map((m) => ({ name: m.name.length > 14 ? m.name.slice(0, 13) + '…' : m.name, Stock: m.totalStock }));
  const topProcessed = [...todays].sort((a, b) => b.todayEntry!.processed - a.todayEntry!.processed).slice(0, 5);

  const mv: any[] = ov?.movements ?? [];
  const ex = ov?.exceptions;
  const exList = [
    ...(ex?.receiptsWithoutEvidence ?? []).map((x: string) => ({ key: `e${x}`, left: <span>Receipt {x}</span>, right: <Pill cls="bg-amber-100 text-amber-700">No scale photo</Pill> })),
    ...(ex?.negativeClosing ?? []).map((x: string) => ({ key: `n${x}`, left: <span>{x}</span>, right: <Pill cls="bg-red-100 text-red-700">Negative closing</Pill> })),
    ...(ex?.openIssues ?? []).map((x: string) => ({ key: `o${x}`, left: <span>Issue {x}</span>, right: <Pill cls="bg-gray-100 text-gray-600">Not fully returned</Pill> })),
  ];
  const ledgerKpis = [
    { label: 'Received', types: ['RECEIPT'], icon: PackageCheck, tone: 'good' as const },
    { label: 'Issued to production', types: ['ISSUE'], icon: Cog, tone: 'default' as const },
    { label: 'Returned', types: ['RETURN'], icon: ArrowRight, tone: 'default' as const },
    { label: 'Waste', types: ['WASTE'], icon: AlertTriangle, tone: 'warn' as const },
    { label: 'Production output', types: ['PROD_OUTPUT'], icon: Droplets, tone: 'good' as const },
    { label: 'Packed out', types: ['PACK_ISSUE'], icon: Boxes, tone: 'default' as const },
  ].map((k) => {
    const by = new Map<string, number>(); // units differ per item, so never add across units
    mv.filter((m) => k.types.includes(m.type)).forEach((m) => by.set(m.unit, (by.get(m.unit) ?? 0) + m.qty));
    return { ...k, value: by.size ? Array.from(by, ([u, q]) => `${nf(q, 2)} ${u}`).join(' · ') : '—' };
  });

  return (
    <div className="min-h-full bg-[#F7F5F0]">
      <Header title="Factory Dashboard" description="IMS · RMS · PMS — live overview of stock, raw material and production" />
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {/* Hero */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-900 px-5 py-4 text-white">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/60">{istFullDate()} · IST</p>
            <p className="text-lg font-semibold">{isSuperadmin ? stores.find((s) => s._id === storeId)?.name ?? 'Select a store' : user?.storeName ?? 'Your store'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['prod', 'ims', 'rms', 'pms'] as Sys[]).filter((k) => k !== 'prod' || !ovDenied).map((k) => (
              <a key={k} href={`#${k}`} className={`flex items-center gap-1.5 rounded-full bg-gradient-to-r ${THEME[k].grad} px-3 py-1.5 text-xs font-bold`}>
                {(() => { const I = THEME[k].icon; return <I className="h-3.5 w-3.5" />; })()}{k === 'prod' ? 'Ledger' : THEME[k].name}
              </a>
            ))}
            {isSuperadmin && (
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="rounded-lg border-0 bg-white/10 px-3 py-1.5 text-sm text-white [&>option]:text-gray-900">
                {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {!on ? (
          <p className="rounded-xl border border-dashed bg-white p-10 text-center text-gray-500">Select a store to see the dashboard.</p>
        ) : (
          <>
            {/* Cross-system alert strip */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { l: 'Products out of stock', v: out, bad: out > 0, i: PackageX },
                { l: 'Products running low', v: low, bad: low > 0, i: AlertTriangle },
                { l: 'Raw materials critical / low', v: crit.length + lowRm.length, bad: crit.length + lowRm.length > 0, i: FlaskConical },
                { l: 'Raw materials not logged today', v: notLogged.length, bad: notLogged.length > 0, i: ClipboardCheck },
              ].map((a) => (
                <div key={a.l} className={`flex items-center gap-3 rounded-xl border p-3 ${a.bad ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <a.i className={`h-5 w-5 ${a.bad ? 'text-red-500' : 'text-emerald-600'}`} />
                  <div><div className="text-xl font-bold tabular-nums">{a.v}</div><div className="text-xs text-gray-600">{a.l}</div></div>
                </div>
              ))}
            </div>

            {/* Production ledger */}
            {!ovDenied && (
              <div id="prod" className="scroll-mt-4">
                <Section sys="prod">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {ledgerKpis.map((k) => <Kpi key={k.label} label={`${k.label} today`} value={k.value} icon={k.icon} tone={k.value === '—' ? 'default' : k.tone} />)}
                  </div>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <Attention
                      title="Low stock in ledger"
                      empty="No ledger item is below its minimum."
                      rows={(ov?.lowStock ?? []).slice(0, 6).map((l: any) => ({
                        key: `${l.item}${l.location}`,
                        left: <span className="font-medium">{l.item}<span className="ml-2 text-xs text-gray-400">{l.location}</span></span>,
                        right: <Pill cls="bg-amber-100 text-amber-700">{nf(l.qty, 2)} {l.unit}</Pill>,
                      }))}
                    />
                    <Attention title="Exceptions to review" empty="No exceptions today." rows={exList.slice(0, 6)} />
                  </div>
                  {(exList.length > 6 || ov?.outbox?.failed > 0) && (
                    <p className="text-xs text-gray-500">{exList.length > 6 ? `${exList.length - 6} more exceptions in the ledger. ` : ''}{ov?.outbox?.failed > 0 ? `Email outbox has ${ov.outbox.failed} failed.` : ''}</p>
                  )}
                </Section>
              </div>
            )}

            {/* IMS */}
            <div id="ims" className="scroll-mt-4">
              <Section sys="ims">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Kpi label="Products tracked" value={nf(total)} icon={Layers} />
                  <Kpi label="Healthy" value={nf(healthy)} tone="good" icon={PackageCheck} hint={total ? `${nf((healthy / total) * 100)}% of catalogue` : undefined} />
                  <Kpi label="Low stock" value={nf(low)} tone={low ? 'warn' : 'default'} icon={AlertTriangle} />
                  <Kpi label="Out of stock" value={nf(out)} tone={out ? 'bad' : 'default'} icon={PackageX} />
                </div>
                <div className="grid gap-5 lg:grid-cols-5">
                  <div className="rounded-xl border p-4 lg:col-span-2">
                    <h3 className="mb-1 text-sm font-semibold text-gray-800">Stock health</h3>
                    {donut.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No stock data yet</p> : (
                      <div className="h-52">
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={donut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                              {donut.map((d) => <Cell key={d.name} fill={d.color} />)}
                            </Pie>
                            <Tooltip /><Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                      {[['Stock in', activity.stockIn], ['Returned', activity.returned], ['Damaged', activity.damaged], ['Sold', activity.sold]].map(([l, v]) => (
                        <div key={l as string} className="rounded-lg bg-gray-50 p-2"><div className="font-bold tabular-nums">{nf(v as number)}</div><div className="text-gray-500">{l}</div></div>
                      ))}
                    </div>
                  </div>
                  <div className="lg:col-span-3">
                    <Attention
                      title="Needs restocking first"
                      empty="Every product is above its threshold."
                      rows={worst.map((i) => {
                        const s = getStoreItemTotalStock(i);
                        return {
                          key: i._id,
                          left: <span className="truncate font-medium">{i.productName ?? 'Product'}<span className="ml-2 text-xs text-gray-400">{i.productSku}</span></span>,
                          right: <Pill cls={s <= 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>{s <= 0 ? 'Out' : `${nf(s)} left`} · min {nf(i.lowStockThreshold)}</Pill>,
                        };
                      })}
                    />
                  </div>
                </div>
              </Section>
            </div>

            {/* RMS */}
            <div id="rms" className="scroll-mt-4">
              <Section sys="rms">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Kpi label="Raw materials" value={nf(materials.length)} icon={Layers} />
                  <Kpi label="Received today" value={nf(stockInToday, 1)} icon={PackageCheck} tone="good" />
                  <Kpi label="Critical / low" value={`${crit.length} / ${lowRm.length}`} icon={AlertTriangle} tone={crit.length ? 'bad' : lowRm.length ? 'warn' : 'default'} />
                  <Kpi label="Not logged today" value={nf(notLogged.length)} icon={ClipboardCheck} tone={notLogged.length ? 'warn' : 'good'} hint={`${todays.length} of ${materials.length} logged`} />
                </div>
                <div className="grid gap-5 lg:grid-cols-5">
                  <div className="rounded-xl border p-4 lg:col-span-3">
                    <h3 className="mb-2 text-sm font-semibold text-gray-800">Current stock — top materials</h3>
                    {topRm.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No raw materials yet</p> : (
                      <div className="h-60">
                        <ResponsiveContainer>
                          <BarChart data={topRm} margin={{ left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={55} />
                            <YAxis tick={{ fontSize: 11 }} /><Tooltip />
                            <Bar dataKey="Stock" fill={THEME.rms.hex} radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="lg:col-span-2">
                    <Attention
                      title="Raw materials to act on"
                      empty="All materials are healthy and logged."
                      rows={[
                        ...crit.map((m) => ({ key: m._id, left: <span className="font-medium">{m.name}</span>, right: <Pill cls="bg-red-100 text-red-700">Critical · {nf(m.totalStock, 1)} {m.unit}</Pill> })),
                        ...lowRm.map((m) => ({ key: m._id, left: <span className="font-medium">{m.name}</span>, right: <Pill cls="bg-amber-100 text-amber-700">Low · {nf(m.totalStock, 1)} {m.unit}</Pill> })),
                        ...notLogged.filter((m) => m.totalStock >= 20).slice(0, 4).map((m) => ({ key: `n${m._id}`, left: <span className="font-medium">{m.name}</span>, right: <Pill cls="bg-gray-100 text-gray-600">No entry today</Pill> })),
                      ].slice(0, 8)}
                    />
                  </div>
                </div>
              </Section>
            </div>

            {/* PMS */}
            <div id="pms" className="scroll-mt-4">
              <Section sys="pms">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Kpi label="Processed today" value={nf(processedToday, 1)} icon={Cog} />
                  <Kpi label="Output today (L)" value={nf(outputToday, 1)} icon={Droplets} tone="good" />
                  <Kpi label="Yield today" value={processedToday ? `${nf(yieldPct, 1)}%` : '—'} icon={Gauge} hint="output ÷ processed" tone={processedToday ? (yieldPct >= 30 ? 'good' : 'warn') : 'default'} />
                  <Kpi label="Materials in production" value={nf(todays.filter((m) => m.todayEntry!.processed > 0).length)} icon={TrendingUp} />
                </div>
                <div className="grid gap-5 lg:grid-cols-5">
                  <div className="rounded-xl border p-4 lg:col-span-3">
                    <h3 className="mb-2 text-sm font-semibold text-gray-800">Last 7 logged days — processed vs output</h3>
                    {trend.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No production history yet</p> : (
                      <div className="h-60">
                        <ResponsiveContainer>
                          <BarChart data={trend} margin={{ left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                            <Tooltip /><Legend />
                            <Bar dataKey="StockIn" name="Received" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Processed" fill={THEME.pms.hex} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Output" name="Output (L)" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="lg:col-span-2">
                    <Attention
                      title="Top processed today"
                      empty="Nothing processed yet today."
                      rows={topProcessed.map((m) => {
                        const e = m.todayEntry!;
                        return {
                          key: m._id,
                          left: <span className="font-medium">{m.name}</span>,
                          right: <span className="text-xs text-gray-600">{nf(e.processed, 1)} {m.unit} → <b className="text-emerald-600">{nf(e.outputLitres, 1)} L</b></span>,
                        };
                      })}
                    />
                  </div>
                </div>
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
