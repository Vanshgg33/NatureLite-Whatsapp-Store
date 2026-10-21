import { RDoc, RLine, uqcLabel } from './docs';
import { fmtDMY, fmtDMonY, fmtMonthYear, rs, stateLabel, stateName } from './period';

export interface Gstr1Company {
  gstin: string; legalName: string; tradeName?: string; stateCode: string;
  aggregateTurnoverPrevFY?: number; b2clLimitPaise: number;
}

interface Tot { taxable: number; igst: number; cgst: number; sgst: number; cess: number }
const zero = (): Tot => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
const add = (t: Tot, l: RLine, sign: number) => {
  t.taxable += sign * l.taxable; t.igst += sign * l.igst; t.cgst += sign * l.cgst; t.sgst += sign * l.sgst; t.cess += sign * l.cess;
};
const taxOf = (t: Tot) => t.igst + t.cgst + t.sgst + t.cess;

/** invoice x rate groups, signed */
function byRate(d: RDoc): Array<{ rate: number; t: Tot }> {
  const m = new Map<number, Tot>();
  for (const l of d.lines) { const t = m.get(l.ratePct) ?? zero(); add(t, l, d.sign); m.set(l.ratePct, t); }
  return [...m.entries()].sort(([a], [b]) => a - b).map(([rate, t]) => ({ rate, t }));
}

export type Section = 'B2B' | 'B2CL' | 'B2CS' | 'EXP';
export function sectionOf(d: RDoc, limitPaise: number): Section {
  if (d.pos === '96') return 'EXP';
  if (d.gstin) return 'B2B';
  if (d.isInter && d.totalPaise > limitPaise) return 'B2CL';
  return 'B2CS';
}

const numSeq = (no: string) => Number((no.match(/(\d+)\s*$/) ?? [])[1] ?? NaN);

export function buildGstr1(allDocs: RDoc[], month: string, start: Date, end: Date, co: Gstr1Company, orders: RDoc[] = []) {
  const inMonth = (d: RDoc) => d.date >= start && d.date < end;
  const docs = allDocs.filter(d => inMonth(d) && !d.cancelled && (d.docType === 'SALE' || d.docType === 'CREDIT_NOTE'));
  const sales = docs.filter(d => d.docType === 'SALE');
  const notes = docs.filter(d => d.docType === 'CREDIT_NOTE');
  const sec = (d: RDoc) => sectionOf(d, co.b2clLimitPaise);

  // ── main sheet ──
  const mainRows: any[][] = [];
  const mainTot = zero();
  let mainValue = 0;
  for (const d of docs) {
    mainValue += d.sign * d.totalPaise;
    for (const { rate, t } of byRate(d)) {
      mainRows.push([d.gstin, d.partyName, d.docType === 'SALE' ? 'Sale' : 'Credit Note', d.docNo, fmtDMY(d.date), rs(d.sign * d.totalPaise),
        rate, 0, rs(t.taxable), 'N', rs(t.igst), rs(t.cgst), rs(t.sgst), rs(t.cess), stateName(d.pos)]);
      mainTot.taxable += t.taxable; mainTot.igst += t.igst; mainTot.cgst += t.cgst; mainTot.sgst += t.sgst; mainTot.cess += t.cess;
    }
  }
  const main: any[][] = [
    ['Period', `${fmtMonthYear(month)} - ${fmtMonthYear(month)}`], [],
    ['1. GSTIN', co.gstin],
    ['2.a Legal name of the registered person.', co.legalName],
    ['2.b Trade name, if any', co.tradeName ?? ''],
    ['3.a Aggregate turnover of the preceeding Financial Year', co.aggregateTurnoverPrevFY ?? ''],
    ['3.b Aggregate turnover, April to June 2017', ''],
    [],
    ['GSTIN/UIN', 'Party Name', 'Transaction Type', 'Invoice No.', 'Invoice Date', 'Invoice Value', 'Rate', 'Cess Rate', 'Taxable value',
      'Reverse Charge', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount', 'Place of Supply(Name of state)'],
    ...mainRows,
    ['Total', '', '', '', '', rs(mainValue), '', '', rs(mainTot.taxable), '', rs(mainTot.igst), rs(mainTot.cgst), rs(mainTot.sgst), rs(mainTot.cess)],
  ];

  // ── b2b ──
  const b2bDocs = sales.filter(d => sec(d) === 'B2B');
  const b2bRows = b2bDocs.flatMap(d => byRate(d).map(({ rate, t }) => [d.gstin, d.partyName, d.docNo, fmtDMonY(d.date), rs(d.totalPaise),
    stateLabel(d.pos), 'N', '', 'Regular B2B', '', rate, rs(t.taxable), rs(t.cess)]));
  const b2bTaxable = b2bDocs.reduce((s, d) => s + d.lines.reduce((a, l) => a + l.taxable, 0), 0);
  const b2b = section(
    ['No. of Recipients', 'No. of Invoices', 'Total Invoice Value', 'Total Taxable Value', 'Total Cess'],
    [new Set(b2bDocs.map(d => d.gstin)).size, b2bDocs.length, rs(b2bDocs.reduce((s, d) => s + d.totalPaise, 0)), rs(b2bTaxable), 0],
    ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge',
      'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount'],
    b2bRows);

  // ── b2cl ──
  const b2clDocs = sales.filter(d => sec(d) === 'B2CL');
  const b2cl = section(
    ['No. of Invoices', 'Total Invoice Value', 'Total Taxable Value', 'Total Cess'],
    [b2clDocs.length, rs(b2clDocs.reduce((s, d) => s + d.totalPaise, 0)), rs(b2clDocs.reduce((s, d) => s + d.lines.reduce((a, l) => a + l.taxable, 0), 0)), 0],
    ['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
    b2clDocs.flatMap(d => byRate(d).map(({ rate, t }) => [d.docNo, fmtDMonY(d.date), rs(d.totalPaise), stateLabel(d.pos), '', rate, rs(t.taxable), rs(t.cess), ''])));

  // ── b2cs: unregistered, rate > 0, grouped POS x rate; credit notes are netted in ──
  const cs = new Map<string, { pos: string; rate: number; t: Tot }>();
  for (const d of docs.filter(x => sec(x) === 'B2CS' && !x.gstin)) {
    for (const { rate, t } of byRate(d).filter(r => r.rate > 0)) {
      const k = `${d.pos}|${rate}`;
      const g = cs.get(k) ?? { pos: d.pos, rate, t: zero() };
      g.t.taxable += t.taxable; g.t.cess += t.cess; g.t.igst += t.igst; g.t.cgst += t.cgst; g.t.sgst += t.sgst;
      cs.set(k, g);
    }
  }
  const csList = [...cs.values()].sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate);
  const b2cs = section(
    ['Total Taxable Value', 'Total Cess'],
    [rs(csList.reduce((s, g) => s + g.t.taxable, 0)), rs(csList.reduce((s, g) => s + g.t.cess, 0))],
    ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
    csList.map(g => ['OE', stateLabel(g.pos), '', g.rate, rs(g.t.taxable), rs(g.t.cess), '']));

  // ── cdnr / cdnur ──
  const cdnrDocs = notes.filter(d => d.gstin);
  const cdnr = section(
    ['No. of Recipients', 'No. of Notes', 'Total Note Value', 'Total Taxable Value', 'Total Cess'],
    [new Set(cdnrDocs.map(d => d.gstin)).size, cdnrDocs.length, rs(cdnrDocs.reduce((s, d) => s + d.totalPaise, 0)),
      rs(cdnrDocs.reduce((s, d) => s + d.lines.reduce((a, l) => a + l.taxable, 0), 0)), 0],
    ['GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type',
      'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'],
    cdnrDocs.flatMap(d => byRate(d).map(({ rate, t }) => [d.gstin, d.partyName, d.docNo, fmtDMonY(d.date), 'C', stateLabel(d.pos), 'N', 'Regular B2B',
      rs(d.totalPaise), '', rate, -rs(t.taxable), rs(t.cess)])));
  const cdnurDocs = notes.filter(d => !d.gstin && sec(d) === 'B2CL');
  const cdnur = section(
    ['No. of Notes', 'Total Note Value', 'Total Taxable Value', 'Total Cess'],
    [cdnurDocs.length, rs(cdnurDocs.reduce((s, d) => s + d.totalPaise, 0)), rs(cdnurDocs.reduce((s, d) => s + d.lines.reduce((a, l) => a + l.taxable, 0), 0)), 0],
    ['UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'],
    cdnurDocs.flatMap(d => byRate(d).map(({ rate, t }) => ['B2CL', d.docNo, fmtDMonY(d.date), 'C', stateLabel(d.pos), rs(d.totalPaise), '', rate, -rs(t.taxable), rs(t.cess)])));

  // ── exp ──
  const expDocs = sales.filter(d => sec(d) === 'EXP');
  const exp = section(
    ['No. of Invoices', 'Total Invoice Value', 'No. of Shipping Bill', 'Total Taxable Value'],
    [expDocs.length, rs(expDocs.reduce((s, d) => s + d.totalPaise, 0)), 0, rs(expDocs.reduce((s, d) => s + d.lines.reduce((a, l) => a + l.taxable, 0), 0))],
    ['Export Type', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Port Code', 'Shipping Bill Number', 'Shipping Bill Date', 'Rate', 'Taxable Value'],
    expDocs.flatMap(d => byRate(d).map(({ rate, t }) => [rate > 0 ? 'WPAY' : 'WOPAY', d.docNo, fmtDMonY(d.date), rs(d.totalPaise), '', '', '', rate, rs(t.taxable)])));

  // ── at / atadj : sale-order advances received / adjusted against sales ──
  const spread = (o: RDoc, amountPaise: number) => { // advance is GST-inclusive; split by order-line value share per rate
    const tot = o.lines.reduce((s, l) => s + l.amount, 0) || 1;
    const m = new Map<number, number>();
    for (const l of o.lines) m.set(l.ratePct, (m.get(l.ratePct) ?? 0) + amountPaise * l.amount / tot);
    return [...m.entries()];
  };
  const groupAdv = (items: Array<{ pos: string; rate: number; amt: number }>) => {
    const g = new Map<string, { pos: string; rate: number; amt: number }>();
    for (const i of items) { const k = `${i.pos}|${i.rate}`; const e = g.get(k) ?? { ...i, amt: 0 }; e.amt += i.amt; g.set(k, e); }
    return [...g.values()].sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate);
  };
  const orderByNo = new Map(orders.map(o => [o.docNo, o]));
  const atItems = orders.filter(o => !o.cancelled && inMonth(o) && o.paidAtCreationPaise > 0)
    .flatMap(o => spread(o, o.paidAtCreationPaise).map(([rate, amt]) => ({ pos: o.pos, rate, amt })));
  const adjItems = sales.filter(s => s.convertedFromOrderNo && orderByNo.has(s.convertedFromOrderNo)).flatMap(s => {
    const o = orderByNo.get(s.convertedFromOrderNo!)!;
    return spread(o, Math.min(o.paidAtCreationPaise, s.totalPaise)).map(([rate, amt]) => ({ pos: s.pos, rate, amt }));
  });
  const advSheet = (items: ReturnType<typeof groupAdv>, label: string) => section(
    [`Total ${label}`, 'Total Cess'], [rs(items.reduce((s, i) => s + i.amt, 0)), 0],
    ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', label === 'Advance Received' ? 'Gross Advance Received' : 'Gross Advance Adjusted', 'Cess Amount'],
    items.map(i => [stateLabel(i.pos), '', i.rate, rs(i.amt), 0]));
  const at = advSheet(groupAdv(atItems), 'Advance Received');
  const atadj = advSheet(groupAdv(adjItems), 'Advance Adjusted');

  // ── exemp (Table 8): every non-taxable line of non-export supplies ──
  const ex = [0, 1, 2, 3].map(() => ({ NIL_RATED: 0, EXEMPT: 0, NON_GST: 0 }));
  for (const d of docs.filter(x => sec(x) !== 'EXP')) {
    const i = (d.gstin ? 0 : 2) + (d.isInter ? 0 : 1); // 0 inter-reg, 1 intra-reg, 2 inter-unreg, 3 intra-unreg
    for (const l of d.lines) if (l.treatment !== 'TAXABLE') ex[i][l.treatment] += d.sign * l.taxable;
  }
  const exLabels = ['Inter-State supplies to registered persons', 'Intra-State supplies to registered persons',
    'Inter-State supplies to unregistered persons', 'Intra-State supplies to unregistered persons'];
  const table8 = ex.reduce((s, r) => s + r.NIL_RATED + r.EXEMPT + r.NON_GST, 0);
  const exemp = section(
    ['Total Nil Rated Supplies', 'Total Exempted Supplies', 'Total Non-GST Supplies'],
    [rs(ex.reduce((s, r) => s + r.NIL_RATED, 0)), rs(ex.reduce((s, r) => s + r.EXEMPT, 0)), rs(ex.reduce((s, r) => s + r.NON_GST, 0))],
    ['Description', 'Nil Rated Supplies', 'Exempted(other than nil rated/non GST supply)', 'Non-GST Supplies'],
    ex.map((r, i) => [exLabels[i], rs(r.NIL_RATED), rs(r.EXEMPT), rs(r.NON_GST)]));

  // ── hsn(b2b) / hsn(b2c) / itemSummary ──
  const hsnSheet = (list: RDoc[], byItem: boolean) => {
    const g = new Map<string, { hsn: string; desc: string; uqc: string; rate: number; qty: number; t: Tot }>();
    for (const d of list) for (const l of d.lines) {
      const k = [l.hsn, byItem ? l.name : '', l.uqc, l.ratePct].join('|');
      const e = g.get(k) ?? { hsn: l.hsn, desc: byItem ? l.name : (l.category || l.name), uqc: l.uqc, rate: l.ratePct, qty: 0, t: zero() };
      e.qty += d.sign * l.qty; add(e.t, l, d.sign); g.set(k, e);
    }
    const rows = [...g.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.desc.localeCompare(b.desc) || a.rate - b.rate);
    const tot = rows.reduce((s, r) => ({ v: s.v + r.t.taxable + taxOf(r.t), t: add2(s.t, r.t) }), { v: 0, t: zero() });
    return {
      rows, totalValue: tot.v, tot: tot.t,
      sheet: section(
        ['No. of HSN', 'Total Value', 'Total Taxable Value', 'Total Integrated Tax', 'Total Central Tax', 'Total State/UT Tax', 'Total Cess'],
        [new Set(rows.map(r => r.hsn)).size, rs(tot.v), rs(tot.t.taxable), rs(tot.t.igst), rs(tot.t.cgst), rs(tot.t.sgst), rs(tot.t.cess)],
        ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'],
        rows.map(r => [r.hsn, r.desc, uqcLabel(r.uqc), r.qty, rs(r.t.taxable + taxOf(r.t)), r.rate, rs(r.t.taxable), rs(r.t.igst), rs(r.t.cgst), rs(r.t.sgst), rs(r.t.cess)])),
    };
  };
  const hsnB2b = hsnSheet(docs.filter(d => d.gstin), false);
  const hsnB2c = hsnSheet(docs.filter(d => !d.gstin), false);
  const items = hsnSheet(docs, true);

  // ── docs (Table 13) – includes cancelled numbers ──
  const issued = allDocs.filter(d => inMonth(d));
  const docRow = (label: string, type: RDoc['docType']) => {
    const list = issued.filter(d => d.docType === type).sort((a, b) => (numSeq(a.docNo) - numSeq(b.docNo)) || a.docNo.localeCompare(b.docNo));
    return [label, list[0]?.docNo ?? '', list[list.length - 1]?.docNo ?? '', list.length, list.filter(d => d.cancelled).length];
  };
  const docsRows = [docRow('Invoices for outward supply', 'SALE'), docRow('Credit Note', 'CREDIT_NOTE')];
  const docsSheet = section(
    ['Total Number', 'Total Cancelled'],
    [docsRows.reduce((t, r) => t + (r[3] as number), 0), docsRows.reduce((t, r) => t + (r[4] as number), 0)],
    ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
    docsRows);

  // ── reconciliation (finding F1) ──
  const lineTotal = docs.reduce((s, d) => s + d.sign * d.lines.reduce((a, l) => a + l.amount, 0), 0);
  const saleLineTotal = sales.reduce((s, d) => s + d.lines.reduce((a, l) => a + l.amount, 0), 0);
  const exportTotal = docs.filter(d => sec(d) === 'EXP').reduce((s, d) => s + d.sign * d.lines.reduce((a, l) => a + l.amount, 0), 0);
  const taxedValue = docs.filter(d => sec(d) !== 'EXP').reduce((s, d) => s + d.sign * d.lines.filter(l => l.treatment === 'TAXABLE').reduce((a, l) => a + l.amount, 0), 0);
  const flags = {
    missingHsn: dedupe(docs.flatMap(d => d.lines.filter(l => l.hsn === 'NA').map(l => ({ docNo: d.docNo, item: l.name })))),
    undeclaredTreatment: dedupe(docs.flatMap(d => d.lines.filter(l => l.ratePct === 0 && !l.treatmentDeclared).map(l => ({ docNo: d.docNo, item: l.name })))),
  };
  const reconciliation = {
    saleSummaryTotal: rs(saleLineTotal),
    gstr1TaxedValue: rs(taxedValue),
    gstr1Table8Value: rs(table8),
    gstr1ExportValue: rs(exportTotal),
    // sale summary (net of credit notes) must equal taxed + Table 8 + exports; anything else was dropped from the return
    difference: rs(lineTotal - taxedValue - table8 - exportTotal),
    hsnSheetTotal: rs(hsnB2b.totalValue + hsnB2c.totalValue),
    itemSummaryTotal: rs(items.totalValue),
    flags,
  };

  return {
    month,
    sheets: [
      { name: 'GSTR1 Report', rows: main }, { name: 'b2b,sez,de', rows: b2b }, { name: 'b2cl', rows: b2cl }, { name: 'b2cs', rows: b2cs },
      { name: 'cdnr', rows: cdnr }, { name: 'cdnur', rows: cdnur }, { name: 'exp', rows: exp }, { name: 'at', rows: at }, { name: 'atadj', rows: atadj },
      { name: 'exemp', rows: exemp }, { name: 'hsn(b2b)', rows: hsnB2b.sheet }, { name: 'hsn(b2c)', rows: hsnB2c.sheet },
      { name: 'itemSummary', rows: items.sheet }, { name: 'docs', rows: docsSheet },
    ],
    totals: {
      invoiceValue: rs(mainValue), taxable: rs(mainTot.taxable), igst: rs(mainTot.igst), cgst: rs(mainTot.cgst), sgst: rs(mainTot.sgst), cess: rs(mainTot.cess),
    },
    summary: {
      b2b: { recipients: new Set(b2bDocs.map(d => d.gstin)).size, invoices: b2bDocs.length, value: rs(b2bDocs.reduce((s, d) => s + d.totalPaise, 0)), taxable: rs(b2bTaxable) },
      b2cs: csList.map(g => ({ pos: stateLabel(g.pos), rate: g.rate, taxable: rs(g.t.taxable), igst: rs(g.t.igst), cgst: rs(g.t.cgst), sgst: rs(g.t.sgst) })),
      table8: ex.map((r, i) => ({ description: exLabels[i], nil: rs(r.NIL_RATED), exempt: rs(r.EXEMPT), nonGst: rs(r.NON_GST) })),
      notes: notes.map(n => ({ docNo: n.docNo, party: n.partyName, gstin: n.gstin, date: fmtDMY(n.date), value: rs(n.totalPaise), refInvoiceNo: n.refInvoiceNo ?? '' })),
      docs: docsRows.map(r => ({ nature: r[0], from: r[1], to: r[2], total: r[3], cancelled: r[4] })),
      hsn: { b2b: hsnB2b.rows.length, b2c: hsnB2c.rows.length, items: items.rows.length },
    },
    reconciliation,
  };
}

function add2(a: Tot, b: Tot): Tot {
  return { taxable: a.taxable + b.taxable, igst: a.igst + b.igst, cgst: a.cgst + b.cgst, sgst: a.sgst + b.sgst, cess: a.cess + b.cess };
}
function dedupe<T extends { docNo: string; item: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter(r => { const k = r.docNo + '|' + r.item; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Section sheet: rows 1-3 summary (labels, values, blank), row 4 column headers, data from row 5. */
function section(labels: string[], values: any[], header: string[], rows: any[][]): any[][] {
  return [labels, values, [], header, ...rows];
}
