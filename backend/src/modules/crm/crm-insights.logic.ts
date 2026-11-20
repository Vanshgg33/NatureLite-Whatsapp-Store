// Pure calculations for investor snapshot, acquisition (CAC) and attribution (blueprint M09, M27, M20, M26).
// No DB access here so every formula can be unit tested. Money is rupees, months are IST "YYYY-MM".

export interface OrderRow { user: string; total: number; discount: number; createdAt: Date; source?: string }

const DAY = 86_400_000;

/** Online revenue orders for reports (revenue, cohorts, attribution). Per-customer LTV is NOT summed from these:
 *  callers pass the CRM's stored net LTV (store bills, returns and refunds included) so reports match the profile. */
export const REVENUE_ORDERS = { status: 'delivered', orderType: { $ne: 'replacement' } } as const;
// One shared formatter: building an Intl.DateTimeFormat per order is far too slow across tens of thousands of orders.
const IST_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' });
export const monthKey = (d: Date) => {
  const p = IST_MONTH.formatToParts(d);
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
};
export const monthAdd = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

interface Cust { user: string; orders: number; ltv: number; first: Date; last: Date; firstSource: string }
function byCustomer(rows: OrderRow[], ltvOf?: Map<string, number>): Cust[] {
  const m = new Map<string, Cust>();
  for (const r of [...rows].sort((a, b) => +a.createdAt - +b.createdAt)) {
    const c = m.get(r.user) ?? { user: r.user, orders: 0, ltv: 0, first: r.createdAt, last: r.createdAt, firstSource: r.source || 'unknown' };
    c.orders++; c.ltv += r.total; c.last = r.createdAt;
    m.set(r.user, c);
  }
  const cs = [...m.values()];
  if (ltvOf) for (const c of cs) c.ltv = ltvOf.get(c.user) ?? c.ltv;
  return cs;
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
  const times = new Map<string, number[]>();
  for (const r of rows) times.set(r.user, [...(times.get(r.user) ?? []), +r.createdAt]);
  const repeaters = eligible.filter((c) => (times.get(c.user) ?? []).some((t) => t > +c.first && t - +c.first <= 90 * DAY));
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
export function buildAcquisition(rows: OrderRow[], spend: { channel: string; amount: number }[], month: string, ltvOf?: Map<string, number>) {
  const cs = byCustomer(rows, ltvOf);
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
  const byUser = new Map<string, Date[]>(); // newest call first
  for (const t of [...touches].sort((a, b) => +b.at - +a.at)) byUser.set(t.user, [...(byUser.get(t.user) ?? []), t.at]);
  for (const o of orders) {
    const hit = (byUser.get(o.user) ?? []).find((at) => +at <= +o.createdAt);
    if (hit && +o.createdAt - +hit <= windowDays * DAY) out.push({ orderId: o.id, total: o.total, touchAt: hit });
  }
  return { orders: out.length, revenue: out.reduce((s, x) => s + x.total, 0), items: out };
}
