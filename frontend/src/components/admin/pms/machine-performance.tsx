'use client';

import { Fragment, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { RawMaterial, RawMaterialPrefill, RawMaterialDailyItem } from '@/types';

// shortcut: the six presses are fixed here; switch to the /production/machines master when more machines are added
const MACHINES = Array.from({ length: 6 }, (_, i) => ({
  n: String(i + 1).padStart(2, '0'),
  code: `JAS-${String(i + 1).padStart(2, '0')}`,
  type: 'Press & expeller',
}));

const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const num = (s: string) => { const v = parseFloat(s); return Number.isFinite(v) && v > 0 ? v : 0; };
const fmt = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PressMachine({ running }: { running: boolean }) {
  return (
    <svg viewBox="0 0 160 110" className="h-28 w-auto transition-transform duration-300 motion-safe:group-hover:-translate-y-0.5" aria-hidden>
      <ellipse cx="62" cy="100" rx="40" ry="4" fill="#00000014" />
      <rect x="30" y="86" width="64" height="12" fill="#A87320" />
      <rect x="38" y="30" width="12" height="56" fill="#B8861E" />
      <rect x="48" y="30" width="30" height="56" fill="#D9A62E" />
      <rect x="44" y="46" width="16" height="22" fill="#2E3436" />
      <rect x="92" y="16" width="12" height="16" fill="#D9A62E" />
      <rect x="74" y="34" width="14" height="10" fill="#D9A62E" />
      <ellipse cx="98" cy="34" rx="24" ry="6" fill="#DCDFDC" />
      <rect x="76" y="34" width="44" height="30" fill="#A9B0AE" />
      <line x1="86" y1="38" x2="86" y2="62" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" />
      <line x1="110" y1="38" x2="110" y2="62" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" />
      <ellipse cx="98" cy="64" rx="22" ry="5" fill="#6B7472" />
      {running && <circle cx="98" cy="74" r="2.5" fill="#D9A62E" className="motion-safe:animate-bounce" />}
    </svg>
  );
}

export function MachinePerformance({ storeId, materials, canLog }: { storeId: string; materials: RawMaterial[]; canLog: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = todayIST();
  const [tab, setTab] = useState<'machines' | 'ledger'>('machines');
  const [ledgerDate, setLedgerDate] = useState(today);

  // modal state
  const [machine, setMachine] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState('');
  const [prefill, setPrefill] = useState<RawMaterialPrefill | null>(null);
  const [f, setF] = useState({ opening: '', stockIn: '', processed: '', loose: '', oilProcessed: '', gaadIn: '', packed: '', gaadOut: '', operator: '', note: '' });
  const reqRef = useRef(0);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const dayQuery = (date: string) => ({
    queryKey: ['raw-analytics-day', storeId, date],
    queryFn: () => api.getRawMaterialAnalytics(storeId, { date }),
    enabled: !!storeId && !!date,
  });
  const { data: todayData } = useQuery(dayQuery(today));
  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({ ...dayQuery(ledgerDate), enabled: !!storeId && !!ledgerDate && tab === 'ledger' });

  const machineEntries = (items: unknown[] | undefined) => ((items ?? []) as RawMaterialDailyItem[])
    .flatMap((i) => (i.entries ?? []).filter((e) => e.machine).map((e) => ({ ...e, materialName: i.materialName ?? '-', unit: i.materialUnit ?? 'kg' })));

  // shortcut: sums processed across materials as kg; materials in other units would mix in
  const processedToday = new Map<string, number>();
  for (const e of machineEntries(todayData?.items)) processedToday.set(e.machine!, (processedToday.get(e.machine!) ?? 0) + (e.processed ?? 0));

  const ledgerRows = machineEntries(ledgerData?.items)
    .sort((a, b) => a.machine!.localeCompare(b.machine!) || +new Date(b.loggedAt) - +new Date(a.loggedAt));

  const material = materials.find((m) => m._id === materialId);
  const opening = prefill?.isExisting ? prefill.openingStock : num(f.opening);
  const available = opening + num(f.stockIn);
  const processed = num(f.processed);
  const closing = available - processed;
  const oilIn = num(f.loose) + num(f.oilProcessed) + num(f.gaadIn);
  const oilOut = num(f.packed) + num(f.gaadOut);
  const netOil = oilIn - oilOut;
  const problem =
    !material ? 'Choose a raw material' :
    !prefill ? 'Loading stock…' :
    processed > available ? `Processed is more than the ${fmt(available)} ${material.unit} available` :
    netOil < 0 ? 'Oil out is more than oil in' :
    !f.operator.trim() ? 'Operator name is required' : '';

  function openFor(code: string) {
    setMachine(code); setMaterialId(''); setPrefill(null);
    setF({ opening: '', stockIn: '', processed: '', loose: '', oilProcessed: '', gaadIn: '', packed: '', gaadOut: '', operator: '', note: '' });
    if (materials.length === 1) pickMaterial(materials[0]._id);
  }

  async function pickMaterial(id: string) {
    const rid = ++reqRef.current;
    setMaterialId(id); setPrefill(null);
    try {
      const p = await api.getRawMaterialPrefill(id);
      if (rid !== reqRef.current) return;
      setPrefill(p);
      setF((s) => ({ ...s, opening: String(p.openingStock) }));
    } catch {
      if (rid === reqRef.current) { setMaterialId(''); toast({ title: 'Could not load stock for that material', variant: 'destructive' }); }
    }
  }

  const save = useMutation({
    mutationFn: () => api.upsertRawMaterialEntry(materialId, {
      openingStock: opening, stockIn: num(f.stockIn), processed, outputLitres: netOil,
      machine: machine!, operator: f.operator.trim(), note: f.note.trim() || undefined,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      qc.invalidateQueries({ queryKey: ['raw-analytics-dates'] });
      qc.invalidateQueries({ queryKey: ['raw-analytics-day'] });
      toast({ title: `${machine} entry saved`, description: `${material?.name} closing stock: ${fmt(res.totalStock)} ${material?.unit}` });
      setMachine(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Failed to save entry', variant: 'destructive' }),
  });

  return (
    <div className="rounded-2xl border bg-white p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Machine performance</h2>
          <p className="text-sm text-gray-500">Choose a machine to record its production for this shift.</p>
        </div>
        <div role="tablist" className="inline-flex rounded-xl bg-gray-100 p-1 text-sm">
          {(['machines', 'ledger'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'machines' ? <>Machines <span className="ml-1 text-gray-400">{String(MACHINES.length).padStart(2, '0')}</span></> : 'Ledger'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'machines' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MACHINES.map((m) => {
            const done = processedToday.get(m.code) ?? 0;
            return (
              <div key={m.code} className="group rounded-xl border p-4 flex flex-col gap-3 transition-shadow hover:shadow-md">
                <div>
                  <p className="font-semibold text-gray-900">Machine {m.n}</p>
                  <p className="text-xs text-gray-400">{m.code} / {m.type}</p>
                </div>
                <div className="rounded-lg bg-[#F4F2EC] flex items-center justify-center py-4"><PressMachine running={done > 0} /></div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Processed today</p>
                    <p className="font-bold text-gray-900 tabular-nums">{fmt(done)} kg</p>
                  </div>
                  <Button size="sm" variant="secondary" className="bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold gap-1"
                    disabled={!canLog || materials.length === 0} title={!canLog ? 'Only full admins can log PMS entries' : materials.length === 0 ? 'Add a raw material first' : undefined}
                    onClick={() => openFor(m.code)}>
                    <Plus className="h-3.5 w-3.5" /> Log entry
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label htmlFor="mp-ledger-date" className="text-sm text-gray-500">Date</label>
            <Input id="mp-ledger-date" type="date" value={ledgerDate} max={today} onChange={(e) => setLedgerDate(e.target.value || today)} className="w-44 h-9" />
          </div>
          {ledgerLoading ? (
            <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />
          ) : ledgerRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No machine entries on {ledgerDate}. Use Log entry on a machine card to add one.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>{['Time', 'Material', 'Operator', 'Stock in', 'Processed', 'Net oil', 'Closing', 'Note'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {ledgerRows.map((r, i) => (
                    <Fragment key={r._id}>
                      {(i === 0 || ledgerRows[i - 1].machine !== r.machine) && (
                        <tr className="bg-emerald-50/60"><td colSpan={8} className="px-3 py-1.5 text-xs font-bold text-emerald-800">{r.machine}</td></tr>
                      )}
                      <tr className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{new Date(r.loggedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-3 py-2">{r.materialName}</td>
                        <td className="px-3 py-2">{r.operator ?? '-'}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(r.stockIn)} {r.unit}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(r.processed)} {r.unit}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(r.outputLitres)} L</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(r.closing)} {r.unit}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[16rem] truncate" title={r.note}>{r.note ?? ''}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!machine} onOpenChange={(o) => { if (!o && !save.isPending) setMachine(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{machine} · Log entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Raw material</label>
              <Select value={materialId} onValueChange={pickMaterial}>
                <SelectTrigger><SelectValue placeholder="Choose raw material" /></SelectTrigger>
                <SelectContent>{materials.map((m) => <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([['Opening', 'opening'], ['+ Stock in', 'stockIn'], ['− Processed', 'processed']] as const).map(([label, k]) => (
                <div key={k} className="space-y-1">
                  <label htmlFor={`mp-${k}`} className="text-xs font-semibold uppercase text-gray-500">{label}</label>
                  <Input id={`mp-${k}`} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0"
                    value={k === 'opening' && prefill?.isExisting ? String(prefill.openingStock) : f[k]} onChange={set(k)}
                    disabled={!prefill || (k === 'opening' && prefill.isExisting)} className="text-center font-semibold" />
                  <p className="text-center text-[11px] text-gray-400">{material?.unit ?? 'kg'}</p>
                </div>
              ))}
            </div>
            {prefill?.isExisting && <p className="text-[11px] text-gray-400">Opening continues from today&apos;s running closing stock.</p>}

            <div className="grid grid-cols-2 gap-3">
              <fieldset className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <legend className="px-1 text-[11px] font-bold uppercase text-emerald-700">Oil in (L)</legend>
                {([['Loose oil', 'loose'], ['Processed oil', 'oilProcessed'], ['Gaad oil', 'gaadIn']] as const).map(([label, k]) => (
                  <div key={k}><label htmlFor={`mp-${k}`} className="text-[11px] font-semibold text-emerald-700">{label}</label>
                    <Input id={`mp-${k}`} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" value={f[k]} onChange={set(k)} className="h-9 bg-white text-center" /></div>
                ))}
              </fieldset>
              <fieldset className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                <legend className="px-1 text-[11px] font-bold uppercase text-red-700">Oil out (L)</legend>
                {([['Packed oil', 'packed'], ['Gaad out', 'gaadOut']] as const).map(([label, k]) => (
                  <div key={k}><label htmlFor={`mp-${k}`} className="text-[11px] font-semibold text-red-700">{label}</label>
                    <Input id={`mp-${k}`} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" value={f[k]} onChange={set(k)} className="h-9 bg-white text-center" /></div>
                ))}
              </fieldset>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className={`rounded-lg px-3 py-2 ${netOil < 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-800'}`}>
                <p className="text-[10px] font-semibold uppercase opacity-70">Net oil output</p>
                <p className="font-bold tabular-nums">{fmt(netOil)} L</p>
              </div>
              <div className={`rounded-lg px-3 py-2 ${closing < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-800'}`}>
                <p className="text-[10px] font-semibold uppercase opacity-70">Closing stock</p>
                <p className="font-bold tabular-nums">{fmt(closing)} {material?.unit ?? 'kg'}</p>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="mp-operator" className="text-xs font-semibold uppercase text-gray-500">Operator *</label>
              <Input id="mp-operator" value={f.operator} onChange={set('operator')} maxLength={80} placeholder="Who ran the machine" />
            </div>
            <div className="space-y-1">
              <label htmlFor="mp-note" className="text-xs font-semibold uppercase text-gray-500">Shift note</label>
              <textarea id="mp-note" value={f.note} onChange={set('note')} maxLength={500} rows={2}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="Optional" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:items-center">
            {problem && <p role="status" className="mr-auto text-xs text-red-600">{problem}</p>}
            <Button variant="outline" onClick={() => setMachine(null)} disabled={save.isPending}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!!problem || save.isPending}>{save.isPending ? 'Saving…' : 'Save entry'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
