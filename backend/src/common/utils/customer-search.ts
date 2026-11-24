/**
 * One definition of "customer search" for every screen that finds customers by name / phone / email (CRM list and
 * palette, billing pickers, admin customers, coupon and campaign pickers). Matching is case-insensitive and ignores
 * extra whitespace; ranking is
 *   0 exact name · 1 name starts with · 2 a word in the name starts with · 3 name contains
 * and for a phone-looking query (digits, spaces, + - ( ) .)
 *   0 same number · 1 number starts with the digits · 3 number contains them
 * so "om" lists Om / Omkar before Komal, and "98765" lists numbers starting 98765 before ones that merely contain it.
 */
import { escapeRegex } from './query.util';

export interface ParsedCustomerQuery {
  /** trimmed, single-spaced, as typed */
  text: string;
  lower: string;
  /** lower with punctuation turned into single spaces, for word-start checks */
  words: string;
  /** every digit typed, formatting removed */
  digits: string;
  /** digits without a leading country code (91) or trunk 0 when a full number was typed */
  national: string;
  /** the whole query looks like a phone number, so digits are matched against phones */
  phoneLike: boolean;
}

export type CustomerSearchField = 'name' | 'phone' | 'email';
type Candidate = { name?: string | null; phone?: string | null; email?: string | null };

const NON_WORD = /[^\p{L}\p{N}]+/gu;

export function parseCustomerQuery(raw?: string | null): ParsedCustomerQuery | null {
  const text = String(raw ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  // trunk / international zeros (098…, 0091…) never belong to the stored number; a country code is dropped when it is
  // explicit (+91…) or the digits are too long to be a bare 10-digit number
  let national = digits.replace(/^0+/, '');
  if (national.startsWith('91') && (national.length > 10 || text.startsWith('+'))) national = national.slice(2);
  const lower = text.toLowerCase();
  return {
    text,
    lower,
    words: lower.replace(NON_WORD, ' ').trim(),
    digits,
    national,
    phoneLike: national.length > 0 && /^[\d\s()+\-.]+$/.test(text),
  };
}

const nameBody = (q: ParsedCustomerQuery) => q.text.split(' ').map(escapeRegex).join('\\s+');

/**
 * Mongo filter for one match tier, so callers can fetch best matches first:
 * exact < prefix < word (a word starts with it) < any (contains).
 */
export function customerSearchFilter(
  q: ParsedCustomerQuery | null,
  mode: 'exact' | 'prefix' | 'word' | 'any' = 'any',
  fields: CustomerSearchField[] = ['name', 'phone'],
): { $or: Record<string, unknown>[] } | null {
  if (!q) return null;
  const body = nameBody(q);
  // word tier uses ASCII classes: Mongo's regex engine is not guaranteed to take p{L}; the JS ranking is Unicode-aware
  const textRx = { exact: `^${body}$`, prefix: `^${body}`, word: `(^|[^a-zA-Z0-9])${body}`, any: body }[mode];
  const or: Record<string, unknown>[] = [];
  for (const f of fields) {
    if (f === 'phone') {
      if (!q.phoneLike || mode === 'word') continue;
      const n = escapeRegex(q.national);
      // stored as 91XXXXXXXXXX: an anchored pattern lets the phone index serve "starts with"
      or.push({ phone: { $regex: { exact: `^(91)?${n}$`, prefix: `^(91)?${n}`, any: n }[mode as 'exact' | 'prefix' | 'any'] } });
    } else {
      or.push({ [f]: { $regex: textRx, $options: 'i' } });
    }
  }
  return or.length ? { $or: or } : null;
}

/** Lower is better; Infinity = not a match. */
export function customerRank(q: ParsedCustomerQuery, c: Candidate, fields: CustomerSearchField[] = ['name', 'phone']): number {
  let best = Infinity;
  const text = (v?: string | null) => {
    const s = String(v ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!s) return;
    let r = Infinity;
    if (s === q.lower) r = 0;
    else if (s.startsWith(q.lower)) r = 1;
    else if (q.words && ` ${s.replace(NON_WORD, ' ').trim()}`.includes(` ${q.words}`)) r = 2;
    else if (s.includes(q.lower)) r = 3;
    best = Math.min(best, r);
  };
  if (fields.includes('name')) text(c.name);
  if (fields.includes('email')) text(c.email);
  if (fields.includes('phone') && q.phoneLike && c.phone) {
    const full = String(c.phone).replace(/\D/g, '');
    const nat = full.length > 10 && full.startsWith('91') ? full.slice(2) : full;
    if (nat === q.national) best = Math.min(best, 0);
    else if (nat.startsWith(q.national)) best = Math.min(best, 1);
    else if (full.includes(q.national)) best = Math.min(best, 3);
  }
  return best;
}

/**
 * Drops non-matches and orders the rest best match first. Equal ranks keep their incoming order, so callers pre-sort
 * by whatever should break ties (priority score, name, recency).
 */
export function rankCustomers<T>(
  items: T[],
  raw: string | null | undefined,
  pick: (item: T) => Candidate,
  fields: CustomerSearchField[] = ['name', 'phone'],
): T[] {
  const q = parseCustomerQuery(raw);
  if (!q) return items;
  return items
    .map((item, i) => ({ item, i, r: customerRank(q, pick(item), fields) }))
    .filter((x) => x.r !== Infinity)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

/** Combines a caller's own filters with the search $or without either overwriting the other. */
export const andFilters = (...parts: (Record<string, unknown> | null | undefined)[]) => {
  const real = parts.filter((p): p is Record<string, unknown> => !!p && Object.keys(p).length > 0);
  return real.length === 0 ? {} : real.length === 1 ? real[0] : { $and: real };
};

/**
 * Best `limit` matches without loading every match: fetch tier by tier (exact, prefix, word, contains), stop when full,
 * then rank. `model.find` is a Mongoose model; `extra` carries the caller's own filters (permissions, "missing name"...).
 */
export async function searchCustomersRanked(
  model: { find: (f: any) => any },
  raw: string | null | undefined,
  o: { limit: number; extra?: Record<string, unknown>; fields?: CustomerSearchField[] },
): Promise<any[]> {
  const q = parseCustomerQuery(raw);
  if (!q) return [];
  const fields = o.fields ?? ['name', 'phone'];
  const pool: any[] = [];
  const seen: unknown[] = [];
  for (const mode of ['exact', 'prefix', 'word', 'any'] as const) {
    if (pool.length >= o.limit) break;
    const f = customerSearchFilter(q, mode, fields);
    if (!f) continue;
    const rows: any[] = await model
      .find(andFilters(o.extra, f, seen.length ? { _id: { $nin: seen } } : null))
      .sort({ name: 1 })
      .limit(o.limit - pool.length)
      .lean();
    for (const r of rows) { pool.push(r); seen.push(r._id); }
  }
  return rankCustomers(pool, raw, (r) => r, fields).slice(0, o.limit);
}
