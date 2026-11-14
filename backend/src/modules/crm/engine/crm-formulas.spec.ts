import {
  CRM_SLOT_KEYS, DEFAULT_CRM_FORMULAS, DEFAULT_CRM_RULES, CRM_SLOT_META, crmSelfCheck, evalCycle, evalPriority, type CrmRules,
} from './crm-formulas';
import { computePriority, computeSegment, resolveCycle } from './status-model';

const DAY = 86_400_000;
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// Legacy implementations copied from the code as it was before rules existed.
function legacyCycle(orders: { date: Date; categories: string[] }[], cats: Record<string, number>, fallback: number) {
  if (orders.length >= 3) {
    const dates = orders.map(o => o.date.getTime());
    const gaps: number[] = [];
    for (let i = 0; i < dates.length - 1; i++) { const g = Math.round((dates[i] - dates[i + 1]) / DAY); if (g > 0) gaps.push(g); }
    if (gaps.length) {
      const s = [...gaps].sort((a, b) => a - b); const mid = Math.floor(s.length / 2);
      const median = s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
      return { days: Math.min(Math.max(median, 7), 120), source: 'personal' };
    }
  }
  if (orders[0]?.categories.length) {
    const known = orders[0].categories.map(c => cats[c]).filter((d): d is number => d !== undefined);
    if (known.length) return { days: Math.min(...known), source: 'category' };
  }
  return { days: fallback, source: 'fallback' };
}
function legacyPriority(ltvPct: number, daysLate: number, totalOrders: number) {
  const lateNorm = Math.min(Math.max(daysLate, 0), 30) / 30;
  const score = Math.round(50 * ltvPct + 40 * lateNorm + (totalOrders >= 2 ? 10 : 0));
  return { score, band: score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low' };
}

describe('built-in rules equal the old behaviour', () => {
  it('3000 random customers get the same cycle and priority', () => {
    const cats = { Ghee: 50, Spices: 45 };
    for (let n = 0; n < 3000; n++) {
      const count = 1 + Math.floor(rnd() * 9);
      let t = Date.UTC(2026, 0, 1);
      const orders = Array.from({ length: count }, (_, i) => { t -= Math.floor(rnd() * 200) * DAY; return { date: new Date(t), categories: i === 0 && rnd() < 0.5 ? ['Ghee'] : [] }; });
      expect(resolveCycle(orders, cats, 30, DEFAULT_CRM_RULES)).toEqual(legacyCycle(orders, cats, 30));
      expect(resolveCycle(orders, cats, 30)).toEqual(legacyCycle(orders, cats, 30));
      const ltvPct = rnd(), late = Math.floor(rnd() * 240) - 40, tot = 1 + Math.floor(rnd() * 8);
      expect(computePriority(ltvPct, late, tot, DEFAULT_CRM_RULES)).toEqual(legacyPriority(ltvPct, late, tot));
      expect(computePriority(ltvPct, late, tot)).toEqual(legacyPriority(ltvPct, late, tot));
    }
  });
});

describe('formulas', () => {
  const f = (over: Partial<typeof DEFAULT_CRM_FORMULAS>) => ({ ...DEFAULT_CRM_FORMULAS, ...over });
  const v = { medianGap: 30, meanGap: 34.6, lastGap: 20, orders: 4 };

  it('a mean-gap formula gives the rounded mean', () => {
    expect(evalCycle(f({ personalCycle: 'meanGap' }), v)).toBe(35);
  });
  it('cycle result that is not a usable number is null', () => {
    expect(evalCycle(f({ personalCycle: 'medianGap / (orders - orders)' }), v)).toBeNull();
    expect(evalCycle(f({ personalCycle: '0' }), v)).toBeNull();
    expect(evalCycle(f({ personalCycle: 'nope' }), v)).toBeNull();
  });
  it('priority is rounded and clamped to 0..100', () => {
    const p = { ltvPct: 0.5, daysLate: 3, orders: 3 };
    expect(evalPriority(f({ priorityScore: '200' }), p)).toBe(100);
    expect(evalPriority(f({ priorityScore: '-5' }), p)).toBe(0);
  });
  it('an unknown name in a priority formula throws', () => {
    expect(() => evalPriority(f({ priorityScore: 'ltv * 2' }), { ltvPct: 0, daysLate: 0, orders: 1 })).toThrow();
  });
  it('a broken stored formula falls back to the built-in instead of crashing', () => {
    const rules: CrmRules = { ...DEFAULT_CRM_RULES, formulas: f({ priorityScore: 'ltv * 2' }) };
    expect(computePriority(0.5, 3, 3, rules)).toEqual(legacyPriority(0.5, 3, 3));
  });
});

describe('safety check', () => {
  it('passes the built-in formulas', () => { expect(crmSelfCheck(DEFAULT_CRM_FORMULAS)).toEqual([]); });
  it('refuses formulas that break on sample customers', () => {
    expect(crmSelfCheck({ ...DEFAULT_CRM_FORMULAS, priorityScore: '1 / 0' }).length).toBeGreaterThan(0);
    expect(crmSelfCheck({ ...DEFAULT_CRM_FORMULAS, priorityScore: 'ltvPct * 1000' }).join(' ')).toMatch(/0 and 100/);
    expect(crmSelfCheck({ ...DEFAULT_CRM_FORMULAS, personalCycle: 'medianGap / (orders - orders)' }).length).toBeGreaterThan(0);
    expect(crmSelfCheck({ ...DEFAULT_CRM_FORMULAS, personalCycle: 'medianGap * 100' }).join(' ')).toMatch(/1 and 1000/);
  });
  it('has meta for every slot', () => { expect(CRM_SLOT_META.map(s => s.key)).toEqual([...CRM_SLOT_KEYS]); });
});

describe('segment hook', () => {
  it('due-soon window can be changed', () => {
    expect(computeSegment(-5, 3)).toBe('due_soon');
    expect(computeSegment(-5, 3, undefined, 3)).toBe('active');
    expect(computeSegment(-3, 3, undefined, 3)).toBe('due_soon');
  });
});
