import { describe, it, expect } from 'vitest';
import { billCalcPure } from './useBillCalc';
import type { LineItem, BillCharge } from './types';

function mkItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    _key: 'k1',
    productId: 'p1',
    name: 'Ghee',
    sku: 'G1',
    hsnCode: '04059020',
    mrp: 950,
    qty: 1,
    unit: 'KGS',
    rate: 900,
    priceInclTax: true,
    discountPct: 0,
    gstRate: 5,
    discountAmt: 0,
    taxable: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: 0,
    ...overrides,
  };
}

describe('billCalcPure', () => {
  it('B1 – intra-state incl-tax: CGST+SGST split, no IGST', () => {
    const items = [mkItem({ rate: 900, gstRate: 5, priceInclTax: true, qty: 1 })];
    const { lines, totals } = billCalcPure(items, 0, [], false, false, 0);
    // 900 rupees = 90000 paise incl 5% GST
    // taxable = round(90000 * 100 / 105) = 85714
    // tax = round(85714 * 5 / 100) = 4286
    // cgst = floor(4286/2) = 2143, sgst = 4286-2143 = 2143
    expect(lines[0].taxable).toBe(85714);
    expect(lines[0].cgst).toBe(2143);
    expect(lines[0].sgst).toBe(2143);
    expect(lines[0].igst).toBe(0);
    expect(lines[0].total).toBe(90000);
    expect(totals.cgstTotalPaise).toBe(2143);
    expect(totals.sgstTotalPaise).toBe(2143);
    expect(totals.igstTotalPaise).toBe(0);
  });

  it('B2 – inter-state: IGST only, no CGST/SGST', () => {
    const items = [mkItem({ rate: 900, gstRate: 5, priceInclTax: true, qty: 1 })];
    const { lines } = billCalcPure(items, 0, [], false, true, 0);
    expect(lines[0].cgst).toBe(0);
    expect(lines[0].sgst).toBe(0);
    expect(lines[0].igst).toBe(4286);
  });

  it('B3 – round-off: input is grandBefore, not already-rounded', () => {
    // rate=945.50 rupees = 94550 paise excl tax 0%
    const items = [mkItem({ rate: 945.5, gstRate: 0, priceInclTax: false, qty: 1 })];
    const { totals } = billCalcPure(items, 0, [], true, false, 0);
    // grandBefore = 94550 paise → rounded = 94600 paise → roundOff = +50
    expect(totals.grandBeforePaise).toBe(94550);
    expect(totals.roundOffPaise).toBe(50);
    expect(totals.grandTotalPaise).toBe(94600);
  });

  it('B4 – bill discount allocated before tax', () => {
    const items = [
      mkItem({ _key: 'a', rate: 600, gstRate: 5, priceInclTax: false, qty: 1 }),
      mkItem({ _key: 'b', productId: 'p2', rate: 400, gstRate: 18, priceInclTax: false, qty: 1 }),
    ];
    // taxable before bill disc: 60000 + 40000 = 100000 paise
    // billDiscountPct = 10% → billDiscAmt = 10000
    // alloc line0 = round(10000 * 60000/100000) = 6000
    // alloc line1 = round(10000 * 40000/100000) = 4000
    // line0 taxable = 60000 - 6000 = 54000
    // line1 taxable = 40000 - 4000 = 36000
    const { lines, totals } = billCalcPure(items, 10, [], false, false, 0);
    expect(lines[0].taxable).toBe(54000);
    expect(lines[1].taxable).toBe(36000);
    expect(lines[0].cgst + lines[0].sgst).toBe(Math.round(54000 * 5 / 100));
    expect(lines[1].cgst + lines[1].sgst).toBe(Math.round(36000 * 18 / 100));
    expect(totals.billDiscAmtPaise).toBe(10000);
  });

  it('B5 – charges added to grand total', () => {
    const items = [mkItem({ rate: 1000, gstRate: 0, priceInclTax: false, qty: 1 })];
    const charges: BillCharge[] = [{ label: 'Shipping', amtRupees: 50 }];
    const { totals } = billCalcPure(items, 0, charges, false, false, 0);
    // 100000 + 5000 = 105000 paise
    expect(totals.grandTotalPaise).toBe(105000);
    expect(totals.chargesTotalPaise).toBe(5000);
  });

  it('B6 – amount due = grand - paid, floored at 0', () => {
    const items = [mkItem({ rate: 100, gstRate: 0, priceInclTax: false, qty: 1 })];
    const { totals } = billCalcPure(items, 0, [], false, false, 50);
    expect(totals.amountDuePaise).toBe(5000);
    // paying more than grand → due = 0
    const { totals: t2 } = billCalcPure(items, 0, [], false, false, 200);
    expect(t2.amountDuePaise).toBe(0);
  });
});
