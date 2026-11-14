import { calcBill, DEFAULT_FORMULAS, selfCheck, SLOT_KEYS, SLOT_META, CalcLineIn, parseExpr, printExpr, slotNames } from './formula-engine';

const O = { discountValue: 0, discountMode: 'percent' as const, roundOff: false, isInterState: false, chargesTotalPaise: 0 };
const ln = (rate: number, gstRate: number, priceInclTax: boolean, qty = 1, discountPct = 0): CalcLineIn => ({ rate, qty, gstRate, priceInclTax, discountPct });

describe('formula engine defaults match the original bill maths', () => {
  it('same state, price incl. tax: 900 @5% -> 85714 + 2143 + 2143', () => {
    const r = calcBill([ln(900, 5, true)], O);
    expect(r.lines[0]).toMatchObject({ taxable: 85714, cgst: 2143, sgst: 2143, igst: 0, total: 90000 });
  });
  it('other state gives IGST only', () => {
    expect(calcBill([ln(900, 5, true)], { ...O, isInterState: true }).lines[0]).toMatchObject({ cgst: 0, sgst: 0, igst: 4286 });
  });
  it('round-off 94550 -> 94600', () => {
    const r = calcBill([ln(945.5, 0, false)], { ...O, roundOff: true });
    expect(r).toMatchObject({ grandBeforePaise: 94550, roundOffPaise: 50, grandTotalPaise: 94600 });
  });
  it('10% bill discount is shared in proportion before tax', () => {
    const r = calcBill([ln(600, 5, false), ln(400, 18, false)], { ...O, discountValue: 10 });
    expect(r.lines.map(l => l.taxable)).toEqual([54000, 36000]);
    expect(r.billDiscAmtPaise).toBe(10000);
  });
  it('rupee discount equals the same % and is capped at the subtotal', () => {
    const a = calcBill([ln(1000, 5, false)], { ...O, discountValue: 12 });
    const b = calcBill([ln(1000, 5, false)], { ...O, discountValue: 120, discountMode: 'amount' });
    expect(b.grandTotalPaise).toBe(a.grandTotalPaise);
    expect(calcBill([ln(1000, 5, false)], { ...O, discountValue: 5000, discountMode: 'amount' }).billDiscAmtPaise).toBe(100000);
  });
  it('fractional qty still gives whole paise', () => {
    expect(calcBill([ln(33.33, 5, false, 0.3)], O).lines[0].taxable).toBe(1000);
  });
  it('charges are added to the grand total', () => {
    expect(calcBill([ln(1000, 0, false)], { ...O, chargesTotalPaise: 5000 }).grandTotalPaise).toBe(105000);
  });
});

// The original hand-written bill maths (as it was in billing.service before formulas became editable), used as an oracle.
function legacy(items: CalcLineIn[], discountValue: number, amountMode: boolean, roundOff: boolean, inter: boolean, charges: number) {
  const pre = items.map(i => { const g = Math.round(Math.round(i.rate * 100) * i.qty); const a = g - Math.round(g * i.discountPct / 100); return i.priceInclTax ? Math.round(a * 100 / (100 + i.gstRate)) : a; });
  const tot = pre.reduce((s, x) => s + x, 0);
  const disc = amountMode ? Math.min(Math.round(discountValue * 100), tot) : Math.round(tot * discountValue / 100);
  const alloc = tot > 0 && disc > 0 ? pre.map(t => Math.round(disc * t / tot)) : pre.map(() => 0);
  const lines = items.map((i, k) => { const taxable = Math.max(0, pre[k] - alloc[k]); const tax = Math.round(taxable * i.gstRate / 100); const cg = inter ? 0 : Math.floor(tax / 2); return { taxable, cgst: cg, sgst: inter ? 0 : tax - cg, igst: inter ? tax : 0, total: taxable + tax }; });
  const before = lines.reduce((s, l) => s + l.total, 0) + charges;
  const grand = roundOff ? Math.round(before / 100) * 100 : before;
  return { lines, disc, before, grand };
}

describe('defaults equal the original maths on random bills', () => {
  it('3000 random bills give identical lines and totals', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const rates = [0, 5, 12, 18, 28];
    for (let n = 0; n < 3000; n++) {
      const items = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ln(+(rnd() * 2000).toFixed(2), rates[Math.floor(rnd() * 5)], rnd() < 0.5, +(rnd() * 20).toFixed(rnd() < 0.5 ? 0 : 3), +(rnd() * 30).toFixed(1) as any));
      const amountMode = rnd() < 0.4, roundOff = rnd() < 0.5, inter = rnd() < 0.5, charges = Math.round(rnd() * 20000);
      const dv = amountMode ? +(rnd() * 500).toFixed(2) : +(rnd() * 40).toFixed(1);
      const a = calcBill(items, { discountValue: dv, discountMode: amountMode ? 'amount' : 'percent', roundOff, isInterState: inter, chargesTotalPaise: charges });
      const b = legacy(items, dv, amountMode, roundOff, inter, charges);
      expect(a.lines.map(l => ({ taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, total: l.total }))).toEqual(b.lines);
      expect([a.billDiscAmtPaise, a.grandBeforePaise, a.grandTotalPaise]).toEqual([b.disc, b.before, b.grand]);
    }
  });
});

describe('selfCheck', () => {
  it('passes for the built-in formulas', () => expect(selfCheck(DEFAULT_FORMULAS)).toEqual([]));
  it('accepts a harmless variation (floor instead of round for tax)', () => {
    expect(selfCheck({ ...DEFAULT_FORMULAS, taxAmt: 'floor(taxable * gstRate / 100)' })).toEqual([]);
  });
  it('rejects wrong tax (double)', () => {
    expect(selfCheck({ ...DEFAULT_FORMULAS, taxAmt: 'round(taxable * gstRate / 50)' }).join()).toMatch(/not .*% of the taxable/);
  });
  it('rejects CGST+SGST not adding up to the tax', () => {
    expect(selfCheck({ ...DEFAULT_FORMULAS, sgst: 'isInterState ? 0 : floor(taxAmt / 2) + 1' }).join()).toMatch(/CGST \+ SGST \+ IGST/);
  });
  it('rejects syntax errors, unknown names and fractional paise', () => {
    expect(selfCheck({ ...DEFAULT_FORMULAS, gross: 'ratePaise *' }).join()).toMatch(/gross/);
    expect(selfCheck({ ...DEFAULT_FORMULAS, gross: 'process' }).join()).toMatch(/Unknown name/);
    expect(selfCheck({ ...DEFAULT_FORMULAS, lineDisc: 'gross * discountPct / 100 + 0.5' }).join()).toMatch(/whole number/);
  });
  it('cannot call anything outside the allowed functions', () => {
    expect(selfCheck({ ...DEFAULT_FORMULAS, gross: 'constructor(1)' }).join()).toMatch(/Unknown function/);
  });
});

describe('slot metadata', () => {
  it('has one metadata entry per slot, in order', () => {
    expect(SLOT_META.map(m => m.key)).toEqual([...SLOT_KEYS]);
  });
});

describe('parse tree and printer (used by the block editor)', () => {
  const texts = [
    ...Object.values(DEFAULT_FORMULAS),
    'a - (b - c)', 'a - b - c', 'a / (b * c)', '-(a + b) * c', '!(a && b) || c', 'x ? y ? 1 : 2 : 3', '(x ? 1 : 2) + 3', 'max(a, min(b, 3))', '2 * -a', '1.5 * a',
  ];
  it('printing then parsing gives the same tree', () => {
    for (const t of texts) expect([t, parseExpr(printExpr(parseExpr(t)))]).toEqual([t, parseExpr(t)]);
  });
  it('prints very small numbers without an exponent, so they still parse', () => {
    for (const v of [0.0000001, 0.00000125, 0.5, 12.75]) {
      const text = printExpr({ t: 'num', v });
      expect([v, /e/i.test(text), parseExpr(text)]).toEqual([v, false, { t: 'num', v }]);
    }
  });
  it('printed text means the same thing', () => {
    const v = { a: 7, b: 3, c: 2, x: 1, y: 0 };
    for (const t of texts.slice(Object.values(DEFAULT_FORMULAS).length)) {
      const run = (s: string) => { try { return calcExpr(s, v); } catch (e: any) { return e.message; } };
      expect([t, run(printExpr(parseExpr(t)))]).toEqual([t, run(t)]);
    }
  });
  it('every name a slot may use really is available there, and nothing else is', () => {
    for (const k of SLOT_KEYS) {
      for (const n of slotNames(k)) {
        const f = { ...DEFAULT_FORMULAS, [k]: `${n} * 0` };
        expect([k, n, calcBill([ln(100, 5, false)], { ...O, roundOff: true }, f).grandTotalPaise >= 0]).toEqual([k, n, true]);
      }
      for (const used of printExpr(parseExpr(DEFAULT_FORMULAS[k])).match(/[A-Za-z_]\w*/g) ?? []) {
        if (!['round', 'floor', 'ceil', 'min', 'max', 'abs'].includes(used)) expect([k, used, slotNames(k).includes(used)]).toEqual([k, used, true]);
      }
    }
  });
  it('a name outside the slot is refused', () => {
    expect(() => calcBill([ln(100, 5, false)], O, { ...DEFAULT_FORMULAS, gross: 'grandTotal * 0' })).toThrow(/Unknown name/);
  });
});

// evaluates a bare expression through the engine by using it as the "gross" step is not possible, so use the public parse + a tiny walker
function calcExpr(src: string, v: Record<string, number>): number {
  const walk = (n: any): number => {
    switch (n.t) {
      case 'num': return n.v;
      case 'var': if (!(n.n in v)) throw new Error(`Unknown name "${n.n}"`); return v[n.n];
      case 'un': return n.op === '-' ? -walk(n.e) : (walk(n.e) === 0 ? 1 : 0);
      case 'bin': { const a = walk(n.l), c = walk(n.r); return ({ '+': a + c, '-': a - c, '*': a * c, '/': a / c, '%': a % c, '&&': +(a !== 0 && c !== 0), '||': +(a !== 0 || c !== 0) } as any)[n.op]; }
      case 'call': return (Math as any)[n.f](...n.args.map(walk));
      case 'if': return walk(n.c) !== 0 ? walk(n.a) : walk(n.b);
    }
    return NaN;
  };
  return walk(parseExpr(src));
}
