import { parseExtraFilters, extraStatsFilter, needsStats, sanitizeView } from './crm-filters';

describe('parseExtraFilters', () => {
  it('keeps valid values and drops junk', () => {
    expect(parseExtraFilters({ minLtv: '1000', maxLtv: 'abc', minDaysLate: '-5', tag: ' VIP ', hasComplaint: 'true' }))
      .toEqual({ minLtv: 1000, tag: 'vip', hasComplaint: true });
  });
  it('ignores empty input and over-long tags', () => {
    expect(parseExtraFilters({})).toEqual({});
    expect(parseExtraFilters({ minLtv: '', tag: 'x'.repeat(31) })).toEqual({});
  });
  it('treats 0 as a real value', () => {
    expect(parseExtraFilters({ minLtv: '0' })).toEqual({ minLtv: 0 });
  });
});

describe('extraStatsFilter', () => {
  it('combines every filter with AND on separate fields', () => {
    expect(extraStatsFilter({ minLtv: 500, maxLtv: 5000, minDaysLate: 10, tag: 'vip' }))
      .toEqual({ ltv: { $gte: 500, $lte: 5000 }, daysLate: { $gte: 10 }, tags: 'vip' });
  });
  it('is empty when nothing is set, and hasComplaint alone does not need stats', () => {
    expect(extraStatsFilter({})).toEqual({});
    expect(needsStats({ hasComplaint: true })).toBe(false);
    expect(needsStats({ minLtv: 1 })).toBe(true);
  });
});

describe('sanitizeView', () => {
  it('stores only whitelisted, valid fields', () => {
    expect(sanitizeView({ segment: 'at_risk', search: '  ram ', isEscalated: true, minLtv: '100', $where: 'evil', segment2: 'x' }))
      .toEqual({ minLtv: 100, segment: 'at_risk', search: 'ram', isEscalated: true });
  });
  it('rejects a segment that is not a plain slug', () => {
    expect(sanitizeView({ segment: '$ne' }).segment).toBeUndefined();
  });
});
