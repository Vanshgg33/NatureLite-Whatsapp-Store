import { PDoc } from './books';
import { rs } from './period';

export interface GovtPurchase { gstin: string; supplierName: string; invoiceNo: string; date: string; taxablePaise: number; taxPaise: number }

const key = (gstin: string, no: string) => `${gstin.trim().toUpperCase()}|${no.replace(/\s+/g, '').toUpperCase()}`;
const paise = (v: unknown) => Math.round(Number(v ?? 0) * 100);
// rupee rounding on the portal vs paise rounding locally
const TAX_TOLERANCE_PAISE = 2;

/** Parse the GSTR-2B JSON downloaded from the GST portal (b2b section) into flat Govt_Purchases rows. */
export function parseGstr2b(json: any): GovtPurchase[] {
  const b2b = json?.data?.docdata?.b2b ?? json?.docdata?.b2b ?? json?.data?.b2b;
  if (!Array.isArray(b2b)) throw new Error('Not a GSTR-2B JSON: data.docdata.b2b missing');
  const out: GovtPurchase[] = [];
  for (const s of b2b) {
    for (const inv of s.inv ?? []) {
      const parts: any[] = Array.isArray(inv.items) && inv.items.length ? inv.items : [inv]; // older format keeps amounts on the invoice
      const sum = (f: string) => parts.reduce((t, p) => t + paise(p[f]), 0);
      out.push({
        gstin: String(s.ctin ?? '').toUpperCase(), supplierName: s.trdnm ?? '', invoiceNo: String(inv.inum ?? ''), date: inv.dt ?? '',
        taxablePaise: sum('txval'), taxPaise: sum('igst') + sum('cgst') + sum('sgst') + sum('cess'),
      });
    }
  }
  return out;
}

const taxOf = (p: PDoc) => p.lines.reduce((t, l) => t + l.igst + l.cgst + l.sgst, 0);
const taxableOf = (p: PDoc) => p.lines.reduce((t, l) => t + l.taxable, 0);

/**
 * Match the government file against the purchase register.
 * MATCHED: gstin + invoice no + tax agree. TAX_MISMATCH: found on both sides, tax differs.
 * MISSING_IN_2B: in register (inside [start,end)), supplier has not filed. NOT_IN_SYSTEM: in 2B, purchase bill never entered.
 * `purchases` may reach back before `start` so earlier invoices reported in this 2B still match.
 */
export function reconcileGstr2b(govt: GovtPurchase[], purchases: PDoc[], start: Date, end: Date, tolerancePaise = TAX_TOLERANCE_PAISE) {
  const local = purchases.filter(p => !p.cancelled && !p.isDebitNote && !p.reverseCharge && p.supplierGstin);
  const localByKey = new Map(local.map(p => [key(p.supplierGstin, p.docNo), p]));
  const govtByKey = new Map(govt.map(g => [key(g.gstin, g.invoiceNo), g]));

  const matched: any[] = [], mismatch: any[] = [], notInSystem: any[] = [], missingIn2b: any[] = [];
  for (const g of govt) {
    const p = localByKey.get(key(g.gstin, g.invoiceNo));
    if (!p) { notInSystem.push({ gstin: g.gstin, supplier: g.supplierName, invoiceNo: g.invoiceNo, date: g.date, taxable: rs(g.taxablePaise), tax: rs(g.taxPaise) }); continue; }
    const row = { gstin: g.gstin, supplier: g.supplierName, invoiceNo: g.invoiceNo, date: g.date, govtTax: rs(g.taxPaise), systemTax: rs(taxOf(p)), govtTaxable: rs(g.taxablePaise), systemTaxable: rs(taxableOf(p)) };
    (Math.abs(g.taxPaise - taxOf(p)) <= tolerancePaise ? matched : mismatch).push(row);
  }
  for (const p of local) {
    if (p.date < start || p.date >= end || govtByKey.has(key(p.supplierGstin, p.docNo))) continue;
    missingIn2b.push({ gstin: p.supplierGstin, supplier: p.supplierName, invoiceNo: p.docNo, taxable: rs(taxableOf(p)), tax: rs(taxOf(p)) });
  }
  return { summary: { matched: matched.length, taxMismatch: mismatch.length, missingIn2b: missingIn2b.length, notInSystem: notInSystem.length }, matched, mismatch, missingIn2b, notInSystem };
}
