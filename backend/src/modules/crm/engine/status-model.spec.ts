import {
  getISTDate,
  computeDaysLate,
  resolveCycle,
  computeSegment,
  computeVip,
  computePriority,
  computeLtvPct,
  DEFAULT_THRESHOLDS,
  DEFAULT_VIP,
} from './status-model';

// Fixed reference: 2026-10-10 00:00:00 UTC = 2026-10-10 05:30:00 IST (same calendar date)
const OCT_10_UTC = new Date('2026-10-10T00:00:00.000Z');
// IST midnight of 2026-10-10 = 2026-10-09T18:30:00Z
const OCT_10_IST_MIDNIGHT = new Date('2026-10-10T00:00:00.000Z'); // result of getISTDate for that day

describe('getISTDate', () => {
  it('returns same calendar date when UTC time is after IST midnight', () => {
    // 2026-10-10T01:00:00Z = 2026-10-10T06:30:00 IST → IST date is Oct 10
    const result = getISTDate(new Date('2026-10-10T01:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });

  it('returns previous calendar date when UTC time is before IST midnight', () => {
    // 2026-10-09T20:00:00Z = 2026-10-10T01:30:00 IST → IST date is Oct 10
    const result = getISTDate(new Date('2026-10-09T20:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });

  it('handles the IST midnight crossover (18:29 UTC = 23:59 IST prev day)', () => {
    // 2026-10-09T18:29:00Z = 2026-10-09T23:59:00 IST → IST date is Oct 9
    const result = getISTDate(new Date('2026-10-09T18:29:00.000Z'));
    expect(result.toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });
});

describe('computeDaysLate', () => {
  const today = new Date('2026-10-10T00:00:00.000Z');

  it('returns 0 when due today', () => {
    expect(computeDaysLate(today, today)).toBe(0);
  });

  it('returns positive days when overdue', () => {
    const due = new Date('2026-10-08T00:00:00.000Z'); // 2 days ago
    expect(computeDaysLate(due, today)).toBe(2);
  });

  it('returns negative days when not yet due', () => {
    const due = new Date('2026-10-15T00:00:00.000Z'); // 5 days ahead
    expect(computeDaysLate(due, today)).toBe(-5);
  });
});

describe('resolveCycle', () => {
  const cycles = { 'Oils (Wood-Pressed)': 32, 'Ghee': 50, 'Flours': 22 };
  const fallback = 30;

  const makeOrders = (daysAgo: number[]) =>
    daysAgo.map((d, i) => ({
      date: new Date(Date.UTC(2026, 9, 10) - d * 86_400_000),
      categories: i === 0 ? ['Oils (Wood-Pressed)'] : [],
    }));

  it('uses personal cycle (median gap) with 3+ orders', () => {
    // gaps: 30, 30, 30 → median 30, clamped to [7,120]
    const orders = makeOrders([0, 30, 60, 90]);
    const result = resolveCycle(orders, cycles, fallback);
    expect(result.source).toBe('personal');
    expect(result.days).toBe(30);
  });

  it('clamps personal cycle to minimum 7', () => {
    // gaps: 3, 3, 3 → median 3, clamp to 7
    const orders = makeOrders([0, 3, 6, 9]);
    const result = resolveCycle(orders, cycles, fallback);
    expect(result.source).toBe('personal');
    expect(result.days).toBe(7);
  });

  it('clamps personal cycle to maximum 120', () => {
    // gaps: 150, 150, 150 → median 150, clamp to 120
    const orders = makeOrders([0, 150, 300, 450]);
    const result = resolveCycle(orders, cycles, fallback);
    expect(result.source).toBe('personal');
    expect(result.days).toBe(120);
  });

  it('falls back to category cycle with < 3 orders', () => {
    const orders = makeOrders([0, 30]); // only 2 orders, last = Oils
    const result = resolveCycle(orders, cycles, fallback);
    expect(result.source).toBe('category');
    expect(result.days).toBe(32); // Oils (Wood-Pressed)
  });

  it('picks shortest when last order has multiple categories', () => {
    const orders = [
      { date: new Date('2026-10-10T00:00:00.000Z'), categories: ['Flours', 'Ghee'] },
    ];
    const result = resolveCycle(orders, cycles, fallback);
    expect(result.source).toBe('category');
    expect(result.days).toBe(22); // Flours is shorter than Ghee
  });

  it('falls back to fallback when category unknown', () => {
    const orders = [{ date: new Date('2026-10-10T00:00:00.000Z'), categories: ['Unknown Cat'] }];
    const result = resolveCycle(orders, cycles, fallback);
    expect(result.source).toBe('fallback');
    expect(result.days).toBe(30);
  });

  it('falls back when no orders at all', () => {
    const result = resolveCycle([], cycles, fallback);
    expect(result.source).toBe('fallback');
    expect(result.days).toBe(30);
  });
});

describe('computeSegment', () => {
  it('returns no_orders when totalOrders is 0', () => {
    expect(computeSegment(999, 0)).toBe('no_orders');
  });

  it('returns lost when daysLate > 180', () => {
    expect(computeSegment(181, 5)).toBe('lost');
    expect(computeSegment(180, 5)).not.toBe('lost');
  });

  it('returns dormant when daysLate in (60, 180]', () => {
    expect(computeSegment(61, 5)).toBe('dormant');
    expect(computeSegment(180, 5)).toBe('dormant');
  });

  it('returns at_risk when daysLate in (15, 60]', () => {
    expect(computeSegment(16, 5)).toBe('at_risk');
    expect(computeSegment(60, 5)).toBe('at_risk');
  });

  it('returns overdue when daysLate in [1, 15]', () => {
    expect(computeSegment(1, 5)).toBe('overdue');
    expect(computeSegment(15, 5)).toBe('overdue');
  });

  it('returns due_today when daysLate is 0', () => {
    expect(computeSegment(0, 1)).toBe('due_today');
    expect(computeSegment(0, 5)).toBe('due_today');
  });

  it('returns due_soon when daysLate in [-7, -1]', () => {
    expect(computeSegment(-1, 5)).toBe('due_soon');
    expect(computeSegment(-7, 5)).toBe('due_soon');
    expect(computeSegment(-8, 5)).not.toBe('due_soon');
  });

  it('returns new when totalOrders=1 and daysLate < -7', () => {
    expect(computeSegment(-8, 1)).toBe('new');
    expect(computeSegment(-30, 1)).toBe('new');
  });

  it('returns active when totalOrders>=2 and daysLate < -7', () => {
    expect(computeSegment(-8, 2)).toBe('active');
    expect(computeSegment(-30, 5)).toBe('active');
  });

  it('overdue takes precedence over new/active (1-order customer can be overdue)', () => {
    expect(computeSegment(5, 1)).toBe('overdue');
  });

  it('respects custom thresholds', () => {
    const custom = { atRiskAfterDays: 10, dormantAfterDays: 30, lostAfterDays: 90 };
    expect(computeSegment(11, 5, custom)).toBe('at_risk');
    expect(computeSegment(31, 5, custom)).toBe('dormant');
    expect(computeSegment(91, 5, custom)).toBe('lost');
  });
});

describe('computeVip', () => {
  it('returns true when both conditions met', () => {
    expect(computeVip(2, 4000)).toBe(true);
    expect(computeVip(5, 10000)).toBe(true);
  });

  it('returns false when orders < minOrders', () => {
    expect(computeVip(1, 10000)).toBe(false);
  });

  it('returns false when ltv < minLifetimeValue', () => {
    expect(computeVip(5, 3999)).toBe(false);
  });

  it('returns false for 1-order customer regardless of ltv (fixes D7)', () => {
    expect(computeVip(1, 999999)).toBe(false);
  });

  it('respects custom config', () => {
    const custom = { minOrders: 3, minLifetimeValue: 10000 };
    expect(computeVip(3, 10000, custom)).toBe(true);
    expect(computeVip(2, 10000, custom)).toBe(false);
  });
});

describe('computePriority', () => {
  it('gives max score to top-percentile VIP with max daysLate', () => {
    const { score, band } = computePriority(1, 30, 5);
    expect(score).toBe(100); // 50*1 + 40*1 + 10 = 100
    expect(band).toBe('high');
  });

  it('gives 0 to bottom-percentile new customer not yet due', () => {
    const { score, band } = computePriority(0, -5, 1);
    expect(score).toBe(0); // 0 + 0 + 0
    expect(band).toBe('low');
  });

  it('clamps daysLate at 30 for lateNorm', () => {
    const { score: s30 } = computePriority(0, 30, 1);
    const { score: s60 } = computePriority(0, 60, 1);
    expect(s30).toBe(s60); // daysLate > 30 doesn't add more
  });

  it('adds 10 points for repeat customers (totalOrders >= 2)', () => {
    const { score: s1 } = computePriority(0, 0, 1);
    const { score: s2 } = computePriority(0, 0, 2);
    expect(s2 - s1).toBe(10);
  });

  it('correctly assigns bands', () => {
    expect(computePriority(0.5, 0, 1).band).toBe('low');    // 50*0.5=25 → low
    expect(computePriority(0.7, 0, 2).band).toBe('medium'); // 50*0.7+10=45 → medium
    expect(computePriority(1, 0, 2).band).toBe('high');     // 50+10=60 → high
  });
});

describe('computeLtvPct', () => {
  it('returns 0 for empty array', () => {
    expect(computeLtvPct(1000, [])).toBe(0);
  });

  it('returns 0 for the lowest value', () => {
    expect(computeLtvPct(100, [100, 200, 300])).toBe(0);
  });

  it('returns correct percentile', () => {
    // ltv=200, array=[100,200,300] → 1 value below → 1/3
    expect(computeLtvPct(200, [100, 200, 300])).toBeCloseTo(1 / 3);
  });

  it('returns close to 1 for the highest value', () => {
    expect(computeLtvPct(300, [100, 200, 300])).toBeCloseTo(2 / 3);
  });
});
