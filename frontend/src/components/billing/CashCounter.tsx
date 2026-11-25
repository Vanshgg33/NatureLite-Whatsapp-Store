'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { makeChange, sumCounts, type Counts } from '@/lib/billing/cash/cashChange';
import { denomLabel, toQty, type CashDrawer, type DrawerDenom } from '@/lib/billing/cash/drawer';

export type TenderStatus = 'NO_CASH' | 'SHORT' | 'EXACT' | 'CHANGE_OK' | 'CANNOT_CHANGE' | 'MANUAL_MISMATCH' | 'REFUND_OK';
export interface CashTender {
  received: Counts;
  returned: Counts;
  /** net cash that belongs to the bill: feeds the Cash (₹) payment */
  appliedRupees: number;
  changeRupees: number;
  status: TenderStatus;
  /** Save stays disabled while false */
  valid: boolean;
}

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
const within = (c: Counts, stock: Counts) => Object.entries(c).every(([k, n]) => (n || 0) <= (stock[k] || 0));

/**
 * The cash counter. mode 'collect': the cashier types the notes the customer handed over; the change is worked out
 * from what the drawer really holds plus those notes. mode 'refund': only the give-back column, for `amountRupees`.
 */
export function CashCounter({ mode = 'collect', amountRupees, drawer, received, onReceivedChange, onTender, disabled, onSkip }: {
  mode?: 'collect' | 'refund';
  /** collect: cash due (whole rupees); refund: cash to hand back */
  amountRupees: number;
  drawer: CashDrawer;
  /** collect only: the notes received, controlled by the page so Save & New can clear them */
  received: Counts;
  onReceivedChange: (c: Counts) => void;
  onTender: (t: CashTender) => void;
  disabled?: boolean;
  /** SOFT mode: lets the cashier skip counting (the page asks for the reason) */
  onSkip?: () => void;
}) {
  const refund = mode === 'refund';
  const defs = useMemo(() => drawer.denoms.filter(d => d.active).sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === 'note' ? -1 : 1)), [drawer.denoms]);
  const stock = drawer.counts;
  const rec = refund ? {} : received;
  const recTotal = sumCounts(rec, defs);
  const target = refund ? amountRupees : Math.max(0, recTotal - amountRupees); // change (or refund) to hand back

  // usable for change = drawer + the notes just handed over (the cashier can give back the customer's own notes)
  const usable = useMemo(() => {
    const u: Counts = { ...stock };
    for (const d of defs) u[d.id] = (u[d.id] || 0) + (rec[d.id] || 0);
    return u;
  }, [stock, rec, defs]);
  const plan = useMemo(() => makeChange(target, usable, defs), [target, usable, defs]);

  const [manual, setManual] = useState<Counts | null>(null); // cashier-edited change
  useEffect(() => setManual(null), [target]); // a new amount is worked out afresh
  const returned = manual ?? plan.returned;
  const retTotal = sumCounts(returned, defs);

  const status: TenderStatus = refund
    ? manual ? (retTotal === target && within(manual, usable) ? 'REFUND_OK' : 'MANUAL_MISMATCH') : plan.ok ? 'REFUND_OK' : 'CANNOT_CHANGE'
    : recTotal === 0 ? 'NO_CASH'
    : recTotal < amountRupees ? 'SHORT'
    : target === 0 ? 'EXACT'
    : manual ? (retTotal === target && within(manual, usable) ? 'CHANGE_OK' : 'MANUAL_MISMATCH')
    : plan.ok ? 'CHANGE_OK' : 'CANNOT_CHANGE';
  const valid = status !== 'CANNOT_CHANGE' && status !== 'MANUAL_MISMATCH';
  const giveBack = status === 'CHANGE_OK' || status === 'REFUND_OK' || status === 'MANUAL_MISMATCH' || status === 'CANNOT_CHANGE' ? returned : {};
  const applied = refund ? 0 : recTotal - (valid ? sumCounts(giveBack, defs) : 0);

  const last = useRef('');
  useEffect(() => {
    const t: CashTender = { received: rec, returned: valid ? giveBack : {}, appliedRupees: applied, changeRupees: valid ? sumCounts(giveBack, defs) : 0, status, valid };
    const key = JSON.stringify(t);
    if (key === last.current) return; // report only real changes (no render loop)
    last.current = key;
    onTender(t);
  });

  const setRec = (id: string, n: number) => onReceivedChange({ ...received, [id]: Math.max(0, Math.min(99999, n)) });
  const setRet = (id: string, n: number) => setManual({ ...returned, [id]: Math.max(0, Math.min(99999, n)) });
  const canEditChange = target > 0 && (refund || recTotal >= amountRupees);

  const focusRow = (i: number) => document.querySelector<HTMLInputElement>(`[data-cash-row="${mode}-${i}"]`)?.focus();
  const keys = (i: number, get: () => number, set: (n: number) => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); focusRow(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(i - 1); }
    else if (e.key === '+') { e.preventDefault(); set(get() + 1); }
    else if (e.key === '-') { e.preventDefault(); set(get() - 1); }
    else if (e.key === 'Escape' && !refund && recTotal > 0) {
      e.preventDefault(); e.stopPropagation();
      if (window.confirm('Clear the cash counter?')) onReceivedChange({});
    }
  };

  const stockChip = (d: DrawerDenom) => {
    const n = stock[d.id] || 0;
    const cls = n === 0 ? 'text-red-600 bg-red-50' : n <= (d.minLevel || 0) ? 'text-amber-700 bg-amber-50' : 'text-gray-400 bg-gray-50';
    return <span className={`text-[9px] px-1 rounded tabular-nums ${cls}`} title="In the drawer now">stock {n}</span>;
  };

  const qtyInput = (i: number, label: string, v: number, set: (n: number) => void, editable = true) => (
    <div className="flex items-center gap-0.5">
      <button type="button" tabIndex={-1} aria-label={`One less ${label}`} disabled={disabled || !editable || v === 0}
        className="h-9 w-8 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/50 disabled:opacity-30" onClick={() => set(v - 1)}>−</button>
      <input data-cash-row={`${mode}-${i}`} inputMode="numeric" pattern="[0-9]*" aria-label={`${label} count`} disabled={disabled || !editable}
        className="h-9 w-12 rounded border border-gray-200 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/40 disabled:bg-gray-50"
        value={v || ''} placeholder="0" onFocus={e => e.currentTarget.select()}
        onChange={e => set(toQty(e.target.value))} onKeyDown={keys(i, () => v, set)} />
      <button type="button" tabIndex={-1} aria-label={`One more ${label}`} disabled={disabled || !editable}
        className="h-9 w-8 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/50 disabled:opacity-30" onClick={() => set(v + 1)}>+</button>
    </div>
  );

  const groups = (['note', 'coin'] as const).map(kind => ({ kind, rows: defs.filter(d => d.kind === kind) })).filter(g => g.rows.length);
  const pill: Record<TenderStatus, [string, string]> = {
    NO_CASH: ['Type the notes received', 'text-gray-500 bg-gray-100'],
    SHORT: [`Short by ${inr(amountRupees - recTotal)}: balance stays due`, 'text-amber-800 bg-amber-100'],
    EXACT: ['Exact', 'text-green-800 bg-green-100'],
    CHANGE_OK: [`Give ${inr(target)} change`, 'text-green-800 bg-green-100'],
    REFUND_OK: [`Hand back ${inr(target)}`, 'text-green-800 bg-green-100'],
    CANNOT_CHANGE: [plan.tooLarge ? 'Change above ₹50,000: take part by UPI/bank' : `Cannot make ${inr(target)} ${refund ? 'refund' : 'change'}`, 'text-red-700 bg-red-100'],
    MANUAL_MISMATCH: [`${refund ? 'Refund' : 'Change'} does not add up (${inr(retTotal)} of ${inr(target)}${within(returned, usable) ? '' : ', more than the drawer holds'})`, 'text-red-700 bg-red-100'],
  };
  let row = 0;

  return (
    <MotionConfig reducedMotion="user">
    <motion.section aria-label={refund ? 'Cash refund' : 'Cash counter'} className="rounded-lg border border-[#2d7a4f]/30 bg-[#f4faf6] p-2.5"
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#1e5436]">{refund ? 'Cash refund' : 'Cash counter'}</span>
        <span className="text-xs text-gray-600">{refund ? 'to hand back' : 'to collect'} <b className="tabular-nums text-gray-900">{inr(amountRupees)}</b></span>
      </div>
      {drawer.lowStock.length > 0 && (
        <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mb-1">Low in drawer: {defs.filter(d => drawer.lowStock.includes(d.id)).map(denomLabel).join(', ')}</p>
      )}
      <div className="grid grid-cols-[1fr_auto_44px] gap-x-1 text-[9px] uppercase tracking-wide text-gray-400 px-0.5">
        <span>note / coin</span><span className="text-center">{refund ? 'hand back' : 'received'}</span><span className="text-right">{refund ? '' : 'give'}</span>
      </div>
      {groups.map(g => (
        <div key={g.kind}>
          <div className="text-[9px] font-semibold uppercase text-gray-400 mt-1">{g.kind === 'note' ? 'Notes' : 'Coins'}</div>
          {g.rows.map(d => {
            const i = row++;
            return (
              <div key={d.id} className="grid grid-cols-[1fr_auto_44px] items-center gap-x-1 py-0.5">
                <span className="flex flex-col leading-tight min-w-0">
                  <span className="text-sm font-semibold tabular-nums text-gray-800">{denomLabel(d)}</span>
                  {stockChip(d)}
                </span>
                {refund
                  ? qtyInput(i, denomLabel(d), returned[d.id] || 0, n => setRet(d.id, n))
                  : qtyInput(i, denomLabel(d), received[d.id] || 0, n => setRec(d.id, n))}
                <span className="text-right text-xs tabular-nums">
                  {refund ? null : manual
                    ? <input inputMode="numeric" aria-label={`Give back ${denomLabel(d)}`} disabled={disabled} value={returned[d.id] || ''} placeholder="0"
                        onFocus={e => e.currentTarget.select()} onChange={e => setRet(d.id, toQty(e.target.value))}
                        className="h-8 w-10 rounded border border-amber-300 text-center tabular-nums" />
                    : giveBack[d.id] ? <b className="text-[#2d7a4f]">give {giveBack[d.id]}</b> : <span className="text-gray-300">—</span>}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <div className="mt-2 border-t border-[#2d7a4f]/20 pt-1.5 space-y-1">
        {!refund && (
          <div className="flex justify-between text-xs tabular-nums">
            <span>Received <motion.b key={recTotal} className="inline-block" initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 0.12 }}>{inr(recTotal)}</motion.b></span>
            <span>Change <b>{inr(target)}</b></span>
          </div>
        )}
        <motion.div key={status} role="status" initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
          className={`text-[11px] font-semibold rounded px-1.5 py-1 transition-colors ${pill[status][1]}`}>{pill[status][0]}</motion.div>
        {status === 'CANNOT_CHANGE' && !plan.tooLarge && (
          <p className="text-[10px] text-red-700 leading-snug">
            Can give {inr(plan.paid)} of {inr(target)}, short {inr(plan.shortfall)}. {refund ? 'Add change to the drawer first, or edit the notes.' : 'Ask the customer for smaller notes, take part by UPI, or edit the change.'}
          </p>
        )}
        <div className="flex justify-between gap-2 text-[11px]">
          {canEditChange && !refund ? (
            <button type="button" className="text-[#2d7a4f] hover:underline disabled:opacity-40" disabled={disabled}
              onClick={() => setManual(manual ? null : { ...plan.returned })}>{manual ? 'Use suggested change' : 'Edit change'}</button>
          ) : refund && manual ? (
            <button type="button" className="text-[#2d7a4f] hover:underline" onClick={() => setManual(null)}>Use suggested notes</button>
          ) : <span />}
          {onSkip && <button type="button" className="text-gray-500 hover:underline disabled:opacity-40" disabled={disabled} onClick={onSkip}>Skip counting</button>}
        </div>
      </div>
    </motion.section>
    </MotionConfig>
  );
}
