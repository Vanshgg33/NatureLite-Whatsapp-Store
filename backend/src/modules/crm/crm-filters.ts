// Combinable customer filters and saved views (blueprint M04). Pure functions so every rule is unit tested.

import { AOV_SEGMENT_KEYS, type AovSegmentKey } from './engine/aov-segments';
import { parseIncompleteLead, type IncompleteLead } from '../../common/utils/incomplete-lead.util';

export interface ExtraFilters { minLtv?: number; maxLtv?: number; minDaysLate?: number; tag?: string; hasComplaint?: boolean; aovSegment?: AovSegmentKey }
export interface ViewFilters extends ExtraFilters { segment?: string; search?: string; isEscalated?: boolean; missing?: IncompleteLead }

const num = (v: unknown): number | undefined => {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Reads untrusted query/body values; anything invalid is dropped rather than trusted. */
export function parseExtraFilters(q: Record<string, unknown> = {}): ExtraFilters {
  const out: ExtraFilters = {};
  const minLtv = num(q.minLtv), maxLtv = num(q.maxLtv), minDaysLate = num(q.minDaysLate);
  if (minLtv !== undefined) out.minLtv = minLtv;
  if (maxLtv !== undefined) out.maxLtv = maxLtv;
  if (minDaysLate !== undefined) out.minDaysLate = minDaysLate;
  const tag = typeof q.tag === 'string' ? q.tag.trim().toLowerCase() : '';
  if (tag && tag.length <= 30) out.tag = tag;
  if (q.hasComplaint === true || q.hasComplaint === 'true') out.hasComplaint = true;
  if (AOV_SEGMENT_KEYS.includes(q.aovSegment as AovSegmentKey)) out.aovSegment = q.aovSegment as AovSegmentKey;
  return out;
}

/** Mongo conditions on crm_customer_stats. Filters combine with AND. */
export function extraStatsFilter(f: ExtraFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.minLtv !== undefined || f.maxLtv !== undefined) out.ltv = { ...(f.minLtv !== undefined && { $gte: f.minLtv }), ...(f.maxLtv !== undefined && { $lte: f.maxLtv }) };
  if (f.minDaysLate !== undefined) out.daysLate = { $gte: f.minDaysLate };
  if (f.tag) out.tags = f.tag;
  if (f.aovSegment) out.aovSegment = f.aovSegment;
  return out;
}

/** True when the filter needs a stats document to exist (customers never scored cannot match). */
export const needsStats = (f: ExtraFilters) => Object.keys(extraStatsFilter(f)).length > 0;

/** What a saved view is allowed to store. */
export function sanitizeView(raw: Record<string, unknown> = {}): ViewFilters {
  const out: ViewFilters = parseExtraFilters(raw);
  if (typeof raw.segment === 'string' && /^[a-z_]{1,30}$/.test(raw.segment)) out.segment = raw.segment;
  if (typeof raw.search === 'string' && raw.search.trim()) out.search = raw.search.trim().slice(0, 100);
  if (raw.isEscalated === true) out.isEscalated = true;
  const missing = parseIncompleteLead(raw.missing);
  if (missing) out.missing = missing;
  return out;
}
