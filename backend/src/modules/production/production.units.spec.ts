import { dayStart, localDate, toBase } from './production.service';

describe('toBase', () => {
  const oil = { name: 'Oil', baseUnit: 'L' as const, kgPerL: 0.92 };
  it('keeps measured base-unit values unconverted', () => {
    expect(toBase(oil, 60, 'L')).toEqual({ base: 60, converted: false, factor: undefined });
  });
  it('converts kg to L with the configured factor and flags it', () => {
    expect(toBase(oil, 92, 'kg')).toMatchObject({ base: 100, converted: true, factor: 0.92 });
  });
  it('refuses conversion when no factor is configured', () => {
    expect(() => toBase({ name: 'Peanut', baseUnit: 'kg' as const }, 5, 'L')).toThrow(/No kg\/L factor/);
  });
  it('rejects unsupported units', () => {
    expect(() => toBase(oil, 1, 'lb')).toThrow(/Unsupported unit/);
  });
});

describe('factory-local day', () => {
  it('starts the IST day at 18:30Z of the previous UTC day', () => {
    expect(dayStart('2026-11-11', 330).toISOString()).toBe('2026-11-10T18:30:00.000Z');
  });
  it('maps an instant to the local calendar date', () => {
    expect(localDate(new Date('2026-11-10T19:00:00Z'), 330)).toBe('2026-11-11');
    expect(localDate(new Date('2026-11-10T19:00:00Z'), 0)).toBe('2026-11-10');
  });
});
