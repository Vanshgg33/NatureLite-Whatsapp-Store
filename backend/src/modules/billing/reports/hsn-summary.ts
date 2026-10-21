import { RDoc } from './docs';
import { rs, ymdToDMY } from './period';

interface Agg { taxable: number; igst: number; cgst: number; sgst: number; cess: number; qty: number; unit: string }
const blank = (): Agg => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, qty: 0, unit: '' });
const value = (a: Agg) => a.taxable + a.igst + a.cgst + a.sgst + a.cess;

/** Sale Summary by HSN: SALE docs only (no orders, no credit notes), every line incl. charges and 0% lines. */
export function buildSaleSummaryByHsn(docs: RDoc[], start: Date, end: Date) {
  const sales = docs.filter(d => d.docType === 'SALE' && !d.cancelled && d.date >= start && d.date < end);
  const byHsn = new Map<string, Agg>();
  const byItem = new Map<string, Agg & { hsn: string; name: string }>();
  for (const d of sales) {
    for (const l of d.lines) {
      const h = byHsn.get(l.hsn) ?? blank();
      const ik = `${l.hsn}\u0000${l.name}`;
      const it = byItem.get(ik) ?? { ...blank(), hsn: l.hsn, name: l.name };
      for (const a of [h, it]) {
        a.taxable += l.taxable; a.igst += l.igst; a.cgst += l.cgst; a.sgst += l.sgst; a.cess += l.cess;
        a.qty += l.qty; a.unit = a.unit || l.unit;
      }
      byHsn.set(l.hsn, h); byItem.set(ik, it);
    }
  }
  const hsnRows = [...byHsn.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hsn, a]) => ({ hsn, ...a, total: value(a) }));
  const itemRows = [...byItem.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.name.localeCompare(b.name)).map(a => ({ ...a, total: value(a) }));
  const sum = (rows: Array<Agg & { total: number }>) => rows.reduce((t, r) => ({
    total: t.total + r.total, taxable: t.taxable + r.taxable, igst: t.igst + r.igst, cgst: t.cgst + r.cgst, sgst: t.sgst + r.sgst, cess: t.cess + r.cess,
  }), { total: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
  return { hsnRows, itemRows, hsnTotals: sum(hsnRows), itemTotals: sum(itemRows) };
}

export function saleSummarySheets(r: ReturnType<typeof buildSaleSummaryByHsn>, from: string, to: string) {
  const range = `From ${ymdToDMY(from)} to ${ymdToDMY(to)}`;
  const tail = (t: ReturnType<typeof buildSaleSummaryByHsn>['hsnTotals'], count: number, pad: number) => [
    [],
    ['Total', ...Array(pad).fill(''), rs(t.total), rs(t.taxable), rs(t.igst), rs(t.cgst), rs(t.sgst), rs(t.cess), 0, 0, 0],
    ['Count', ...Array(pad).fill(''), count],
  ];
  return [
    {
      name: 'Sale Summary by HSN',
      rows: [
        [range], ['Sale Summary by HSN'],
        ['HSN.', 'Total Value', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'CESS', 'Additional CESS', 'Flood CESS', 'Other Taxes'],
        ...r.hsnRows.map(x => [x.hsn, rs(x.total), rs(x.taxable), rs(x.igst), rs(x.cgst), rs(x.sgst), rs(x.cess), 0, 0, 0]),
        ...tail(r.hsnTotals, r.hsnRows.length, 0),
      ],
    },
    {
      name: 'Item Details',
      rows: [
        [range],
        ['HSN.', 'Item Name', 'Total Qty', 'Total Value', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'CESS', 'Additional CESS', 'Flood CESS', 'Other Taxes'],
        ...r.itemRows.map(x => [x.hsn, x.name, `${Math.round(x.qty * 1000) / 1000} ${x.unit}`.trim(), rs(x.total), rs(x.taxable), rs(x.igst), rs(x.cgst), rs(x.sgst), rs(x.cess), 0, 0, 0]),
        ...tail(r.itemTotals, r.itemRows.length, 2),
      ],
    },
  ];
}
