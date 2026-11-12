import { parseGstr2b, reconcileGstr2b } from './gstr2b';
import { monthRange } from './period';

const pd = (o: any) => ({ id: 'x', docNo: 'INV-1', supplierId: 's', supplierName: 'Sup', supplierGstin: '22AAAAA0000A1Z5', pos: '22', date: new Date('2026-09-10T05:00:00Z'),
  isDebitNote: false, cancelled: false, itc: 'ELIGIBLE', reverseCharge: false, totalPaise: 0, paidPaise: 0, paymentMode: '',
  lines: [{ name: 'Oil', hsn: '1515', qty: 1, ratePct: 5, treatment: 'TAXABLE', taxable: 10_000, cgst: 250, sgst: 250, igst: 0 }], ...o });
const json = (invs: any[]) => ({ data: { docdata: { b2b: [{ ctin: '22AAAAA0000A1Z5', trdnm: 'Sup', inv: invs }] } } });
const inv = (inum: string, tax: number) => ({ inum, dt: '10-09-2026', items: [{ txval: 100, cgst: tax / 2, sgst: tax / 2, igst: 0 }] });
const { start, end } = monthRange('2026-09');

describe('GSTR-2B reconcile', () => {
  it('matches, flags tax mismatch, missing in 2B and not in system', () => {
    const govt = parseGstr2b(json([inv('INV-1', 5), inv('INV-2', 9), inv('INV-3', 5)]));
    const r = reconcileGstr2b(govt, [pd({}), pd({ docNo: 'INV-2' }), pd({ docNo: 'INV-4' })], start, end);
    expect(r.summary).toEqual({ matched: 1, taxMismatch: 1, missingIn2b: 1, notInSystem: 1 });
    expect(r.missingIn2b[0].invoiceNo).toBe('INV-4');
    expect(r.notInSystem[0].invoiceNo).toBe('INV-3');
  });
  it('rejects a file that is not GSTR-2B', () => expect(() => parseGstr2b({})).toThrow());
});
