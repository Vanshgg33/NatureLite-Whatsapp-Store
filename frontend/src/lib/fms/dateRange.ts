export type RangeKey = 'today' | 'yesterday' | '7' | '30' | 'month' | 'all' | string;

export function resolveDateRange(range: string | null): { gte: Date; lte: Date } | null {
  if (!range || range === 'all') return null;

  const now = new Date();
  const ist = { timeZone: 'Asia/Kolkata' };
  const todayStr = now.toLocaleDateString('en-CA', ist); // YYYY-MM-DD
  const todayStart = new Date(`${todayStr}T00:00:00+05:30`);
  const todayEnd   = new Date(todayStart.getTime() + 86_400_000 - 1);

  if (range === 'today')     return { gte: todayStart, lte: todayEnd };
  if (range === 'yesterday') {
    const s = new Date(todayStart.getTime() - 86_400_000);
    return { gte: s, lte: new Date(s.getTime() + 86_400_000 - 1) };
  }
  if (range === '7')  return { gte: new Date(todayStart.getTime() - 6 * 86_400_000), lte: todayEnd };
  if (range === '30') return { gte: new Date(todayStart.getTime() - 29 * 86_400_000), lte: todayEnd };
  if (range === 'month') {
    const [y, m] = todayStr.split('-');
    return { gte: new Date(`${y}-${m}-01T00:00:00+05:30`), lte: todayEnd };
  }
  return null;
}

export function filterByRange<T extends { createdAt: string | Date }>(
  items: T[],
  range: string | null,
): T[] {
  const bounds = resolveDateRange(range);
  if (!bounds) return items;
  const { gte, lte } = bounds;
  return items.filter(i => {
    const d = new Date(i.createdAt);
    return d >= gte && d <= lte;
  });
}
