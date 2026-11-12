import { buildSegments, buildInvestorSnapshot, buildAcquisition, attributeOrders, monthAdd } from './crm-insights.logic';

const d = (s: string) => new Date(s + 'T06:00:00Z');
const o = (user: string, date: string, total: number, extra: any = {}) => ({ user, total, discount: 0, createdAt: d(date), ...extra });
const NOW = d('2026-11-12');

describe('monthAdd', () => {
  it('crosses year boundaries', () => {
    expect(monthAdd('2026-11', 3)).toBe('2027-02');
    expect(monthAdd('2026-01', -1)).toBe('2025-12');
  });
});

describe('buildSegments', () => {
  const rows = [
    o('a', '2026-05-01', 3000), // win-back: old, high ltv
    o('b', '2026-10-01', 500, { discount: 50, cats: ['oil'] }), o('b', '2026-11-01', 500, { discount: 50, cats: ['oil'] }), // price-sensitive + cross-sell
    o('c', '2026-10-01', 500, { cats: ['oil'] }), o('c', '2026-11-01', 500, { cats: ['ghee'] }), // two categories
  ];
  const by = Object.fromEntries(buildSegments(rows, NOW).map((s) => [s.key, s]));
  it('finds each rule', () => {
    expect(by.win_back.top.map((m) => m.user)).toEqual(['a']);
    expect(by.price_sensitive.top.map((m) => m.user)).toEqual(['b']);
    expect(by.cross_sell.top.map((m) => m.user)).toEqual(['b']);
  });
});

describe('buildInvestorSnapshot', () => {
  const rows = [o('a', '2026-09-10', 1000), o('a', '2026-10-10', 1000), o('b', '2026-10-12', 500), o('c', '2026-11-02', 800), o('z', '2026-07-01', 100), o('z', '2026-08-01', 100)];
  const s = buildInvestorSnapshot(rows, NOW);
  const m = Object.fromEntries(s.monthly.map((x) => [x.month, x]));
  it('computes revenue, growth and new vs repeat', () => {
    expect(m['2026-10'].revenue).toBe(1500);
    expect(m['2026-10'].momGrowthPct).toBe(50);
    expect(m['2026-10'].newCustomers).toBe(1); // b
    expect(m['2026-10'].repeatCustomers).toBe(1); // a
  });
  it('computes cohort retention and 90-day repeat', () => {
    const sep = s.cohorts.find((c) => c.cohort === '2026-09')!;
    expect(sep.size).toBe(1);
    expect(sep.retention[0]).toBe(100); // a ordered again in October
    expect(sep.retention[1]).toBe(0); // November: nobody
    expect(sep.retention[3]).toBeNull(); // January is in the future
    expect(s.repeatRate90d).toBe(100); // only z is 90+ days old, and z repeated
  });
});

describe('buildAcquisition', () => {
  it('divides spend by new customers per channel', () => {
    const rows = [o('a', '2026-11-01', 1000, { source: 'instagram' }), o('b', '2026-11-03', 600, { source: 'instagram' }), o('c', '2026-10-03', 600, { source: 'instagram' })];
    const r = buildAcquisition(rows, [{ channel: 'instagram', amount: 1000 }], '2026-11');
    expect(r[0]).toMatchObject({ channel: 'instagram', newCustomers: 2, cac: 500, avgLtv: 800, ltvToCac: 1.6 });
  });
});

describe('attributeOrders', () => {
  it('uses the latest call inside the window only', () => {
    const touches = [{ user: 'a', at: d('2026-11-01') }, { user: 'a', at: d('2026-11-05') }];
    const orders = [
      { id: '1', user: 'a', total: 100, createdAt: d('2026-11-08') }, // inside 7 days of 11-05
      { id: '2', user: 'a', total: 200, createdAt: d('2026-11-20') }, // too late
      { id: '3', user: 'b', total: 300, createdAt: d('2026-11-08') }, // never called
      { id: '4', user: 'a', total: 400, createdAt: d('2026-10-30') }, // before the call
    ];
    const r = attributeOrders(touches, orders);
    expect(r.revenue).toBe(100);
    expect(r.orders).toBe(1);
  });
});

describe('performance at store scale', () => {
  it('attribution and investor snapshot stay fast with 30k orders', () => {
    const rows = Array.from({ length: 30_000 }, (_, i) => o('u' + (i % 5000), '2026-0' + (1 + (i % 9)) + '-10', 100));
    const touches = Array.from({ length: 30_000 }, (_, i) => ({ user: 'u' + (i % 5000), at: d('2026-0' + (1 + (i % 9)) + '-09') }));
    const t0 = Date.now();
    buildInvestorSnapshot(rows, NOW);
    attributeOrders(touches, rows.map((r, i) => ({ id: String(i), user: r.user, total: r.total, createdAt: r.createdAt })));
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('attribution ignores a call made after the order even if it is the newest call', () => {
    const r = attributeOrders([{ user: 'a', at: d('2026-11-01') }, { user: 'a', at: d('2026-11-10') }], [{ id: '1', user: 'a', total: 50, createdAt: d('2026-11-03') }]);
    expect(r.revenue).toBe(50);
    expect(r.items[0].touchAt).toEqual(d('2026-11-01'));
  });
});
