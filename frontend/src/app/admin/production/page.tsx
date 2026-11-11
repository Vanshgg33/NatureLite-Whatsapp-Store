'use client';
import { istDateKey } from '@/lib/time';

import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Factory } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/admin-access';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import type { Store } from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const inp = 'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm';
const UNITS = ['kg', 'L', 'pcs'];
const EVENTS = ['receipt', 'issue', 'return', 'production', 'packing', 'eod', 'lowstock'];
const newKey = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const fmt = (d?: string) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '');
const today = () => istDateKey();
const errMsg = (e: any) => {
  const m = e?.response?.data?.message ?? e?.message ?? 'Something went wrong';
  return Array.isArray(m) ? m.join(', ') : typeof m === 'object' ? m.message : m;
};
const csvEsc = (v: unknown) => { let s = v == null ? '' : String(v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no spreadsheet formulas
   return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function saveCsv(filename: string, csv: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

/** Downscale phone photos before upload (max 1600px, JPEG 0.8); falls back to the original on any failure. */
async function compress(file: File): Promise<File> {
  try {
    if (!file.type.startsWith('image/')) return file;
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob: Blob | null = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.8));
    return blob && blob.size < file.size ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
async function uploadPhotos(sid: string, files: File[], status: (s: string) => void): Promise<string[]> {
  const keys: string[] = [];
  for (let i = 0; i < files.length; i++) {
    status(`Uploading photo ${i + 1} of ${files.length}...`);
    keys.push(await api.prodUpload(sid, await compress(files[i])));
  }
  status('');
  return keys;
}

/** Count-up for dashboard totals; skipped entirely when the user prefers reduced motion. */
function useCountUp(target: number) {
  const [v, setV] = useState(target);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 500); setV(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
function Num({ value, unit }: { value: number; unit?: string }) {
  const v = useCountUp(value);
  return <span>{v.toLocaleString('en-IN', { maximumFractionDigits: 4 })}{unit ? ` ${unit}` : ''}</span>;
}

function F({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-medium text-gray-600">{label}<div className="mt-1">{children}</div></label>;
}
function Sel({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; placeholder?: string }) {
  return (
    <select className={inp} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? 'Select...'}</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}
function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-500">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr>{head.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Evidence links; each click asks the server for a 5-minute signed URL (photos are private). */
function Photos({ sid, keys }: { sid: string; keys?: string[] }) {
  const open = async (key: string) => {
    const w = window.open('', '_blank'); // opened first so the popup blocker allows it after the async call
    try { const r = await api.prod('get', 'evidence/url', { storeId: sid, key }); if (w) { w.opener = null; w.location.href = r.url; } else window.location.href = r.url; }
    catch (e) { w?.close(); alert(errMsg(e)); }
  };
  return <>{(keys ?? []).map((k, i) => <button key={k} type="button" onClick={() => open(k)} className="mr-1 text-emerald-700 underline">photo{i + 1}</button>)}</>;
}
function PhotoPicker({ files, setFiles, status }: { files: File[]; setFiles: (f: File[]) => void; status: string }) {
  return (
    <div>
      <input className={inp} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      {files.length > 0 && <p className="mt-1 text-xs text-gray-500">{files.length} photo(s) selected</p>}
      {status && <p className="mt-1 text-xs text-emerald-700" role="status">{status}</p>}
    </div>
  );
}

type Send = (m: 'post' | 'put', p: string, b: Record<string, unknown>) => Promise<boolean>;
const TABS: [string, string][] = [['overview', 'Overview'], ['stock', 'Stock'], ['receive', 'Receive'], ['issue', 'Issue / Return'], ['adjust', 'Adjust / Waste'],
  ['production', 'Production & Packing'], ['ledger', 'Ledger'], ['eod', 'End of day'], ['reports', 'Reports']];

export default function ProductionPage() {
  const { user } = useAdminAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { can } = useAdminAccess();
  const isUnscoped = user?.role === 'superadmin' || !user?.storeId;
  const [storeId, setStoreId] = useState<string>(user?.storeId || '');
  const [tab, setTabState] = useState('overview');
  const [drill, setDrill] = useState<{ type?: string; from?: string; to?: string; q?: string; n: number } | null>(null);
  const [last, setLast] = useState('');

  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (t) setTabState(t); }, []);
  const setTab = (t: string) => { setTabState(t); window.history.replaceState(null, '', `?tab=${t}`); };
  const goLedger = (d: { type?: string; from?: string; to?: string }) => { setDrill({ ...d, n: Date.now() }); setTab('ledger'); };

  const { data: stores = [] } = useQuery<Store[]>({ queryKey: ['stores'], queryFn: () => api.getStores(), enabled: isUnscoped });
  const sid = storeId || stores[0]?._id || '';
  const useProd = (key: string, path: string, params: Record<string, unknown> = {}) =>
    useQuery<any>({ queryKey: ['prod', sid, key, params], queryFn: () => api.prod('get', path, { storeId: sid, ...params }), enabled: !!sid });

  const items = useProd('items', 'items').data ?? [];
  const locations = useProd('locations', 'locations').data ?? [];
  const machines = useProd('machines', 'machines').data ?? [];
  const materials = items.filter((i: any) => i.kind === 'material' && i.active);
  const products = items.filter((i: any) => i.kind === 'product' && i.active);
  const itemOpts = (l: any[]) => l.map((i) => ({ v: i._id, l: `${i.name} (${i.baseUnit})` }));
  const locOpts = locations.filter((l: any) => l.active).map((l: any) => ({ v: l._id, l: l.name }));

  // One helper for every write: shows the committed reference + balance and refreshes all production data.
  const act = useMutation({
    mutationFn: ({ method, path, body }: { method: 'post' | 'put'; path: string; body: Record<string, unknown> }) =>
      api.prod(method, path, { storeId: sid, ...body }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['prod'] });
      if (r?.duplicate) return toast({ title: 'Already saved', description: 'This request was submitted before; showing the original.' });
      const ref = r?.movement?.ref ?? r?.entry?.ref ?? r?.ref;
      const msg = [ref, r?.balance !== undefined && `balance now ${r.balance} ${r.unit ?? ''}`, r?.notification && r.notification !== 'none' && `email: ${r.notification}`].filter(Boolean).join(' · ');
      if (msg) { setLast(msg); toast({ title: 'Saved', description: msg }); }
    },
    onError: (e: any) => toast({ title: 'Not saved', description: errMsg(e), variant: 'destructive' }),
  });
  const send: Send = (method, path, body) => act.mutateAsync({ method, path, body }).then(() => true).catch(() => false);

  if (isUnscoped && !stores.length && !user?.storeId) return <div className="p-6 text-sm text-gray-500">Loading stores...</div>;
  const label = [...TABS, ['setup', 'Setup'], ['email', 'Email']].find(([v]) => v === tab)?.[1] ?? '';

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <nav aria-label="Breadcrumb" className="text-xs text-gray-500">Admin / Factory / Production / <span className="text-gray-800">{label}</span></nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Factory className="h-6 w-6 text-emerald-700" /><h1 className="text-2xl font-bold text-gray-900">Production</h1></div>
        {isUnscoped && <div className="w-56"><Sel value={sid} onChange={setStoreId} options={stores.map((s) => ({ v: s._id, l: s.name }))} /></div>}
      </div>
      {last && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 transition-opacity">Last saved: {last}</div>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          {[...TABS, ...(can('production.master') ? [['setup', 'Setup']] : []), ...(can('production.settings') ? [['email', 'Email']] : [])].map(([v, l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="pt-4"><OverviewTab sid={sid} goLedger={goLedger} /></TabsContent>
        <TabsContent value="stock" className="pt-4"><StockTab sid={sid} /></TabsContent>
        <TabsContent value="receive" className="pt-4"><ReceiveTab sid={sid} materials={materials} locOpts={locOpts} itemOpts={itemOpts} send={send} busy={act.isPending} /></TabsContent>
        <TabsContent value="issue" className="pt-4"><IssueTab sid={sid} materials={materials} machines={machines} locOpts={locOpts} itemOpts={itemOpts} send={send} busy={act.isPending} /></TabsContent>
        <TabsContent value="adjust" className="pt-4"><AdjustTab items={items} locOpts={locOpts} itemOpts={itemOpts} send={send} busy={act.isPending} /></TabsContent>
        <TabsContent value="production" className="pt-4"><ProductionTab sid={sid} products={products} machines={machines} locOpts={locOpts} itemOpts={itemOpts} send={send} busy={act.isPending} can={can} /></TabsContent>
        <TabsContent value="ledger" className="pt-4"><LedgerTab key={drill?.n ?? 0} sid={sid} items={items} send={send} can={can} initial={drill} /></TabsContent>
        <TabsContent value="eod" className="pt-4"><EodTab sid={sid} locOpts={locOpts} send={send} can={can} /></TabsContent>
        <TabsContent value="reports" className="pt-4"><ReportsTab sid={sid} products={products} machines={machines} /></TabsContent>
        <TabsContent value="setup" className="pt-4"><SetupTab sid={sid} items={items} machines={machines} locations={locations} send={send} isUnscoped={isUnscoped} /></TabsContent>
        <TabsContent value="email" className="pt-4"><EmailTab sid={sid} send={send} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────── Overview (every card drills into the ledger) ───────── */
const OV: { label: string; types: string[]; sign: number }[] = [
  { label: 'Receipts', types: ['RECEIPT'], sign: 1 }, { label: 'Issued to production', types: ['ISSUE'], sign: -1 }, { label: 'Returned', types: ['RETURN'], sign: 1 },
  { label: 'Waste', types: ['WASTE'], sign: -1 }, { label: 'Adjustments (net)', types: ['ADJUST', 'REVERSAL'], sign: 1 },
  { label: 'Production output', types: ['PROD_OUTPUT'], sign: 1 }, { label: 'Packed out', types: ['PACK_ISSUE'], sign: -1 },
];
function OverviewTab({ sid, goLedger }: { sid: string; goLedger: (d: any) => void }) {
  const [date, setDate] = useState(today());
  const { data } = useQuery<any>({ queryKey: ['prod', sid, 'overview', date], queryFn: () => api.prod('get', 'reports/overview', { storeId: sid, date }), enabled: !!sid });
  const mv: any[] = data?.movements ?? [];
  const ex = data?.exceptions;
  const hasEx = ex && (ex.receiptsWithoutEvidence.length || ex.negativeClosing.length || ex.openIssues.length);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><input className={`${inp} w-44`} type="date" value={date} onChange={(e) => setDate(e.target.value)} /><span className="text-xs text-gray-500">Factory-local day. Click a card to see the entries behind it.</span></div>
      {data && !mv.length && <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-500">No stock movements on {date}. Record a receipt (Receive tab) or a production entry to get started.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {OV.map((o) => {
          const parts = mv.filter((m) => o.types.includes(m.type)); const count = parts.reduce((s, m) => s + m.count, 0);
          if (!count) return null;
          const byUnit = new Map<string, number>(); parts.forEach((m) => byUnit.set(m.unit, (byUnit.get(m.unit) ?? 0) + o.sign * m.qty));
          return (
            <button key={o.label} type="button" onClick={() => goLedger({ type: o.types.join(','), from: date, to: date })}
              className="rounded-lg border bg-white p-4 text-left transition hover:border-emerald-500 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <div className="text-xs uppercase text-gray-500">{o.label}</div>
              <div className="mt-1 text-xl font-bold text-gray-900">{Array.from(byUnit.entries()).map(([u, q]) => <div key={u}>{q < 0 && o.label.startsWith('Adjust') ? '-' : ''}<Num value={Math.abs(Math.round(q * 1e6) / 1e6)} unit={u} /></div>)}</div>
              <div className="mt-1 text-xs text-gray-500">{count} movement{count > 1 ? 's' : ''}</div>
            </button>
          );
        })}
      </div>
      {data?.output?.length > 0 && <div><h3 className="mb-2 font-semibold">Output by product</h3>
        <Table head={['Product', 'Output', 'Entries']} empty="" rows={data.output.map((o: any) => [o.key, `${o.qty} ${o.unit}`, o.entries])} /></div>}
      {data?.lowStock?.length > 0 && <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"><b>Low stock:</b> {data.lowStock.map((l: any) => `${l.item} @ ${l.location} (${l.qty} ${l.unit})`).join(', ')}</div>}
      {hasEx && <div className="space-y-1 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><b>Exceptions</b>
        {ex.receiptsWithoutEvidence.length > 0 && <div>Receipts without scale photo: {ex.receiptsWithoutEvidence.join(', ')}</div>}
        {ex.negativeClosing.length > 0 && <div>Negative closing: {ex.negativeClosing.join(', ')}</div>}
        {ex.openIssues.length > 0 && <div>Issues not fully returned: {ex.openIssues.join(', ')}</div>}</div>}
      {(data?.outbox?.failed > 0 || data?.outbox?.queued > 0) && <p className="text-xs text-gray-600">Email outbox: {data.outbox.queued ?? 0} queued, {data.outbox.failed ?? 0} failed.</p>}
    </div>
  );
}

/* ───────── Stock ───────── */
function StockTab({ sid }: { sid: string }) {
  const { data = [] } = useQuery<any[]>({ queryKey: ['prod', sid, 'balances'], queryFn: () => api.prod('get', 'balances', { storeId: sid }), enabled: !!sid });
  const low = data.filter((r) => r.low);
  return (
    <div className="space-y-3">
      {low.length > 0 && <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Low stock: {low.map((r) => `${r.item.name} @ ${r.location.name} (${r.qty} ${r.item.baseUnit})`).join(', ')}</div>}
      <Table head={['Item', 'Type', 'Location', 'On hand', '']} empty="No stock yet. Add items in Setup, then record a receipt."
        rows={data.map((r) => [r.item.name, r.item.kind === 'product' ? `Product (${r.item.form})` : 'Raw material', r.location.name, <b key="q"><Num value={r.qty} unit={r.item.baseUnit} /></b>,
          r.low ? <span key="l" className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Low</span> : ''])} />
    </div>
  );
}

/* ───────── Receive ───────── */
function ReceiveTab({ sid, materials, locOpts, itemOpts, send, busy }: any) {
  const blank = { item: '', location: '', qty: '', unit: 'kg', supplier: '', lot: '', performedBy: '', note: '' };
  const [f, setF] = useState(blank);
  const [files, setFiles] = useState<File[]>([]);
  const [key, setKey] = useState(newKey());
  const [up, setUp] = useState('');
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    let evidence: string[] = [];
    try { evidence = await uploadPhotos(sid, files, setUp); }
    catch (e) { setUp(`Photo upload failed (${errMsg(e)}). Nothing was saved; retry.`); return; }
    if (await send('post', 'receipts', { ...f, qty: Number(f.qty), evidence, idemKey: key })) { setF({ ...blank, location: f.location }); setFiles([]); setKey(newKey()); }
  };
  return (
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-3">
      <F label="Ingredient"><Sel value={f.item} onChange={set('item')} options={itemOpts(materials)} /></F>
      <F label="Location"><Sel value={f.location} onChange={set('location')} options={locOpts} /></F>
      <div className="grid grid-cols-2 gap-2">
        <F label="Measured quantity"><input className={inp} type="number" min="0" step="any" value={f.qty} onChange={(e) => set('qty')(e.target.value)} /></F>
        <F label="Unit"><Sel value={f.unit} onChange={set('unit')} options={UNITS.map((u) => ({ v: u, l: u }))} /></F>
      </div>
      <F label="Supplier / reference"><input className={inp} value={f.supplier} onChange={(e) => set('supplier')(e.target.value)} /></F>
      <F label="Lot (optional)"><input className={inp} value={f.lot} onChange={(e) => set('lot')(e.target.value)} /></F>
      <F label="Received by (person)"><input className={inp} value={f.performedBy} onChange={(e) => set('performedBy')(e.target.value)} /></F>
      <F label="Scale photos (compressed, stored privately)"><PhotoPicker files={files} setFiles={setFiles} status={up} /></F>
      <F label="Note"><input className={inp} value={f.note} onChange={(e) => set('note')(e.target.value)} /></F>
      <div className="flex items-end"><Button disabled={busy || !f.item || !f.location || !f.qty} onClick={submit}>Record receipt</Button></div>
      <p className="text-xs text-gray-500 md:col-span-3">Entering a unit different from the item&apos;s base unit is converted with the item&apos;s configured kg/L factor and recorded as an estimate.</p>
    </CardContent></Card>
  );
}

/* ───────── Issue / Return ───────── */
function IssueTab({ sid, materials, machines, locOpts, itemOpts, send, busy }: any) {
  const [f, setF] = useState({ item: '', location: '', qty: '', unit: 'kg', destination: '', machine: '', entryRef: '', performedBy: '' });
  const [key, setKey] = useState(newKey());
  const [r, setR] = useState({ issueRef: '', qty: '', unit: 'kg', condition: '', reason: '' });
  const [rFiles, setRFiles] = useState<File[]>([]); const [rUp, setRUp] = useState('');
  const [rKey, setRKey] = useState(newKey());
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const { data: issues = [] } = useQuery<any[]>({ queryKey: ['prod', sid, 'issues'], queryFn: () => api.prod('get', 'issues', { storeId: sid }), enabled: !!sid });
  const openIssues = issues.filter((i) => i.net > 0);
  const doReturn = async () => {
    let evidence: string[] = [];
    try { evidence = await uploadPhotos(sid, rFiles, setRUp); } catch (e) { setRUp(`Photo upload failed (${errMsg(e)}). Nothing was saved.`); return; }
    if (await send('post', 'returns', { ...r, qty: Number(r.qty), evidence, idemKey: rKey })) { setR({ ...r, qty: '' }); setRFiles([]); setRKey(newKey()); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-2">
        <h3 className="font-semibold md:col-span-2">Issue to production</h3>
        <F label="Ingredient"><Sel value={f.item} onChange={set('item')} options={itemOpts(materials)} /></F>
        <F label="From location"><Sel value={f.location} onChange={set('location')} options={locOpts} /></F>
        <F label="Quantity"><input className={inp} type="number" min="0" step="any" value={f.qty} onChange={(e) => set('qty')(e.target.value)} /></F>
        <F label="Unit"><Sel value={f.unit} onChange={set('unit')} options={UNITS.map((u) => ({ v: u, l: u }))} /></F>
        <F label="Destination"><input className={inp} value={f.destination} onChange={(e) => set('destination')(e.target.value)} placeholder="e.g. Expeller line" /></F>
        <F label="Machine (optional)"><Sel value={f.machine} onChange={set('machine')} options={machines.map((m: any) => ({ v: m.code, l: `${m.code} ${m.name}` }))} /></F>
        <F label="Production entry ref (optional)"><input className={inp} value={f.entryRef} onChange={(e) => set('entryRef')(e.target.value)} /></F>
        <F label="Operator"><input className={inp} value={f.performedBy} onChange={(e) => set('performedBy')(e.target.value)} /></F>
        <Button className="md:col-span-2" disabled={busy || !f.item || !f.location || !f.qty || !f.destination}
          onClick={async () => { if (await send('post', 'issues', { ...f, qty: Number(f.qty), idemKey: key })) { setF({ ...f, qty: '' }); setKey(newKey()); } }}>Issue material</Button>
      </CardContent></Card>

      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-2">
        <h3 className="font-semibold md:col-span-2">Return unused material</h3>
        <F label="Against issue"><Sel value={r.issueRef} onChange={(v) => setR({ ...r, issueRef: v })} options={openIssues.map((i) => ({ v: i.ref, l: `${i.ref} · ${i.item?.name} · ${i.net} ${i.item?.baseUnit} unreturned` }))} /></F>
        <div className="grid grid-cols-2 gap-2">
          <F label="Returned qty"><input className={inp} type="number" min="0" step="any" value={r.qty} onChange={(e) => setR({ ...r, qty: e.target.value })} /></F>
          <F label="Unit"><Sel value={r.unit} onChange={(v) => setR({ ...r, unit: v })} options={UNITS.map((u) => ({ v: u, l: u }))} /></F>
        </div>
        <F label="Condition"><input className={inp} value={r.condition} onChange={(e) => setR({ ...r, condition: e.target.value })} /></F>
        <F label="Reason"><input className={inp} value={r.reason} onChange={(e) => setR({ ...r, reason: e.target.value })} /></F>
        <div className="md:col-span-2"><F label="Scale photo (if weighed)"><PhotoPicker files={rFiles} setFiles={setRFiles} status={rUp} /></F></div>
        <Button className="md:col-span-2" disabled={busy || !r.issueRef || !r.qty} onClick={doReturn}>Record return</Button>
      </CardContent></Card>

      <div className="lg:col-span-2">
        <Table head={['Issue', 'Item', 'When', 'Issued', 'Returned', 'Net consumed', 'Destination']} empty="No issues yet."
          rows={issues.map((i) => [i.ref, i.item?.name, fmt(i.eventAt), `${i.issued} ${i.item?.baseUnit}`, `${i.returned}`, <b key="n">{i.net} {i.item?.baseUnit}</b>, i.destination])} />
      </div>
    </div>
  );
}

/* ───────── Adjust / waste / count ───────── */
function AdjustTab({ items, locOpts, itemOpts, send, busy }: any) {
  const [mode, setMode] = useState<'adjustments' | 'waste' | 'count'>('adjustments');
  const [f, setF] = useState({ item: '', location: '', value: '', unit: 'kg', reason: '' });
  const [key, setKey] = useState(newKey());
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const body = () => mode === 'count' ? { item: f.item, location: f.location, counted: Number(f.value), unit: f.unit, reason: f.reason }
    : { item: f.item, location: f.location, unit: f.unit, reason: f.reason, idemKey: key, ...(mode === 'waste' ? { qty: Number(f.value) } : { delta: Number(f.value) }) };
  return (
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-3">
      <F label="Action"><Sel value={mode} onChange={(v) => setMode(v as any)} options={[{ v: 'adjustments', l: 'Adjustment (+/-)' }, { v: 'waste', l: 'Waste' }, { v: 'count', l: 'Physical count' }]} /></F>
      <F label="Item"><Sel value={f.item} onChange={set('item')} options={itemOpts(items.filter((i: any) => i.active))} /></F>
      <F label="Location"><Sel value={f.location} onChange={set('location')} options={locOpts} /></F>
      <F label={mode === 'adjustments' ? 'Delta (use - to reduce)' : mode === 'waste' ? 'Waste quantity' : 'Counted quantity'}>
        <input className={inp} type="number" step="any" value={f.value} onChange={(e) => set('value')(e.target.value)} /></F>
      <F label="Unit"><Sel value={f.unit} onChange={set('unit')} options={UNITS.map((u) => ({ v: u, l: u }))} /></F>
      <F label="Reason (required)"><input className={inp} value={f.reason} onChange={(e) => set('reason')(e.target.value)} /></F>
      <Button disabled={busy || !f.item || !f.location || f.value === '' || (mode !== 'count' && !f.reason)}
        onClick={async () => { if (await send('post', mode, body())) { setF({ ...f, value: '' }); setKey(newKey()); } }}>Post</Button>
    </CardContent></Card>
  );
}

/* ───────── Production entries + packing ───────── */
function ProductionTab({ sid, products, machines, locOpts, itemOpts, send, busy, can }: any) {
  const row = () => ({ machine: '', qty: '', unit: 'L', startAt: '', endAt: '' });
  const [f, setF] = useState({ product: '', location: '', operator: '', notes: '', issueRefs: '' });
  const [rows, setRows] = useState([row()]);
  const [files, setFiles] = useState<File[]>([]); const [up, setUp] = useState('');
  const [p, setP] = useState({ item: '', location: '', qty: '', unit: 'L', destination: '', packedItem: '', packedQty: '', packedUnit: 'pcs' });
  const [pKey, setPKey] = useState(newKey());
  const [openId, setOpenId] = useState('');
  const { data: entries = [] } = useQuery<any[]>({ queryKey: ['prod', sid, 'entries'], queryFn: () => api.prod('get', 'entries', { storeId: sid }), enabled: !!sid });
  const { data: detail } = useQuery<any>({ queryKey: ['prod', sid, 'entry', openId], queryFn: () => api.prod('get', `entries/${openId}`, { storeId: sid }), enabled: !!sid && !!openId });
  const total = rows.reduce((t, r) => t + (Number(r.qty) || 0), 0);
  const upd = (i: number, k: string, v: string) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const entryBody = (evidence: string[]) => ({ ...f, evidence, issueRefs: f.issueRefs.split(',').map((s) => s.trim()).filter(Boolean),
    rows: rows.filter((r) => r.machine && r.qty).map((r) => ({ ...r, qty: Number(r.qty), startAt: r.startAt || undefined, endAt: r.endAt || undefined })) });
  const save = async (post: boolean) => {
    let evidence: string[] = [];
    try { evidence = await uploadPhotos(sid, files, setUp); } catch (e) { setUp(`Photo upload failed (${errMsg(e)}). Nothing was saved.`); return; }
    const done = () => { setRows([row()]); setFiles([]); };
    if (!post) { if (await send('post', 'entries', entryBody(evidence))) done(); return; }
    const created: any = await api.prod('post', 'entries', { storeId: sid, ...entryBody(evidence) }).catch((e) => { alert(errMsg(e)); return null; });
    if (created && await send('post', `entries/${created._id}/post`, {})) done();
  };
  return (
    <div className="space-y-4">
      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-4">
        <h3 className="font-semibold md:col-span-4">New production entry</h3>
        <F label="Product"><Sel value={f.product} onChange={(v) => setF({ ...f, product: v })} options={itemOpts(products)} /></F>
        <F label="Output location"><Sel value={f.location} onChange={(v) => setF({ ...f, location: v })} options={locOpts} /></F>
        <F label="Operator"><input className={inp} value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })} /></F>
        <F label="Linked issue refs (comma separated)"><input className={inp} value={f.issueRefs} onChange={(e) => setF({ ...f, issueRefs: e.target.value })} /></F>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 md:col-span-4 md:grid-cols-6">
            <F label="Machine"><Sel value={r.machine} onChange={(v) => upd(i, 'machine', v)} options={machines.filter((m: any) => m.active).map((m: any) => ({ v: m.code, l: `${m.code} ${m.name}` }))} /></F>
            <F label="Output"><input className={inp} type="number" min="0" step="any" value={r.qty} onChange={(e) => upd(i, 'qty', e.target.value)} /></F>
            <F label="Unit"><Sel value={r.unit} onChange={(v) => upd(i, 'unit', v)} options={UNITS.map((u) => ({ v: u, l: u }))} /></F>
            <F label="Start (optional)"><input className={inp} type="datetime-local" value={r.startAt} onChange={(e) => upd(i, 'startAt', e.target.value)} /></F>
            <F label="End (optional)"><input className={inp} type="datetime-local" value={r.endAt} onChange={(e) => upd(i, 'endAt', e.target.value)} /></F>
            {rows.length > 1 && <Button variant="outline" className="self-end" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button>}
          </div>
        ))}
        <div className="md:col-span-2"><F label="Photo / attachment (optional)"><PhotoPicker files={files} setFiles={setFiles} status={up} /></F></div>
        <div className="md:col-span-2"><F label="Notes"><input className={inp} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></F></div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-4">
          <Button variant="outline" onClick={() => setRows([...rows, row()])}>+ Machine row</Button>
          <span className="text-sm">Entered total (not unit-converted): <b>{total}</b></span>
          <Button disabled={busy || !f.product || !f.location} variant="outline" onClick={() => save(false)}>Save draft</Button>
          <Button disabled={busy || !f.product || !f.location} onClick={() => save(true)}>Post (adds finished stock)</Button>
        </div>
      </CardContent></Card>

      <Table head={['Entry', 'Product', 'Produced', 'Machines', 'Total', 'Status', '']} empty="No production entries yet."
        rows={entries.map((e) => [e.ref, e.product?.name, fmt(e.producedAt), e.rows.map((r: any) => `${r.machine}: ${r.qty} ${r.unit}`).join(', '), `${e.total} ${e.product?.baseUnit}`,
          e.status,
          <span key="a" className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpenId(openId === e._id ? '' : e._id)}>{openId === e._id ? 'Hide' : 'Details'}</Button>
            {e.status === 'draft' && <Button size="sm" disabled={busy} onClick={() => send('post', `entries/${e._id}/post`, {})}>Post</Button>}
            {e.status === 'posted' && can('production.reverse') && <Button size="sm" variant="outline" disabled={busy}
              onClick={() => { const reason = prompt('Reason for reversing this entry?'); if (reason) send('post', 'reverse', { movementId: e.movement, reason }); }}>Reverse</Button>}
          </span>])} />

      {openId && detail && (
        <Card><CardContent className="space-y-2 p-4 text-sm">
          <h3 className="font-semibold">{detail.entry.ref} · material consumption</h3>
          <div className="text-xs text-gray-500">Operator {detail.entry.operator || '-'} · posted by {detail.entry.postedByName || '-'} {detail.entry.evidence?.length > 0 && <>· <Photos sid={sid} keys={detail.entry.evidence} /></>}
            {detail.entry.rows.some((r: any) => r.startAt) && <> · runs: {detail.entry.rows.filter((r: any) => r.startAt).map((r: any) => `${r.machine} ${fmt(r.startAt)}${r.endAt ? ` to ${fmt(r.endAt)}` : ''}`).join('; ')}</>}</div>
          <Table head={['Issue', 'Material', 'Issued', 'Returned', 'Net used', 'Yield (labelled)']} empty="No RMS issues linked. Add issue refs to the entry to see consumption."
            rows={detail.consumption.map((c: any) => [c.ref, c.material, `${c.issued} ${c.unit}`, c.returned, `${c.net} ${c.unit}`,
              c.yield ? <span key="y" title={c.yield.definition}>{c.yield.value} output per {c.unit} net used <em className="text-xs text-gray-500">(this entry only)</em></span> : '-'])} />
        </CardContent></Card>
      )}

      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-4">
        <h3 className="font-semibold md:col-span-4">Packing issue (consumes finished stock)</h3>
        <F label="Product (bulk)"><Sel value={p.item} onChange={(v) => setP({ ...p, item: v })} options={itemOpts(products)} /></F>
        <F label="Location"><Sel value={p.location} onChange={(v) => setP({ ...p, location: v })} options={locOpts} /></F>
        <F label="Quantity"><input className={inp} type="number" min="0" step="any" value={p.qty} onChange={(e) => setP({ ...p, qty: e.target.value })} /></F>
        <F label="Unit"><Sel value={p.unit} onChange={(v) => setP({ ...p, unit: v })} options={UNITS.map((u) => ({ v: u, l: u }))} /></F>
        <F label="Packing batch / order ref"><input className={inp} value={p.destination} onChange={(e) => setP({ ...p, destination: e.target.value })} /></F>
        <F label="Packed product (optional)"><Sel value={p.packedItem} onChange={(v) => setP({ ...p, packedItem: v })} options={itemOpts(products)} /></F>
        <F label="Packed qty"><input className={inp} type="number" min="0" step="any" value={p.packedQty} onChange={(e) => setP({ ...p, packedQty: e.target.value })} /></F>
        <F label="Packed unit"><Sel value={p.packedUnit} onChange={(v) => setP({ ...p, packedUnit: v })} options={UNITS.map((u) => ({ v: u, l: u }))} /></F>
        <Button className="md:col-span-4" disabled={busy || !p.item || !p.location || !p.qty || !p.destination}
          onClick={async () => { if (await send('post', 'packing', { ...p, qty: Number(p.qty), packedQty: p.packedItem ? Number(p.packedQty) : undefined, packedItem: p.packedItem || undefined, idemKey: pKey })) { setP({ ...p, qty: '' }); setPKey(newKey()); } }}>Record packing issue</Button>
      </CardContent></Card>
    </div>
  );
}

/* ───────── Ledger ───────── */
function LedgerTab({ sid, items, send, can, initial }: any) {
  const [flt, setFlt] = useState({ item: '', type: initial?.type ?? '', from: initial?.from ?? '', to: initial?.to ?? '', q: initial?.q ?? '', user: '' });
  const [page, setPage] = useState(1);
  const params = () => Object.fromEntries(Object.entries(flt).filter(([, v]) => v));
  const { data } = useQuery<any>({ queryKey: ['prod', sid, 'ledger', flt, page], queryFn: () => api.prod('get', 'ledger', { storeId: sid, page, ...params() }), enabled: !!sid });
  const rows = data?.data ?? [];
  const types = ['RECEIPT', 'ISSUE', 'RETURN', 'ADJUST', 'WASTE', 'REVERSAL', 'PROD_OUTPUT', 'PACK_ISSUE', 'PACK_RECEIPT'];
  const ch = (k: string) => (v: string) => { setPage(1); setFlt({ ...flt, [k]: v }); };
  const exportCsv = async () => { const r = await api.prod('get', 'export/ledger', { storeId: sid, ...params() }); saveCsv(r.filename, r.csv); };
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-6">
        <Sel value={flt.item} onChange={ch('item')} options={items.map((i: any) => ({ v: i._id, l: i.name }))} placeholder="All items" />
        <input className={inp} placeholder="Types e.g. RECEIPT,ISSUE" value={flt.type} onChange={(e) => ch('type')(e.target.value)} list="ledger-types" />
        <datalist id="ledger-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
        <input className={inp} type="date" value={flt.from} onChange={(e) => ch('from')(e.target.value)} />
        <input className={inp} type="date" value={flt.to} onChange={(e) => ch('to')(e.target.value)} />
        <input className={inp} placeholder="Reference e.g. RCV-00001" value={flt.q} onChange={(e) => ch('q')(e.target.value)} />
        <input className={inp} placeholder="Entered by" value={flt.user} onChange={(e) => ch('user')(e.target.value)} />
      </div>
      <Table head={['Ref', 'When', 'Type', 'Item', 'Location', 'Movement', 'Balance after', 'By', 'Links', '']} empty="No movements match these filters."
        rows={rows.map((m: any) => [m.ref, fmt(m.eventAt), m.type, m.item?.name, m.location?.name,
          <b key="q" className={m.qty < 0 ? 'text-red-600' : 'text-emerald-700'}>{m.qty > 0 ? '+' : ''}{m.qty} {m.item?.baseUnit}{m.converted ? <span className="ml-1 text-xs font-normal text-gray-500">(entered {m.enteredQty} {m.enteredUnit}, estimate @ {m.factor} kg/L)</span> : null}</b>,
          `${m.runningAfter} ${m.item?.baseUnit}`, m.enteredByName ?? '',
          <span key="l" className="text-xs">{m.sourceRef && <>↳ {m.sourceRef} </>}<Photos sid={sid} keys={m.evidence} />{m.reversed && <em className="text-red-600"> reversed</em>}</span>,
          can('production.reverse') && !m.reversed && m.type !== 'REVERSAL' ? <Button key="r" size="sm" variant="outline"
            onClick={() => { const reason = prompt(`Reason for reversing ${m.ref}?`); if (reason) send('post', 'reverse', { movementId: m._id, reason }); }}>Reverse</Button> : null])} />
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>{data?.total ?? 0} movements <Button size="sm" variant="outline" className="ml-2" onClick={exportCsv}>Export CSV</Button></span>
        <span className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="sm" variant="outline" disabled={page * (data?.limit ?? 30) >= (data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button></span>
      </div>
    </div>
  );
}

/* ───────── End of day ───────── */
function EodTab({ sid, locOpts, send, can }: any) {
  const [date, setDate] = useState(today());
  const [loc, setLoc] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const { data } = useQuery<any>({ queryKey: ['prod', sid, 'eod', date, loc], queryFn: () => api.prod('get', 'eod', { storeId: sid, date, location: loc || undefined }), enabled: !!sid });
  const ex = data?.exceptions;
  const exportCsv = async () => { const r = await api.prod('get', 'export/eod', { storeId: sid, date, location: loc || undefined }); saveCsv(r.filename, r.csv); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><input className={`${inp} w-44`} type="date" value={date} onChange={(e) => setDate(e.target.value)} /><div className="w-56"><Sel value={loc} onChange={setLoc} options={locOpts} placeholder="All locations" /></div>
        <Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button><Button size="sm" variant="outline" onClick={() => window.print()}>Print / save as PDF</Button></div>
      <p className="text-xs text-gray-500">Opening + receipts + returns + output − issues − waste − packing ± adjustments = closing (system balance, factory-local day).</p>
      <Table head={['Item', 'Location', 'Opening', 'Receipts', 'Returns', 'Issues', 'Net consumed', 'Waste', 'Adjust', 'Output', 'Packing', 'Closing', 'Physical count']} empty="No movements for this day."
        rows={(data?.rows ?? []).map((r: any) => {
          const k = `${r.itemId}:${r.locationId}`; const c = counts[k];
          return [r.item, r.location, r.opening, r.receipts, r.returns, r.issues, r.netConsumed, r.waste, r.adjustments, r.output, r.packing, <b key="c" className={r.closing < 0 ? 'text-red-600' : ''}>{r.closing} {r.unit}</b>,
            can('production.adjust') ? <span key="p" className="flex items-center gap-1"><input className={`${inp} w-20`} type="number" step="any" value={c ?? ''} onChange={(e) => setCounts({ ...counts, [k]: e.target.value })} />
              {c !== undefined && c !== '' && <><span className="text-xs">var {Math.round((Number(c) - r.closing) * 1e6) / 1e6}</span>
                <Button size="sm" variant="outline" onClick={() => { if (confirm('Record this physical count as an adjustment?')) send('post', 'count', { item: r.itemId, location: r.locationId, counted: Number(c), unit: r.unit, reason: `EOD ${date}` }); }}>Adjust</Button></>}</span> : null];
        })} />
      {ex && (ex.receiptsWithoutEvidence.length > 0 || ex.negativeClosing.length > 0 || ex.openIssues.length > 0) && (
        <div className="space-y-1 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <b>Exceptions</b>
          {ex.receiptsWithoutEvidence.length > 0 && <div>Receipts without scale photo: {ex.receiptsWithoutEvidence.join(', ')}</div>}
          {ex.negativeClosing.length > 0 && <div>Negative closing: {ex.negativeClosing.join(', ')}</div>}
          {ex.openIssues.length > 0 && <div>Issues not fully returned/closed: {ex.openIssues.join(', ')}</div>}
        </div>
      )}
    </div>
  );
}

/* ───────── Reports ───────── */
function ReportsTab({ sid, products, machines }: any) {
  const [f, setF] = useState({ from: '', to: '', period: 'day', dimension: 'machine', product: '', machine: '', operator: '' });
  const p = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const { data } = useQuery<any>({ queryKey: ['prod', sid, 'r-output', f], queryFn: () => api.prod('get', 'reports/output', { storeId: sid, ...p }), enabled: !!sid });
  const { data: fin = [] } = useQuery<any[]>({ queryKey: ['prod', sid, 'r-fin', f.from, f.to], queryFn: () => api.prod('get', 'reports/finished', { storeId: sid, from: f.from || undefined, to: f.to || undefined }), enabled: !!sid });
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  const rows: any[] = data?.rows ?? [];
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-semibold">Production output</h3>
        <div className="grid gap-2 md:grid-cols-7">
          <input className={inp} type="date" value={f.from} onChange={(e) => set('from')(e.target.value)} aria-label="From" />
          <input className={inp} type="date" value={f.to} onChange={(e) => set('to')(e.target.value)} aria-label="To" />
          <Sel value={f.period} onChange={set('period')} options={[{ v: 'day', l: 'By day' }, { v: 'week', l: 'By week' }, { v: 'month', l: 'By month' }]} placeholder="No period" />
          <Sel value={f.dimension} onChange={set('dimension')} options={[{ v: 'machine', l: 'By machine' }, { v: 'product', l: 'By product' }, { v: 'tag', l: 'By tag' }, { v: 'operator', l: 'By operator' }]} placeholder="No split" />
          <Sel value={f.product} onChange={set('product')} options={products.map((x: any) => ({ v: x._id, l: x.name }))} placeholder="All products" />
          <Sel value={f.machine} onChange={set('machine')} options={machines.map((m: any) => ({ v: m.code, l: m.code }))} placeholder="All machines" />
          <input className={inp} placeholder="Operator" value={f.operator} onChange={(e) => set('operator')(e.target.value)} />
        </div>
        <Table head={['Period', f.dimension || 'Group', 'Output', 'Entries']} empty="No posted production in this range. Post a production entry first."
          rows={rows.map((r) => [r.period, r.key, <b key="q">{r.qty} {r.unit}</b>, r.entries])} />
        <div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={!rows.length}
          onClick={() => saveCsv('production-output.csv', [['Period', 'Group', 'Output', 'Unit', 'Entries'], ...rows.map((r) => [r.period, r.key, r.qty, r.unit, r.entries])].map((l) => l.map(csvEsc).join(',')).join('\n'))}>Export CSV</Button>
          <span className="text-xs text-gray-500">{data?.definition}</span></div>
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold">Finished stock (bulk and packed)</h3>
        <Table head={['Product', 'Form', 'On hand', 'By location', 'Produced', 'Packed out', 'Packed in', 'Adjustments']} empty="No finished products yet. Add products in Setup."
          rows={fin.map((r) => [`${r.item} (${r.code})`, r.form, <b key="o">{r.onHand} {r.unit}</b>, r.byLocation.map((l: any) => `${l.location}: ${l.qty}`).join(', ') || '-', r.produced, r.packedOut, r.packedIn, r.adjustments])} />
        <p className="text-xs text-gray-500">Produced / packed / adjustments cover the selected date range (all time if empty). Machine capacity and expected yield are never inferred.</p>
      </div>
    </div>
  );
}

/* ───────── Setup ───────── */
function SetupTab({ sid, items, machines, locations, send, isUnscoped }: any) {
  const [it, setIt] = useState({ kind: 'material', code: '', name: '', baseUnit: 'kg', kgPerL: '', lowStockThreshold: '', tags: '' });
  const [m, setM] = useState({ code: '', name: '', type: '' });
  const [l, setL] = useState('');
  const [newTag, setNewTag] = useState('');
  const { data: vocab = [] } = useQuery<string[]>({ queryKey: ['prod', sid, 'tags'], queryFn: () => api.prod('get', 'tags', { storeId: sid }), enabled: !!sid });
  const toggleTag = (t: string) => { const cur = it.tags.split(',').map((x) => x.trim()).filter(Boolean); setIt({ ...it, tags: (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(',') }); };
  const curTags = it.tags.split(',').map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-6">
      <Card><CardContent className="space-y-2 p-4">
        <h3 className="font-semibold">Tag vocabulary</h3>
        <p className="text-xs text-gray-500">When tags are defined here, items can only use these (category, variant, grade, organic...).</p>
        <div className="flex flex-wrap gap-2">{vocab.map((t) => <span key={t} className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">{t} <button type="button" aria-label={`Remove ${t}`} onClick={() => send('put', 'tags', { tags: vocab.filter((x) => x !== t) })}>×</button></span>)}
          {!vocab.length && <span className="text-xs text-gray-500">No tags yet; items accept free text until you add one.</span>}</div>
        <div className="flex gap-2"><input className={`${inp} max-w-xs`} value={newTag} placeholder="New tag" onChange={(e) => setNewTag(e.target.value)} />
          <Button size="sm" disabled={!newTag.trim()} onClick={async () => { if (await send('put', 'tags', { tags: [...vocab, newTag.trim()] })) setNewTag(''); }}>Add tag</Button></div>
      </CardContent></Card>

      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-4">
        <h3 className="font-semibold md:col-span-4">Items (materials &amp; finished products)</h3>
        <F label="Kind"><Sel value={it.kind} onChange={(v) => setIt({ ...it, kind: v })} options={[{ v: 'material', l: 'Raw material' }, { v: 'product', l: 'Finished product' }]} /></F>
        <F label="Code"><input className={inp} value={it.code} onChange={(e) => setIt({ ...it, code: e.target.value })} /></F>
        <F label="Name"><input className={inp} value={it.name} onChange={(e) => setIt({ ...it, name: e.target.value })} /></F>
        <F label="Base unit (ledger unit)"><Sel value={it.baseUnit} onChange={(v) => setIt({ ...it, baseUnit: v })} options={UNITS.map((u) => ({ v: u, l: u }))} /></F>
        <F label="kg per litre (only if you enter both kg and L)"><input className={inp} type="number" step="any" min="0" value={it.kgPerL} onChange={(e) => setIt({ ...it, kgPerL: e.target.value })} /></F>
        <F label="Low-stock threshold"><input className={inp} type="number" min="0" step="any" value={it.lowStockThreshold} onChange={(e) => setIt({ ...it, lowStockThreshold: e.target.value })} /></F>
        <div className="md:col-span-2"><F label="Tags">{vocab.length
          ? <div className="flex flex-wrap gap-2">{vocab.map((t) => <label key={t} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={curTags.includes(t)} onChange={() => toggleTag(t)} />{t}</label>)}</div>
          : <input className={inp} value={it.tags} placeholder="comma separated" onChange={(e) => setIt({ ...it, tags: e.target.value })} />}</F></div>
        <Button className="md:col-span-4" disabled={!it.code || !it.name}
          onClick={async () => { if (await send('post', 'items', { ...it, kgPerL: it.kgPerL ? Number(it.kgPerL) : undefined, lowStockThreshold: Number(it.lowStockThreshold) || 0, tags: curTags })) setIt({ ...it, code: '', name: '', kgPerL: '', tags: '' }); }}>Add item</Button>
      </CardContent></Card>
      <Table head={['Code', 'Name', 'Kind', 'Base', 'kg/L', 'Low-stock at', 'Tags', '']} empty="No items yet."
        rows={items.map((i: any) => [i.code, i.name, i.kind, i.baseUnit, i.kgPerL ?? '-', i.lowStockThreshold || '-', (i.tags ?? []).join(', '),
          <span key="a" className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { const v = prompt('New kg per litre factor (applies to new entries only):', String(i.kgPerL ?? '')); if (v) send('put', `items/${i._id}`, { kgPerL: Number(v) }); }}>Set factor</Button>
            <Button size="sm" variant="outline" onClick={() => { const v = prompt(`Tags, comma separated${vocab.length ? ` (allowed: ${vocab.join(', ')})` : ''}:`, (i.tags ?? []).join(', ')); if (v !== null) send('put', `items/${i._id}`, { tags: v.split(',').map((x) => x.trim()).filter(Boolean) }); }}>Tags</Button>
            <Button size="sm" variant="outline" onClick={() => { const v = prompt('Low-stock threshold:', String(i.lowStockThreshold ?? 0)); if (v !== null) send('put', `items/${i._id}`, { lowStockThreshold: Number(v) }); }}>Threshold</Button>
            <Button size="sm" variant="outline" onClick={() => send('put', `items/${i._id}`, { active: !i.active })}>{i.active ? 'Deactivate' : 'Activate'}</Button></span>])} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Card><CardContent className="grid grid-cols-3 gap-2 p-4">
            <h3 className="col-span-3 font-semibold">Machines</h3>
            <F label="Code"><input className={inp} value={m.code} onChange={(e) => setM({ ...m, code: e.target.value })} placeholder="OIL-01" /></F>
            <F label="Name"><input className={inp} value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></F>
            <F label="Type"><input className={inp} value={m.type} onChange={(e) => setM({ ...m, type: e.target.value })} /></F>
            <Button className="col-span-3" disabled={!m.code || !m.name} onClick={async () => { if (await send('post', 'machines', m)) setM({ code: '', name: '', type: '' }); }}>Add machine</Button>
          </CardContent></Card>
          <Table head={['Code', 'Name', 'Type', '']} empty="No machines yet." rows={machines.map((x: any) => [x.code, x.name, x.type ?? '', <Button key="a" size="sm" variant="outline" onClick={() => send('put', `machines/${x._id}`, { active: !x.active })}>{x.active ? 'Deactivate' : 'Activate'}</Button>])} />
        </div>
        <div className="space-y-3">
          <Card><CardContent className="grid grid-cols-3 gap-2 p-4">
            <h3 className="col-span-3 font-semibold">Storage locations</h3>
            <div className="col-span-2"><F label="Name"><input className={inp} value={l} onChange={(e) => setL(e.target.value)} /></F></div>
            <Button className="self-end" disabled={!l} onClick={async () => { if (await send('post', 'locations', { name: l })) setL(''); }}>Add</Button>
          </CardContent></Card>
          <Table head={['Location', '']} empty="No locations yet. Add one before recording stock." rows={locations.map((x: any) => [x.name, <Button key="a" size="sm" variant="outline" onClick={() => send('put', `locations/${x._id}`, { active: !x.active })}>{x.active ? 'Deactivate' : 'Activate'}</Button>])} />
        </div>
      </div>

      {isUnscoped && (
        <Card><CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="text-sm"><b>Standard roles</b><div className="text-xs text-gray-500">Creates Production Operator / Lead / Inventory Admin / ERP Admin in Roles &amp; Access (skips any that exist). Assign them to logins from Roles &amp; Access.</div></div>
          <Button variant="outline" onClick={async () => { const r = await api.prod('post', 'role-presets', {}).catch((e) => ({ error: errMsg(e) })); alert(r.error ? `Failed: ${r.error}` : `Created: ${r.created.join(', ') || 'none'}. Already existed: ${r.skipped.join(', ') || 'none'}.`); }}>Create standard roles</Button>
        </CardContent></Card>
      )}
    </div>
  );
}

/* ───────── Email & settings ───────── */
function EmailTab({ sid, send }: { sid: string; send: Send }) {
  const qc = useQueryClient();
  const { data: st } = useQuery<any>({ queryKey: ['prod', sid, 'settings'], queryFn: () => api.prod('get', 'settings', { storeId: sid }), enabled: !!sid });
  const { data: outbox = [] } = useQuery<any[]>({ queryKey: ['prod', sid, 'outbox'], queryFn: () => api.prod('get', 'outbox', { storeId: sid }), enabled: !!sid, refetchInterval: 15000 });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [opt, setOpt] = useState<{ eodTime?: string; utcOffsetMinutes?: string; requireReceiptPhoto?: boolean }>({});
  const [to, setTo] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const val = (e: string) => draft[e] ?? (st?.recipients?.[e] ?? []).join(', ');
  const eodTime = opt.eodTime ?? st?.eodTime ?? ''; const off = opt.utcOffsetMinutes ?? String(st?.utcOffsetMinutes ?? 330); const reqPhoto = opt.requireReceiptPhoto ?? !!st?.requireReceiptPhoto;
  return (
    <div className="space-y-4">
      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-3">
        <h3 className="font-semibold md:col-span-3">Recipients per event (comma separated emails)</h3>
        {EVENTS.map((e) => <F key={e} label={e === 'eod' ? 'eod (daily summary)' : e === 'lowstock' ? 'lowstock (threshold crossed)' : e}><input className={inp} value={val(e)} onChange={(ev) => setDraft({ ...draft, [e]: ev.target.value })} /></F>)}
        <F label="Send daily EOD summary at (factory local HH:mm, blank = off)"><input className={inp} type="time" value={eodTime} onChange={(e) => setOpt({ ...opt, eodTime: e.target.value })} /></F>
        <F label="Factory UTC offset (minutes; India = 330)"><input className={inp} type="number" value={off} onChange={(e) => setOpt({ ...opt, utcOffsetMinutes: e.target.value })} /></F>
        <label className="flex items-end gap-2 pb-1 text-sm"><input type="checkbox" checked={reqPhoto} onChange={(e) => setOpt({ ...opt, requireReceiptPhoto: e.target.checked })} />Require a scale photo on every receipt</label>
        <Button onClick={async () => { if (await send('put', 'settings', { recipients: Object.fromEntries(EVENTS.map((e) => [e, val(e).split(',').map((s) => s.trim()).filter(Boolean)])), eodTime, utcOffsetMinutes: Number(off), requireReceiptPhoto: reqPhoto })) { setDraft({}); setOpt({}); } }}>Save settings</Button>
        <div className="flex items-end gap-2 md:col-span-2"><input className={inp} placeholder="Send a test email to..." value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="outline" onClick={async () => { const r = await api.prod('post', 'notifications/test', { to }).catch((e) => ({ ok: false, error: errMsg(e) })); setTestMsg(r.ok ? 'Test email sent' : `Failed: ${r.error}`); }}>Test SMTP</Button></div>
        {testMsg && <p className="text-sm md:col-span-3">{testMsg}</p>}
        <p className="text-xs text-gray-500 md:col-span-3">SMTP host/user/password are server environment settings (SMTP_*), not editable here. Emails are sent after the stock event is saved; an SMTP outage never rolls back stock.</p>
      </CardContent></Card>
      <Table head={['Created', 'Event', 'Ref', 'To', 'Status', 'Attempts', 'Error', '']} empty="No notifications yet. Add recipients above, then record an event."
        rows={outbox.map((o) => [fmt(o.createdAt), o.event, o.ref, o.to, o.status, o.attempts, o.error ?? '',
          o.status === 'failed' ? <Button key="r" size="sm" variant="outline" onClick={async () => { await send('post', `outbox/${o._id}/retry`, {}); qc.invalidateQueries({ queryKey: ['prod'] }); }}>Retry</Button> : null])} />
    </div>
  );
}
