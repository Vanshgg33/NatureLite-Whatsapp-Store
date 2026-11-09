import { fyOf, isValidGstin } from './gst-utils';

describe('isValidGstin', () => {
  it('accepts a valid GSTIN and rejects a one-character change', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('27AAPFU0939F1ZX')).toBe(false);
  });
  it('rejects blanks and bad patterns', () => {
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin(undefined)).toBe(false);
    expect(isValidGstin('22ABCDE1234F1Z')).toBe(false);
  });
});

describe('fyOf', () => {
  it('rolls over on 1 April IST', () => {
    expect(fyOf(new Date('2027-03-31T18:30:00Z'))).toEqual({ label: '2027-28', short: '27-28' }); // 00:00 IST 1 Apr
    expect(fyOf(new Date('2027-03-31T18:29:00Z'))).toEqual({ label: '2026-27', short: '26-27' });
    expect(fyOf(new Date('2026-11-08T10:00:00Z')).label).toBe('2026-27');
  });
});
