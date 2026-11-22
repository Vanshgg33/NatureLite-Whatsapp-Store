import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { makeChange, checkTender } from './cashChange';
import { toQty } from './drawer';

const defs = [
  { id: 'N500', value: 500, kind: 'note' as const, par: 10 },
  { id: 'N200', value: 200, kind: 'note' as const, par: 10 },
  { id: 'N100', value: 100, kind: 'note' as const, par: 30 },
  { id: 'N20', value: 20, kind: 'note' as const, par: 40 },
];

describe('cashChange (frontend copy)', () => {
  it('is byte-identical to the backend copy (the server re-checks with the same code)', () => {
    const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    expect(norm(resolve(__dirname, 'cashChange.ts'))).toBe(norm(resolve(__dirname, '../../../../../backend/src/modules/billing/cash-drawer/cashChange.ts')));
  });

  it('Om scenario: 3500 for 3180 -> 200 + 100 + 20; the server check agrees', () => {
    const stock = { N500: 4, N200: 3, N100: 10, N20: 10 };
    const received = { N500: 5, N100: 10 };
    const plan = makeChange(320, { ...stock, N500: 9, N100: 20 }, defs);
    expect(plan.returned).toEqual({ N200: 1, N100: 1, N20: 1 });
    expect(checkTender({ cashDue: 3180, received, returned: plan.returned, stock, defs, activeIds: defs.map(d => d.id) }))
      .toEqual({ ok: true, changeDue: 320, applied: 3180 });
  });

  it('counter input sanitising', () => {
    expect(['12', '₹500', '-3', '1.5', 'abc', '', '1e9', '9999999'].map(toQty)).toEqual([12, 500, 3, 15, 0, 0, 19, 99999]);
  });
});
