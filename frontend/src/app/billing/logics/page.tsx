'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, Check, Lock, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { istDateKey } from '@/lib/time';
import { useAdminAccess } from '@/lib/admin-access';
import { useToast } from '@/components/ui/use-toast';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatINR } from '@/lib/billing/utils/formatINR';
import { calcBill, slotNames, VAR_LABELS, type Formulas, type SlotKey } from '@/lib/billing/formula-engine';
import { FormulaBuilder } from './FormulaBuilder';
import { cn } from '@/lib/utils';

type F = Record<string, string>;
interface Option { id: string; label: string; desc: string; set: F }
interface Group { id: string; lane: 'item' | 'discount' | 'totals'; title: string; help: string; slots: string[]; options: Option[] }
interface Slot { key: string; label: string; vars: string[]; help: string }
interface ParamRow { key: string; module: string; label: string; help: string; unit: string; value: number | string; lastChange: { effectiveFrom: string; reason: string } | null }
interface Registry {
  slots: Slot[]; groups: Group[]; defaults: F;
  active: { version: number; formulas: F };
  history: Array<{ version: number; effectiveFrom: string; reason: string }>;
  params: ParamRow[];
}
type Pick = { kind: 'group' | 'param' | 'fixed'; id: string };

const LANES: Array<[Group['lane'], string, string]> = [
  ['item', 'Each item on the bill', 'Worked out line by line'],
  ['discount', 'Discount and tax', 'Applied to every item'],
  ['totals', 'Totals', 'Added up for the whole bill'],
];

// Rules that stay in code on purpose: they follow GST law or keep the books balanced.
const FIXED: Array<{ id: string; title: string; lines: string[] }> = [
  { id: 'gstr1', title: 'GSTR-1 sections', lines: ['A valid GSTIN means B2B.', 'No GSTIN and another state above the B2CL limit means B2CL. Everything else is B2CS.', 'The price tag never decides the section.'] },
  { id: 'books', title: 'Books and ledger', lines: ['Every document becomes balanced debit and credit entries.', 'The Trial Balance must balance and so must the Balance Sheet.'] },
  { id: 'stock', title: 'Stock', lines: ['Stock goes out first-in, first-out at each location.', 'A sale cannot take a location below zero unless an authorised person gives a reason.'] },
  { id: 'invoice', title: 'Invoice numbers', lines: ['Typed numbers are 1 to 16 characters: letters, digits, hyphen or slash. They must be unique.', 'The series restarts every 1 April.'] },
  { id: 'lock', title: 'Period lock', lines: ['No bill, rate change or formula can start on or before the “GSTR-1 filed until” date.'] },
];

const errText = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? e?.message ?? 'Something went wrong'; };
const humanSec = (s: number) => (s < 60 ? `${s} sec` : s < 3600 ? `${+(s / 60).toFixed(1)} min` : `${+(s / 3600).toFixed(1)} h`);

// A sample bill so the effect of a change is visible before publishing.
const SAMPLE_ITEMS = [
  { rate: 900, qty: 1, gstRate: 5, priceInclTax: true, discountPct: 0 },
  { rate: 450.5, qty: 3, gstRate: 12, priceInclTax: false, discountPct: 5 },
];
const SAMPLE_OPTS = { discountValue: 7.5, discountMode: 'percent' as const, roundOff: true, isInterState: false, chargesTotalPaise: 5000 };
function sampleRows(f: F): Array<[string, number]> | string {
  try {
    const r = calcBill(SAMPLE_ITEMS, SAMPLE_OPTS, f as unknown as Formulas);
    return [['Taxable value', r.taxableTotal], ['CGST', r.cgstTotal], ['SGST', r.sgstTotal], ['Round-off', r.roundOffPaise], ['Bill total', r.grandTotalPaise]];
  } catch (e: any) { return e.message; }
}

export default function LogicsPage() {
  const { can } = useAdminAccess();
  const canEdit = can('billing_logics.edit');
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: reg, isLoading, error } = useQuery<Registry>({ queryKey: ['billing-logics'], queryFn: () => api.getBillingLogics() });

  const [draft, setDraft] = useState<F>({});
  const [pick, setPick] = useState<Pick | null>(null);
  const [startsOn, setStartsOn] = useState(istDateKey());
  const [reason, setReason] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; problems: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (reg) { setDraft(reg.active.formulas); setPick(p => p ?? { kind: 'group', id: reg.groups[0].id }); } }, [reg]);

  const live = reg?.active.formulas ?? {};
  const changed = (g: Group) => g.slots.some(s => draft[s] !== live[s]);
  const changedGroups = reg ? reg.groups.filter(changed) : [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ['billing-logics'] }); qc.invalidateQueries({ queryKey: ['billing-formulas'] }); };
  const edit = (patch: F) => { setDraft(d => ({ ...d, ...patch })); setCheck(null); };
  const matched = (g: Group) => g.options.find(o => Object.entries(o.set).every(([k, v]) => draft[k] === v));

  const runTest = async () => {
    setBusy(true);
    try { setCheck(await api.testBillingFormulas(draft)); } catch (e) { setCheck({ ok: false, problems: [errText(e)] }); } finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true);
    try {
      await api.publishBillingFormulas({ formulas: draft, startsOn, reason });
      toast({ title: 'Published', description: `Applies to bills dated ${startsOn} onward. Older bills are unchanged.` });
      setReason(''); setCheck(null); refresh();
    } catch (e) { setCheck({ ok: false, problems: [errText(e)] }); } finally { setBusy(false); }
  };

  const before = useMemo(() => sampleRows(live), [live]);
  const after = useMemo(() => sampleRows(draft), [draft]);

  const group = reg && pick?.kind === 'group' ? reg.groups.find(g => g.id === pick.id) : undefined;
  const param = reg && pick?.kind === 'param' ? reg.params.find(p => p.key === pick.id) : undefined;
  const fixed = pick?.kind === 'fixed' ? FIXED.find(f => f.id === pick.id) : undefined;

  return (
    <div className="space-y-5 pb-24">
      <Header title="Logics" description="Click a box to change how billing works" icon={<SlidersHorizontal className="h-6 w-6 text-[#2d7a4f]" />} />
      <div className="px-4 md:px-6">
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">{errText(error)}</p>}
        {reg && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_460px] items-start">
            <div className="space-y-6 min-w-0">
              <p className="text-sm text-gray-600 mt-10 md:mt-0">
                {reg.active.version === 0 ? 'Billing is using the built-in formulas.' : `Billing is using published version ${reg.active.version}.`} Changes only reach customers when you publish them, and only for bills dated from the day you choose.
              </p>

              {LANES.map(([lane, title, sub]) => (
                <section key={lane} aria-label={title}>
                  <div className="mb-2 flex items-baseline gap-2"><h2 className="font-semibold text-gray-900">{title}</h2><span className="text-xs text-gray-500">{sub}</span></div>
                  <div className="flex flex-col md:flex-row md:flex-wrap md:items-stretch gap-1.5">
                    {reg.groups.filter(g => g.lane === lane).map((g, i, arr) => {
                      const o = matched(g);
                      const stepNo = reg.groups.indexOf(g) + 1;
                      return (
                        <Fragment key={g.id}>
                          <NodeButton active={pick?.kind === 'group' && pick.id === g.id} changed={changed(g)} onClick={() => setPick({ kind: 'group', id: g.id })}
                            no={stepNo} title={g.title} sub={o ? o.label : 'Custom formula'} />
                          {i < arr.length - 1 && <Arrow />}
                        </Fragment>
                      );
                    })}
                  </div>
                </section>
              ))}

              <section aria-label="Sample bill" className="rounded-2xl border border-[#2d7a4f]/30 bg-white p-4">
                <h2 className="font-semibold text-gray-900">Try it on a sample bill</h2>
                <p className="text-xs text-gray-500 mb-3">₹900 item with 5% tax included, plus 3 × ₹450.50 with 5% discount and 12% tax added, 7.5% bill discount, ₹50 freight, same state, round-off on.</p>
                {typeof before === 'string' || typeof after === 'string' ? (
                  <p className="text-sm text-red-700">{typeof after === 'string' ? after : before as string}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500"><th className="py-1 font-normal"></th><th className="py-1 font-normal text-right">Today</th><th className="py-1 font-normal text-right">With your changes</th></tr></thead>
                    <tbody>
                      {before.map(([label, v], i) => {
                        const w = after[i][1];
                        return (
                          <tr key={label} className={cn('border-t border-gray-100', label === 'Bill total' && 'font-semibold')}>
                            <td className="py-1.5 text-gray-700">{label}</td>
                            <td className="py-1.5 text-right tabular-nums">{formatINR(v)}</td>
                            <td className={cn('py-1.5 text-right tabular-nums', w !== v && 'text-amber-700 font-semibold')}>{formatINR(w)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>

              <section aria-label="Other settings">
                <div className="mb-2 flex items-baseline gap-2"><h2 className="font-semibold text-gray-900">Other settings</h2><span className="text-xs text-gray-500">Saved on their own, each with a start date</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {reg.params.map(p => (
                    <NodeButton key={p.key} active={pick?.kind === 'param' && pick.id === p.key} onClick={() => setPick({ kind: 'param', id: p.key })}
                      title={p.label} sub={`${p.module}: ${paramShort(p)}`} />
                  ))}
                </div>
              </section>

              <section aria-label="Fixed rules">
                <div className="mb-2 flex items-baseline gap-2"><h2 className="font-semibold text-gray-900">Fixed rules</h2><span className="text-xs text-gray-500">Locked: they follow GST law or keep the books balanced</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {FIXED.map(f => (
                    <NodeButton key={f.id} locked active={pick?.kind === 'fixed' && pick.id === f.id} onClick={() => setPick({ kind: 'fixed', id: f.id })} title={f.title} />
                  ))}
                </div>
              </section>

              {reg.history.length > 0 && (
                <details className="rounded-xl border bg-white p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-gray-900">Published versions ({reg.history.length})</summary>
                  <ul className="mt-2 space-y-1 text-gray-600">
                    {reg.history.map(h => <li key={h.version}>Version {h.version}, from {new Date(h.effectiveFrom).toLocaleDateString('en-IN')}: {h.reason}</li>)}
                  </ul>
                </details>
              )}
            </div>

            <aside className="lg:sticky lg:top-4 rounded-2xl border bg-white p-4 shadow-sm" aria-live="polite">
              {group && <GroupPanel key={group.id} g={group} reg={reg} draft={draft} canEdit={canEdit} edit={edit} />}
              {param && <ParamPanel key={param.key} p={param} canEdit={canEdit} onSaved={refresh} />}
              {fixed && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-2 font-semibold text-gray-900"><Lock className="h-4 w-4 text-gray-400" />{fixed.title}</h3>
                  <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">{fixed.lines.map(l => <li key={l}>{l}</li>)}</ul>
                  <p className="text-xs text-gray-500">This stays in code on purpose. Ask a developer if it needs to change.</p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {reg && canEdit && changedGroups.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 md:left-[220px] border-t bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          {/* md:pr-64 keeps the buttons clear of the app's floating clock chip in the bottom-right corner */}
          <div className="px-4 md:px-6 md:pr-64 py-3 space-y-2">
            {check && (
              <div className={cn('rounded-lg p-2.5 text-sm', check.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
                {check.ok ? 'All checks passed. Safe to publish.' : <ul className="list-disc pl-5">{check.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <p className="text-sm font-medium text-gray-900 mr-2 self-center">{changedGroups.length} {changedGroups.length === 1 ? 'box' : 'boxes'} changed</p>
              <label className="text-xs text-gray-600">Applies to bills from<Input className="h-9 w-40" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} /></label>
              <label className="text-xs text-gray-600 flex-1 min-w-[180px]">Reason<Input className="h-9" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this changing?" /></label>
              <Button variant="outline" disabled={busy} onClick={runTest}>Test</Button>
              <Button disabled={busy || !reason.trim() || !startsOn} onClick={publish}>Publish</Button>
              <Button variant="ghost" disabled={busy} onClick={() => { setDraft(live); setCheck(null); }}>Discard changes</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function paramShort(p: ParamRow) {
  if (p.key === 'b2clThreshold') return formatINR(Number(p.value));
  if (p.key === 'whatsappRetryDelaysSec') return String(p.value).split(',').map(s => humanSec(Number(s))).join(', ');
  return `${p.value} ${p.unit}`;
}

function Arrow() {
  return <span className="flex items-center justify-center text-gray-300 self-center md:self-auto" aria-hidden><ArrowRight className="hidden md:block h-4 w-4" /><ArrowDown className="md:hidden h-4 w-4" /></span>;
}

function NodeButton({ title, sub, no, active, changed, locked, onClick }: { title: string; sub?: string; no?: number; active: boolean; changed?: boolean; locked?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        'relative text-left rounded-xl border px-3 py-2.5 min-w-[150px] max-w-full md:max-w-[220px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]',
        locked ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-white border-gray-200 hover:border-[#2d7a4f]/60',
        active && 'border-[#2d7a4f] ring-2 ring-[#2d7a4f]/25',
        changed && !active && 'border-amber-400',
      )}>
      <span className="flex items-center gap-2">
        {no !== undefined && <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2d7a4f]/10 text-[11px] font-medium text-[#2d7a4f]">{no}</span>}
        {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
        <span className={cn('text-sm font-medium', locked ? 'text-gray-600' : 'text-gray-900')}>{title}</span>
        {changed && <span className="ml-auto rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">changed</span>}
      </span>
      {sub && <span className="mt-0.5 block text-xs text-gray-500 truncate">{sub}</span>}
    </button>
  );
}

function GroupPanel({ g, reg, draft, canEdit, edit }: { g: Group; reg: Registry; draft: F; canEdit: boolean; edit: (p: F) => void }) {
  const live = reg.active.formulas;
  const current = g.options.find(o => Object.entries(o.set).every(([k, v]) => draft[k] === v));
  const slots = reg.slots.filter(s => g.slots.includes(s.key));
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900">{g.title}</h3>
        <p className="text-sm text-gray-600">{g.help}</p>
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900">Build it with blocks</h4>
        {slots.map(s => (
          <div key={s.key}>
            <p className="mb-1 text-xs text-gray-600"><b className="text-gray-800">{s.label}</b> = </p>
            <FormulaBuilder value={draft[s.key] ?? ''} disabled={!canEdit} onChange={t => edit({ [s.key]: t })}
              names={slotNames(s.key as SlotKey).map(n => ({ name: n, label: VAR_LABELS[n] ?? reg.slots.find(x => x.key === n)?.label ?? n }))} />
          </div>
        ))}
        <p className="text-xs text-gray-500">Change any value, number or sign from its dropdown. The “⋯” next to a block adds a calculation, rounding or an if / otherwise around it, or removes one. Amounts are in paise.</p>
      </div>
      <h4 className="text-sm font-medium text-gray-900 pt-1">Or start from a ready-made choice</h4>
      <div role="radiogroup" aria-label={`How ${g.title} works`} className="space-y-1.5">
        {!current && (
          <div className="rounded-lg border border-amber-400 bg-amber-50 p-2.5 text-sm"><b>Custom formula</b><span className="block text-xs text-amber-800">Changed with the blocks above. Pick a choice below to replace it.</span></div>
        )}
        {g.options.map(o => {
          const on = current?.id === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} disabled={!canEdit} onClick={() => edit(o.set)}
              className={cn('flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f] disabled:opacity-60',
                on ? 'border-[#2d7a4f] bg-[#2d7a4f]/5' : 'border-gray-200 hover:border-[#2d7a4f]/50')}>
              <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-[#2d7a4f] bg-[#2d7a4f] text-white' : 'border-gray-300')}>{on && <Check className="h-3 w-3" />}</span>
              <span><span className="block text-sm font-medium text-gray-900">{o.label}</span><span className="block text-xs text-gray-600">{o.desc}</span></span>
            </button>
          );
        })}
      </div>
      {canEdit && g.slots.some(s => draft[s] !== live[s]) && (
        <button type="button" className="text-xs text-gray-500 underline" onClick={() => edit(Object.fromEntries(g.slots.map(s => [s, live[s]])))}>Undo changes to this box</button>
      )}
      <details className="rounded-lg border border-gray-200 p-2.5 text-sm">
        <summary className="cursor-pointer font-medium text-gray-800">Advanced: type the formula</summary>
        <div className="mt-2 space-y-3">
          <p className="text-xs text-gray-500">For special cases only. Amounts are in paise. You can use + − × / %, comparisons, <code>? :</code>, <code>round floor ceil min max abs</code>. The built-in checks run before anything is published.</p>
          {slots.map(s => (
            <label key={s.key} className="block">
              <span className="text-xs font-medium text-gray-700">{s.label}</span>
              <Textarea className="mt-1 font-mono text-xs" rows={2} value={draft[s.key] ?? ''} disabled={!canEdit} onChange={e => edit({ [s.key]: e.target.value })} />
              <span className="text-[11px] text-gray-500">Names you can use: {s.vars.join(', ')}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function ParamPanel({ p, canEdit, onSaved }: { p: ParamRow; canEdit: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const isRupees = p.key === 'b2clThreshold';
  const show = (v: number | string) => (isRupees ? String(Number(v) / 100) : String(v));
  const [value, setValue] = useState(show(p.value));
  const [startsOn, setStartsOn] = useState(istDateKey());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const unchanged = value.trim() === show(p.value);

  const save = async () => {
    setErr('');
    const send = isRupees ? Math.round(Number(value) * 100) : value;
    if (isRupees && !Number.isFinite(Number(value))) { setErr('Enter an amount in rupees'); return; }
    try {
      await api.setBillingParam({ key: p.key, value: send, startsOn, reason });
      toast({ title: 'Saved', description: `${p.label} applies from ${startsOn}.` });
      setReason(''); onSaved();
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900">{p.label}</h3>
        <p className="text-xs text-gray-500">{p.module}</p>
        <p className="mt-1 text-sm text-gray-600">{p.help}</p>
      </div>
      <p className="text-sm text-gray-700">Now: <b>{paramShort(p)}</b>{p.lastChange && <span className="text-gray-500"> (since {new Date(p.lastChange.effectiveFrom).toLocaleDateString('en-IN')})</span>}</p>
      {canEdit ? (
        <div className="space-y-2">
          <label className="block text-xs text-gray-600">{isRupees ? 'New limit in rupees' : p.key === 'whatsappRetryDelaysSec' ? 'New delays in seconds, separated by commas' : 'New value in paise'}
            <Input value={value} onChange={e => setValue(e.target.value)} inputMode={p.key === 'whatsappRetryDelaysSec' ? 'text' : 'decimal'} />
          </label>
          {p.key === 'whatsappRetryDelaysSec' && <p className="text-xs text-gray-500">That means: {value.split(',').map(s => Number(s)).filter(n => n > 0).map(humanSec).join(' → ') || 'nothing yet'}</p>}
          <label className="block text-xs text-gray-600">Applies from<Input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} /></label>
          <label className="block text-xs text-gray-600">Reason<Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this changing?" /></label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button disabled={unchanged || !reason.trim()} onClick={save}>Save</Button>
        </div>
      ) : <p className="text-xs text-gray-500">You can view this setting but not change it.</p>}
    </div>
  );
}
