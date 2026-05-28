/**
 * Parses natural language date expressions into { from, to } Date ranges.
 * Returns null when no recognizable pattern is found.
 *
 * Handles: "today", "yesterday", "this week", "last week", "this month",
 * "last month", "last N days/weeks/months", "Q1/Q2/Q3/Q4 YYYY",
 * "January 2025", "May 1–15", "between May 1 and May 15"
 */
export function parseDateRange(expr: string): { from: Date; to: Date } | null {
  const m = expr.toLowerCase().trim();
  const now = new Date();

  const startOf = (d: Date): Date => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const endOf = (d: Date): Date => {
    const c = new Date(d);
    c.setHours(23, 59, 59, 999);
    return c;
  };

  // today
  if (/\btoday\b/.test(m)) {
    return { from: startOf(now), to: endOf(now) };
  }

  // yesterday
  if (/\byesterday\b/.test(m)) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOf(y), to: endOf(y) };
  }

  // this week (Mon–today)
  if (/\bthis\s+week\b/.test(m)) {
    const day = now.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon);
    return { from: startOf(mon), to: endOf(now) };
  }

  // last week (Mon–Sun of previous week)
  if (/\blast\s+week\b/.test(m)) {
    const day = now.getDay();
    const diffToLastMon = (day === 0 ? -13 : -(day + 6));
    const lastMon = new Date(now);
    lastMon.setDate(now.getDate() + diffToLastMon);
    const lastSun = new Date(lastMon);
    lastSun.setDate(lastMon.getDate() + 6);
    return { from: startOf(lastMon), to: endOf(lastSun) };
  }

  // this month
  if (/\bthis\s+month\b/.test(m)) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: first, to: endOf(now) };
  }

  // last month
  if (/\blast\s+month\b/.test(m)) {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: first, to: endOf(last) };
  }

  // last N days
  const lastDaysMatch = m.match(/\blast\s+(\d+)\s+days?\b/);
  if (lastDaysMatch) {
    const n = parseInt(lastDaysMatch[1]);
    const from = new Date(now.getTime() - n * 86_400_000);
    return { from: startOf(from), to: endOf(now) };
  }

  // last N weeks
  const lastWeeksMatch = m.match(/\blast\s+(\d+)\s+weeks?\b/);
  if (lastWeeksMatch) {
    const n = parseInt(lastWeeksMatch[1]);
    const from = new Date(now.getTime() - n * 7 * 86_400_000);
    return { from: startOf(from), to: endOf(now) };
  }

  // last N months
  const lastMonthsMatch = m.match(/\blast\s+(\d+)\s+months?\b/);
  if (lastMonthsMatch) {
    const n = parseInt(lastMonthsMatch[1]);
    const from = new Date(now);
    from.setMonth(from.getMonth() - n);
    return { from: startOf(from), to: endOf(now) };
  }

  // quarter: Q1 2025 / Q2 / Q3 / Q4
  const quarterMatch = m.match(/\bq([1-4])\s*(\d{4})?\b/);
  if (quarterMatch) {
    const q = parseInt(quarterMatch[1]);
    const year = quarterMatch[2] ? parseInt(quarterMatch[2]) : now.getFullYear();
    const startMonth = (q - 1) * 3;
    const from = new Date(year, startMonth, 1);
    const to = new Date(year, startMonth + 3, 0);
    return { from, to: endOf(to) };
  }

  // Named month: "january 2025", "may 2024"
  const MONTHS: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  for (const [name, idx] of Object.entries(MONTHS)) {
    const monthMatch = m.match(new RegExp(`\\b${name}\\s*(\\d{4})?\\b`));
    if (monthMatch) {
      const year = monthMatch[1] ? parseInt(monthMatch[1]) : now.getFullYear();
      const from = new Date(year, idx, 1);
      const to = new Date(year, idx + 1, 0);
      return { from, to: endOf(to) };
    }
  }

  // "between May 1 and May 15" or "May 1-15"
  const betweenMatch = m.match(/between\s+(\w+\s+\d+)\s+and\s+(\w+\s+\d+)/);
  if (betweenMatch) {
    const d1 = new Date(`${betweenMatch[1]} ${now.getFullYear()}`);
    const d2 = new Date(`${betweenMatch[2]} ${now.getFullYear()}`);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      return { from: startOf(d1), to: endOf(d2) };
    }
  }

  return null;
}

/** Converts a date range to a `days` count for backward-compatible tool params. */
export function dateRangeToDays(range: { from: Date; to: Date }): number {
  return Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000));
}
