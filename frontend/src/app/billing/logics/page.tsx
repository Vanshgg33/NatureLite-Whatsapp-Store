'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { istDateKey } from '@/lib/time';
import { useAdminAccess } from '@/lib/admin-access';
import { useToast } from '@/components/ui/use-toast';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatINR } from '@/lib/billing/utils/formatINR';

interface Slot { key: string; label: string; scope: 'line' | 'bill'; vars: string[]; help: string }
interface ParamRow { key: string; module: string; label: string; help: string; unit: string; value: number | string; lastChange: { effectiveFrom: string; reason: string } | null }
interface Registry {
  slots: Slot[]; defaults: Record<string, string>;
  active: { version: number; formulas: Record<string, string> };
  history: Array<{ version: number; effectiveFrom: string; reason: string; createdBy?: string }>;
  params: ParamRow[];
}

// Rules that stay in code on purpose: they follow GST law or keep the books balanced.
const FIXED_RULES: Array<[string, string[]]> = [
  ['GSTR-1 sections', ['A valid GSTIN means B2B.', 'No GSTIN and other state above the B2CL limit means B2CL; everything else is B2CS.', 'The price tag never decides the section.']],
  ['Books & ledger', ['Every document becomes balanced debit and credit entries.', 'Trial Balance debit must equal credit; the Balance Sheet must balance.']],
  ['Stock', ['Stock goes out first-in-first-out per location.', 'A sale cannot take a location below zero unless an authorised user gives a reason.']],
  ['Invoice numbers', ['Typed numbers are 1–16 characters (letters, digits, hyphen, slash) and must be unique.', 'The series restarts every 1 April.']],
  ['Period lock', ['No bill, rate change or formula can start on or before the "GSTR-1 filed until" date.']],
];

const errText = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? e?.message ?? 'Something went wrong'; };

export default function LogicsPage() {
  const { can } = useAdminAccess();
  const canEdit = can('billing_logics.edit');
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: reg, isLoading, error } = useQuery<Registry>({ queryKey: ['billing-logics'], queryFn: () => api.getBillingLogics() });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [startsOn, setStartsOn] = useState(istDateKey());
  const [reason, setReason] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; problems: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (reg) setDraft(reg.active.formulas); }, [reg]);

  const edited = (k: string) => reg && draft[k] !== reg.active.formulas[k];
  const anyEdit = !!reg && reg.slots.some(s => edited(s.key));
  const setSlot = (k: string, v: string) => { setDraft(d => ({ ...d, [k]: v })); setCheck(null); };
  const refresh = () => { qc.invalidateQueries({ queryKey: ['billing-logics'] }); qc.invalidateQueries({ queryKey: ['billing-formulas'] }); };

  const runTest = async () => {
    setBusy(true);
    try { setCheck(await api.testBillingFormulas(draft)); } catch (e) { setCheck({ ok: false, problems: [errText(e)] }); } finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true);
    try {
      await api.publishBillingFormulas({ formulas: draft, startsOn, reason });
      toast({ title: 'Formulas published', description: `Applies to bills dated ${startsOn} onward. Older bills are unchanged.` });
      setReason(''); setCheck(null); refresh();
    } catch (e) { setCheck({ ok: false, problems: [errText(e)] }); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 pb-10">
      <Header title="Logics" description="Edit how billing calculates. Every change is tested, dated, logged, and never touches old bills." icon={<SlidersHorizontal className="h-6 w-6 text-[#2d7a4f]" />} />
      <div className="px-4 md:px-6 max-w-5xl">
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">{errText(error)}</p>}
        {reg && (
          <Tabs defaultValue="formulas">
            <TabsList className="mb-4">
              <TabsTrigger value="formulas">New Bill formulas</TabsTrigger>
              <TabsTrigger value="values">Values</TabsTrigger>
              <TabsTrigger value="fixed">Fixed rules</TabsTrigger>
            </TabsList>

            <TabsContent value="formulas" className="space-y-4">
              <div className="rounded-xl border bg-white p-4 text-sm text-gray-600 space-y-1">
                <p>In use now: <b>{reg.active.version === 0 ? 'built-in formulas' : `version ${reg.active.version}`}</b>. All amounts are in <b>paise</b> (₹1 = 100) and every step must give a whole number.</p>
                <p>You can use + − × / %, comparisons, <code>? :</code>, <code>&amp;&amp;</code> <code>||</code>, and <code>round floor ceil min max abs</code>. Line steps may also use the line inputs <code>ratePaise qty discountPct gstRate priceInclTax isInterState</code> and any earlier step.</p>
                <p>A formula is only published if it passes the built-in checks (CGST + SGST = tax, totals add up, tax matches the rate, round-off under ₹1).</p>
              </div>

              {reg.slots.map((s, i) => (
                <div key={s.key} className="rounded-xl border bg-white p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-gray-400 tabular-nums">{i + 1}</span>
                    <span className="font-medium text-gray-900">{s.label}</span>
                    <code className="text-xs text-[#2d7a4f]">{s.key}</code>
                    {edited(s.key) && <span className="text-xs rounded bg-amber-100 text-amber-800 px-1.5">edited</span>}
                    <span className="ml-auto text-xs text-gray-400">{s.scope === 'line' ? 'per line' : 'whole bill'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-1.5">{s.help} Names: {s.vars.join(', ')}</p>
                  <Textarea className="font-mono text-xs" rows={2} value={draft[s.key] ?? ''} disabled={!canEdit} onChange={e => setSlot(s.key, e.target.value)} />
                  {edited(s.key) && canEdit && <button className="mt-1 text-xs text-gray-500 underline" onClick={() => setSlot(s.key, reg.active.formulas[s.key])}>undo this change</button>}
                </div>
              ))}

              {canEdit && (
                <div className="rounded-xl border bg-white p-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                    <label className="text-sm">Applies to bills dated from<Input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} /></label>
                    <label className="text-sm">Reason (saved in the change history)<Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this changing?" /></label>
                  </div>
                  {check && (
                    <div className={`rounded-lg p-3 text-sm ${check.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                      {check.ok ? 'All checks passed.' : <ul className="list-disc pl-5">{check.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={busy} onClick={runTest}>Test</Button>
                    <Button disabled={busy || !reason.trim() || !startsOn} onClick={publish}>Publish</Button>
                    <Button variant="ghost" disabled={busy} onClick={() => { setDraft(reg.defaults); setCheck(null); }}>Load built-in formulas</Button>
                  </div>
                  {!anyEdit && <p className="text-xs text-gray-500">No unpublished edits. “Load built-in formulas” then Publish returns billing to the standard maths.</p>}
                </div>
              )}

              {reg.history.length > 0 && (
                <div className="rounded-xl border bg-white p-4">
                  <h3 className="font-medium text-gray-900 mb-2">Published versions</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {reg.history.map(h => <li key={h.version}>v{h.version} · from {new Date(h.effectiveFrom).toLocaleDateString('en-IN')} · {h.reason}</li>)}
                  </ul>
                </div>
              )}
            </TabsContent>

            <TabsContent value="values" className="space-y-4">
              {reg.params.map(p => <ParamCard key={p.key} p={p} canEdit={canEdit} onSaved={refresh} />)}
            </TabsContent>

            <TabsContent value="fixed" className="space-y-3">
              <p className="text-sm text-gray-600">These stay in code on purpose: they follow GST law or keep the books balanced. Ask a developer to change them.</p>
              {FIXED_RULES.map(([title, lines]) => (
                <div key={title} className="rounded-xl border bg-white p-4">
                  <h3 className="font-medium text-gray-900">{title}</h3>
                  <ul className="list-disc pl-5 text-sm text-gray-600">{lines.map(l => <li key={l}>{l}</li>)}</ul>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function ParamCard({ p, canEdit, onSaved }: { p: ParamRow; canEdit: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState(String(p.value));
  const [startsOn, setStartsOn] = useState(istDateKey());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => setValue(String(p.value)), [p.value]);

  const save = async () => {
    setErr('');
    try {
      await api.setBillingParam({ key: p.key, value, startsOn, reason });
      toast({ title: `${p.label} updated`, description: `Applies from ${startsOn}` });
      setReason(''); onSaved();
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="rounded-xl border bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs uppercase tracking-wide text-gray-400">{p.module}</span>
        <span className="font-medium text-gray-900">{p.label}</span>
        <span className="ml-auto text-sm text-gray-700">Now: <b>{p.unit === 'paise' && Number(p.value) >= 100 ? `${formatINR(Number(p.value))} (${p.value} paise)` : String(p.value)}</b></span>
      </div>
      <p className="text-xs text-gray-500">{p.help}</p>
      {canEdit && (
        <div className="grid gap-2 md:grid-cols-[160px_150px_1fr_auto] items-end">
          <label className="text-xs">New value<Input value={value} onChange={e => setValue(e.target.value)} /></label>
          <label className="text-xs">From<Input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} /></label>
          <label className="text-xs">Reason<Input value={reason} onChange={e => setReason(e.target.value)} /></label>
          <Button disabled={!reason.trim() || value === String(p.value)} onClick={save}>Save</Button>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
