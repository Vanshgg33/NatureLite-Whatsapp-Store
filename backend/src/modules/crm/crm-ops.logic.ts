// Pure helpers for goals, lead response time and the inbox (blueprint M03, M19, M14).
import { monthAdd } from './crm-insights.logic';

/** IST month boundaries as real instants. */
export const monthRange = (month: string) => ({
  from: new Date(`${month}-01T00:00:00+05:30`),
  to: new Date(`${monthAdd(month, 1)}-01T00:00:00+05:30`),
});

/** On track when progress keeps up with the share of the month that has passed. */
export function goalStatus(actual: number, target: number, month: string, now = new Date()) {
  const { from, to } = monthRange(month);
  const elapsed = Math.min(1, Math.max(0, (+now - +from) / (+to - +from)));
  const progressPct = target > 0 ? Math.round((actual / target) * 1000) / 10 : null;
  const status = target > 0 && actual >= target ? 'done' : actual >= target * elapsed ? 'on_track' : 'behind';
  return { progressPct, elapsedPct: Math.round(elapsed * 1000) / 10, status };
}

export function medianMinutes(leads: { createdAt: Date; firstContactAt: Date | null }[]): number | null {
  const m = leads.filter((l) => l.firstContactAt).map((l) => (+l.firstContactAt! - +l.createdAt) / 60_000).sort((a, b) => a - b);
  if (!m.length) return null;
  const mid = Math.floor(m.length / 2);
  return Math.round(m.length % 2 ? m[mid] : (m[mid - 1] + m[mid]) / 2);
}

/** A conversation needs a reply when the newest message is inbound. */
export const needsReply = (lastDirection: string) => lastDirection === 'inbound';

// ─── Digest & Alerts (M02) ───────────────────────────────────────────────────
export type DigestPeriod = 'day' | 'week';
const DAY_MS = 86_400_000;

/** day = today so far (IST) vs yesterday up to the same time; week = last 7 days vs the 7 before */
export function digestWindows(period: DigestPeriod, now = new Date()) {
  if (period === 'week') return { from: new Date(+now - 7 * DAY_MS), to: now, prevFrom: new Date(+now - 14 * DAY_MS), prevTo: new Date(+now - 7 * DAY_MS) };
  const from = new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T00:00:00+05:30`);
  return { from, to: now, prevFrom: new Date(+from - DAY_MS), prevTo: new Date(+now - DAY_MS) };
}

export interface DigestAlert { key: string; severity: 'high' | 'medium'; title: string; detail: string; href?: string; count: number }

export interface AlertInput {
  overdueCallbacks: number;
  goalsBehind: Array<{ metric: string; progressPct: number | null; elapsedPct: number }>;
  unrepliedChats: number;          // newest message inbound and older than an hour
  highRiskCustomers: number;
  lowRatedFeedback: number;        // 1-2 stars in the last 7 days
  uncontactedLeads: number;        // still 'new' after 24 hours
  staleFeeds: Array<{ name: string; hours: number | null }>; // no data for 48h+ (null = never)
  revenue: { current: number; previous: number };
}

/** Turns the numbers into a ranked list of things a manager should act on. Empty = nothing needs attention. */
export function buildAlerts(i: AlertInput): DigestAlert[] {
  const a: DigestAlert[] = [];
  const s = (n: number) => (n === 1 ? '' : 's');
  if (i.uncontactedLeads > 0) a.push({ key: 'leads', severity: 'high', count: i.uncontactedLeads, href: '/crm/leads', title: `${i.uncontactedLeads} lead${s(i.uncontactedLeads)} not contacted in 24h`, detail: 'New leads go cold fast. Call them first.' });
  if (i.overdueCallbacks > 0) a.push({ key: 'callbacks', severity: i.overdueCallbacks >= 10 ? 'high' : 'medium', count: i.overdueCallbacks, href: '/crm/callbacks', title: `${i.overdueCallbacks} overdue callback${s(i.overdueCallbacks)}`, detail: 'Customers were promised a call back.' });
  if (i.lowRatedFeedback > 0) a.push({ key: 'feedback', severity: 'high', count: i.lowRatedFeedback, href: '/crm/feedback', title: `${i.lowRatedFeedback} low rating${s(i.lowRatedFeedback)} (1-2★) this week`, detail: 'Reach out before they churn or post publicly.' });
  if (i.unrepliedChats > 0) a.push({ key: 'inbox', severity: i.unrepliedChats >= 5 ? 'high' : 'medium', count: i.unrepliedChats, href: '/crm/inbox', title: `${i.unrepliedChats} WhatsApp chat${s(i.unrepliedChats)} waiting over an hour`, detail: 'The customer wrote last and nobody replied.' });
  for (const f of i.staleFeeds) a.push({ key: `feed:${f.name}`, severity: 'medium', count: 1, title: `${f.name}: no data ${f.hours == null ? 'ever' : `for ${Math.round(f.hours)}h`}`, detail: 'Either a quiet spell or the feed has stopped. Worth a check.' });
  for (const g of i.goalsBehind) a.push({ key: `goal:${g.metric}`, severity: 'medium', count: 1, href: '/crm/goals', title: `Goal behind: ${g.metric}`, detail: `${g.progressPct ?? 0}% done with ${g.elapsedPct}% of the month gone.` });
  const { current, previous } = i.revenue;
  if (previous > 0 && current < previous * 0.7) a.push({ key: 'revenue', severity: 'medium', count: 1, title: `Revenue down ${Math.round((1 - current / previous) * 100)}% vs the previous period`, detail: 'Delivered online orders plus store bills.' });
  if (i.highRiskCustomers > 0) a.push({ key: 'churn', severity: 'medium', count: i.highRiskCustomers, href: '/crm/intelligence', title: `${i.highRiskCustomers} high-value customer${s(i.highRiskCustomers)} at high churn risk`, detail: 'Overdue for their usual reorder by 2× their cycle or more.' });
  return a.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === 'high' ? -1 : 1));
}
