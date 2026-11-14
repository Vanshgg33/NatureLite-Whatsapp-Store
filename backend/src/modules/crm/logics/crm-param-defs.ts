/** The numbers on the CRM Logics page. Stored in CrmSettings (thresholds/vip are nested objects there); `default` is used until set. */
export interface CrmValueDef { key: string; label: string; help: string; unit: string; min: number; max: number; default: number }

export const CRM_VALUE_DEFS: CrmValueDef[] = [
  { key: 'minOrdersForPersonal', label: 'Orders before using their own pattern', unit: 'orders', min: 2, max: 10, default: 3, help: 'Until a customer has this many orders, the category or fallback cycle is used instead of their own pattern.' },
  { key: 'fallbackCycleDays', label: 'Fallback reorder cycle', unit: 'days', min: 1, max: 365, default: 30, help: 'Used when there is no pattern and no category cycle for the customer.' },
  { key: 'dueSoonDays', label: 'Due-soon window', unit: 'days', min: 0, max: 60, default: 7, help: 'A customer is "due soon" this many days before their expected reorder date.' },
  { key: 'atRiskAfterDays', label: 'At-risk after', unit: 'days late', min: 1, max: 1000, default: 15, help: 'Days past the due date before a customer becomes at-risk.' },
  { key: 'dormantAfterDays', label: 'Dormant after', unit: 'days late', min: 1, max: 1000, default: 60, help: 'Days past the due date before a customer becomes dormant.' },
  { key: 'lostAfterDays', label: 'Lost after', unit: 'days late', min: 1, max: 1000, default: 180, help: 'Days past the due date before a customer counts as lost.' },
  { key: 'vipMinOrders', label: 'VIP: minimum orders', unit: 'orders', min: 1, max: 100, default: 2, help: 'A customer needs at least this many orders to be a VIP.' },
  { key: 'vipMinLifetimeValue', label: 'VIP: minimum lifetime spend', unit: '₹', min: 0, max: 10_000_000, default: 4000, help: 'And at least this much spent in total.' },
  { key: 'priorityHighAt', label: 'High priority from score', unit: 'score', min: 1, max: 100, default: 60, help: 'Scores at or above this are high priority.' },
  { key: 'priorityMediumAt', label: 'Medium priority from score', unit: 'score', min: 1, max: 100, default: 35, help: 'Scores at or above this (and below high) are medium priority.' },
  { key: 'dailyCallTarget', label: 'Daily call target', unit: 'calls', min: 1, max: 1000, default: 50, help: 'How many calls each caller aims for in a day.' },
];

export const crmValueDef = (key: string) => CRM_VALUE_DEFS.find(d => d.key === key);

/**
 * Checks a partial change on top of the current values. Returns only the values that were asked for (plus category cycles),
 * or a plain-language error. Whole numbers only; the ordering rules (at-risk < dormant < lost, medium < high) apply to the result.
 */
export function checkCrmValues(current: Record<string, number>, patch: unknown): { values: Record<string, number>; cycles?: Record<string, number> } | { error: string } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: 'Nothing to change' };
  const values: Record<string, number> = {};
  let cycles: Record<string, number> | undefined;
  for (const [k, raw] of Object.entries(patch as Record<string, unknown>)) {
    if (k === 'reorderCycles') {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Reorder cycles must be a list of category and days' };
      cycles = {};
      for (const [cat, d] of Object.entries(raw as Record<string, unknown>)) {
        if (!cat.trim() || cat.length > 60) return { error: 'Category names must be 1 to 60 characters' };
        if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 365) return { error: `Reorder cycle for ${cat} must be a whole number between 1 and 365 days` };
        cycles[cat] = d;
      }
      continue;
    }
    const def = crmValueDef(k);
    if (!def) return { error: `Unknown setting "${k}"` };
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return { error: `${def.label} must be a number` };
    if (!Number.isInteger(raw)) return { error: `${def.label} must be a whole number` };
    if (raw < def.min || raw > def.max) return { error: `${def.label} must be between ${def.min} and ${def.max}` };
    values[k] = raw;
  }
  const m = { ...current, ...values };
  if (!(m.atRiskAfterDays < m.dormantAfterDays && m.dormantAfterDays < m.lostAfterDays)) return { error: 'At-risk days must be below dormant days, and dormant below lost' };
  if (!(m.priorityMediumAt < m.priorityHighAt)) return { error: 'The medium priority score must be below the high priority score' };
  return cycles ? { values, cycles } : { values };
}
