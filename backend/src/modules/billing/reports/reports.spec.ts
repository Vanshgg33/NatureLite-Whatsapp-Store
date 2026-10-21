import { toRDoc, normalizeHsn } from './docs';
import { buildDaybook, daybookSheets } from './daybook';
import { buildSaleSummaryByHsn } from './hsn-summary';
import { buildGstr1 } from './gstr1';
import { buildGstr3b } from './gstr3b';
import { monthRange, dayRange, fmtDMY } from './period';
import { toXlsx } from './xlsx';

const CO = { gstin: '22ABJCS3598L1ZR', legalName: 'SUHIKA PVT LTD', stateCode: '22', b2clLimitPaise: 10_000_000 };
const t = (iso: string) => new Date(`${iso}+05:30`);

const line = (o: any) => ({ name: 'Oil', sku: 'S1', hsnCode: '15151990', qty: 1, unit: 'Btl', uqc: 'BTL', rate: 100, priceInclTax: true,
  discountPct: 0, gstRate: 5, cgst: 0, sgst: 0, igst: 0, taxable: 0, gstTreatment: 'TAXABLE', ...o });

// A: intra-state unregistered, 5% line + nil-rated flour (hsn lost its leading zero) + GST'd shipping, part paid in cash
const billA = { _id: 'a', invoiceNo: 'NLF-26-27/101', docType: 'SALE', invoiceDate: t('2026-09-10T10:00:00'), createdAt: t('2026-09-10T10:00:00'),
  customerName: 'Ram', placeOfSupply: '22', status: 'active', paymentMode: 'cash', amountPaidPaise: 5_000, grandTotalPaise: 14_400,
  payments: [{ mode: 'cash', amountPaise: 5_000, at: t('2026-09-10T10:00:00'), kind: 'INITIAL' }],
  items: [
    line({ name: 'Groundnut Oil', taxable: 8_000, cgst: 200, sgst: 200, priceInclTax: true, rate: 88.4, qty: 1 }),
    line({ name: 'Wheat Flour', hsnCode: 1101000, gstRate: 0, taxable: 5_000, gstTreatment: 'NIL_RATED', unit: 'Pac', uqc: 'PAC' }),
  ],
  charges: [{ label: 'Shipping Charge', amtPaise: 1_000, hsn: '996511', gstRate: 18, taxablePaise: 847, cgst: 76, sgst: 77, igst: 0 }] };
// B: registered intra-state
const billB = { _id: 'b', invoiceNo: 'NLF-26-27/102', docType: 'SALE', invoiceDate: t('2026-09-11T11:00:00'), createdAt: t('2026-09-11T11:00:00'),
  customerName: 'Shop Pvt', customerGstNo: '22AAAAA0000A1Z5', placeOfSupply: '22', status: 'active', amountPaidPaise: 0, grandTotalPaise: 10_500,
  items: [line({ taxable: 10_000, cgst: 250, sgst: 250 })] };
// C: unregistered inter-state (Punjab) 5% + nil
const billC = { _id: 'c', invoiceNo: 'NLF-26-27/103', docType: 'SALE', invoiceDate: t('2026-09-12T12:00:00'), createdAt: t('2026-09-12T12:00:00'),
  customerName: 'Gurpreet', placeOfSupply: '03', status: 'active', amountPaidPaise: 0, grandTotalPaise: 6_150,
  items: [line({ taxable: 4_000, igst: 200 }), line({ name: 'Pulses', hsnCode: '7133100', gstRate: 0, taxable: 1_950, gstTreatment: 'NIL_RATED' })] };
// D: cancelled — must be excluded everywhere but counted in docs
const billD = { ...billB, _id: 'd', invoiceNo: 'NLF-26-27/104', status: 'cancelled' };
// CN against A
const cn = { _id: 'e', invoiceNo: 'NLF-26-27/9', docType: 'CREDIT_NOTE', invoiceDate: t('2026-09-15T09:00:00'), createdAt: t('2026-09-15T09:00:00'),
  customerName: 'Ram', placeOfSupply: '22', status: 'active', amountPaidPaise: 0, grandTotalPaise: 2_100, refInvoiceNo: 'NLF-26-27/101',
  items: [line({ taxable: 2_000, cgst: 50, sgst: 50 })] };
// Sale order with advance
const order = { _id: 'f', invoiceNo: 'NLF-26-27/5', docType: 'SALE_ORDER', invoiceDate: t('2026-09-16T09:00:00'), createdAt: t('2026-09-16T09:00:00'),
  customerName: 'Ram', placeOfSupply: '22', status: 'active', amountPaidPaise: 3_000, grandTotalPaise: 10_500,
  payments: [{ mode: 'upi', amountPaise: 3_000, at: t('2026-09-16T09:00:00'), kind: 'INITIAL' }],
  items: [line({ taxable: 10_000, cgst: 250, sgst: 250 })] };

const all = [billA, billB, billC, billD, cn, order].map(b => toRDoc(b, '22'));
const sep = monthRange('2026-09');

describe('normalizeHsn', () => {
  it('restores the leading zero lost on 7-digit codes and flags blanks', () => {
    expect(normalizeHsn(7139010)).toBe('07139010');
    expect(normalizeHsn('15131900')).toBe('15131900');
    expect(normalizeHsn('996511')).toBe('996511');
    expect(normalizeHsn('')).toBe('NA');
    expect(normalizeHsn(undefined)).toBe('NA');
  });
});

describe('toRDoc', () => {
  it('turns additional charges into a taxed pseudo-line and signs credit notes', () => {
    const a = all[0];
    expect(a.lines).toHaveLength(3);
    const ship = a.lines[2];
    expect(ship).toMatchObject({ isCharge: true, hsn: '996511', ratePct: 18, taxable: 847, amount: 1_000 });
    expect(all[4].sign).toBe(-1);
  });
  it('derives pre-tax unit price and discount from the inclusive entered rate', () => {
    const l = toRDoc({ ...billA, items: [line({ rate: 160, qty: 1, discountPct: 3, taxable: 14_781, cgst: 370, sgst: 369 })] }).lines[0];
    expect(l.unitPrice).toBeCloseTo(152.381, 3);
    expect(l.discountPaise).toBe(15_238 - 14_781);
  });
  it('lines legacy v0 bills (rupee floats only) correctly', () => {
    const d = toRDoc({ ...billB, items: [{ name: 'x', hsnCode: '1', qty: 1, unitPrice: 105, gstRate: 5, taxableAmount: 100, gstAmount: 5, total: 105 }] }, '22');
    expect(d.lines[0]).toMatchObject({ taxable: 10_000, cgst: 250, sgst: 250, igst: 0, amount: 10_500 });
  });
});

describe('daybook', () => {
  const r = buildDaybook(all, ...(Object.values(dayRange('2026-09-10', '2026-09-16')) as [Date, Date]));
  it('lists sales, credit notes and sale orders; cancelled bills are excluded', () => {
    expect(r.rows.map(x => x.type)).toEqual(['Sale', 'Sale', 'Sale', 'Credit Note', 'Sale Order']);
    expect(r.rows[0]).toMatchObject({ refNo: 'NLF-26-27/101', paymentType: 'Cash', total: 144, moneyIn: 50, moneyOut: 0 });
    expect(r.rows[1].paymentType).toBe('Credit');
  });
  it('totals money in/out and ties item amounts to invoice total', () => {
    expect(r.totals).toEqual({ moneyIn: 80, moneyOut: 0, net: 80 });
    const a = r.items.filter(i => i.txnNo === 'NLF-26-27/101').reduce((s, i) => s + i.amount, 0);
    expect(Math.round(a * 100)).toBe(14_400);
  });
  it('exposes the two sheets with header row 1 and data from row 3', () => {
    const sheets = daybookSheets(r);
    expect(sheets.map(s => s.name)).toEqual(['Day Book Report', 'Item Details']);
    expect(sheets[0].rows[0][0]).toBe('Name');
    expect(sheets[0].rows[1]).toEqual([]);
    expect(sheets[0].rows[2][1]).toBe('NLF-26-27/101');
    expect(sheets[1].rows[0]).toHaveLength(18);
  });
  it('reports a later payment as its own Payment-In row on the day received', () => {
    const later = toRDoc({ ...billB, payments: [{ mode: 'upi', amountPaise: 4_000, at: t('2026-09-14T10:00:00'), kind: 'LATER' }] });
    const d = buildDaybook([later], ...(Object.values(dayRange('2026-09-14', '2026-09-14')) as [Date, Date]));
    expect(d.rows).toEqual([expect.objectContaining({ type: 'Payment-In', moneyIn: 40, paymentType: 'Upi' })]);
  });
});

describe('sale summary by HSN', () => {
  const r = buildSaleSummaryByHsn(all, sep.start, sep.end);
  it('uses sales only (no CN, no orders, no cancelled) and keeps 0% lines and charges', () => {
    // A 14,400 + B 10,500 + C 6,150
    expect(Math.round(r.hsnTotals.total)).toBe(31_050);
    expect(r.hsnRows.map(x => x.hsn)).toContain('996511');
    expect(r.hsnRows.map(x => x.hsn)).toContain('07133100');
  });
  it('item total equals HSN total', () => expect(r.itemTotals.total).toBe(r.hsnTotals.total));
});

describe('GSTR-1', () => {
  const r = buildGstr1(all, '2026-09', sep.start, sep.end, CO, [all[5]]);
  const sheet = (n: string) => r.sheets.find(s => s.name === n)!.rows;
  it('emits the 14 sheets with the exact names', () => {
    expect(r.sheets.map(s => s.name)).toEqual(['GSTR1 Report', 'b2b,sez,de', 'b2cl', 'b2cs', 'cdnr', 'cdnur', 'exp', 'at', 'atadj', 'exemp', 'hsn(b2b)', 'hsn(b2c)', 'itemSummary', 'docs']);
  });
  it('main totals = sales minus credit notes (value counted once per invoice)', () => {
    expect(r.totals.invoiceValue).toBeCloseTo(144 + 105 + 61.5 - 21, 2);
    expect(r.totals.taxable).toBeCloseTo(138.47 + 100 + 59.5 - 20, 2);
    expect(r.totals.igst).toBe(2);
    expect(r.totals.cgst + r.totals.sgst).toBeCloseTo(5.53 + 5 - 1, 2);
  });
  it('b2b has the registered invoice; b2cs nets the credit note and excludes 0% rows', () => {
    expect(r.summary.b2b).toMatchObject({ recipients: 1, invoices: 1, value: 105, taxable: 100 });
    const cs = r.summary.b2cs.find(x => x.pos === '22-Chhattisgarh' && x.rate === 5)!;
    expect(cs.taxable).toBe(60); // 80 - 20
    expect(r.summary.b2cs.some(x => x.rate === 0)).toBe(false);
  });
  it('Table 8 carries every nil/exempt line split by registration and state', () => {
    const intraUnreg = r.summary.table8[3], interUnreg = r.summary.table8[2];
    expect(intraUnreg.nil).toBe(50);
    expect(interUnreg.nil).toBe(19.5);
  });
  it('docs counts cancelled numbers too', () => {
    expect(sheet('docs').slice(4)).toEqual([
      ['Invoices for outward supply', 'NLF-26-27/101', 'NLF-26-27/104', 4, 1],
      ['Credit Note', 'NLF-26-27/9', 'NLF-26-27/9', 1, 0],
    ]);
  });
  it('sale-order advance appears in Table 11 (at)', () => {
    expect(sheet('at').slice(4).reduce((s, row) => s + row[3], 0)).toBe(30);
  });
  it('hsn sheets + item summary tie to the main sheet (no dropped lines)', () => {
    expect(r.reconciliation.hsnSheetTotal).toBe(r.reconciliation.itemSummaryTotal);
    expect(r.reconciliation.difference).toBe(0);
    expect(r.reconciliation.flags.missingHsn).toEqual([]);
  });
  it('flags a 0% line that was never given a GST treatment', () => {
    const risky = toRDoc({ ...billB, invoiceNo: 'NLF-26-27/200', items: [line({ name: 'Mystery Flour', gstRate: 0, taxable: 100, gstTreatment: undefined })] });
    const rr = buildGstr1([risky], '2026-09', sep.start, sep.end, CO);
    expect(rr.reconciliation.flags.undeclaredTreatment).toEqual([{ docNo: 'NLF-26-27/200', item: 'Mystery Flour' }]);
  });
  it('B2CL: inter-state unregistered above the limit is split out', () => {
    const big = toRDoc({ ...billC, invoiceNo: 'NLF-26-27/300', grandTotalPaise: 12_000_000 });
    const rr = buildGstr1([big], '2026-09', sep.start, sep.end, CO);
    expect(rr.sheets.find(s => s.name === 'b2cl')!.rows[1][0]).toBe(1);
  });
});

describe('GSTR-3B', () => {
  const g1 = buildGstr1(all, '2026-09', sep.start, sep.end, CO);
  const g3 = buildGstr3b(all, '2026-09', sep.start, sep.end);
  it('has sheets 3.1, 3.2, 4, 5 and the From/To header', () => {
    expect(g3.sheets.map(s => s.name)).toEqual(['3.1', '3.2', '4', '5']);
    expect(g3.sheets[0].rows.slice(0, 2)).toEqual([['From', '09/2026'], ['To', '09/2026']]);
    expect(g3.sheets[0].rows[2][0]).toBe('Nature of Supplies');
    expect(g3.sheets[0].rows[4][0]).toMatch(/^\(a\)/);
  });
  it('3.1(a)+(c) taxable equals GSTR-1 taxable total; tax equals GSTR-1 tax', () => {
    const [, a, , , , ] = g3.table31.a as number[];
    const c = (g3.table31.c as number[])[1];
    expect(a + c).toBeCloseTo(g1.totals.taxable, 2);
    const tax = (g3.table31.a as number[]).slice(2).reduce((s, v) => s + v, 0);
    expect(tax).toBeCloseTo(g1.totals.igst + g1.totals.cgst + g1.totals.sgst, 2);
  });
  it('3.1(c) matches Table 8 and 3.2 igst equals 3.1(a) igst for inter-state unregistered sales', () => {
    expect((g3.table31.c as number[])[1]).toBeCloseTo(50 + 19.5, 2);
    expect(g3.table32.reduce((s, r) => s + r.igst, 0)).toBeCloseTo((g3.table31.a as number[])[2], 2);
    expect(g3.table32[0]).toMatchObject({ pos: '03-Punjab', taxable: 59.5, igst: 2 }); // nil-rated inter-state included
  });
});

describe('xlsx writer', () => {
  it('produces a workbook buffer', () => {
    expect(toXlsx([{ name: 'a', rows: [['x', 1]] }]).length).toBeGreaterThan(100);
  });
  it('formats dates dd/MM/yyyy in IST', () => expect(fmtDMY(t('2026-09-30T23:30:00'))).toBe('30/09/2026'));
});
