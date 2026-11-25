'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
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

/** note / coin colours, after the printed notes: [fill, edge] */
const SWATCH: Record<string, [string, string]> = {
  N10: ['#dcecdf', '#a8c7ad'], N20: ['#f2d9ce', '#d7ac9a'], N50: ['#e3dff0', '#b9add4'], N100: ['#d6e8eb', '#a6c8cd'],
  N200: ['#e9d7c3', '#cdb495'], N500: ['#d9e5c4', '#b0c392'], N2000: ['#f3d6e0', '#d6a2b5'],
  C1: ['#eff0e6', '#c7c9b7'], C2: ['#e6e6e6', '#bdbdbd'], C5: ['#d7c7ad', '#b29b75'], C10: ['#d9d9d9', '#aaaaaa'], C20: ['#d9d9d9', '#aaaaaa'],
};
const swatch = (d: DrawerDenom): [string, string] => SWATCH[d.id] ?? (d.kind === 'note' ? ['#e5ece7', '#b6c4ba'] : ['#e6e6e6', '#bdbdbd']);

/** a rupee amount that eases to its new value (jumps straight there under reduced motion) */
function Rupees({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from.current === value) { from.current = value; setShown(value); return; }
    const start = from.current, t0 = performance.now(), ms = 220;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return <span className={`tabular-nums ${className ?? ''}`}>{inr(shown)}</span>;
}

/** the little note / coin picture */
function Face({ d, small }: { d: DrawerDenom; small?: boolean }) {
  const [fill, edge] = swatch(d);
  if (d.kind === 'coin') {
    return (
      <span aria-hidden className={`${small ? 'h-6 w-6 text-[8px]' : 'h-8 w-8 text-[9px]'} shrink-0 rounded-full border-2 grid place-items-center font-bold text-gray-600`}
        style={{ background: fill, borderColor: edge }}>₹{d.value}</span>
    );
  }
  return (
    <span aria-hidden className={`${small ? 'h-5 w-9' : 'h-8 w-14'} shrink-0 rounded-[4px] border grid place-items-center`} style={{ background: fill, borderColor: edge }}>
      <span className={`${small ? 'h-2.5 w-2.5' : 'h-4 w-4'} rounded-full border`} style={{ borderColor: edge }} />
    </span>
  );
}

/**
 * The cash counter. mode 'collect': the cashier counts the notes the customer handed over; the change is worked out
 * from what the drawer really holds plus those notes. mode 'refund': the notes to hand back, for `amountRupees`.
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

  const inDrawer = (d: DrawerDenom) => {
    const n = stock[d.id] || 0;
    const cls = n === 0 ? 'text-red-600' : n <= (d.minLevel || 0) ? 'text-amber-700' : 'text-gray-400';
    return <span className={`text-[10px] tabular-nums ${cls}`} title="In the drawer now">{n} in drawer</span>;
  };

  const btn = 'grid place-items-center rounded-md leading-none transition active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/60 disabled:opacity-30 disabled:active:scale-100';
  /** − count + ; the count box also takes + / − / arrows / Enter, so the buttons stay out of the Tab order */
  const stepper = (i: number, label: string, v: number, set: (n: number) => void, small = false) => (
    <div className="flex items-center gap-1">
      <button type="button" tabIndex={-1} aria-label={`One less ${label}`} disabled={disabled || v === 0}
        className={`${btn} ${small ? 'h-7 w-7 text-sm' : 'h-8 w-8 text-lg'} border border-gray-200 bg-gray-50 text-[#497b57] hover:bg-gray-100`} onClick={() => set(v - 1)}>−</button>
      <span className="relative">
        <input data-cash-row={`${mode}-${i}`} inputMode="numeric" pattern="[0-9]*" aria-label={`${label} count`} disabled={disabled}
          className={`${small ? 'h-7 w-9 text-xs' : 'h-8 w-11 text-sm'} rounded-md border border-transparent bg-transparent text-center font-semibold tabular-nums text-gray-800 focus:outline-none focus:border-[#2d7a4f]/50 focus:bg-white focus:ring-2 focus:ring-[#2d7a4f]/30`}
          value={v || ''} placeholder="0" onFocus={e => e.currentTarget.select()}
          onChange={e => set(toQty(e.target.value))} onKeyDown={keys(i, () => v, set)} />
        {/* a ring that pops on every change; it remounts, the input never does (so typing keeps focus) */}
        {v > 0 && (
          <motion.span key={v} aria-hidden className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-[#2d7a4f]"
            initial={{ opacity: 0.7, scale: 1 }} animate={{ opacity: 0, scale: 1.3 }} transition={{ duration: 0.35, ease: 'easeOut' }} />
        )}
      </span>
      <button type="button" tabIndex={-1} aria-label={`One more ${label}`} disabled={disabled}
        className={`${btn} ${small ? 'h-7 w-7 text-sm' : 'h-8 w-8 text-lg'} bg-[#477a54] text-white hover:bg-[#3d6a49]`} onClick={() => set(v + 1)}>+</button>
    </div>
  );

  // shown small to large, as on the counter tray (the change maker keeps its own order)
  const notes = defs.filter(d => d.kind === 'note').reverse();
  const coins = defs.filter(d => d.kind === 'coin').reverse();
  const qtyOf = (d: DrawerDenom) => (refund ? returned[d.id] : received[d.id]) || 0;
  const setQty = (d: DrawerDenom, n: number) => (refund ? setRet(d.id, n) : setRec(d.id, n));
  let row = 0;

  const message: Record<TenderStatus, [string, string]> = {
    NO_CASH: ['Count the notes and coins the customer handed over', 'text-gray-600 bg-gray-100'],
    SHORT: [`Short by ${inr(amountRupees - recTotal)}: the balance stays due on the bill`, 'text-amber-900 bg-amber-100'],
    EXACT: ['Exact amount received: no change to give', 'text-green-800 bg-green-100'],
    CHANGE_OK: [`Return ${inr(target)} to the customer`, 'text-green-800 bg-green-100'],
    REFUND_OK: [`Hand back ${inr(target)}`, 'text-green-800 bg-green-100'],
    CANNOT_CHANGE: [plan.tooLarge ? 'Change above ₹50,000: take part by UPI/bank' : `Cannot make ${inr(target)} ${refund ? 'refund' : 'change'} from the drawer`, 'text-red-700 bg-red-100'],
    MANUAL_MISMATCH: [`${refund ? 'Refund' : 'Change'} does not add up (${inr(retTotal)} of ${inr(target)}${within(returned, usable) ? '' : ', more than the drawer holds'})`, 'text-red-700 bg-red-100'],
  };
  const showReturn = !refund && target > 0;

  return (
    <MotionConfig reducedMotion="user">
      <motion.section aria-label={refund ? 'Cash refund' : 'Cash denomination'} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
        <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 border-b border-gray-100">
          <div>
            <h3 className="text-[15px] font-bold text-[#182e22]">{refund ? 'Cash refund' : 'Cash denomination'}</h3>
            <p className="text-[11px] text-gray-500">{refund ? 'Pick the notes and coins handed back' : 'Count cash received from customer'}</p>
          </div>
          <span className="text-[10px] font-semibold tracking-wider text-[#287344] bg-[#f0f7f1] rounded px-1.5 py-0.5">{refund ? 'REFUND' : 'REQUIRED'}</span>
        </header>

        <div className="p-3 space-y-3">
          <div className="rounded-lg border border-[#d7e9da] bg-[#f0f7f1] px-3 py-2 flex items-end justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold tracking-wide text-[#63766a]">{refund ? 'HANDING BACK' : 'CASH COUNTED'}</div>
              <Rupees value={refund ? retTotal : recTotal} className="text-xl font-bold text-[#287344]" />
            </div>
            <div className="text-right text-[11px] text-[#63766a]">
              {refund ? 'Refund' : 'Cash due'} <b className="tabular-nums text-gray-900">{inr(amountRupees)}</b>
            </div>
          </div>

          {drawer.lowStock.length > 0 && (
            <p className="text-[10px] text-amber-800 bg-amber-50 rounded px-2 py-1">Low in drawer: {defs.filter(d => drawer.lowStock.includes(d.id)).map(denomLabel).join(', ')}</p>
          )}

          {notes.length > 0 && (
            <div>
              <div className="text-[11px] font-bold tracking-wide text-[#34443a] mb-1.5">NOTES</div>
              <ul className="space-y-1.5">
                {notes.map(d => {
                  const i = row++;
                  const v = qtyOf(d);
                  return (
                    <li key={d.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors duration-150 ${v ? 'border-[#a8c7ad] bg-[#f6fbf7]' : 'border-gray-200 bg-white'}`}>
                      <Face d={d} />
                      <span className="flex-1 min-w-0 leading-tight">
                        <span className="block text-[15px] font-bold text-[#26372d]">₹{d.value}</span>
                        <span className="text-[10px] text-gray-400">NOTE · </span>{inDrawer(d)}
                      </span>
                      {stepper(i, denomLabel(d), v, n => setQty(d, n))}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {coins.length > 0 && (
            <div>
              <div className="text-[11px] font-bold tracking-wide text-[#34443a] mb-1.5">COINS</div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1.5">
                {coins.map(d => {
                  const i = row++;
                  const v = qtyOf(d);
                  return (
                    <li key={d.id} className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-colors duration-150 ${v ? 'border-[#a8c7ad] bg-[#f6fbf7]' : 'border-gray-200 bg-white'}`}>
                      <Face d={d} />
                      <span className="text-[11px] font-bold text-[#26372d]">{d.value >= 10 ? `₹${d.value} coin` : `₹${d.value}`}</span>
                      {stepper(i, denomLabel(d), v, n => setQty(d, n), true)}
                      {inDrawer(d)}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* the customer gave more than the bill: how much to give back, and in which notes */}
          <AnimatePresence initial={false}>
            {showReturn && (
              <motion.div key="return" role="region" aria-label="Change to return"
                initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className={`rounded-xl border-2 p-3 ${valid ? 'border-[#2d7a4f] bg-[#f0f7f1]' : 'border-red-300 bg-red-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-[#63766a]">RETURN TO CUSTOMER</div>
                    <Rupees value={target} className={`text-2xl font-extrabold ${valid ? 'text-[#1e5436]' : 'text-red-700'}`} />
                  </div>
                  <div className="text-right text-[11px] text-gray-600 leading-snug">
                    Received <b className="tabular-nums">{inr(recTotal)}</b><br />Due <b className="tabular-nums">{inr(amountRupees)}</b>
                  </div>
                </div>
                {!manual ? (
                  <ul aria-label="Notes and coins to give back" className="mt-2 flex flex-wrap gap-1.5">
                    <AnimatePresence initial={false}>
                      {defs.filter(d => giveBack[d.id]).map((d, k) => (
                        <motion.li key={d.id} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15, delay: k * 0.04 }}
                          className="flex items-center gap-1.5 rounded-md bg-white border border-[#d7e9da] px-1.5 py-1 text-xs">
                          <Face d={d} small /><b className="tabular-nums text-[#1e5436]">{giveBack[d.id]} ×</b><span>{denomLabel(d)}</span>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                ) : (
                  <ul aria-label="Change to give back (edited)" className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-1.5">
                    {defs.map(d => (
                      <li key={d.id} className="flex items-center justify-between gap-1 rounded-md bg-white border border-amber-200 px-1.5 py-1 text-xs">
                        <span className="flex items-center gap-1"><Face d={d} small />{denomLabel(d)}</span>
                        <input inputMode="numeric" aria-label={`Give back ${denomLabel(d)}`} disabled={disabled} value={returned[d.id] || ''} placeholder="0"
                          onFocus={e => e.currentTarget.select()} onChange={e => setRet(d.id, toQty(e.target.value))}
                          className="h-7 w-10 rounded border border-amber-300 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={status} role="status" aria-live="polite"
              initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
              className={`text-[12px] font-semibold rounded-md px-2 py-1.5 ${message[status][1]}`}>
              {message[status][0]}
            </motion.div>
          </AnimatePresence>
          {status === 'CANNOT_CHANGE' && !plan.tooLarge && (
            <p className="text-[11px] text-red-700 leading-snug">
              Can give {inr(plan.paid)} of {inr(target)}, short {inr(plan.shortfall)}. {refund ? 'Add change to the drawer first, or edit the notes.' : 'Ask the customer for smaller notes, take part by UPI, or edit the change.'}
            </p>
          )}

          <div className="flex justify-between gap-2 text-[11px]">
            {canEditChange && !refund ? (
              <button type="button" className="rounded text-[#2d7a4f] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/50 disabled:opacity-40" disabled={disabled}
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
