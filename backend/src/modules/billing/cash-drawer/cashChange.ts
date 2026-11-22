// cashChange.ts - pure, dependency-free. Identical copy lives in backend and frontend (a test checks they match).
export type DenomId = string; // e.g. "N500" (note) or "C10" (coin)
export interface DenomDef {
  id: DenomId;
  value: number;
  kind: "note" | "coin";
  par: number;
}
export type Counts = Record<DenomId, number>;

export const MAX_CHANGE_RUPEES = 50000;
const BASE = 1_000_000_000; // one physical piece; dominates any scarcity penalty

export interface ChangePlan {
  ok: boolean; // true when the full change can be paid
  changeDue: number; // rupees requested
  returned: Counts; // best plan (full when ok, else best partial)
  paid: number; // rupees covered by `returned`
  shortfall: number; // changeDue - paid
  pieces: number;
  tooLarge?: boolean;
}

export const sumCounts = (c: Counts, defs: DenomDef[]): number =>
  defs.reduce((s, d) => s + d.value * (c[d.id] || 0), 0);

// a request body can carry anything: null, arrays and strings are not counts
export const isValidCounts = (c: Counts, defs: DenomDef[], maxQty = 100000): boolean =>
  !!c &&
  typeof c === "object" &&
  !Array.isArray(c) &&
  Object.entries(c).every(
    ([k, v]) => defs.some((d) => d.id === k) && Number.isSafeInteger(v) && v >= 0 && v <= maxQty,
  );

// Bounded change-making. Primary goal: fewest pieces. Secondary: spare denominations that
// are below their par level. Greedy is NOT safe with bounded stock, so we use exact DP.
export function makeChange(changeDue: number, available: Counts, defs: DenomDef[]): ChangePlan {
  const empty: Counts = {};
  if (!Number.isSafeInteger(changeDue) || changeDue < 0)
    throw new Error("changeDue must be a non-negative integer");
  if (changeDue === 0)
    return { ok: true, changeDue, returned: empty, paid: 0, shortfall: 0, pieces: 0 };
  if (changeDue > MAX_CHANGE_RUPEES)
    return {
      ok: false,
      changeDue,
      returned: empty,
      paid: 0,
      shortfall: changeDue,
      pieces: 0,
      tooLarge: true,
    };

  type Item = { id: DenomId; k: number; w: number; cost: number };
  const items: Item[] = [];
  for (const d of defs) {
    const have = Math.min(
      Math.max(0, Math.floor(available[d.id] || 0)),
      Math.floor(changeDue / d.value),
    );
    if (have === 0) continue;
    const scarcity =
      d.par > 0 ? Math.round((1000 * Math.max(0, d.par - (available[d.id] || 0))) / d.par) : 0;
    const unit = BASE + scarcity;
    for (let chunk = 1, left = have; left > 0; chunk *= 2) {
      const k = Math.min(chunk, left);
      items.push({ id: d.id, k, w: k * d.value, cost: k * unit });
      left -= k;
    }
  }
  const dp = new Float64Array(changeDue + 1).fill(Infinity);
  dp[0] = 0;
  const take = items.map(() => new Uint8Array(changeDue + 1));
  items.forEach((it, i) => {
    for (let a = changeDue; a >= it.w; a--) {
      const c = dp[a - it.w] + it.cost;
      if (c < dp[a]) {
        dp[a] = c;
        take[i][a] = 1;
      }
    }
  });
  let target = changeDue;
  while (target > 0 && dp[target] === Infinity) target--;
  const returned: Counts = {};
  let a = target,
    pieces = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (take[i][a]) {
      returned[items[i].id] = (returned[items[i].id] || 0) + items[i].k;
      pieces += items[i].k;
      a -= items[i].w;
    }
  }
  return {
    ok: target === changeDue,
    changeDue,
    returned,
    paid: target,
    shortfall: changeDue - target,
    pieces,
  };
}

export interface TenderCheck {
  ok: boolean;
  code?: string;
  changeDue: number;
  applied: number;
}

// Shared by client (preview) and server (authority). All amounts in whole rupees.
export function checkTender(p: {
  cashDue: number;
  received: Counts;
  returned: Counts;
  stock: Counts;
  defs: DenomDef[];
  activeIds: DenomId[];
}): TenderCheck {
  const { cashDue, received, returned, stock, defs, activeIds } = p;
  const fail = (code: string): TenderCheck => ({ ok: false, code, changeDue: 0, applied: 0 });
  if (!isValidCounts(received, defs) || !isValidCounts(returned, defs)) return fail("BAD_COUNTS");
  for (const id of [...Object.keys(received), ...Object.keys(returned)])
    if ((received[id] || returned[id]) && !activeIds.includes(id))
      return fail("INACTIVE_DENOMINATION");
  const rec = sumCounts(received, defs),
    ret = sumCounts(returned, defs);
  const changeDue = Math.max(0, rec - cashDue);
  if (ret !== changeDue)
    return { ok: false, code: "CHANGE_MISMATCH", changeDue, applied: rec - ret };
  for (const d of defs)
    // stock available = drawer + notes just received
    if ((returned[d.id] || 0) > (stock[d.id] || 0) + (received[d.id] || 0))
      return { ok: false, code: "STOCK_INSUFFICIENT", changeDue, applied: rec - ret };
  return { ok: true, changeDue, applied: rec - ret };
}
