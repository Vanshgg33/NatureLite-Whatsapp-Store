// Bill-calculation formulas as editable expressions, with a tiny safe evaluator (no eval, no Function).
// SYNC: byte-identical copy lives at frontend/src/lib/billing/formula-engine.ts (a frontend test fails if they differ).
// All money values are integer paise. Every formula result must be a finite integer or the bill is refused.

export type Vars = Record<string, number>;
type Fn = (v: Vars) => number;

/** A parsed formula. The Logics page edits this tree as blocks and prints it back to text. */
export type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; n: string }
  | { t: 'un'; op: '-' | '!'; e: Node }
  | { t: 'bin'; op: string; l: Node; r: Node }
  | { t: 'call'; f: string; args: Node[] }
  | { t: 'if'; c: Node; a: Node; b: Node };

const FUNCS = new Map<string, (...a: number[]) => number>([
  ['round', Math.round], ['floor', Math.floor], ['ceil', Math.ceil],
  ['min', Math.min], ['max', Math.max], ['abs', Math.abs],
]);
const b = (x: boolean) => (x ? 1 : 0);
const BIN = new Map<string, (a: number, c: number) => number>([
  ['*', (a, c) => a * c], ['/', (a, c) => a / c], ['%', (a, c) => a % c],
  ['+', (a, c) => a + c], ['-', (a, c) => a - c],
  ['<', (a, c) => b(a < c)], ['>', (a, c) => b(a > c)], ['<=', (a, c) => b(a <= c)], ['>=', (a, c) => b(a >= c)],
  ['==', (a, c) => b(a === c)], ['!=', (a, c) => b(a !== c)],
  ['&&', (a, c) => b(a !== 0 && c !== 0)], ['||', (a, c) => b(a !== 0 || c !== 0)],
]);
/** Binary operators from loosest to tightest binding. */
const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];
const PREC: Record<string, number> = {};
LEVELS.forEach((ops, i) => ops.forEach(o => { PREC[o] = i + 1; }));

export function parseExpr(src: string): Node {
  if (src.length > 300) throw new Error('Formula is too long (max 300 characters)');
  const toks = src.match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|<=|>=|==|!=|&&|\|\||[-+*/%<>!?:(),]|\S/g) ?? [];
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (t: string) => { if (next() !== t) throw new Error(`Expected "${t}"`); };

  const level = (i: number): Node => {
    if (i === LEVELS.length) return unary();
    let l = level(i + 1);
    for (let op = peek(); op !== undefined && LEVELS[i].includes(op); op = peek()) { next(); l = { t: 'bin', op, l, r: level(i + 1) }; }
    return l;
  };
  const unary = (): Node => {
    const t = peek();
    if (t === '-' || t === '!') { next(); return { t: 'un', op: t, e: unary() }; }
    return primary();
  };
  const primary = (): Node => {
    const t = next();
    if (t === undefined) throw new Error('Formula ends too early');
    if (/^\d/.test(t)) return { t: 'num', v: Number(t) };
    if (t === '(') { const e = ternary(); expect(')'); return e; }
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() !== '(') return { t: 'var', n: t };
      next();
      if (!FUNCS.has(t)) throw new Error(`Unknown function "${t}"`);
      const args: Node[] = [];
      if (peek() !== ')') { do { args.push(ternary()); } while (peek() === ',' && next()); }
      expect(')');
      return { t: 'call', f: t, args };
    }
    throw new Error(`Unexpected "${t}"`);
  };
  const ternary = (): Node => {
    const c = level(0);
    if (peek() !== '?') return c;
    next();
    const a = ternary(); expect(':'); const e = ternary();
    return { t: 'if', c, a, b: e };
  };
  const ast = ternary();
  if (p < toks.length) throw new Error(`Unexpected "${toks[p]}"`);
  return ast;
}

/** Text form of a tree, with only the brackets that are needed. parseExpr(printExpr(n)) gives n back. */
export function printExpr(n: Node, min = 0): string {
  let own = 8;
  let s: string;
  switch (n.t) {
    case 'num': s = /e/i.test(String(n.v)) ? n.v.toFixed(20).replace(/0+$/, '').replace(/\.$/, '') : String(n.v); break;
    case 'var': s = n.n; break;
    case 'un': own = 7; s = n.op + printExpr(n.e, 7); break;
    case 'bin': own = PREC[n.op]; s = `${printExpr(n.l, own)} ${n.op} ${printExpr(n.r, own + 1)}`; break;
    case 'call': s = `${n.f}(${n.args.map(a => printExpr(a)).join(', ')})`; break;
    case 'if': own = 0; s = `${printExpr(n.c, 1)} ? ${printExpr(n.a)} : ${printExpr(n.b)}`; break;
  }
  return own < min ? `(${s})` : s;
}

function toFn(n: Node): Fn {
  switch (n.t) {
    case 'num': return () => n.v;
    case 'var': { const name = n.n; return v => { if (!Object.prototype.hasOwnProperty.call(v, name)) throw new Error(`Unknown name "${name}"`); return v[name]; }; }
    case 'un': { const e = toFn(n.e); return n.op === '-' ? v => -e(v) : v => b(e(v) === 0); }
    case 'bin': { const l = toFn(n.l), r = toFn(n.r), f = BIN.get(n.op)!; return v => f(l(v), r(v)); }
    case 'call': { const f = FUNCS.get(n.f)!, args = n.args.map(toFn); return v => f(...args.map(a => a(v))); }
    case 'if': { const c = toFn(n.c), x = toFn(n.a), y = toFn(n.b); return v => (c(v) !== 0 ? x(v) : y(v)); }
  }
}

const cache = new Map<string, Fn>();
function compile(src: string): Fn {
  const hit = cache.get(src);
  if (hit) return hit;
  const fn = toFn(parseExpr(src));
  if (cache.size > 500) cache.clear();
  cache.set(src, fn);
  return fn;
}

// ─── Formula slots ───────────────────────────────────────────────────────────

export const SLOT_KEYS = [
  'gross', 'lineDisc', 'preTaxable', 'billDiscAmt', 'billDiscAlloc', 'taxable',
  'taxAmt', 'cgst', 'sgst', 'igst', 'lineTotal', 'grandBefore', 'grandTotal',
] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];
export type Formulas = Record<SlotKey, string>;

export const DEFAULT_FORMULAS: Formulas = {
  gross: 'round(ratePaise * qty)',
  lineDisc: 'round(gross * discountPct / 100)',
  preTaxable: 'priceInclTax ? round((gross - lineDisc) * 100 / (100 + gstRate)) : gross - lineDisc',
  billDiscAmt: 'isAmountMode ? min(round(discountValue * 100), totalPreTaxable) : round(totalPreTaxable * discountValue / 100)',
  billDiscAlloc: '(totalPreTaxable > 0 && billDiscAmt > 0) ? round(billDiscAmt * preTaxable / totalPreTaxable) : 0',
  taxable: 'max(0, preTaxable - billDiscAlloc)',
  taxAmt: 'round(taxable * gstRate / 100)',
  cgst: 'isInterState ? 0 : floor(taxAmt / 2)',
  sgst: 'isInterState ? 0 : taxAmt - floor(taxAmt / 2)',
  igst: 'isInterState ? taxAmt : 0',
  lineTotal: 'taxable + taxAmt',
  grandBefore: 'taxableTotal + cgstTotal + sgstTotal + igstTotal + chargesTotal',
  grandTotal: 'roundOff ? round(grandBefore / 100) * 100 : grandBefore',
};

const LINE_IN = ['ratePaise', 'qty', 'discountPct', 'gstRate', 'priceInclTax', 'isInterState'];
const BILL_DISC_IN = ['totalPreTaxable', 'discountValue', 'isAmountMode'];
const TOTALS_IN = ['taxableTotal', 'cgstTotal', 'sgstTotal', 'igstTotal', 'chargesTotal', 'roundOff'];

/** What the Logics page shows for each slot. `vars` = the names that slot may use (earlier slots are also available). */
export const SLOT_META: Array<{ key: SlotKey; label: string; scope: 'line' | 'bill'; vars: string[]; help: string }> = [
  { key: 'gross', scope: 'line', label: 'Line amount', vars: LINE_IN, help: 'Rate × quantity, in paise.' },
  { key: 'lineDisc', scope: 'line', label: 'Line discount', vars: ['gross'], help: 'Discount taken off one line.' },
  { key: 'preTaxable', scope: 'line', label: 'Taxable value before bill discount', vars: ['lineDisc'], help: 'Splits tax out of the price when the price includes tax.' },
  { key: 'billDiscAmt', scope: 'bill', label: 'Bill discount amount', vars: BILL_DISC_IN, help: 'Whole-bill discount, as % or rupees, capped at the subtotal.' },
  { key: 'billDiscAlloc', scope: 'line', label: 'Bill discount share of this line', vars: ['billDiscAmt', 'preTaxable', 'totalPreTaxable'], help: 'How the bill discount is spread across lines.' },
  { key: 'taxable', scope: 'line', label: 'Final taxable value', vars: ['preTaxable', 'billDiscAlloc'], help: 'Taxable value after all discounts.' },
  { key: 'taxAmt', scope: 'line', label: 'Tax amount', vars: ['taxable', 'gstRate'], help: 'GST on the line.' },
  { key: 'cgst', scope: 'line', label: 'CGST', vars: ['taxAmt', 'isInterState'], help: 'Same-state share (half).' },
  { key: 'sgst', scope: 'line', label: 'SGST', vars: ['taxAmt', 'cgst', 'isInterState'], help: 'Same-state share (other half).' },
  { key: 'igst', scope: 'line', label: 'IGST', vars: ['taxAmt', 'isInterState'], help: 'Other-state tax.' },
  { key: 'lineTotal', scope: 'line', label: 'Line total', vars: ['taxable', 'taxAmt'], help: 'Taxable value + tax.' },
  { key: 'grandBefore', scope: 'bill', label: 'Grand total before round-off', vars: TOTALS_IN, help: 'Sum of line totals and charges.' },
  { key: 'grandTotal', scope: 'bill', label: 'Grand total', vars: ['grandBefore', 'roundOff'], help: 'After rounding to the nearest rupee when round-off is on.' },
];

/** Plain-language names for the inputs a formula can use. Earlier steps are named after their SLOT_META label. */
export const VAR_LABELS: Record<string, string> = {
  ratePaise: 'Price (in paise)', qty: 'Quantity', discountPct: 'Item discount %', gstRate: 'GST rate %',
  priceInclTax: 'Price includes tax (1 = yes, 0 = no)', isInterState: 'Other state (1 = yes, 0 = no)',
  discountValue: 'Bill discount as typed', isAmountMode: 'Discount typed in ₹ (1 = yes, 0 = %)', roundOff: 'Round-off switch (1 = on)',
  chargesTotal: 'Charges total', totalPreTaxable: 'Subtotal before bill discount',
  taxableTotal: 'Taxable total', cgstTotal: 'CGST total', sgstTotal: 'SGST total', igstTotal: 'IGST total',
};

const LINE_SLOTS: SlotKey[] = ['gross', 'lineDisc', 'preTaxable'];
const AFTER_DISC: SlotKey[] = ['billDiscAlloc', 'taxable', 'taxAmt', 'cgst', 'sgst', 'igst', 'lineTotal'];

/** Every name a slot's formula may use: the inputs of its stage plus the steps before it (mirrors calcBill). */
export function slotNames(k: SlotKey): string[] {
  const base = ['isInterState', 'discountValue', 'isAmountMode', 'roundOff', 'chargesTotal'];
  const line = ['ratePaise', 'qty', 'discountPct', 'gstRate', 'priceInclTax'];
  const totals = ['taxableTotal', 'cgstTotal', 'sgstTotal', 'igstTotal'];
  if (k === 'billDiscAmt') return [...base, 'totalPreTaxable'];
  if (k === 'grandBefore') return [...base, ...totals];
  if (k === 'grandTotal') return [...base, ...totals, 'grandBefore'];
  const i = LINE_SLOTS.indexOf(k);
  if (i >= 0) return [...base, ...line, ...LINE_SLOTS.slice(0, i)];
  return [...base, ...line, 'totalPreTaxable', 'billDiscAmt', ...LINE_SLOTS, ...AFTER_DISC.slice(0, AFTER_DISC.indexOf(k))];
}

// ─── Calculation ─────────────────────────────────────────────────────────────

export interface CalcLineIn { rate: number; qty: number; discountPct: number; gstRate: number; priceInclTax: boolean }
export interface CalcOpts { discountValue: number; discountMode: 'percent' | 'amount'; roundOff: boolean; isInterState: boolean; chargesTotalPaise: number }
export interface CalcLineOut { discountAmt: number; taxable: number; taxAmt: number; cgst: number; sgst: number; igst: number; total: number }
export interface CalcResult {
  lines: CalcLineOut[]; preTaxableTotal: number; billDiscAmtPaise: number; taxableTotal: number;
  cgstTotal: number; sgstTotal: number; igstTotal: number; grandBeforePaise: number; roundOffPaise: number; grandTotalPaise: number;
}

function ev(f: Formulas, k: SlotKey, vars: Vars): number {
  let r: number;
  try { r = compile(f[k])(vars); } catch (e: any) { throw new Error(`Formula "${k}": ${e.message}`); }
  if (!Number.isInteger(r)) throw new Error(`Formula "${k}" did not give a whole number of paise`);
  return r;
}
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

/** One fixed sample bill. The Logics page and the assistant both use it to show what a formula change does. */
export const SAMPLE_BILL: { items: CalcLineIn[]; opts: CalcOpts; text: string } = {
  items: [
    { rate: 900, qty: 1, gstRate: 5, priceInclTax: true, discountPct: 0 },
    { rate: 450.5, qty: 3, gstRate: 12, priceInclTax: false, discountPct: 5 },
  ],
  opts: { discountValue: 7.5, discountMode: 'percent', roundOff: true, isInterState: false, chargesTotalPaise: 5000 },
  text: '₹900 item with 5% tax included, plus 3 × ₹450.50 with 5% discount and 12% tax added, 7.5% bill discount, ₹50 freight, same state, round-off on.',
};

export function calcBill(items: CalcLineIn[], o: CalcOpts, f: Formulas = DEFAULT_FORMULAS): CalcResult {
  const base = { isInterState: +o.isInterState, discountValue: o.discountValue, isAmountMode: +(o.discountMode === 'amount'), roundOff: +o.roundOff, chargesTotal: o.chargesTotalPaise };
  const pass1 = items.map(it => {
    const v: Vars = { ...base, ratePaise: Math.round(it.rate * 100), qty: it.qty, discountPct: it.discountPct, gstRate: it.gstRate, priceInclTax: +it.priceInclTax };
    v.gross = ev(f, 'gross', v); v.lineDisc = ev(f, 'lineDisc', v); v.preTaxable = ev(f, 'preTaxable', v);
    return v;
  });
  const totalPreTaxable = sum(pass1.map(v => v.preTaxable));
  const billDiscAmt = ev(f, 'billDiscAmt', { ...base, totalPreTaxable });
  const lines = pass1.map(v => {
    v.totalPreTaxable = totalPreTaxable; v.billDiscAmt = billDiscAmt;
    v.billDiscAlloc = ev(f, 'billDiscAlloc', v); v.taxable = ev(f, 'taxable', v); v.taxAmt = ev(f, 'taxAmt', v);
    v.cgst = ev(f, 'cgst', v); v.sgst = ev(f, 'sgst', v); v.igst = ev(f, 'igst', v); v.lineTotal = ev(f, 'lineTotal', v);
    return { discountAmt: v.lineDisc, taxable: v.taxable, taxAmt: v.taxAmt, cgst: v.cgst, sgst: v.sgst, igst: v.igst, total: v.lineTotal };
  });
  const t = { ...base, taxableTotal: sum(lines.map(l => l.taxable)), cgstTotal: sum(lines.map(l => l.cgst)), sgstTotal: sum(lines.map(l => l.sgst)), igstTotal: sum(lines.map(l => l.igst)) } as Vars;
  t.grandBefore = ev(f, 'grandBefore', t);
  const grandTotal = ev(f, 'grandTotal', t);
  return {
    lines, preTaxableTotal: totalPreTaxable, billDiscAmtPaise: billDiscAmt, taxableTotal: t.taxableTotal,
    cgstTotal: t.cgstTotal, sgstTotal: t.sgstTotal, igstTotal: t.igstTotal,
    grandBeforePaise: t.grandBefore, roundOffPaise: grandTotal - t.grandBefore, grandTotalPaise: grandTotal,
  };
}

// ─── Test-before-publish ─────────────────────────────────────────────────────

const line = (rate: number, qty: number, gstRate: number, priceInclTax: boolean, discountPct = 0): CalcLineIn => ({ rate, qty, gstRate, priceInclTax, discountPct });
const SAMPLES: Array<{ name: string; items: CalcLineIn[]; o: CalcOpts }> = [
  { name: 'Same state, price includes tax', items: [line(900, 1, 5, true)], o: { discountValue: 0, discountMode: 'percent', roundOff: false, isInterState: false, chargesTotalPaise: 0 } },
  { name: 'Other state (IGST)', items: [line(900, 1, 5, true)], o: { discountValue: 0, discountMode: 'percent', roundOff: false, isInterState: true, chargesTotalPaise: 0 } },
  { name: 'Two lines, 10% bill discount', items: [line(600, 1, 5, false), line(400, 1, 18, false, 5)], o: { discountValue: 10, discountMode: 'percent', roundOff: false, isInterState: false, chargesTotalPaise: 0 } },
  { name: 'Rupee discount, round-off, charges', items: [line(945.5, 2, 12, false), line(33.33, 0.3, 5, true)], o: { discountValue: 120, discountMode: 'amount', roundOff: true, isInterState: false, chargesTotalPaise: 5000 } },
  { name: 'Awkward amounts', items: [line(77.77, 3.3, 18, true, 7), line(13.37, 7, 5, false, 3)], o: { discountValue: 7.5, discountMode: 'percent', roundOff: true, isInterState: false, chargesTotalPaise: 0 } },
  { name: 'Zero-rated line', items: [line(100, 3, 0, false)], o: { discountValue: 0, discountMode: 'percent', roundOff: true, isInterState: true, chargesTotalPaise: 0 } },
];

/** Returns a list of problems; empty means the formulas are safe to publish. */
export function selfCheck(f: Formulas): string[] {
  const bad: string[] = [];
  for (const s of SAMPLES) {
    let r: CalcResult;
    try { r = calcBill(s.items, s.o, f); } catch (e: any) { bad.push(`${s.name}: ${e.message}`); continue; }
    const fail = (m: string) => bad.push(`${s.name}: ${m}`);
    r.lines.forEach((l, i) => {
      const rate = s.items[i].gstRate;
      if (l.taxable < 0) fail('taxable value is negative');
      if (l.cgst + l.sgst + l.igst !== l.taxAmt) fail('CGST + SGST + IGST must equal the tax amount');
      if (l.total !== l.taxable + l.taxAmt) fail('line total must equal taxable value + tax');
      if (Math.abs(l.taxAmt - l.taxable * rate / 100) > 1) fail(`tax is not ${rate}% of the taxable value`);
      if (s.o.isInterState ? l.cgst !== 0 || l.sgst !== 0 : l.igst !== 0) fail(s.o.isInterState ? 'other-state bills must have IGST only' : 'same-state bills must have CGST + SGST only');
    });
    if (r.billDiscAmtPaise < 0 || r.billDiscAmtPaise > r.preTaxableTotal) fail('bill discount must be between 0 and the subtotal');
    if (Math.abs(r.preTaxableTotal - r.billDiscAmtPaise - r.taxableTotal) > s.items.length) fail('discount shares must add up to the bill discount');
    if (r.grandBeforePaise !== sum(r.lines.map(l => l.total)) + s.o.chargesTotalPaise) fail('grand total before round-off must equal line totals + charges');
    if (s.o.roundOff ? Math.abs(r.roundOffPaise) >= 100 || r.grandTotalPaise % 100 !== 0 : r.roundOffPaise !== 0) fail('round-off must be under ₹1 and only when switched on');
  }
  return bad;
}
