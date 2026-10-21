import { Books, toPDoc, toPayRec } from './books';
import { toRDoc } from './docs';
import { collectMoves, valueStock } from './stock';
import { computePnl, netIncomeTo } from './ledger';
import { buildBalanceSheet, buildStockSummary, buildTrialBalance, pnlSheet } from './statements';
import { buildGstr3b } from './gstr3b';
import { monthRange } from './period';

const t = (iso: string) => new Date(`${iso}+05:30`);
const OPEN = t('2026-04-01T00:00:00');
const END = t('2026-10-01T00:00:00'); // exclusive end for "as on 30-Sep-2026"

const line = (o: any) => ({ name: 'Oil', sku: 'S1', productId: 'p1', hsnCode: '15151990', qty: 1, unit: 'Btl', uqc: 'BTL', rate: 100, priceInclTax: true,
  discountPct: 0, gstRate: 5, cgst: 0, sgst: 0, igst: 0, taxable: 0, gstTreatment: 'TAXABLE', ...o });
const bill = (o: any) => ({ _id: o.invoiceNo, customerId: 'c1', customerName: 'Ram', placeOfSupply: '22', status: 'active', docType: 'SALE', ...o });

function fixture(): Books {
  const sale = bill({ invoiceNo: 'NLF-26-27/1', invoiceDate: t('2026-06-10T10:00:00'), createdAt: t('2026-06-10T10:00:00'), grandTotalPaise: 168_000,
    payments: [{ mode: 'cash', amountPaise: 100_000, at: t('2026-06-10T10:00:00'), kind: 'INITIAL' }],
    items: [line({ qty: 20, taxable: 160_000, cgst: 4000, sgst: 4000 })], charges: [{ label: 'Shipping', amtPaise: 1_000, hsn: '996511', gstRate: 18, taxablePaise: 847, cgst: 76, sgst: 77, igst: 0 }] });
  sale.grandTotalPaise = 169_000; // + shipping
  const roundedSale = bill({ invoiceNo: 'NLF-26-27/2', invoiceDate: t('2026-07-01T10:00:00'), createdAt: t('2026-07-01T10:00:00'), grandTotalPaise: 21_000, roundOffPaise: -40,
    items: [line({ qty: 2, taxable: 20_000, cgst: 520, sgst: 520 })], customerId: 'c2', customerName: 'Walk-in' });
  roundedSale.grandTotalPaise = 21_000; // taxable 20,000 + tax 1,040 = 21,040 -> rounded to 21,000
  const cn = bill({ invoiceNo: 'NLF-26-27/9', docType: 'CREDIT_NOTE', invoiceDate: t('2026-06-15T10:00:00'), createdAt: t('2026-06-15T10:00:00'), grandTotalPaise: 16_800,
    items: [line({ qty: 2, taxable: 16_000, cgst: 400, sgst: 400 })] });
  const order = bill({ invoiceNo: 'NLF-26-27/5', docType: 'SALE_ORDER', invoiceDate: t('2026-08-01T10:00:00'), createdAt: t('2026-08-01T10:00:00'), grandTotalPaise: 10_500,
    payments: [{ mode: 'upi', amountPaise: 3_000, at: t('2026-08-01T10:00:00'), kind: 'INITIAL' }], items: [line({ qty: 1, taxable: 10_000, cgst: 250, sgst: 250 })] });
  const later = bill({ ...roundedSale, invoiceNo: 'NLF-26-27/3', _id: 'x3', customerId: 'c1', customerName: 'Ram',
    invoiceDate: t('2026-08-05T10:00:00'), createdAt: t('2026-08-05T10:00:00'),
    payments: [{ mode: 'upi', amountPaise: 10_000, at: t('2026-08-20T10:00:00'), kind: 'LATER' }] });

  const docs = [sale, roundedSale, cn, order, later].map(b => toRDoc(b, '22'));
  const purchases = [
    { _id: 'pu1', docNo: 'PUR-26-27/1', supplierId: 's1', supplierName: 'Supplier', stateOfSupply: '22', date: t('2026-05-10T10:00:00'), totalPaise: 288_750, paidPaise: 100_000, paymentMode: 'bank',
      items: [{ productId: 'p1', name: 'Oil', hsnCode: '15151990', qty: 50, gstRate: 5, taxable: 275_000, cgst: 6875, sgst: 6875, igst: 0 }] },
    { _id: 'pu2', docNo: 'PUR-26-27/2', supplierId: 's1', supplierName: 'Supplier', stateOfSupply: '22', date: t('2026-06-01T10:00:00'), reverseCharge: true, totalPaise: 50_000, paidPaise: 0,
      items: [{ productId: 'p1', name: 'Oil', hsnCode: '15151990', qty: 10, gstRate: 5, taxable: 50_000, cgst: 1250, sgst: 1250, igst: 0 }] },
    { _id: 'pu3', docNo: 'PUR-26-27/3', supplierId: 's9', supplierName: 'Lawyer', stateOfSupply: '22', date: t('2026-06-02T10:00:00'), itcEligibility: 'INELIGIBLE_17_5', totalPaise: 11_800, paidPaise: 0,
      items: [{ name: 'Gift', hsnCode: '9999', qty: 1, gstRate: 18, taxable: 10_000, cgst: 900, sgst: 900, igst: 0 }] },
    { _id: 'dn1', docNo: 'DN-26-27/1', isDebitNote: true, supplierId: 's1', supplierName: 'Supplier', stateOfSupply: '22', date: t('2026-07-20T10:00:00'), totalPaise: 28_875, paidPaise: 0,
      items: [{ productId: 'p1', name: 'Oil', hsnCode: '15151990', qty: 5, gstRate: 5, taxable: 27_500, cgst: 687, sgst: 688, igst: 0 }] },
  ].map(toPDoc);
  const payments = [
    { _id: 'a', type: 'IN', partyId: 'c1', partyName: 'Ram', mode: 'cash', amountPaise: 20_000, discountPaise: 500, date: t('2026-07-02T10:00:00'), status: 'CLEARED' },
    { _id: 'b', type: 'IN', partyId: 'c1', partyName: 'Ram', mode: 'cheque', amountPaise: 10_000, date: t('2026-08-02T10:00:00'), status: 'UNDEPOSITED' },
    { _id: 'c', type: 'IN', partyId: 'c1', partyName: 'Ram', mode: 'cheque', amountPaise: 5_000, date: t('2026-08-03T10:00:00'), status: 'CLEARED', clearedOn: t('2026-08-10T10:00:00'), accountId: 'bank' },
    { _id: 'd', type: 'IN', partyId: 'c1', partyName: 'Ram', mode: 'cheque', amountPaise: 99_999, date: t('2026-08-03T10:00:00'), status: 'BOUNCED' },
    { _id: 'e', type: 'OUT', partyId: 's1', partyName: 'Supplier', mode: 'bank', amountPaise: 15_000, discountPaise: 200, date: t('2026-08-04T10:00:00'), status: 'CLEARED' },
  ].map(toPayRec);
  const expenses = [
    { date: t('2026-06-20T10:00:00'), category: 'Freight', amountPaise: 3_000, mode: 'cash', direct: true, isIncome: false },
    { date: t('2026-06-21T10:00:00'), category: 'Rent', amountPaise: 7_000, mode: 'bank', direct: false, isIncome: false },
    { date: t('2026-06-22T10:00:00'), category: 'Loan Interest', amountPaise: 500, mode: 'bank', direct: false, isIncome: false },
    { date: t('2026-06-23T10:00:00'), category: 'Interest Income', amountPaise: 1_200, mode: 'bank', direct: false, isIncome: true },
  ];
  const manual = [{ productId: 'p1', date: OPEN, kind: 'OPENING', qty: 100, unitCostPaise: 5_000 }, { productId: 'p1', date: t('2026-09-01T10:00:00'), kind: 'ADJUST', qty: -3 }];
  return {
    docs, purchases, payments, expenses, stateCode: '22',
    accounts: [{ id: 'cash', name: 'Cash', kind: 'CASH', openingBalancePaise: 1_000_000 }, { id: 'bank', name: 'HDFC', kind: 'BANK', openingBalancePaise: 5_000_000 }],
    opening: { asOn: OPEN, retainedEarningsPaise: 100_000, modeAccountMap: {}, partyOpenings: [{ partyId: 'c1', name: 'Ram', balancePaise: 20_000 }, { partyId: 's1', name: 'Supplier', balancePaise: -30_000 }] },
    products: [{ id: 'p1', name: 'Oil', sku: 'S1', salePricePaise: 6_000, purchasePricePaise: 4_000 }, { id: 'p2', name: 'apple jam', sku: 'S2', salePricePaise: 9_000, purchasePricePaise: 0 }],
    moves: collectMoves(docs, purchases, manual),
  };
}

describe('stock valuation', () => {
  it('uses moving weighted-average cost, values negative stock at 0 and falls back to the product cost', () => {
    const d = (n: number) => new Date(2026, 0, n);
    const moves = [
      { productId: 'p', date: d(1), qty: 10, kind: 'OPENING' as const, unitCostPaise: 100 },
      { productId: 'p', date: d(2), qty: 10, kind: 'PURCHASE' as const, unitCostPaise: 200 },
      { productId: 'p', date: d(3), qty: -5, kind: 'SALE' as const },
    ];
    expect(valueStock(moves, d(10))).toMatchObject({ qty: 15, costPaise: 150, valuePaise: 2250 });
    expect(valueStock(moves, d(2))).toMatchObject({ qty: 10, valuePaise: 1000 }); // purchase on the 2nd is excluded (strictly before)
    // unpriced opening stock is averaged at the fallback cost, not at zero
    const unpriced = [{ productId: 'p', date: d(1), qty: 10, kind: 'OPENING' as const }, { productId: 'p', date: d(2), qty: 10, kind: 'PURCHASE' as const, unitCostPaise: 200 }];
    expect(valueStock(unpriced, d(5), 100)).toMatchObject({ qty: 20, costPaise: 150, valuePaise: 3000 });
    const neg = [{ productId: 'p', date: d(1), qty: -4, kind: 'SALE' as const }];
    expect(valueStock(neg, d(5), 300)).toMatchObject({ qty: -4, valuePaise: 0 });
    expect(valueStock([{ productId: 'p', date: d(1), qty: 3, kind: 'ADJUST' as const }], d(5), 300).valuePaise).toBe(900);
  });
});

describe('stock summary', () => {
  const b = fixture();
  const r = buildStockSummary(b, '2026-09-30');
  it('computes quantity, reserved, available and value per item, alphabetically', () => {
    expect(r.rows.map(x => x.name)).toEqual(['apple jam', 'Oil']);
    const oil = r.rows[1];
    // 100 open +50 +10 purchases -5 debit note -20 -2 -2 sales +2 credit note -3 adjustment
    expect(oil.qty).toBe(130);
    expect(oil.reserved).toBe(1);
    expect(oil.available).toBe(oil.qty - 1);
    // cost shown is rounded to the paisa, value uses the unrounded average
    expect(Math.abs(oil.valuePaise - oil.qty * oil.purchasePricePaise)).toBeLessThanOrEqual(oil.qty / 2);
  });
  it('values a never-purchased item at its fallback cost / 0 and keeps Available = Stock - Reserved', () => {
    const jam = r.rows[0];
    expect(jam).toMatchObject({ qty: 0, valuePaise: 0, available: 0 });
    expect(r.totals.valuePaise).toBe(r.rows.reduce((s, x) => s + x.valuePaise, 0));
  });
  it('sheet layout: godown on row 1, header on row 3, data from row 5', () => {
    const rows = r.sheet[0].rows;
    expect(rows[0]).toEqual(['Godown', 'All Godown']);
    expect(rows[2][0]).toBe('Item Name');
    expect(rows[4][0]).toBe('apple jam');
  });
});

describe('books integrity (double entry)', () => {
  const b = fixture();
  const co = { name: 'SUHIKA', phone: '1', email: 'a@b.c', gstin: 'G' };

  it('Trial Balance debit total equals credit total, with a zero opening-balance difference', () => {
    const tb = buildTrialBalance(b, '2026-09-30', co, '2026-04-01');
    expect(tb.balanced).toBe(true);
    expect(tb.debitTotal).toBe(tb.creditTotal);
    expect(tb.debitTotal).toBeGreaterThan(0);
    const rows = tb.sheet[0].rows;
    expect(rows[7]).toEqual(['Accounts', 'Closing Balance']);
    expect(rows[8]).toEqual(['', 'Debit', 'Credit']);
    expect(rows.find(r => r[0] === 'V. Difference in Opening Balance')).toEqual(['V. Difference in Opening Balance', 0, 0]);
  });

  it('Balance Sheet left total equals right total with no hidden plug', () => {
    const bs = buildBalanceSheet(b, '2026-09-30');
    expect(bs.difference).toBe(0);
    expect(bs.warning).toBeNull();
    expect(bs.leftTotal).toBe(bs.rightTotal);
  });

  it('P&L net profit (spec formula) equals the net income the ledger accumulates', () => {
    const pnl = computePnl(b, OPEN, END);
    expect(pnl.netProfit).toBe(netIncomeTo(b, END));
    expect(buildBalanceSheet(b, '2026-09-30').netIncome).toBe(pnl.netProfit / 100);
  });

  it('P&L lines match the documents', () => {
    const pnl = computePnl(b, OPEN, END);
    expect(pnl.sale).toBe(169_000 + 21_000 + 21_000);
    expect(pnl.creditNote).toBe(16_800);
    expect(pnl.purchase).toBe(288_750 + 50_000 + 11_800);
    expect(pnl.debitNote).toBe(28_875);
    expect(pnl.directExpenses).toBe(3_000);
    expect(pnl.paymentInDiscount).toBe(500);
    expect(pnl.paymentOutDiscount).toBe(200);
    expect(pnl.otherIncome).toBe(1_200);
    expect(pnl.indirect).toEqual({ 'Other Expense': 7_000, 'Loan Interest Expense': 500 });
    // sale GST (8000+...) net of CN + RCM output; input only on eligible purchases
    expect(pnl.gstReceivable).toBe(13_750 + 2_500 - 1_375);
    expect(pnl.gstPayable).toBe((8_000 + 153 + 1_040 + 1_040) - 800 + 2_500 - 0);
    expect(pnl.grossProfit + pnl.otherIncome - pnl.indirectTotal).toBe(pnl.netProfit);
  });

  it('a period P&L opens with stock valued at the period start', () => {
    const q2 = computePnl(b, t('2026-07-01T00:00:00'), END);
    const q1 = computePnl(b, OPEN, t('2026-07-01T00:00:00'));
    expect(q2.openingStock).toBe(q1.closingStock);
    expect(q1.openingStock).toBe(100 * 5_000);
  });

  it('sheet exposes the P&L rows from row 4 with values in column C', () => {
    const rows = pnlSheet(computePnl(b, OPEN, END), '2026-04-01', '2026-09-30')[0].rows;
    expect(rows[0]).toEqual(['', 'ProfitAndLossReport']);
    expect(rows[3]).toEqual(['Sale (+)', '', 2110]);
    expect(rows.find(r => r[0] === 'Net Profit')![2]).toBe(computePnl(b, OPEN, END).netProfit / 100);
  });

  it('keeps balancing with a later financial year folding earlier profit into retained earnings', () => {
    const bs = buildBalanceSheet({ ...b, opening: { ...b.opening!, asOn: t('2026-01-01T00:00:00') } }, '2027-06-30');
    expect(bs.difference).toBe(0);
  });
});

describe('GSTR-3B with purchases', () => {
  const b = fixture();
  const m = monthRange('2026-06');
  const g = buildGstr3b(b.docs, '2026-06', m.start, m.end, b.purchases, '22');
  it('fills 3.1(d), table 4 and ineligible ITC from purchase bills', () => {
    expect((g.table31.d as number[]).slice(1)).toEqual([500, 0, 12.5, 12.5, 0]);
    const sheet4 = g.sheets[2].rows;
    expect(sheet4.find(r => String(r[0]).startsWith('(3)'))).toEqual([expect.any(String), 0, 12.5, 12.5, 0]);
    expect(sheet4.find(r => String(r[0]).startsWith('(1) As per section 17(5)'))).toEqual([expect.any(String), 0, 9, 9, 0]);
  });
});
