// What changed when a bill was edited, in words a person can read (Bill Edit History).
export interface BillChange { field: string; label: string; from: string; to: string }

const rs = (paise: unknown) => `₹${((Number(paise) || 0) / 100).toFixed(2)}`;
const txt = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? '—' : String(v).trim());
const istDay = (d: unknown) => (d ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(new Date(d as string)) : '—');
const lineKey = (l: any) => `${String(l.productId)}|${l.variantSku ?? ''}`;
const lineDesc = (l: any) => `${l.qty} × ₹${Number(l.rate ?? 0).toFixed(2)}${l.discountPct ? ` (−${l.discountPct}%)` : ''} = ${rs(l.total)}`;
const chargesDesc = (cs: any[] = []) => cs.map((c) => `${c.label} ${rs(c.amtPaise)}`).join(', ');

const SIMPLE: [string, string, (v: any) => string][] = [
  ['invoiceDate', 'Invoice date', istDay],
  ['customerName', 'Customer', txt],
  ['orderTag', 'Sales channel', txt],
  ['placeOfSupply', 'Place of supply', txt],
  ['billingAddress', 'Billing address', txt],
  ['shippingAddress', 'Shipping address', txt],
  ['storeName', 'Stock store', txt],
  ['paymentTerm', 'Payment term', txt],
  ['paymentMode', 'Payment mode', txt],
  ['deliveryUserName', 'Delivery person', txt],
  ['billDiscountAmtPaise', 'Bill discount', rs],
  ['roundOffPaise', 'Round off', rs],
  ['notes', 'Notes', txt],
  ['terms', 'Terms', txt],
];
const MONEY: [string, string][] = [['grandTotalPaise', 'Grand total'], ['amountPaidPaise', 'Amount paid'], ['amountDuePaise', 'Balance due']];

export function diffBill(before: any, after: any): BillChange[] {
  const out: BillChange[] = [];
  for (const [field, label, fmt] of SIMPLE) {
    const a = fmt(before?.[field]);
    const b = fmt(after?.[field]);
    if (a !== b) out.push({ field, label, from: a, to: b });
  }
  const oldLines = new Map<string, any>((before?.items ?? []).map((l: any) => [lineKey(l), l]));
  const newLines = new Map<string, any>((after?.items ?? []).map((l: any) => [lineKey(l), l]));
  for (const [k, l] of oldLines) {
    const n = newLines.get(k);
    if (!n) out.push({ field: 'items', label: `Item removed: ${l.name}`, from: lineDesc(l), to: '—' });
    else if (lineDesc(l) !== lineDesc(n) || Number(l.gstRate) !== Number(n.gstRate)) {
      out.push({ field: 'items', label: `Item: ${n.name}`, from: `${lineDesc(l)}, GST ${l.gstRate}%`, to: `${lineDesc(n)}, GST ${n.gstRate}%` });
    }
  }
  for (const [k, n] of newLines) if (!oldLines.has(k)) out.push({ field: 'items', label: `Item added: ${n.name}`, from: '—', to: lineDesc(n) });
  const ca = chargesDesc(before?.charges);
  const cb = chargesDesc(after?.charges);
  if (ca !== cb) out.push({ field: 'charges', label: 'Charges', from: ca || '—', to: cb || '—' });
  for (const [field, label] of MONEY) {
    if ((Number(before?.[field]) || 0) !== (Number(after?.[field]) || 0)) out.push({ field, label, from: rs(before?.[field]), to: rs(after?.[field]) });
  }
  return out;
}
