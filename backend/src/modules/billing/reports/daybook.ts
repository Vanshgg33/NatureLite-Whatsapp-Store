import { RDoc } from './docs';
import { fmtDMY, rs } from './period';

const TYPE_LABEL = { SALE: 'Sale', SALE_ORDER: 'Sale Order', CREDIT_NOTE: 'Credit Note' } as const;

export interface DaybookRow {
  name: string; refNo: string; type: string; paymentType: string;
  total: number; moneyIn: number; moneyOut: number; description: string;
}
export interface DaybookItemRow {
  date: string; txnNo: string; party: string; item: string; itemCode: string; hsn: string; category: string;
  count: number; challanOrderNo: string; qty: number; unit: string; unitPrice: number; discountPct: number;
  discount: number; taxPct: number; tax: number; txnType: string; amount: number;
}

/** docs: every non-cancelled doc that may fall in [start, end); selection by doc date / payment date happens here. */
export function buildDaybook(docs: RDoc[], start: Date, end: Date) {
  const inRange = (d: Date) => d >= start && d < end;
  const live = docs.filter(d => !d.cancelled);

  type Entry = { at: number; row: DaybookRow };
  const entries: Entry[] = [];

  for (const d of live.filter(x => inRange(x.date))) {
    // Credit note: money actually refunded is Money Out. Sale / order: Money In (order = advance).
    const refund = d.docType === 'CREDIT_NOTE';
    entries.push({
      at: d.createdAt.getTime(),
      row: {
        name: d.partyName, refNo: d.docNo, type: TYPE_LABEL[d.docType], paymentType: d.paymentLabel,
        total: rs(d.totalPaise),
        moneyIn: refund ? 0 : rs(d.paidAtCreationPaise),
        moneyOut: refund ? rs(d.paidAtCreationPaise) : 0,
        description: '',
      },
    });
  }
  // Payments collected later against an invoice show as their own Payment-In rows on the day received
  for (const d of live.filter(x => x.docType === 'SALE')) {
    for (const p of d.laterPayments.filter(p => inRange(p.at))) {
      entries.push({
        at: p.at.getTime(),
        row: { name: d.partyName, refNo: d.docNo, type: 'Payment-In', paymentType: p.mode, total: rs(p.amountPaise), moneyIn: rs(p.amountPaise), moneyOut: 0, description: `Payment against ${d.docNo}` },
      });
    }
  }
  entries.sort((a, b) => a.at - b.at);
  const rows = entries.map(e => e.row);

  const items: DaybookItemRow[] = [];
  for (const d of live.filter(x => inRange(x.date)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    for (const l of d.lines) {
      items.push({
        date: fmtDMY(d.date), txnNo: d.docNo, party: d.partyName, item: l.name, itemCode: l.barcode, hsn: l.hsn === 'NA' ? '' : l.hsn,
        category: l.category, count: 0, challanOrderNo: d.convertedFromOrderNo ?? '', qty: l.qty, unit: l.unit,
        unitPrice: Math.round(l.unitPrice * 1000) / 1000, discountPct: l.discountPct, discount: rs(l.discountPaise),
        taxPct: l.ratePct, tax: rs(l.cgst + l.sgst + l.igst + l.cess), txnType: TYPE_LABEL[d.docType], amount: rs(l.amount),
      });
    }
  }

  const totalIn = rows.reduce((s, r) => s + Math.round(r.moneyIn * 100), 0);
  const totalOut = rows.reduce((s, r) => s + Math.round(r.moneyOut * 100), 0);
  return { rows, items, totals: { moneyIn: rs(totalIn), moneyOut: rs(totalOut), net: rs(totalIn - totalOut) } };
}

export function daybookSheets(r: ReturnType<typeof buildDaybook>) {
  const dayBook: any[][] = [
    ['Name', 'Ref No', 'Type', 'Payment Type', 'Total', 'Money In', 'Money Out', 'Description'],
    [],
    ...r.rows.map(x => [x.name, x.refNo, x.type, x.paymentType, x.total, x.moneyIn, x.moneyOut, x.description]),
    [],
    ['Total', '', '', '', '', r.totals.moneyIn, r.totals.moneyOut],
    [],
    ['Total Money In - Total Money Out', '', '', '', '', r.totals.net],
  ];
  const itemDetails: any[][] = [
    ['Date', 'Invoice No./Txn No.', 'Party Name', 'Item Name', 'Item Code', 'HSN/SAC', 'Category', 'Count', 'Challan/Order No.',
      'Quantity', 'Unit', 'UnitPrice', 'Discount Percent', 'Discount', 'Tax Percent', 'Tax', 'Transaction Type', 'Amount'],
    [],
    ...r.items.map(i => [i.date, i.txnNo, i.party, i.item, i.itemCode, i.hsn, i.category, i.count, i.challanOrderNo,
      i.qty, i.unit, i.unitPrice, i.discountPct, i.discount, i.taxPct, i.tax, i.txnType, i.amount]),
  ];
  return [{ name: 'Day Book Report', rows: dayBook }, { name: 'Item Details', rows: itemDetails }];
}
