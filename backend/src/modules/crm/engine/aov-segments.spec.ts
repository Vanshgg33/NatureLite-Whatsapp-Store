import { aovSegment, AOV_SEGMENTS } from './aov-segments';

describe('aovSegment (AOV = net LTV ÷ valid orders)', () => {
  it.each([
    [0, 1, 'aov_below_1000'],
    [999.99, 1, 'aov_below_1000'],
    [1000, 1, 'aov_1000_1999'],
    [1998.99, 1, 'aov_1000_1999'],
    [1999, 1, 'aov_1999_2999'],
    [2998.99, 1, 'aov_1999_2999'],
    [2999, 1, 'aov_2999_3999'],
    [3998.99, 1, 'aov_2999_3999'],
    [3999, 1, 'aov_3999_plus'],
    [250000, 1, 'aov_3999_plus'],
  ])('LTV %p over %p order(s) → %s', (ltv, n, key) => expect(aovSegment(ltv, n)).toBe(key));

  it('uses the exact AOV, never a rounded one', () => {
    expect(aovSegment(5996.99, 3)).toBe('aov_1000_1999'); // 1998.9966…, would round to 1999.00
    expect(aovSegment(5997, 3)).toBe('aov_1999_2999');    // exactly 1999
    expect(aovSegment(2999.99, 3)).toBe('aov_below_1000'); // 999.9966…
    expect(aovSegment(3000, 3)).toBe('aov_1000_1999');
    expect(aovSegment(0.1 + 0.2 + 999.7, 1)).toBe('aov_1000_1999'); // float noise (1000.0000000000001 / 999.99999…) settles to the paisa
    expect(aovSegment(11996.99, 3)).toBe('aov_2999_3999'); // 3998.9966…
  });

  it('zero valid orders is excluded from every segment', () => {
    expect(aovSegment(0, 0)).toBeNull();
    expect(aovSegment(5000, 0)).toBeNull();
  });

  it('bands are contiguous and cover every AOV ≥ 0', () => {
    AOV_SEGMENTS.slice(1).forEach((s, i) => expect(s.min).toBe(AOV_SEGMENTS[i].max));
    expect(AOV_SEGMENTS[0].min).toBe(0);
  });
});
