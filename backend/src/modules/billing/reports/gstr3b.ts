import { RDoc } from './docs';
import { PDoc } from './books';
import { fmtMMYYYY, rs, stateLabel } from './period';

interface T { taxable: number; igst: number; cgst: number; sgst: number; cess: number }
const zero = (): T => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });

const isZeroRatedDest = (pos: string) => pos === '96' || pos === '97';

/**
 * GSTR-3B from the same dataset as GSTR-1 (sales minus credit notes).
 * Tables 4 and 5 need purchase bills (Phase 5) and are emitted as zeros until then.
 */
export function buildGstr3b(allDocs: RDoc[], month: string, start: Date, end: Date, allPurchases: PDoc[] = [], stateCode = '22') {
  const docs = allDocs.filter(d => !d.cancelled && d.date >= start && d.date < end && (d.docType === 'SALE' || d.docType === 'CREDIT_NOTE'));

  const d_ = zero(); // 3.1(d) inward supplies liable to reverse charge
  const a = zero(), b = zero(), c = zero(), e = zero(); // 3.1 (a) taxable, (b) zero rated, (c) nil/exempt, (e) non-GST
  const unreg = new Map<string, { taxable: number; igst: number }>();

  for (const d of docs) {
    const zr = isZeroRatedDest(d.pos);
    for (const l of d.lines) {
      const sgn = d.sign;
      const target = zr ? b : l.treatment === 'TAXABLE' ? a : l.treatment === 'NON_GST' ? e : c;
      target.taxable += sgn * l.taxable; target.igst += sgn * l.igst; target.cgst += sgn * l.cgst; target.sgst += sgn * l.sgst; target.cess += sgn * l.cess;
      // 3.2: inter-state supplies to unregistered persons (incl. their nil-rated lines)
      if (!zr && d.isInter && !d.gstin) {
        const u = unreg.get(d.pos) ?? { taxable: 0, igst: 0 };
        u.taxable += sgn * l.taxable; u.igst += sgn * l.igst;
        unreg.set(d.pos, u);
      }
    }
  }

  // ── purchases: tables 3.1(d), 4, 5 ──
  const purchases = allPurchases.filter(p => !p.cancelled && p.date >= start && p.date < end);
  const itc = { rcm: zero(), other: zero(), i175: zero(), oth: zero() };
  const t5 = { nilInter: 0, nilIntra: 0, nonInter: 0, nonIntra: 0 };
  for (const p of purchases) {
    const sg = p.isDebitNote ? -1 : 1;
    const inter = p.pos !== stateCode;
    for (const l of p.lines) {
      const tax = (t: T) => { t.igst += sg * l.igst; t.cgst += sg * l.cgst; t.sgst += sg * l.sgst; };
      if (p.reverseCharge) { d_.taxable += sg * l.taxable; d_.igst += sg * l.igst; d_.cgst += sg * l.cgst; d_.sgst += sg * l.sgst; }
      if (p.itc === 'ELIGIBLE') tax(p.reverseCharge ? itc.rcm : itc.other);
      else tax(p.itc === 'INELIGIBLE_17_5' ? itc.i175 : itc.oth);
      if (l.ratePct === 0) {
        if (l.treatment === 'NON_GST') t5[inter ? 'nonInter' : 'nonIntra'] += sg * l.taxable;
        else t5[inter ? 'nilInter' : 'nilIntra'] += sg * l.taxable;
      }
    }
  }

  const row = (label: string, t: T) => [label, rs(t.taxable), rs(t.igst), rs(t.cgst), rs(t.sgst), rs(t.cess)];
  const header31 = ['Nature of Supplies', 'Total Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'];
  const rows31 = [
    row('(a) Outward taxable supplies (other than zero rated, nil rated and exempted)', a),
    row('(b) Outward taxable supplies (zero rated)', b),
    row('(c) Other outward supplies (nil rated, exempted)', c),
    row('(d) Inward supplies (liable to reverse charge)', d_),
    row('(e) Non-GST outward supplies', e),
  ];
  const sheet31 = [['From', fmtMMYYYY(month)], ['To', fmtMMYYYY(month)], header31, [], ...rows31];

  const places = [...unreg.entries()].sort(([x], [y]) => x.localeCompare(y));
  const sheet32 = [
    ['Place of Supply (State/UT)', 'Supplies Made To Unregistered Persons', '', 'Supplies Made To Composition Taxable Persons', '', 'Supplies Made To UIN Holders', ''],
    ['', 'Total taxable value', 'Amount of integrated tax', 'Total taxable value', 'Amount of integrated tax', 'Total taxable value', 'Amount of integrated tax'],
    ...places.map(([pos, u]) => [stateLabel(pos), rs(u.taxable), rs(u.igst), 0, 0, 0, 0]),
  ];

  const itcRow = (label: string, t: T = zero()) => [label, rs(t.igst), rs(t.cgst), rs(t.sgst), rs(t.cess)];
  const sheet4 = [
    ['Details', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'],
    ['(A) ITC Available (whether in full or part)'],
    itcRow('(1) Import of goods'), itcRow('(2) Import of services'), itcRow('(3) Inward supplies liable to reverse charge (other than 1 & 2 above)', itc.rcm),
    itcRow('(4) Inward supplies from ISD'), itcRow('(5) All other ITC', itc.other),
    ['(D) Ineligible ITC'], itcRow('(1) As per section 17(5)', itc.i175), itcRow('(2) Others', itc.oth),
  ];
  const sheet5 = [
    ['Nature of Supplies', 'Inter-State supplies', 'Intra-State supplies'],
    ['From a supplier under composition scheme, Exempt and Nil rated supply', rs(t5.nilInter), rs(t5.nilIntra)],
    ['Non GST supply', rs(t5.nonInter), rs(t5.nonIntra)],
  ];

  return {
    month,
    table31: { a: rows31[0], b: rows31[1], c: rows31[2], d: rows31[3], e: rows31[4] },
    table32: places.map(([pos, u]) => ({ pos: stateLabel(pos), taxable: rs(u.taxable), igst: rs(u.igst) })),
    totals: { taxable: rs(a.taxable + b.taxable + c.taxable + e.taxable), tax: rs(a.igst + a.cgst + a.sgst + a.cess + b.igst + b.cgst + b.sgst + b.cess) },
    sheets: [{ name: '3.1', rows: sheet31 }, { name: '3.2', rows: sheet32 }, { name: '4', rows: sheet4 }, { name: '5', rows: sheet5 }],
  };
}
