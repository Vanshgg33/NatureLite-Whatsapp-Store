import { nextRetryDelay, normalizeIndianMobile } from './billing-whatsapp.service';

describe('billing whatsapp helpers', () => {
  it('normalises Indian mobiles to 91XXXXXXXXXX', () => {
    for (const raw of ['098765 43210', '+91 98765 43210', '919876543210', '9876543210']) {
      expect(normalizeIndianMobile(raw)).toBe('919876543210');
    }
  });
  it('rejects invalid numbers', () => {
    for (const raw of ['', undefined, '12345', '5876543210', '98765432101234']) {
      expect(normalizeIndianMobile(raw as any)).toBeNull();
    }
  });
  it('retries at 1 min, 5 min, 30 min, 2 h then gives up', () => {
    expect([0, 1, 2, 3, 4].map(nextRetryDelay)).toEqual([60, 300, 1800, 7200, null]);
  });
});
