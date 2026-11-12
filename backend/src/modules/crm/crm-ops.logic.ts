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
