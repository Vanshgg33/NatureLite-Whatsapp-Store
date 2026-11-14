// CRM rules the owner can edit: two formulas (reorder cycle from a customer's own pattern, priority score) plus a few numbers.
// Uses the billing formula evaluator. Built-in values reproduce the original hard-coded behaviour exactly.
import { compile } from '../../billing/logics/formula-engine';

export const CRM_SLOT_KEYS = ['personalCycle', 'priorityScore'] as const;
export type CrmSlotKey = (typeof CRM_SLOT_KEYS)[number];
export type CrmFormulas = Record<CrmSlotKey, string>;

export const DEFAULT_CRM_FORMULAS: CrmFormulas = {
  personalCycle: 'min(max(medianGap, 7), 120)',
  // brackets kept so floating-point rounding matches the original code
  priorityScore: '50 * ltvPct + 40 * (min(max(daysLate, 0), 30) / 30) + (orders >= 2 ? 10 : 0)',
};

export interface CrmRules {
  formulas: CrmFormulas;
  dueSoonDays: number;
  minOrdersForPersonal: number;
  priorityHighAt: number;
  priorityMediumAt: number;
}

export const DEFAULT_CRM_RULES: CrmRules = {
  formulas: DEFAULT_CRM_FORMULAS,
  dueSoonDays: 7,
  minOrdersForPersonal: 3,
  priorityHighAt: 60,
  priorityMediumAt: 35,
};

export const CRM_SLOT_META: Array<{ key: CrmSlotKey; label: string; help: string; vars: string[] }> = [
  { key: 'personalCycle', label: 'Reorder cycle from their own orders', vars: ['medianGap', 'meanGap', 'lastGap', 'orders'],
    help: 'How many days this customer normally takes to reorder, worked out from the gaps between their orders. Used once they have enough orders.' },
  { key: 'priorityScore', label: 'Priority score', vars: ['ltvPct', 'daysLate', 'orders'],
    help: 'A number from 0 to 100 that decides who is called first. Higher means call sooner.' },
];

export const CRM_VAR_LABELS: Record<string, string> = {
  medianGap: 'Typical gap between orders (days, the middle value)',
  meanGap: 'Average gap between orders (days)',
  lastGap: 'Latest gap between orders (days)',
  orders: 'Number of orders',
  ltvPct: 'Customer value rank (0 = lowest, 1 = highest)',
  daysLate: 'Days past the due date (negative = not due yet)',
};

type CycleVars = { medianGap: number; meanGap: number; lastGap: number; orders: number };
type PriorityVars = { ltvPct: number; daysLate: number; orders: number };

const rawCycle = (f: CrmFormulas, v: CycleVars) => compile(f.personalCycle)(v);
const rawPriority = (f: CrmFormulas, v: PriorityVars) => compile(f.priorityScore)(v);

/** Whole days >= 1, or null when the formula gives nothing usable (the caller then uses the category/fallback cycle). */
export function evalCycle(f: CrmFormulas, v: CycleVars): number | null {
  try {
    const r = rawCycle(f, v);
    if (!Number.isFinite(r)) return null;
    const days = Math.round(r);
    return days >= 1 ? days : null;
  } catch { return null; }
}

/** Whole number 0..100. Throws on an unknown name or a result that is not a number. */
export function evalPriority(f: CrmFormulas, v: PriorityVars): number {
  const r = rawPriority(f, v);
  if (!Number.isFinite(r)) throw new Error('Priority formula did not give a number');
  return Math.min(100, Math.max(0, Math.round(r)));
}

/** Example customers shown on the page and used by the safety check. */
export const CRM_SAMPLES: Array<{ text: string; cycle: CycleVars; priority: PriorityVars }> = [
  { text: 'Regular: orders about monthly, 4 orders, a week late, mid value', cycle: { medianGap: 30, meanGap: 32, lastGap: 28, orders: 4 }, priority: { ltvPct: 0.5, daysLate: 7, orders: 4 } },
  { text: 'Quick reorderer: every 10 days, 8 orders, due today, top value', cycle: { medianGap: 10, meanGap: 11, lastGap: 9, orders: 8 }, priority: { ltvPct: 0.95, daysLate: 0, orders: 8 } },
  { text: 'Slow reorderer: every 90 days, 3 orders, not due for 20 days', cycle: { medianGap: 90, meanGap: 100, lastGap: 120, orders: 3 }, priority: { ltvPct: 0.2, daysLate: -20, orders: 3 } },
  { text: 'Lapsed: 200 days late, lowest value', cycle: { medianGap: 45, meanGap: 50, lastGap: 60, orders: 5 }, priority: { ltvPct: 0, daysLate: 200, orders: 5 } },
  { text: 'Short gaps: orders a day apart', cycle: { medianGap: 1, meanGap: 1, lastGap: 1, orders: 3 }, priority: { ltvPct: 0.1, daysLate: 2, orders: 1 } },
];

/** Problems found running both formulas on the sample customers; empty means safe to publish. */
export function crmSelfCheck(f: CrmFormulas): string[] {
  const bad: string[] = [];
  for (const s of CRM_SAMPLES) {
    try {
      const r = rawCycle(f, s.cycle);
      if (!Number.isFinite(r) || Math.round(r) < 1 || Math.round(r) > 1000) bad.push(`${s.text}: the reorder cycle must be between 1 and 1000 days (got ${Number.isFinite(r) ? Math.round(r) : 'no number'})`);
    } catch (e: any) { bad.push(`${s.text}: reorder cycle - ${e.message}`); }
    try {
      const r = rawPriority(f, s.priority);
      if (!Number.isFinite(r) || r < 0 || r > 100) bad.push(`${s.text}: the priority score must be between 0 and 100 (got ${Number.isFinite(r) ? Math.round(r) : 'no number'})`);
    } catch (e: any) { bad.push(`${s.text}: priority score - ${e.message}`); }
  }
  return bad;
}
