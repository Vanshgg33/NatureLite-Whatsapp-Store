// CRM Segments: customers banded by AOV = net lifetime sales ÷ valid orders. Pure so every boundary is unit tested.

/** Lower bound inclusive, upper bound exclusive, in whole rupees. Order matters: first match wins. */
export const AOV_SEGMENTS = [
  { key: 'aov_below_1000', name: 'Below ₹1,000', rule: 'AOV less than ₹1,000', min: 0, max: 1000 },
  { key: 'aov_1000_1999', name: '₹1,000–₹1,998.99', rule: 'AOV ≥ ₹1,000 and < ₹1,999', min: 1000, max: 1999 },
  { key: 'aov_1999_2999', name: '₹1,999–₹2,998.99', rule: 'AOV ≥ ₹1,999 and < ₹2,999', min: 1999, max: 2999 },
  { key: 'aov_2999_3999', name: '₹2,999–₹3,998.99', rule: 'AOV ≥ ₹2,999 and < ₹3,999', min: 2999, max: 3999 },
  { key: 'aov_3999_plus', name: '₹3,999 and above', rule: 'AOV ≥ ₹3,999', min: 3999, max: Infinity },
] as const;

export type AovSegmentKey = (typeof AOV_SEGMENTS)[number]['key'];
export const AOV_SEGMENT_KEYS: AovSegmentKey[] = AOV_SEGMENTS.map((s) => s.key);

/** Segment for a customer, or null with zero valid orders. Compared in integer paise (ltv × 100 vs bound × 100 × orders),
 *  so an AOV like 5996.99 / 3 = 1998.9966… stays below ₹1,999 instead of being rounded up into the next band. */
export function aovSegment(netLtv: number, validOrders: number): AovSegmentKey | null {
  if (!(validOrders > 0)) return null;
  const paise = Math.round(Math.max(0, Number(netLtv) || 0) * 100);
  return AOV_SEGMENTS.find((s) => paise < s.max * 100 * validOrders)?.key ?? 'aov_3999_plus';
}
