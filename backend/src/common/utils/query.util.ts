/**
 * Shared query/filter helpers to avoid duplication across repositories.
 */

/**
 * Build a createdAt filter for date range queries.
 * Returns undefined if neither date is provided (caller should not add createdAt to filter).
 */
export function buildCreatedAtFilter(
  startDate?: string | Date,
  endDate?: string | Date,
): Record<string, Date> | undefined {
  if (!startDate && !endDate) return undefined;
  const filter: Record<string, Date> = {};
  if (startDate) filter.$gte = typeof startDate === 'string' ? new Date(startDate) : startDate;
  if (endDate) filter.$lte = typeof endDate === 'string' ? new Date(endDate) : endDate;
  return filter;
}

/**
 * Build a $or array for case-insensitive regex search on multiple string fields.
 */
export function buildSearchOrFilter(
  search: string,
  fields: string[],
): Array<Record<string, { $regex: string; $options: string }>> {
  if (!search?.trim()) return [];
  return fields.map((field) => ({
    [field]: { $regex: search.trim(), $options: 'i' },
  }));
}
