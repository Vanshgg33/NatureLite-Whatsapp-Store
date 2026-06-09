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

  if (startDate) {
    const sDate = typeof startDate === 'string' ? new Date(startDate) : new Date(startDate);
    if (!isNaN(sDate.getTime())) {
      if (typeof startDate === 'string' && startDate.trim().length <= 10) {
        sDate.setUTCHours(0, 0, 0, 0);
      } else {
        sDate.setHours(0, 0, 0, 0);
      }
      filter.$gte = sDate;
    }
  }

  if (endDate) {
    const eDate = typeof endDate === 'string' ? new Date(endDate) : new Date(endDate);
    if (!isNaN(eDate.getTime())) {
      if (typeof endDate === 'string' && endDate.trim().length <= 10) {
        eDate.setUTCHours(23, 59, 59, 999);
      } else {
        eDate.setHours(23, 59, 59, 999);
      }
      filter.$lte = eDate;
    }
  }

  if (Object.keys(filter).length === 0) return undefined;
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
