import { stateName } from './period';

export type DocType = 'SALE' | 'CREDIT_NOTE' | 'SALE_ORDER';
export type Treatment = 'TAXABLE' | 'NIL_RATED' | 'EXEMPT' | 'NON_GST';

/** One report line. All money in integer paise; the sign (credit note = -1) lives on the doc. */
export interface RLine {
  productId: string;
  name: string;
  barcode: string;
  hsn: string;          // 8-digit string or 'NA'
  category: string;
  qty: number;
  unit: string;
  uqc: string;          // BTL | CAN | PAC | BAG | NOS | OTH ...
  unitPrice: number;    // rupees, pre-tax
  discountPct: number;
  discountPaise: number;
  ratePct: number;
  treatment: Treatment; // effective treatment (rate > 0 is always TAXABLE)
  treatmentDeclared: boolean; // false when inferred from the rate (legacy / unflagged line)
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  amount: number;       // taxable + all tax
  isCharge: boolean;
}

export interface RDoc {
  id: string;
  partyId: string;
  /** payments taken when the document was created, per mode */
  initialPays: Array<{ mode: string; amountPaise: number }>;
  docType: DocType;
  docNo: string;
  date: Date;
  createdAt: Date;
  cancelled: boolean;
  partyName: string;
  gstin: string;        // '' when unregistered
  pos: string;          // place of supply state code
  isInter: boolean;
  totalPaise: number;
  roundOffPaise: number;
  sign: 1 | -1;
  refInvoiceNo?: string;
  convertedFromOrderNo?: string;
  orderTag: string;
  paidAtCreationPaise: number;
  paymentLabel: string;
  laterPayments: Array<{ mode: string; amountPaise: number; at: Date }>;
  lines: RLine[];
}

/** HSN is a string; a 7-digit value lost its leading zero (finding F3). 4/6/8 digit codes are kept. */
export function normalizeHsn(raw: unknown): string {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (!s || /^0+$/.test(s)) return 'NA';
  return s.length === 7 ? '0' + s : s;
}

const UQC_BY_UNIT: Record<string, string> = {
  btl: 'BTL', bottle: 'BTL', bottles: 'BTL', can: 'CAN', cans: 'CAN', pac: 'PAC', pack: 'PAC', packs: 'PAC',
  bag: 'BAG', bags: 'BAG', nos: 'NOS', pcs: 'NOS', kg: 'KGS', kgs: 'KGS', ltr: 'LTR', l: 'LTR',
};
export function toUqc(uqc?: string, unit?: string): string {
  const u = (uqc ?? '').trim().toUpperCase();
  if (u && u !== 'NOS') return u;
  return UQC_BY_UNIT[(unit ?? '').trim().toLowerCase()] ?? (u || 'OTH');
}

const UQC_LABEL: Record<string, string> = {
  BTL: 'BTL-BOTTLES', CAN: 'CAN-CANS', PAC: 'PAC-PACKS', BAG: 'BAG-BAGS', NOS: 'NOS-NUMBERS',
  KGS: 'KGS-KILOGRAMS', LTR: 'LTR-LITRES', OTH: 'OTH-OTHERS',
};
export const uqcLabel = (u: string) => UQC_LABEL[u] ?? 'OTH-OTHERS';

export function effectiveTreatment(ratePct: number, declared?: string): { t: Treatment; declared: boolean } {
  if (ratePct > 0) return { t: 'TAXABLE', declared: !!declared };
  if (declared && declared !== 'TAXABLE') return { t: declared as Treatment, declared: true };
  return { t: 'NIL_RATED', declared: false }; // a 0% line flagged TAXABLE (or unflagged) is reported as nil-rated
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

function toLine(it: any, isInter: boolean): RLine {
  const ratePct = Number(it.gstRate ?? 0);
  const hasPaise = Number(it.taxable) > 0 || (Number(it.cgst) || 0) + (Number(it.sgst) || 0) + (Number(it.igst) || 0) > 0;
  let taxable: number, cgst: number, sgst: number, igst: number;
  if (hasPaise) {
    taxable = Math.round(it.taxable ?? 0); cgst = Math.round(it.cgst ?? 0); sgst = Math.round(it.sgst ?? 0); igst = Math.round(it.igst ?? 0);
  } else { // legacy v0 bill: rupee floats only
    taxable = Math.round((it.taxableAmount ?? 0) * 100);
    const tax = Math.round((it.gstAmount ?? 0) * 100);
    igst = isInter ? tax : 0;
    cgst = isInter ? 0 : Math.floor(tax / 2);
    sgst = isInter ? 0 : tax - cgst;
  }
  const qty = Number(it.qty ?? 0);
  const entered = Number(it.rate) > 0 ? Number(it.rate) : Number(it.unitPrice ?? 0);
  const unitPrice = it.priceInclTax === false ? entered : entered / (1 + ratePct / 100);
  const { t, declared } = effectiveTreatment(ratePct, it.gstTreatment);
  return {
    productId: String(it.productId ?? ''),
    name: it.name ?? '',
    barcode: it.barcode ?? it.sku ?? '',
    hsn: normalizeHsn(it.hsnCode),
    category: it.category ?? '',
    qty,
    unit: it.unit ?? '',
    uqc: toUqc(it.uqc, it.unit),
    unitPrice,
    discountPct: Number(it.discountPct ?? 0),
    discountPaise: Math.max(0, Math.round(unitPrice * qty * 100) - taxable),
    ratePct, treatment: t, treatmentDeclared: declared,
    taxable, cgst, sgst, igst, cess: 0,
    amount: taxable + cgst + sgst + igst,
    isCharge: false,
  };
}

function chargeLine(c: any): RLine | null {
  const amt = Math.round(c.amtPaise ?? 0);
  if (!amt) return null;
  const taxed = Number(c.gstRate) > 0 && c.taxablePaise != null;
  const taxable = taxed ? Math.round(c.taxablePaise) : amt; // legacy charges carried no GST
  const cgst = taxed ? Math.round(c.cgst ?? 0) : 0;
  const sgst = taxed ? Math.round(c.sgst ?? 0) : 0;
  const igst = taxed ? Math.round(c.igst ?? 0) : 0;
  const ratePct = taxed ? Number(c.gstRate) : 0;
  const { t, declared } = effectiveTreatment(ratePct, taxed ? 'TAXABLE' : undefined);
  return {
    productId: '', name: c.label ?? 'Additional Charge', barcode: '', hsn: normalizeHsn(c.hsn), category: '', qty: 1, unit: '', uqc: 'OTH',
    unitPrice: taxable / 100, discountPct: 0, discountPaise: 0, ratePct, treatment: t, treatmentDeclared: declared,
    taxable, cgst, sgst, igst, cess: 0, amount: taxable + cgst + sgst + igst, isCharge: true,
  };
}

export function toRDoc(bill: any, companyStateCode = '22'): RDoc {
  const pos = String(bill.placeOfSupply ?? companyStateCode);
  const docType: DocType = bill.docType ?? 'SALE';
  const payments: any[] = bill.payments ?? [];
  const legacyPaid = Math.round(bill.amountPaidPaise || (bill.amountPaid ?? 0) * 100);
  const initialPays = payments.filter(p => p.kind !== 'LATER');
  const initial = payments.length ? initialPays.reduce((s, p) => s + p.amountPaise, 0) : legacyPaid;
  const modes = [...new Set(initialPays.map(p => cap(p.mode)))];
  const fallbackMode = bill.paymentMode && bill.paymentMode !== 'credit' ? bill.paymentMode : 'cash';
  const paymentLabel = initial <= 0 ? 'Credit' : modes.length ? modes.join('+') : cap(fallbackMode);
  const isInter = pos !== companyStateCode;
  const lines: RLine[] = (bill.items ?? []).map((it: any) => toLine(it, isInter));
  for (const c of bill.charges ?? []) { const l = chargeLine(c); if (l) lines.push(l); }
  return {
    id: String(bill._id ?? ''),
    partyId: String(bill.customerId ?? ''),
    initialPays: payments.length
      ? initialPays.map(p => ({ mode: String(p.mode ?? 'cash').toLowerCase(), amountPaise: p.amountPaise }))
      : legacyPaid > 0 ? [{ mode: String(fallbackMode).toLowerCase(), amountPaise: legacyPaid }] : [],
    docType,
    docNo: bill.invoiceNo,
    date: new Date(bill.invoiceDate ?? bill.createdAt),
    createdAt: new Date(bill.createdAt ?? bill.invoiceDate),
    cancelled: bill.status === 'cancelled',
    partyName: bill.customerName ?? '',
    gstin: (bill.customerGstNo ?? '').trim().toUpperCase(),
    pos,
    isInter,
    totalPaise: Math.round(bill.grandTotalPaise || (bill.grandTotal ?? 0) * 100),
    roundOffPaise: Math.round(bill.roundOffPaise ?? 0),
    sign: docType === 'CREDIT_NOTE' ? -1 : 1,
    refInvoiceNo: bill.refInvoiceNo,
    convertedFromOrderNo: bill.convertedFromOrderNo,
    orderTag: bill.orderTag ?? '',
    paidAtCreationPaise: initial,
    paymentLabel,
    laterPayments: payments.filter(p => p.kind === 'LATER').map(p => ({ mode: cap(p.mode), amountPaise: p.amountPaise, at: new Date(p.at) })),
    lines,
  };
}

export const stateOf = (d: RDoc) => stateName(d.pos);
