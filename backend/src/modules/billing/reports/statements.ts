import { Books } from './books';
import { balances, buildLedger, computePnl, fallbackCostOf, Ledger, netIncomeTo, withClosingStock } from './ledger';
import { groupByProduct, valueStock } from './stock';
import { fmtDMY, rs, ymdToDMY } from './period';

// ───────────────────────── Profit & Loss ─────────────────────────

export function pnlSheet(p: ReturnType<typeof computePnl>, from: string, to: string) {
  const row = (label: string, v?: number) => [label, '', v == null ? '' : rs(v)];
  const ind = (k: string) => p.indirect[k] ?? 0;
  return [{
    name: 'Profit and Loss Report',
    rows: [
      ['', 'ProfitAndLossReport'], ['', `${ymdToDMY(from)} to ${ymdToDMY(to)}`], [],
      row('Sale (+)', p.sale), row('Credit Note (-)', p.creditNote), row('Sale FA (+)', 0),
      row('Purchase (-)', p.purchase), row('Debit Note (+)', p.debitNote), row('Purchase FA (-)', 0),
      row('Payment Out Discount Amount', p.paymentOutDiscount), row('Direct Expenses / Other Direct Expenses(-)', p.directExpenses),
      row('Payment In Discount Amount', p.paymentInDiscount),
      row('Tax Payable'), row('GST Payable(-)', p.gstPayable), row('TCS Payable(-)', 0), row('TDS Payable(-)', 0),
      row('Tax Receivable'), row('GST Receivable(+)', p.gstReceivable), row('TCS Receivable(+)', 0), row('TDS Receivable(+)', 0),
      row('Opening Stock (-)', p.openingStock), row('Closing Stock (+)', p.closingStock), row('Opening Stock FA (-)', 0), row('Closing Stock FA (+)', 0),
      row('Gross Profit', p.grossProfit),
      row('Other Income (+)', p.otherIncome),
      row('Indirect Expenses(-)', p.indirectTotal),
      row('    Other Expense', ind('Other Expense')), row('    Loan Interest Expense', ind('Loan Interest Expense')),
      row('    Loan Processing Fee Expense', ind('Loan Processing Fee Expense')), row('    Loan Charges Expense', ind('Loan Charges Expense')),
      row('Net Profit', p.netProfit),
      [],
      row('Round-off included in Sale / Purchase (info)', p.roundOff),
    ],
  }];
}

// ───────────────────────── Stock Summary ─────────────────────────

export function buildStockSummary(b: Books, asOnYmd: string) {
  const before = new Date(new Date(asOnYmd + 'T00:00:00+05:30').getTime() + 86_400_000);
  const groups = groupByProduct(b.moves);
  const fb = fallbackCostOf(b);

  // Reserved = open sale orders (not converted into a sale yet) up to the as-on date
  const converted = new Set(b.docs.filter(d => d.docType === 'SALE' && !d.cancelled && d.convertedFromOrderNo).map(d => d.convertedFromOrderNo!));
  const reserved = new Map<string, number>();
  for (const d of b.docs) {
    if (d.docType !== 'SALE_ORDER' || d.cancelled || converted.has(d.docNo) || d.date >= before) continue;
    for (const l of d.lines) if (l.productId && !l.isCharge) reserved.set(l.productId, (reserved.get(l.productId) ?? 0) + l.qty);
  }

  const rows = b.products.map(p => {
    const v = valueStock(groups.get(p.id) ?? [], before, fb(p.id));
    const res = reserved.get(p.id) ?? 0;
    return {
      name: p.name, salePricePaise: p.salePricePaise, purchasePricePaise: Math.round(v.costPaise),
      qty: v.qty, available: v.qty - res, reserved: res, valuePaise: v.valuePaise,
    };
  }).sort((a, c) => a.name.toLowerCase().localeCompare(c.name.toLowerCase()));

  const totals = {
    qty: rows.reduce((s, r) => s + r.qty, 0), available: rows.reduce((s, r) => s + r.available, 0),
    reserved: rows.reduce((s, r) => s + r.reserved, 0), valuePaise: rows.reduce((s, r) => s + r.valuePaise, 0),
  };
  const sheet = [{
    name: 'Stock Summary Report',
    rows: [
      ['Godown', 'All Godown'], [],
      ['Item Name', 'Sale Price', 'Purchase Price', 'Stock Quantity', 'Available Quantity for Sale', 'Reserved Quantity', 'Stock Value'], [],
      ...rows.map(r => [r.name, rs(r.salePricePaise), rs(r.purchasePricePaise), r.qty, r.available, r.reserved, rs(r.valuePaise)]),
      ['Total', '', '', totals.qty, totals.available, totals.reserved, rs(totals.valuePaise)],
    ],
  }];
  return { asOn: asOnYmd, rows, totals, sheet };
}

// ───────────────────────── tree helpers ─────────────────────────

/** amt is in the node's natural direction (debit for assets/expenses, credit for liabilities/incomes). */
interface N { label: string; amt?: number; kids?: N[] }
const leaf = (label: string, amt: number): N => ({ label: '* ' + label, amt });
const grp = (label: string, kids: N[]): N => ({ label, kids });
const total = (n: N): number => (n.kids ? n.kids.reduce((s, k) => s + total(k), 0) : n.amt ?? 0);

function flat(n: N, level: number, out: Array<{ n: N; level: number }> = []) {
  out.push({ n, level });
  n.kids?.forEach(k => flat(k, level + 1, out));
  return out;
}

interface Parts {
  bal: Map<string, number>; // dr - cr
  ledger: Ledger;
  b: Books;
}
function parts(b: Books, before: Date): Parts {
  const ledger = buildLedger(b, before);
  return { bal: balances(withClosingStock(b, ledger, before)), ledger, b };
}

function sections(x: Parts) {
  const { bal, ledger } = x;
  const g = (a: string) => bal.get(a) ?? 0;
  const name = (a: string) => ledger.names.get(a) ?? a;

  const partyAccts = [...bal.keys()].filter(a => a.startsWith('PARTY:')).sort((p, q) => name(p).localeCompare(name(q)));
  const debtors = partyAccts.filter(a => g(a) > 0).map(a => leaf(name(a), g(a)));
  const creditors = partyAccts.filter(a => g(a) < 0).map(a => leaf(name(a), -g(a)));
  const acctOf = (kinds: string[]) => [...bal.keys()].filter(a => a.startsWith('ACCT:') && kinds.includes(ledger.kinds.get(a) ?? '')).sort()
    .map(a => leaf(name(a), g(a)));
  const ro = g('ROUNDOFF');
  const incKeys = [...bal.keys()].filter(a => a.startsWith('INC:')).sort();
  const dexp = [...bal.keys()].filter(a => a.startsWith('DEXP:')).sort();
  const iexp = [...bal.keys()].filter(a => a.startsWith('IEXP:')).sort();

  const assets = {
    fixed: grp('A. Fixed Assets', []), nonCurrent: grp('B. Non Current Assets', []),
    current: grp('C. Current Assets', [
      grp('a. Sundry Debtors', debtors),
      grp('b. Input Duties & Taxes', [grp('* Input GST', [leaf('Input CGST', g('IN_CGST')), leaf('Input SGST', g('IN_SGST')), leaf('Input IGST', g('IN_IGST'))])]),
      grp('c. Bank Accounts', acctOf(['BANK', 'WALLET'])),
      grp('d. Cash Accounts', acctOf(['CASH'])),
      grp('e. Other Current Assets', [leaf('Undeposited Cheques', g('UNDEP_CHQ')), leaf('Stock-in-hand', g('STOCK'))]),
    ]),
    other: grp('D. Other Assets', []),
  };
  const liabilities = {
    capital: grp('A. Capital Account', [leaf("Owner's Equity", -g('EQUITY')), grp('* Reserves & Surplus', [leaf('Retained Earnings', -g('RETAINED'))])]),
    longTerm: grp('B. Long-term Liabilities', [leaf('Loan Accounts', 0)]),
    current: grp('C. Current Liabilities', [
      grp('a. Sundry Creditors', creditors),
      grp('b. Outward Duties & Taxes', [grp('* Output GST', [leaf('Output CGST', -g('OUT_CGST')), leaf('Output SGST', -g('OUT_SGST')), leaf('Output IGST', -g('OUT_IGST'))])]),
      grp('c. Other Current Liabilities', [leaf('Advances Received for Sale Order', -g('ADV_SO'))]),
    ]),
    other: grp('D. Other Liabilities', []),
  };
  const incomes = grp('III. Incomes', [
    grp('A. Sale Accounts', [leaf('Sale (Revenue) Account', -g('SALE')), leaf('Additional Charges on Sale', -g('SALE_CHG'))]),
    grp('B. Other Incomes (Direct)', [leaf('Closing Stock (Trading)', -g('CLOSING_STOCK_TR')), leaf('Payment-out Discount', -g('PAYOUT_DISC'))]),
    grp('C. Other Incomes (Indirect)', [...incKeys.map(a => leaf(a.slice(4), -g(a))), ...(ro < 0 ? [leaf('Round Off', -ro)] : [])]),
  ]);
  const expenses = grp('IV. Expenses', [
    grp('A. Purchase Accounts', [leaf('Purchase', g('PURCHASE'))]),
    grp('B. Direct Expenses', [leaf('Payment-in Discount', g('PAYIN_DISC')), ...dexp.map(a => leaf(a.slice(5), g(a)))]),
    grp('C. Indirect Expenses', [leaf('Opening Stock Balance', g('OPENING_STOCK')), ...iexp.map(a => leaf(a.slice(5), g(a))), ...(ro > 0 ? [leaf('Round Off', ro)] : [])]),
  ]);
  return { assets, liabilities, incomes, expenses };
}

// ───────────────────────── Trial Balance ─────────────────────────

export function buildTrialBalance(b: Books, asOnYmd: string, co: { name: string; phone: string; email: string; gstin: string }, fyStartYmd: string) {
  const before = new Date(new Date(asOnYmd + 'T00:00:00+05:30').getTime() + 86_400_000);
  const s = sections(parts(b, before));
  const roots: Array<{ n: N; nat: 'dr' | 'cr' }> = [
    { n: grp('I. Assets', Object.values(s.assets)), nat: 'dr' },
    { n: grp('II. Equities & Liabilities', Object.values(s.liabilities)), nat: 'cr' },
    { n: s.incomes, nat: 'cr' }, { n: s.expenses, nat: 'dr' },
  ];
  let debit = 0, credit = 0;
  const out: any[][] = [];
  const emit = (n: N, level: number, nat: 'dr' | 'cr') => {
    const t = total(n);
    const natural = t >= 0;
    const col = (nat === 'dr') === natural ? 'dr' : 'cr';
    const isLeaf = !n.kids;
    if (isLeaf) { if (col === 'dr') debit += Math.abs(t); else credit += Math.abs(t); }
    const pad = ' '.repeat(level * 4);
    out.push([pad + n.label, col === 'dr' ? rs(Math.abs(t)) : '', col === 'cr' ? rs(Math.abs(t)) : '']);
    n.kids?.forEach(k => emit(k, level + 1, nat));
  };
  roots.forEach((r, i) => {
    emit(r.n, 0, r.nat);
    if (i === 1 || i === 0) out.push(['Total', ...(r.nat === 'dr' ? [rs(Math.abs(total(r.n))), ''] : ['', rs(Math.abs(total(r.n)))])]);
  });
  out.push(['V. Difference in Opening Balance', 0, 0]);
  out.push(['Total', rs(debit), rs(credit)]);
  const sheet = [{
    name: 'Trial Balance report',
    rows: [
      [], ['TRIAL BALANCE SHEET'], [],
      [`Company Name: ${co.name}`], [`Phone No.: ${co.phone}`, `Email ID: ${co.email}`], [`GSTIN No: ${co.gstin}`, `Time Period: ${ymdToDMY(fyStartYmd)} to ${ymdToDMY(asOnYmd)}`], [],
      ['Accounts', 'Closing Balance'], ['', 'Debit', 'Credit'], ...out,
    ],
  }];
  return { asOn: asOnYmd, debitTotal: rs(debit), creditTotal: rs(credit), balanced: Math.round(debit) === Math.round(credit), sheet };
}

// ───────────────────────── Balance Sheet ─────────────────────────

export function fyStartOf(asOnYmd: string, fyStartMonth = 4): string {
  const [y, m] = asOnYmd.split('-').map(Number);
  const yr = m >= fyStartMonth ? y : y - 1;
  return `${yr}-${String(fyStartMonth).padStart(2, '0')}-01`;
}

export function buildBalanceSheet(b: Books, asOnYmd: string, fyStartMonth = 4) {
  const before = new Date(new Date(asOnYmd + 'T00:00:00+05:30').getTime() + 86_400_000);
  const s = sections(parts(b, before));

  // Net income of the current FY; everything earlier folds into retained earnings
  const fyStart = new Date(fyStartOf(asOnYmd, fyStartMonth) + 'T00:00:00+05:30');
  const openedOn = b.opening?.asOn ?? new Date(0);
  const niAll = netIncomeTo(b, before);
  const niPrior = fyStart > openedOn ? netIncomeTo(b, fyStart) : 0;
  const netIncome = niAll - niPrior;

  const cap = s.liabilities.capital;
  const reserves = cap.kids![1];
  reserves.kids = [leaf('Net Income (Profit)', netIncome), leaf('Retained Earnings', (reserves.kids![0].amt ?? 0) + niPrior)];

  const left = [cap, s.liabilities.longTerm, s.liabilities.current, s.liabilities.other];
  const right = [s.assets.fixed, s.assets.nonCurrent, s.assets.current, s.assets.other];
  const fmtLines = (nodes: N[]) => nodes.flatMap(n => flat(n, 0)).map(({ n, level }) => ({
    label: ' '.repeat(level * 4) + (n.kids ? `${n.label} (${rs(total(n))})` : n.label), amount: n.kids ? '' : rs(n.amt ?? 0),
  }));
  const L = fmtLines(left), R = fmtLines(right);
  const leftTotal = left.reduce((t, n) => t + total(n), 0), rightTotal = right.reduce((t, n) => t + total(n), 0);
  const rows: any[][] = [];
  for (let i = 0; i < Math.max(L.length, R.length); i++) rows.push([L[i]?.label ?? '', L[i]?.amount ?? '', R[i]?.label ?? '', R[i]?.amount ?? '']);
  rows.push(['Total', rs(leftTotal), 'Total', rs(rightTotal)]);
  const d = new Date(before.getTime() - 1);
  const title = `Balance Sheet as on ${d.toLocaleString('en-US', { month: 'short', timeZone: 'Asia/Kolkata' })} ${d.toLocaleString('en-GB', { day: 'numeric', timeZone: 'Asia/Kolkata' })}, ${d.toLocaleString('en-GB', { year: 'numeric', timeZone: 'Asia/Kolkata' })}`;
  const sheet = [{ name: 'Balance sheet', rows: [[title], [], ['Equities & Liabilities', 'Amount', 'Assets', 'Amount'], ...rows] }];
  const diff = rs(leftTotal - rightTotal);
  return {
    asOn: asOnYmd, leftTotal: rs(leftTotal), rightTotal: rs(rightTotal), difference: diff,
    // never hide an imbalance: the UI must show this warning when set
    warning: diff !== 0 ? `Balance sheet is out of balance by ${diff}` : null,
    netIncome: rs(netIncome), left: L, right: R, sheet,
  };
}

export { fmtDMY };
