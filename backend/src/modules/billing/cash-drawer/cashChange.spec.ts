import { makeChange, checkTender, sumCounts, isValidCounts } from './cashChange';
import type { DenomDef, Counts } from './cashChange';

const defs: DenomDef[] = [
  { id: 'N500', value: 500, kind: 'note', par: 10 },
  { id: 'N200', value: 200, kind: 'note', par: 10 },
  { id: 'N100', value: 100, kind: 'note', par: 20 },
  { id: 'N50', value: 50, kind: 'note', par: 20 },
  { id: 'N20', value: 20, kind: 'note', par: 30 },
  { id: 'N10', value: 10, kind: 'note', par: 30 },
  { id: 'C10', value: 10, kind: 'coin', par: 30 },
  { id: 'C5', value: 5, kind: 'coin', par: 30 },
  { id: 'C2', value: 2, kind: 'coin', par: 30 },
  { id: 'C1', value: 1, kind: 'coin', par: 30 },
];
const all = defs.map(d => d.id);

describe('makeChange', () => {
  it('greedy trap: 50x1, 20x3, change 60 -> 3x20', () => {
    const r = makeChange(60, { N50: 1, N20: 3 }, defs);
    expect(r.ok).toBe(true);
    expect(r.returned).toEqual({ N20: 3 });
  });

  it('impossible -> best partial and shortfall', () => {
    const r = makeChange(35, { N50: 5, N20: 1 }, defs);
    expect(r).toMatchObject({ ok: false, paid: 20, shortfall: 15 });
  });

  it('zero is ok, negative and fractional throw', () => {
    expect(makeChange(0, {}, defs).ok).toBe(true);
    expect(() => makeChange(-1, {}, defs)).toThrow();
    expect(() => makeChange(1.5, {}, defs)).toThrow();
  });

  it('above the limit is tooLarge', () => {
    expect(makeChange(50001, { N500: 1000 }, defs)).toMatchObject({ ok: false, tooLarge: true, shortfall: 50001 });
  });

  it('matches brute force on 400 random stocks (feasibility + fewest pieces)', () => {
    const brute = (target: number, stock: Counts) => {
      let best = Infinity;
      const rec = (i: number, left: number, pcs: number) => {
        if (left === 0) { best = Math.min(best, pcs); return; }
        if (i === defs.length) return;
        const d = defs[i];
        const max = Math.min(stock[d.id] || 0, Math.floor(left / d.value));
        for (let k = 0; k <= max; k++) rec(i + 1, left - k * d.value, pcs + k);
      };
      rec(0, target, 0);
      return best;
    };
    let seed = 12345;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let t = 0; t < 400; t++) {
      const stock: Counts = {};
      defs.forEach(d => (stock[d.id] = rnd(4)));
      const target = 1 + rnd(260);
      const r = makeChange(target, stock, defs);
      const b = brute(target, stock);
      expect(r.ok).toBe(b !== Infinity);
      if (r.ok) {
        expect(sumCounts(r.returned, defs)).toBe(target);
        expect(defs.every(d => (r.returned[d.id] || 0) <= (stock[d.id] || 0))).toBe(true);
        expect(r.pieces).toBe(b);
      } else {
        expect(sumCounts(r.returned, defs)).toBe(r.paid);
      }
    }
  });

  it('30 from 20x1, 10x1, coin10x30 uses 2 pieces', () => {
    const r = makeChange(30, { N20: 1, N10: 1, C10: 30 }, defs);
    expect(r.ok && r.pieces === 2).toBe(true);
  });

  it('worst case stays fast', () => {
    const s: Counts = {};
    defs.forEach(d => (s[d.id] = 500));
    const t0 = Date.now();
    expect(makeChange(49999, s, defs).ok).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1000); // generous for CI; ~30 ms on a laptop
  });

  // section 12 acceptance scenario: bill 3180, customer gives 5x500 + 10x100 = 3500
  const opening: Counts = { N500: 4, N200: 3, N100: 10, N50: 10, N20: 10, N10: 10, C10: 20, C5: 20, C2: 20, C1: 20 };
  const received: Counts = { N500: 5, N100: 10 };
  const usable = (stock: Counts) => {
    const u = { ...stock };
    for (const [k, v] of Object.entries(received)) u[k] = (u[k] || 0) + v;
    return u;
  };
  it('Om scenario: change 320 = 200 + 100 + 20', () => {
    expect(makeChange(320, usable(opening), defs).returned).toEqual({ N200: 1, N100: 1, N20: 1 });
  });
  it('Om scenario variants', () => {
    expect(makeChange(320, usable({ ...opening, N200: 0 }), defs).returned).toEqual({ N100: 3, N20: 1 });
    // 20 notes gone: two 10s; the N10 and C10 have equal par so either 10 is fine, but exactly 2 pieces
    const v2 = makeChange(320, usable({ ...opening, N200: 0, N20: 0 }), defs);
    expect(v2.ok && v2.returned.N100 === 3 && (v2.returned.N10 || 0) + (v2.returned.C10 || 0) === 2).toBe(true);
    const only500 = makeChange(320, usable({ N500: 4 }), defs);
    expect(only500).toMatchObject({ ok: false, paid: 300, shortfall: 20, returned: { N100: 3 } });
  });
});

describe('checkTender', () => {
  it('brief example: 3000 due, 5x500 + 8x100 received, change 300', () => {
    const stock: Counts = { N100: 10, N50: 4 };
    const rec: Counts = { N500: 5, N100: 8 };
    const plan = makeChange(300, { ...stock, N500: 5, N100: 18 }, defs);
    expect(checkTender({ cashDue: 3000, received: rec, returned: plan.returned, stock, defs, activeIds: all }))
      .toEqual({ ok: true, changeDue: 300, applied: 3000 });
  });
  it('stock guard', () => {
    expect(checkTender({ cashDue: 100, received: { N500: 1 }, returned: { N100: 4 }, stock: { N100: 3 }, defs, activeIds: ['N500', 'N100'] }).code)
      .toBe('STOCK_INSUFFICIENT');
  });
  it('mismatch', () => {
    expect(checkTender({ cashDue: 100, received: { N500: 1 }, returned: { N100: 3 }, stock: { N100: 9 }, defs, activeIds: ['N500', 'N100'] }).code)
      .toBe('CHANGE_MISMATCH');
  });
  it('unknown denomination', () => {
    expect(checkTender({ cashDue: 100, received: { N2000: 1 }, returned: {}, stock: {}, defs, activeIds: [] }).code).toBe('BAD_COUNTS');
  });
  it('inactive denomination', () => {
    expect(checkTender({ cashDue: 100, received: { N500: 1 }, returned: { N100: 4 }, stock: { N100: 9 }, defs, activeIds: ['N100'] }).code)
      .toBe('INACTIVE_DENOMINATION');
  });
  it('short pay: no change, applied = received', () => {
    expect(checkTender({ cashDue: 1000, received: { N500: 1 }, returned: {}, stock: {}, defs, activeIds: all }))
      .toEqual({ ok: true, changeDue: 0, applied: 500 });
  });
  it('garbage counts never throw', () => {
    for (const bad of [null, [], 'x', { N500: -1 }, { N500: 1.5 }, { N500: '2' }, { N500: 1e9 }] as any[]) {
      expect(isValidCounts(bad, defs)).toBe(false);
      expect(checkTender({ cashDue: 1, received: bad, returned: {}, stock: {}, defs, activeIds: all }).code).toBe('BAD_COUNTS');
    }
  });
});
