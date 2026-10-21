'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/utils';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

type Tab = 'accounts' | 'payments' | 'expenses' | 'purchases' | 'stock';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'accounts', label: 'Accounts & Opening' }, { key: 'payments', label: 'Payment In / Out' },
  { key: 'expenses', label: 'Expenses & Income' }, { key: 'purchases', label: 'Purchases' }, { key: 'stock', label: 'Stock' },
];

const inr = (paise: number) => '₹' + ((paise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);
const INPUT = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f] w-full';
const TH = 'px-3 py-2 text-left text-xs font-semibold text-gray-500 bg-gray-50 whitespace-nowrap';
const TD = 'px-3 py-2 text-sm text-gray-700 whitespace-nowrap';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-gray-500 space-y-1"><span>{label}</span>{children}</label>;
}

/** Customer (links to the customer's ledger by id) or a free-text name (suppliers). */
function PartyPicker({ value, onChange, allowFree = true }: { value: { id: string; name: string }; onChange: (v: { id: string; name: string }) => void; allowFree?: boolean }) {
  const [q, setQ] = useState(value.name);
  const dq = useDebouncedValue(q, 250);
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setQ(value.name); }, [value.name]);
  useEffect(() => { if (dq && open) api.searchBillingCustomers(dq).then(setResults).catch(() => {}); }, [dq, open]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <input className={INPUT} value={q} placeholder="Search customer or type a name…" onFocus={() => setOpen(true)}
        onChange={e => { setQ(e.target.value); setOpen(true); if (allowFree) onChange({ id: '', name: e.target.value }); }} />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-auto">
          {results.map(c => (
            <button key={c._id} type="button" className="w-full text-left px-3 py-2 hover:bg-[#f7faf8] text-sm"
              onClick={() => { onChange({ id: c._id, name: c.name }); setQ(c.name); setOpen(false); }}>
              {c.name} <span className="text-xs text-gray-400 font-mono">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductPicker({ value, onChange }: { value: { id: string; name: string }; onChange: (v: { id: string; name: string }) => void }) {
  const [q, setQ] = useState(value.name);
  const dq = useDebouncedValue(q, 250);
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (dq && open) api.searchBillingProducts(dq).then(setResults).catch(() => {}); }, [dq, open]);
  return (
    <div className="relative">
      <input className={INPUT} value={q} placeholder="Search product…" onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); }} />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-auto">
          {results.map(p => (
            <button key={p._id ?? p.productId} type="button" className="w-full text-left px-3 py-2 hover:bg-[#f7faf8] text-sm"
              onClick={() => { onChange({ id: p._id ?? p.productId, name: p.name }); setQ(p.name); setOpen(false); }}>
              {p.name} <span className="text-xs text-gray-400">{p.sku}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useBooks(path: string, params?: any) {
  return useQuery({ queryKey: ['books', path, params], queryFn: () => api.billingBooks('get', path, params) });
}
function useSave(path: string, method: 'post' | 'put' | 'patch' = 'post') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.billingBooks(method, path, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['books'] }),
  });
}
const errMsg = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white rounded-xl shadow-sm p-4 space-y-3"><div className="text-sm font-semibold text-gray-800">{title}</div>{children}</div>;
}

// ── Accounts & opening ───────────────────────────────────────────────────────

function AccountsTab() {
  const accounts = useBooks('accounts');
  const opening = useBooks('opening');
  const addAccount = useSave('accounts');
  const saveOpening = useSave('opening', 'put');
  const [a, setA] = useState({ name: '', kind: 'CASH', openingBalanceRupees: '' });
  const [o, setO] = useState({ asOn: '', retained: '', upi: '', card: '', bank: '' });
  const [parties, setParties] = useState<Array<{ partyId: string; name: string; balanceRupees: string }>>([]);
  const [np, setNp] = useState({ id: '', name: '' });
  const [npBal, setNpBal] = useState('');
  useEffect(() => {
    const d = opening.data;
    if (!d) return;
    setO({ asOn: d.asOn ? new Date(new Date(d.asOn).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) : '', retained: String((d.retainedEarningsPaise ?? 0) / 100), upi: d.modeAccountMap?.upi ?? '', card: d.modeAccountMap?.card ?? '', bank: d.modeAccountMap?.bank ?? '' });
    setParties((d.partyOpenings ?? []).map((p: any) => ({ partyId: p.partyId, name: p.name, balanceRupees: String(p.balancePaise / 100) })));
  }, [opening.data]);
  const bankish = (accounts.data ?? []).filter((x: any) => x.kind !== 'CASH');

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Cash / bank / wallet accounts">
        <table className="w-full"><thead><tr><th className={TH}>Name</th><th className={TH}>Type</th><th className={TH}>Opening</th></tr></thead>
          <tbody>{(accounts.data ?? []).map((x: any) => <tr key={x._id} className="border-t"><td className={TD}>{x.name}</td><td className={TD}>{x.kind}</td><td className={TD}>{inr(x.openingBalancePaise)}</td></tr>)}</tbody></table>
        <div className="grid grid-cols-4 gap-2 items-end">
          <Field label="Name"><input className={INPUT} value={a.name} onChange={e => setA({ ...a, name: e.target.value })} /></Field>
          <Field label="Type"><select className={INPUT} value={a.kind} onChange={e => setA({ ...a, kind: e.target.value })}><option>CASH</option><option>BANK</option><option>WALLET</option></select></Field>
          <Field label="Opening ₹"><input className={INPUT} type="number" value={a.openingBalanceRupees} onChange={e => setA({ ...a, openingBalanceRupees: e.target.value })} /></Field>
          <Button size="sm" disabled={!a.name} onClick={() => addAccount.mutate({ ...a, openingBalanceRupees: Number(a.openingBalanceRupees || 0) }, { onSuccess: () => setA({ name: '', kind: 'CASH', openingBalanceRupees: '' }) })}><Plus className="h-3.5 w-3.5" /> Add</Button>
        </div>
        {addAccount.isError && <div className="text-xs text-red-600">{errMsg(addAccount.error)}</div>}
      </Panel>

      <Panel title="Opening balances">
        <p className="text-xs text-gray-500">Owner&apos;s equity is derived from these (assets − liabilities − retained earnings), so the Trial Balance has no opening plug.</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Books opened on"><input className={INPUT} type="date" value={o.asOn} onChange={e => setO({ ...o, asOn: e.target.value })} /></Field>
          <Field label="Retained earnings (prior years) ₹"><input className={INPUT} type="number" value={o.retained} onChange={e => setO({ ...o, retained: e.target.value })} /></Field>
          {(['upi', 'card', 'bank'] as const).map(m => (
            <Field key={m} label={`${m.toUpperCase()} payments settle into`}>
              <select className={INPUT} value={o[m]} onChange={e => setO({ ...o, [m]: e.target.value })}><option value="">Default bank</option>{bankish.map((x: any) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>
            </Field>
          ))}
        </div>
        <div className="text-xs font-semibold text-gray-500 pt-1">Party opening balances (+ they owe us, − we owe them)</div>
        {parties.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm"><span className="flex-1 truncate">{p.name}</span><span>₹{p.balanceRupees}</span>
            <button onClick={() => setParties(parties.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button></div>
        ))}
        <div className="grid grid-cols-[1fr_7rem_auto] gap-2 items-end">
          <Field label="Party"><PartyPicker value={np} onChange={setNp} /></Field>
          <Field label="Balance ₹"><input className={INPUT} type="number" value={npBal} onChange={e => setNpBal(e.target.value)} /></Field>
          <Button size="sm" variant="outline" disabled={!np.name || !npBal} onClick={() => { setParties([...parties, { partyId: np.id, name: np.name, balanceRupees: npBal }]); setNp({ id: '', name: '' }); setNpBal(''); }}>Add</Button>
        </div>
        <Button size="sm" disabled={!o.asOn || saveOpening.isPending} onClick={() => saveOpening.mutate({
          asOn: o.asOn, retainedEarningsRupees: Number(o.retained || 0),
          partyOpenings: parties.map(p => ({ ...p, balanceRupees: Number(p.balanceRupees) })),
          modeAccountMap: Object.fromEntries((['upi', 'card', 'bank'] as const).filter(m => o[m]).map(m => [m, o[m]])),
        })}>{saveOpening.isPending ? 'Saving…' : 'Save opening balances'}</Button>
        {saveOpening.isSuccess && <span className="text-xs text-green-700 ml-2">Saved</span>}
        {saveOpening.isError && <div className="text-xs text-red-600">{errMsg(saveOpening.error)}</div>}
      </Panel>
    </div>
  );
}

// ── Payments ─────────────────────────────────────────────────────────────────

function PaymentsTab() {
  const list = useBooks('payments');
  const accounts = useBooks('accounts');
  const save = useSave('payments');
  const [f, setF] = useState({ type: 'IN', mode: 'cash', amount: '', discount: '', date: today(), accountId: '', note: '' });
  const [party, setParty] = useState({ id: '', name: '' });
  const qc = useQueryClient();
  const cheque = useMutation({
    mutationFn: ({ id, ...b }: any) => api.billingBooks('patch', `payments/${id}/cheque`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['books'] }),
  });
  return (
    <div className="space-y-4">
      <Panel title="Record a payment">
        <div className="grid sm:grid-cols-4 gap-2 items-end">
          <Field label="Type"><select className={INPUT} value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="IN">Payment In (from customer)</option><option value="OUT">Payment Out (to supplier)</option></select></Field>
          <div className="sm:col-span-2"><Field label="Party"><PartyPicker value={party} onChange={setParty} /></Field></div>
          <Field label="Mode"><select className={INPUT} value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}>{['cash', 'upi', 'card', 'bank', 'cheque'].map(m => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Amount ₹"><input className={INPUT} type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Discount given ₹"><input className={INPUT} type="number" value={f.discount} onChange={e => setF({ ...f, discount: e.target.value })} /></Field>
          <Field label="Date"><input className={INPUT} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Account (optional)"><select className={INPUT} value={f.accountId} onChange={e => setF({ ...f, accountId: e.target.value })}><option value="">Auto by mode</option>{(accounts.data ?? []).map((x: any) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></Field>
        </div>
        <Button size="sm" disabled={!party.name || !Number(f.amount) || save.isPending}
          onClick={() => save.mutate({ type: f.type, mode: f.mode, partyId: party.id || undefined, partyName: party.name, amountRupees: Number(f.amount), discountRupees: Number(f.discount || 0), date: f.date, accountId: f.accountId || undefined, note: f.note },
            { onSuccess: () => { setF({ ...f, amount: '', discount: '' }); setParty({ id: '', name: '' }); } })}>Save payment</Button>
        {save.isError && <div className="text-xs text-red-600">{errMsg(save.error)}</div>}
      </Panel>
      <div className="bg-white rounded-xl shadow-sm overflow-auto">
        <table className="w-full"><thead><tr>{['Date', 'Type', 'Party', 'Mode', 'Amount', 'Discount', 'Status', ''].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>{(list.data ?? []).map((p: any) => (
            <tr key={p._id} className="border-t"><td className={TD}>{day(p.date)}</td><td className={TD}>{p.type === 'IN' ? 'Payment-In' : 'Payment-Out'}</td><td className={TD}>{p.partyName}</td><td className={TD}>{p.mode}</td>
              <td className={`${TD} text-right`}>{inr(p.amountPaise)}</td><td className={`${TD} text-right`}>{inr(p.discountPaise)}</td><td className={TD}>{p.mode === 'cheque' ? p.status : '—'}</td>
              <td className={TD}>{p.status === 'UNDEPOSITED' && (<span className="space-x-2">
                <button className="text-xs text-[#2d7a4f] underline" onClick={() => cheque.mutate({ id: p._id, status: 'CLEARED' })}>Clear</button>
                <button className="text-xs text-red-600 underline" onClick={() => cheque.mutate({ id: p._id, status: 'BOUNCED' })}>Bounced</button></span>)}</td></tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}

// ── Expenses ─────────────────────────────────────────────────────────────────

function ExpensesTab() {
  const list = useBooks('expenses');
  const save = useSave('expenses');
  const qc = useQueryClient();
  const del = useMutation({ mutationFn: (id: string) => api.billingBooks('delete', `expenses/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['books'] }) });
  const [f, setF] = useState({ category: '', amount: '', mode: 'cash', kind: 'indirect', date: today(), note: '' });
  return (
    <div className="space-y-4">
      <Panel title="Add an expense or other income">
        <div className="grid sm:grid-cols-5 gap-2 items-end">
          <Field label="Category"><input className={INPUT} value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="Rent, Freight, Loan Interest…" /></Field>
          <Field label="Amount ₹"><input className={INPUT} type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Kind"><select className={INPUT} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="indirect">Indirect expense</option><option value="direct">Direct expense</option><option value="income">Other income</option></select></Field>
          <Field label="Paid via"><select className={INPUT} value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}>{['cash', 'upi', 'card', 'bank'].map(m => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Date"><input className={INPUT} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Button size="sm" disabled={!f.category || !Number(f.amount) || save.isPending}
          onClick={() => save.mutate({ category: f.category, amountRupees: Number(f.amount), mode: f.mode, direct: f.kind === 'direct', isIncome: f.kind === 'income', date: f.date, note: f.note }, { onSuccess: () => setF({ ...f, category: '', amount: '' }) })}>Save</Button>
        {save.isError && <div className="text-xs text-red-600">{errMsg(save.error)}</div>}
      </Panel>
      <div className="bg-white rounded-xl shadow-sm overflow-auto">
        <table className="w-full"><thead><tr>{['Date', 'Category', 'Kind', 'Amount', 'Mode', ''].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>{(list.data ?? []).map((e: any) => (
            <tr key={e._id} className="border-t"><td className={TD}>{day(e.date)}</td><td className={TD}>{e.category}</td><td className={TD}>{e.isIncome ? 'Income' : e.direct ? 'Direct' : 'Indirect'}</td>
              <td className={`${TD} text-right`}>{inr(e.amountPaise)}</td><td className={TD}>{e.mode}</td>
              <td className={TD}><button className="text-gray-400 hover:text-red-500" onClick={() => del.mutate(e._id)}><X className="h-3.5 w-3.5" /></button></td></tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}

// ── Purchases ────────────────────────────────────────────────────────────────

const blankItem = () => ({ product: { id: '', name: '' }, hsnCode: '', qty: '1', rate: '', gstRate: '5', priceInclTax: false });

function PurchasesTab() {
  const list = useBooks('purchases');
  const save = useSave('purchases');
  const qc = useQueryClient();
  const cancel = useMutation({ mutationFn: (id: string) => api.billingBooks('patch', `purchases/${id}/cancel`), onSuccess: () => qc.invalidateQueries({ queryKey: ['books'] }) });
  const [h, setH] = useState({ supplier: '', gstin: '', state: '22', date: today(), debit: false, itc: 'ELIGIBLE', rcm: false, paid: '', mode: 'cash', roundOff: true });
  const [items, setItems] = useState([blankItem()]);
  const valid = h.supplier && items.every(i => i.product.name && Number(i.qty) > 0 && Number(i.rate) >= 0);
  return (
    <div className="space-y-4">
      <Panel title="New purchase bill / debit note">
        <div className="grid sm:grid-cols-4 gap-2 items-end">
          <Field label="Supplier"><input className={INPUT} value={h.supplier} onChange={e => setH({ ...h, supplier: e.target.value })} /></Field>
          <Field label="Supplier GSTIN"><input className={INPUT} value={h.gstin} onChange={e => setH({ ...h, gstin: e.target.value.toUpperCase() })} /></Field>
          <Field label="State code (supply)"><input className={INPUT} value={h.state} onChange={e => setH({ ...h, state: e.target.value })} /></Field>
          <Field label="Date"><input className={INPUT} type="date" value={h.date} onChange={e => setH({ ...h, date: e.target.value })} /></Field>
          <Field label="ITC"><select className={INPUT} value={h.itc} onChange={e => setH({ ...h, itc: e.target.value })}><option value="ELIGIBLE">Eligible</option><option value="INELIGIBLE_17_5">Ineligible – sec 17(5)</option><option value="OTHER_INELIGIBLE">Ineligible – other</option></select></Field>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={h.rcm} onChange={e => setH({ ...h, rcm: e.target.checked })} /> Reverse charge</label>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={h.debit} onChange={e => setH({ ...h, debit: e.target.checked })} /> This is a debit note</label>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={h.roundOff} onChange={e => setH({ ...h, roundOff: e.target.checked })} /> Round off</label>
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_5rem_6rem_5rem_auto_auto] gap-2 items-end">
            <Field label="Item"><ProductPicker value={it.product} onChange={p => setItems(items.map((x, j) => j === i ? { ...x, product: p } : x))} /></Field>
            <Field label="HSN"><input className={INPUT} value={it.hsnCode} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, hsnCode: e.target.value } : x))} /></Field>
            <Field label="Qty"><input className={INPUT} type="number" value={it.qty} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} /></Field>
            <Field label="Rate ₹"><input className={INPUT} type="number" value={it.rate} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} /></Field>
            <Field label="GST %"><input className={INPUT} type="number" value={it.gstRate} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, gstRate: e.target.value } : x))} /></Field>
            <label className="flex items-center gap-1 text-xs pb-2"><input type="checkbox" checked={it.priceInclTax} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, priceInclTax: e.target.checked } : x))} /> incl. GST</label>
            <button className="pb-2 text-gray-400 hover:text-red-500" onClick={() => setItems(items.filter((_, j) => j !== i).length ? items.filter((_, j) => j !== i) : [blankItem()])}><X className="h-4 w-4" /></button>
          </div>
        ))}
        <div className="flex items-end gap-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setItems([...items, blankItem()])}><Plus className="h-3.5 w-3.5" /> Add item</Button>
          <Field label={h.debit ? 'Refund received ₹' : 'Paid now ₹'}><input className={INPUT} type="number" value={h.paid} onChange={e => setH({ ...h, paid: e.target.value })} /></Field>
          <Field label="Via"><select className={INPUT} value={h.mode} onChange={e => setH({ ...h, mode: e.target.value })}>{['cash', 'upi', 'card', 'bank'].map(m => <option key={m}>{m}</option>)}</select></Field>
          <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate({
            supplierName: h.supplier, supplierGstin: h.gstin || undefined, stateOfSupply: h.state, date: h.date, isDebitNote: h.debit, itcEligibility: h.itc, reverseCharge: h.rcm,
            paidRupees: Number(h.paid || 0), paymentMode: h.mode, roundOff: h.roundOff,
            items: items.map(i => ({ productId: i.product.id || undefined, name: i.product.name, hsnCode: i.hsnCode, qty: Number(i.qty), rate: Number(i.rate), gstRate: Number(i.gstRate), priceInclTax: i.priceInclTax })),
          }, { onSuccess: () => { setItems([blankItem()]); setH({ ...h, supplier: '', gstin: '', paid: '' }); } })}>Save</Button>
        </div>
        {save.isError && <div className="text-xs text-red-600">{errMsg(save.error)}</div>}
      </Panel>
      <div className="bg-white rounded-xl shadow-sm overflow-auto">
        <table className="w-full"><thead><tr>{['Date', 'Doc No', 'Supplier', 'Total', 'Paid', 'ITC', 'Status', ''].map(x => <th key={x} className={TH}>{x}</th>)}</tr></thead>
          <tbody>{(list.data ?? []).map((p: any) => (
            <tr key={p._id} className={`border-t ${p.status === 'cancelled' ? 'opacity-50' : ''}`}><td className={TD}>{day(p.date)}</td><td className={`${TD} font-mono text-xs`}>{p.docNo}</td><td className={TD}>{p.supplierName}</td>
              <td className={`${TD} text-right`}>{inr(p.totalPaise)}</td><td className={`${TD} text-right`}>{inr(p.paidPaise)}</td><td className={TD}>{p.itcEligibility}{p.reverseCharge ? ' · RCM' : ''}</td><td className={TD}>{p.status}</td>
              <td className={TD}>{p.status !== 'cancelled' && <button className="text-xs text-red-600 underline" onClick={() => cancel.mutate(p._id)}>Cancel</button>}</td></tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}

// ── Stock ────────────────────────────────────────────────────────────────────

function StockTab() {
  const list = useBooks('stock-entries');
  const save = useSave('stock-entries');
  const [f, setF] = useState({ kind: 'OPENING', qty: '', cost: '', date: today(), note: '' });
  const [prod, setProd] = useState({ id: '', name: '' });
  return (
    <div className="space-y-4">
      <Panel title="Opening stock / adjustment">
        <p className="text-xs text-gray-500">Purchases and sales move stock automatically. Use this for the opening quantity (dated on the day your books open) and for corrections such as damage or recount (use a negative quantity to reduce).</p>
        <div className="grid sm:grid-cols-5 gap-2 items-end">
          <Field label="Kind"><select className={INPUT} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="OPENING">Opening stock</option><option value="ADJUST">Adjustment</option></select></Field>
          <div className="sm:col-span-2"><Field label="Product"><ProductPicker value={prod} onChange={setProd} /></Field></div>
          <Field label="Quantity (± for adjustments)"><input className={INPUT} type="number" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} /></Field>
          <Field label="Unit cost ₹ (pre-tax)"><input className={INPUT} type="number" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></Field>
        </div>
        <Button size="sm" disabled={!prod.id || !Number(f.qty) || save.isPending}
          onClick={() => save.mutate({ kind: f.kind, productId: prod.id, name: prod.name, qty: Number(f.qty), unitCostRupees: f.cost ? Number(f.cost) : undefined, date: f.date }, { onSuccess: () => { setProd({ id: '', name: '' }); setF({ ...f, qty: '', cost: '' }); } })}>Save</Button>
        {save.isError && <div className="text-xs text-red-600">{errMsg(save.error)}</div>}
      </Panel>
      <div className="bg-white rounded-xl shadow-sm overflow-auto">
        <table className="w-full"><thead><tr>{['Date', 'Kind', 'Product', 'Qty', 'Unit cost'].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>{(list.data ?? []).map((e: any) => (
            <tr key={e._id} className="border-t"><td className={TD}>{day(e.date)}</td><td className={TD}>{e.kind}</td><td className={TD}>{e.name}</td><td className={`${TD} text-right`}>{e.qty}</td><td className={`${TD} text-right`}>{e.unitCostPaise != null ? inr(e.unitCostPaise) : '—'}</td></tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}

export default function BooksPage() {
  const [tab, setTab] = useState<Tab>('accounts');
  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header title="Books & Stock" description="Accounts, payments, expenses, purchases and stock that feed P&L, Trial Balance and Balance Sheet" icon={<BookOpen className="h-6 w-6 text-[#2d7a4f]" />} />
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap gap-1 bg-white rounded-xl p-1 shadow-sm w-fit max-w-full">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-[#2d7a4f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{t.label}</button>
          ))}
        </div>
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'expenses' && <ExpensesTab />}
        {tab === 'purchases' && <PurchasesTab />}
        {tab === 'stock' && <StockTab />}
      </div>
    </div>
  );
}
