// Pure calculations for segments, investor snapshot, acquisition (CAC) and attribution (blueprint M09, M27, M20, M26).
// No DB access here so every formula can be unit tested. Money is rupees, months are IST "YYYY-MM".
import { istDateKey } from '../../common/utils/ist-time';

export interface OrderRow { user: string; total: number; discount: number; createdAt: Date; source?: string; cats?: string[] }

const DAY = 86_400_000;
export const monthKey = (d: Date) => istDateKey(d).slice(0, 7);
export const monthAdd = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

interface Cust { user: string; orders: number; ltv: number; first: Date; last: Date; allDiscounted: boolean; cats: Set<string>; firstSource: string }
function byCustomer(rows: OrderRow[]): Cust[] {
  const m = new Map<string, Cust>();
  for (const r of [...rows].sort((a, b) => +a.createdAt - +b.createdAt)) {
    const c = m.get(r.user) ?? { user: r.user, orders: 0, ltv: 0, first: r.createdAt, last: r.createdAt, allDiscounted: true, cats: new Set<string>(), firstSource: r.source || 'unknown' };
    c.orders++; c.ltv += r.total; c.last = r.createdAt; c.allDiscounted &&= r.discount > 0;
    (r.cats ?? []).forEach((x) => c.cats.add(String(x)));
    m.set(r.user, c);
  }
  return [...m.values()];
}

/** Rule-based segments (M09). Gifting and Referrers need festival / referral data the store does not have yet. */
export function buildSegments(rows: OrderRow[], now = new Date(), minLtv = 2000) {
  const cs = byCustomer(rows);
  const defs = [
    { key: 'win_back', name: 'Win-back', rule: `Last order over 90 days ago and lifetime value ≥ ₹${minLtv}`, test: (c: Cust) => +now - +c.last > 90 * DAY && c.ltv >= minLtv },
    { key: 'price_sensitive', name: 'Price-sensitive', rule: '2+ orders and every order used a discount', test: (c: Cust) => c.orders >= 2 && c.allDiscounted },
    { key: 'cross_sell', name: 'Cross-sell', rule: '2+ orders, all from a single category', test: (c: Cust) => c.orders >= 2 && c.cats.size === 1 },
  ];
  return defs.map((d) => {
    const members = cs.filter(d.test).sort((a, b) => b.ltv - a.ltv);
    return { key: d.key, name: d.name, rule: d.rule, count: members.length, top: members.slice(0, 20).map((c) => ({ user: c.user, orders: c.orders, ltv: c.ltv, lastOrderAt: c.last })) };
  });
}

/** Investor snapshot (M27): last 6 months, new vs repeat, 90-day repeat rate and cohort retention. */
export function buildInvestorSnapshot(rows: OrderRow[], now = new Date()) {
  const cur = monthKey(now);
  const months = Array.from({ length: 6 }, (_, i) => monthAdd(cur, i - 5));
  const cs = byCustomer(rows);
  const firstMonth = new Map(cs.map((c) => [c.user, monthKey(c.first)]));
  const activeIn = new Map<string, Set<string>>(); // month -> users who ordered
  const revenue: Record<string, number> = {}, orders: Record<string, number> = {};
  for (const r of rows) {
    const k = monthKey(r.createdAt);
    revenue[k] = (revenue[k] ?? 0) + r.total; orders[k] = (orders[k] ?? 0) + 1;
    activeIn.set(k, (activeIn.get(k) ?? new Set()).add(r.user));
  }
  const monthly = months.map((m, i) => {
    const users = [...(activeIn.get(m) ?? [])];
    const prev = i > 0 ? revenue[months[i - 1]] ?? 0 : (revenue[monthAdd(m, -1)] ?? 0);
    return {
      month: m, revenue: revenue[m] ?? 0, orders: orders[m] ?? 0,
      aov: orders[m] ? Math.round((revenue[m] ?? 0) / orders[m]) : 0,
      momGrowthPct: prev > 0 ? Math.round((((revenue[m] ?? 0) - prev) / prev) * 1000) / 10 : null,
      newCustomers: users.filter((u) => firstMonth.get(u) === m).length,
      repeatCustomers: users.filter((u) => firstMonth.get(u) !== m).length,
    };
  });
  const eligible = cs.filter((c) => +now - +c.first >= 90 * DAY);
  const repeaters = eligible.filter((c) => rows.some((r) => r.user === c.user && +r.createdAt > +c.first && +r.createdAt - +c.first <= 90 * DAY));
  const cohorts = months.map((m) => {
    const members = cs.filter((c) => firstMonth.get(c.user) === m).map((c) => c.user);
    return {
      cohort: m, size: members.length,
      retention: [1, 2, 3, 4, 5].map((k) => {
        const t = monthAdd(m, k);
        return t > cur || !members.length ? null : pct(members.filter((u) => activeIn.get(t)?.has(u)).length, members.length);
      }),
    };
  });
  return { monthly, repeatRate90d: pct(repeaters.length, eligible.length), repeatRateBase: eligible.length, cohorts };
}

/** CAC per channel for one month (M20). A customer's channel is the source of their first order. */
export function buildAcquisition(rows: OrderRow[], spend: { channel: string; amount: number }[], month: string) {
  const cs = byCustomer(rows);
  const channels = new Map<string, { spend: number; newCustomers: number; ltvSum: number }>();
  const get = (ch: string) => channels.get(ch) ?? channels.set(ch, { spend: 0, newCustomers: 0, ltvSum: 0 }).get(ch)!;
  spend.forEach((s) => { get(s.channel).spend += s.amount; });
  cs.filter((c) => monthKey(c.first) === month).forEach((c) => { const g = get(c.firstSource); g.newCustomers++; g.ltvSum += c.ltv; });
  return [...channels].map(([channel, g]) => {
    const avgLtv = g.newCustomers ? Math.round(g.ltvSum / g.newCustomers) : 0;
    const cac = g.newCustomers ? Math.round(g.spend / g.newCustomers) : null;
    return { channel, spend: g.spend, newCustomers: g.newCustomers, cac, avgLtv, ltvToCac: cac ? Math.round((avgLtv / cac) * 10) / 10 : null };
  }).sort((a, b) => b.spend - a.spend);
}

/** Last-touch attribution (M26): an order belongs to the latest call made to that customer within `windowDays` before it. */
export function attributeOrders(touches: { user: string; at: Date }[], orders: { id: string; user: string; total: number; createdAt: Date }[], windowDays = 7) {
  const out: { orderId: string; total: number; touchAt: Date }[] = [];
  for (const o of orders) {
    const hit = touches
      .filter((t) => t.user === o.user && +t.at <= +o.createdAt && +o.createdAt - +t.at <= windowDays * DAY)
      .sort((a, b) => +b.at - +a.at)[0];
    if (hit) out.push({ orderId: o.id, total: o.total, touchAt: hit.at });
  }
  return { orders: out.length, revenue: out.reduce((s, x) => s + x.total, 0), items: out };
}
