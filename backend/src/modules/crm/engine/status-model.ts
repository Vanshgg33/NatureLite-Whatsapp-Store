// Pure, side-effect-free functions for CRM status computation.
// All accept explicit parameters so tests can inject fixed dates and data.

export type Segment =
  | 'new' | 'active' | 'due_soon' | 'due_today'
  | 'overdue' | 'at_risk' | 'dormant' | 'lost' | 'no_orders';

export type CycleSource = 'personal' | 'category' | 'fallback';
export type PriorityBand = 'high' | 'medium' | 'low';

export interface Thresholds {
  atRiskAfterDays: number;
  dormantAfterDays: number;
  lostAfterDays: number;
}

export interface VipConfig {
  minOrders: number;
  minLifetimeValue: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  atRiskAfterDays: 15,
  dormantAfterDays: 60,
  lostAfterDays: 180,
};

export const DEFAULT_VIP: VipConfig = {
  minOrders: 2,
  minLifetimeValue: 4000,
};

export interface OrderForCycle {
  date: Date;
  categories: string[];
}

/**
 * Returns the IST calendar date as a UTC-midnight Date.
 * Inject `now` in tests for deterministic results.
 */
export function getISTDate(now = new Date()): Date {
  // IST = UTC+5:30
  const istMs = now.getTime() + 5.5 * 3_600_000;
  const d = new Date(istMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Days late relative to nextDueDate.
 * Positive = overdue, 0 = due today, negative = days until due.
 */
export function computeDaysLate(nextDueDate: Date, today: Date): number {
  return Math.floor((today.getTime() - nextDueDate.getTime()) / 86_400_000);
}

/**
 * Resolve reorder cycle for a customer.
 * orders: sorted newest-first, each with its last-order categories.
 */
export function resolveCycle(
  orders: OrderForCycle[],
  categoryDays: Record<string, number>,
  fallbackDays: number,
): { days: number; source: CycleSource } {
  if (orders.length >= 3) {
    const dates = orders.map(o => o.date.getTime());
    const gaps: number[] = [];
    for (let i = 0; i < dates.length - 1; i++) {
      const g = Math.round((dates[i] - dates[i + 1]) / 86_400_000);
      if (g > 0) gaps.push(g);
    }
    if (gaps.length) {
      const sorted = [...gaps].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      return { days: Math.min(Math.max(median, 7), 120), source: 'personal' };
    }
  }

  // Category default: shortest cycle among last order's categories
  if (orders[0]?.categories.length) {
    const known = orders[0].categories
      .map(c => categoryDays[c])
      .filter((d): d is number => d !== undefined);
    if (known.length) return { days: Math.min(...known), source: 'category' };
  }

  return { days: fallbackDays, source: 'fallback' };
}

/**
 * Compute segment. Evaluated top-to-bottom, first match wins.
 */
export function computeSegment(
  daysLate: number,
  totalOrders: number,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Segment {
  if (totalOrders === 0) return 'no_orders';
  if (daysLate > thresholds.lostAfterDays) return 'lost';
  if (daysLate > thresholds.dormantAfterDays) return 'dormant';
  if (daysLate > thresholds.atRiskAfterDays) return 'at_risk';
  if (daysLate >= 1) return 'overdue';
  if (daysLate === 0) return 'due_today';
  if (daysLate >= -7) return 'due_soon';
  if (totalOrders === 1) return 'new';
  return 'active';
}

/**
 * VIP rule: configurable minimum orders and lifetime value.
 */
export function computeVip(
  totalOrders: number,
  ltv: number,
  config: VipConfig = DEFAULT_VIP,
): boolean {
  return totalOrders >= config.minOrders && ltv >= config.minLifetimeValue;
}

/**
 * Priority score 0–100.
 * ltvPct: percentile rank of this customer's LTV among all customers with orders (0–1).
 * Ties broken by caller (daysLate desc, then ltv desc).
 */
export function computePriority(
  ltvPct: number,
  daysLate: number,
  totalOrders: number,
): { score: number; band: PriorityBand } {
  const lateNorm = Math.min(Math.max(daysLate, 0), 30) / 30;
  const score = Math.round(50 * ltvPct + 40 * lateNorm + (totalOrders >= 2 ? 10 : 0));
  const band: PriorityBand = score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
  return { score, band };
}

/**
 * Compute LTV percentile rank within a sorted array of all LTV values.
 * allLtvs: sorted ascending. Returns 0–1.
 */
export function computeLtvPct(ltv: number, allLtvsSorted: number[]): number {
  if (!allLtvsSorted.length) return 0;
  let rank = 0;
  for (const v of allLtvsSorted) {
    if (v < ltv) rank++;
    else break;
  }
  return rank / allLtvsSorted.length;
}
