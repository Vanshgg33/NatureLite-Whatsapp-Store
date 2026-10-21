import { Books } from './books';
import { RDoc } from './docs';
import { collectMoves, groupByProduct, StockMove, totalStockValue, valueStock } from './stock';

/**
 * Double-entry postings derived from the documents. Reports read the books through this single engine,
 * so Trial Balance (debit = credit) and Balance Sheet (left = right) balance by construction.
 * All amounts in integer paise.
 */
export interface Posting { acct: string; dr: number; cr: number; date: Date }

const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
const inRange = (d: Date, from: Date, to: Date) => d >= from && d < to;

export function fallbackCostOf(b: Books) {
  const m = new Map(b.products.map(p => [p.id, p.purchasePricePaise]));
  return (pid: string) => m.get(pid) ?? 0;
}

export interface Ledger { postings: Posting[]; names: Map<string, string>; kinds: Map<string, string>; openingStockPaise: number }

export function buildLedger(b: Books, before: Date): Ledger {
  const names = new Map<string, string>();
  const kinds = new Map<string, string>();
  const all: Posting[] = [];
  const post = (date: Date, ...e: Array<[string, number, number]>) => { for (const [acct, dr, cr] of e) if (dr || cr) all.push({ acct, dr, cr, date }); };

  const op = b.opening ?? { asOn: new Date(0), retainedEarningsPaise: 0, partyOpenings: [], modeAccountMap: {} };
  for (const a of b.accounts) { names.set('ACCT:' + a.id, a.name); kinds.set('ACCT:' + a.id, a.kind); }

  const firstOf = (k: string) => b.accounts.find(a => a.kind === k);
  const resolve = (mode: string, explicit?: string): string => {
    mode = (mode || 'cash').toLowerCase();
    if (explicit && b.accounts.some(a => a.id === explicit)) return 'ACCT:' + explicit;
    if (mode === 'cheque') return 'UNDEP_CHQ';
    const mapped = op.modeAccountMap?.[mode];
    if (mapped && b.accounts.some(a => a.id === mapped)) return 'ACCT:' + mapped;
    const a = mode === 'cash' ? firstOf('CASH') : (firstOf('BANK') ?? firstOf('WALLET'));
    if (a) return 'ACCT:' + a.id;
    const key = mode === 'cash' ? 'ACCT:_CASH' : 'ACCT:_BANK';
    names.set(key, mode === 'cash' ? 'Cash' : 'Bank'); kinds.set(key, mode === 'cash' ? 'CASH' : 'BANK');
    return key;
  };
  const party = (id: string, name: string) => {
    const k = id ? 'PARTY:' + id : 'PARTY:N:' + name.trim().toLowerCase();
    if (!names.has(k) || !names.get(k)) names.set(k, name);
    return k;
  };

  // ── opening balances ──
  for (const a of b.accounts) post(op.asOn, ['ACCT:' + a.id, Math.max(a.openingBalancePaise, 0), Math.max(-a.openingBalancePaise, 0)]);
  for (const p of op.partyOpenings) post(op.asOn, [party(p.partyId, p.name), Math.max(p.balancePaise, 0), Math.max(-p.balancePaise, 0)]);
  const fb = fallbackCostOf(b);
  const openingStock = totalStockValue(groupByProduct(b.moves.filter(m => m.kind === 'OPENING')), new Date(8.64e15), fb);
  post(op.asOn, ['OPENING_STOCK', openingStock, 0], ['RETAINED', Math.max(-op.retainedEarningsPaise, 0), Math.max(op.retainedEarningsPaise, 0)]);
  const eq = sum(all, p => p.dr - p.cr);
  post(op.asOn, ['EQUITY', Math.max(-eq, 0), Math.max(eq, 0)]); // owner's equity = whatever opening assets less liabilities leave

  // ── sales, credit notes, sale orders ──
  const convertedOrders = new Set(b.docs.filter(d => d.docType === 'SALE' && !d.cancelled && d.convertedFromOrderNo).map(d => d.convertedFromOrderNo!));
  for (const d of b.docs) {
    if (d.cancelled) continue;
    const pk = party(d.partyId, d.partyName);
    if (d.docType === 'SALE_ORDER') {
      const tgt = convertedOrders.has(d.docNo) ? pk : 'ADV_SO';
      for (const p of d.initialPays) post(d.date, [resolve(p.mode), p.amountPaise, 0], [tgt, 0, p.amountPaise]);
      continue;
    }
    const isSale = d.docType === 'SALE';
    const x = sum(d.lines.filter(l => !l.isCharge), l => l.taxable), xc = sum(d.lines.filter(l => l.isCharge), l => l.taxable);
    const c = sum(d.lines, l => l.cgst), s = sum(d.lines, l => l.sgst), i = sum(d.lines, l => l.igst);
    const r = d.totalPaise - (x + xc + c + s + i);
    const f = (dr: number, cr: number): [number, number] => isSale ? [dr, cr] : [cr, dr]; // credit note mirrors the sale
    post(d.date,
      [pk, ...f(d.totalPaise, 0)], ['SALE', ...f(0, x)], ['SALE_CHG', ...f(0, xc)],
      ['OUT_CGST', ...f(0, c)], ['OUT_SGST', ...f(0, s)], ['OUT_IGST', ...f(0, i)],
      ['ROUNDOFF', ...(r > 0 ? f(0, r) : f(-r, 0))]);
    for (const p of d.initialPays) { // receipts on a sale / refunds on a credit note
      const [adr, acr] = isSale ? [p.amountPaise, 0] : [0, p.amountPaise];
      post(d.date, [resolve(p.mode), adr, acr], [pk, acr, adr]);
    }
    for (const p of d.laterPayments) post(p.at, [resolve(p.mode), p.amountPaise, 0], [pk, 0, p.amountPaise]);
  }

  // ── purchases and debit notes ──
  for (const p of b.purchases) {
    if (p.cancelled) continue;
    const pk = party(p.supplierId, p.supplierName);
    const x = sum(p.lines, l => l.taxable), c = sum(p.lines, l => l.cgst), s = sum(p.lines, l => l.sgst), i = sum(p.lines, l => l.igst);
    const tax = c + s + i, eligible = p.itc === 'ELIGIBLE';
    const r = p.totalPaise - (x + (p.reverseCharge ? 0 : tax));
    const f = (dr: number, cr: number): [number, number] => p.isDebitNote ? [cr, dr] : [dr, cr];
    post(p.date,
      ['PURCHASE', ...f(eligible ? x : x + tax, 0)],
      ['IN_CGST', ...f(eligible ? c : 0, 0)], ['IN_SGST', ...f(eligible ? s : 0, 0)], ['IN_IGST', ...f(eligible ? i : 0, 0)],
      [pk, ...f(0, p.totalPaise)],
      ['ROUNDOFF', ...(r > 0 ? f(r, 0) : f(0, -r))]);
    if (p.reverseCharge) post(p.date, ['OUT_CGST', ...f(0, c)], ['OUT_SGST', ...f(0, s)], ['OUT_IGST', ...f(0, i)]);
    if (p.paidPaise) {
      const acct = resolve(p.paymentMode === 'cheque' ? 'bank' : p.paymentMode);
      post(p.date, p.isDebitNote ? [acct, p.paidPaise, 0] : [pk, p.paidPaise, 0], p.isDebitNote ? [pk, 0, p.paidPaise] : [acct, 0, p.paidPaise]);
    }
  }

  // ── standalone payments ──
  for (const p of b.payments) {
    if (p.status === 'BOUNCED') continue;
    const pk = party(p.partyId, p.partyName);
    const total = p.amountPaise + p.discountPaise;
    if (p.type === 'IN') {
      if (p.mode === 'cheque') {
        post(p.date, ['UNDEP_CHQ', p.amountPaise, 0]);
        if (p.status === 'CLEARED') post(p.clearedOn ?? p.date, ['UNDEP_CHQ', 0, p.amountPaise], [resolve('bank', p.accountId), p.amountPaise, 0]);
      } else post(p.date, [resolve(p.mode, p.accountId), p.amountPaise, 0]);
      post(p.date, ['PAYIN_DISC', p.discountPaise, 0], [pk, 0, total]);
    } else {
      post(p.date, [resolve(p.mode === 'cheque' ? 'bank' : p.mode, p.accountId), 0, p.amountPaise], ['PAYOUT_DISC', 0, p.discountPaise], [pk, total, 0]);
    }
  }

  // ── expenses / other income ──
  for (const e of b.expenses) {
    const acct = resolve(e.mode === 'cheque' ? 'bank' : e.mode, e.accountId);
    if (e.isIncome) post(e.date, [acct, e.amountPaise, 0], ['INC:' + e.category, 0, e.amountPaise]);
    else post(e.date, [(e.direct ? 'DEXP:' : 'IEXP:') + e.category, e.amountPaise, 0], [acct, 0, e.amountPaise]);
  }

  const postings = all.filter(p => p.date < before);
  return { postings, names, kinds, openingStockPaise: openingStock };
}

/** Closing stock appears twice: as an asset and as a credit in the trading account. */
export function withClosingStock(b: Books, l: Ledger, before: Date): Posting[] {
  const v = totalStockValue(groupByProduct(b.moves), before, fallbackCostOf(b));
  return [...l.postings, { acct: 'STOCK', dr: v, cr: 0, date: before }, { acct: 'CLOSING_STOCK_TR', dr: 0, cr: v, date: before }];
}

export const balances = (ps: Posting[]) => {
  const m = new Map<string, number>();
  for (const p of ps) m.set(p.acct, (m.get(p.acct) ?? 0) + p.dr - p.cr);
  return m;
};

const isPnl = (a: string) => /^(SALE|SALE_CHG|ROUNDOFF|PAYOUT_DISC|CLOSING_STOCK_TR|PURCHASE|PAYIN_DISC|OPENING_STOCK)$|^(INC|DEXP|IEXP):/.test(a);
/** Cumulative net income since the books opened up to `before` (credit minus debit on all P&L accounts). */
export function netIncomeTo(b: Books, before: Date): number {
  const bal = balances(withClosingStock(b, buildLedger(b, before), before));
  let ni = 0; for (const [a, v] of bal) if (isPnl(a)) ni -= v;
  return ni;
}

// ── Profit & Loss (spec formulas) ──
export function computePnl(b: Books, from: Date, to: Date) {
  const docs = b.docs.filter(d => !d.cancelled && inRange(d.date, from, to));
  const sales = docs.filter(d => d.docType === 'SALE'), cns = docs.filter(d => d.docType === 'CREDIT_NOTE');
  const pur = b.purchases.filter(p => !p.cancelled && inRange(p.date, from, to));
  const bills = pur.filter(p => !p.isDebitNote), dns = pur.filter(p => p.isDebitNote);
  const outTax = (ds: RDoc[]) => sum(ds, d => sum(d.lines, l => l.cgst + l.sgst + l.igst + l.cess));
  const inTax = (ps: typeof pur) => sum(ps, p => (p.itc === 'ELIGIBLE' ? sum(p.lines, l => l.cgst + l.sgst + l.igst) : 0));
  const rcmTax = (ps: typeof pur) => sum(ps, p => (p.reverseCharge ? sum(p.lines, l => l.cgst + l.sgst + l.igst) : 0));

  const pays = b.payments.filter(p => p.status !== 'BOUNCED' && inRange(p.date, from, to));
  const exp = b.expenses.filter(e => inRange(e.date, from, to));
  const indirect = new Map<string, number>();
  for (const e of exp.filter(e => !e.direct && !e.isIncome)) {
    const k = /loan interest/i.test(e.category) ? 'Loan Interest Expense' : /processing fee/i.test(e.category) ? 'Loan Processing Fee Expense' : /loan charge/i.test(e.category) ? 'Loan Charges Expense' : 'Other Expense';
    indirect.set(k, (indirect.get(k) ?? 0) + e.amountPaise);
  }
  const groups = groupByProduct(b.moves), fb = fallbackCostOf(b);
  const v = {
    sale: sum(sales, d => d.totalPaise), creditNote: sum(cns, d => d.totalPaise),
    purchase: sum(bills, p => p.totalPaise), debitNote: sum(dns, p => p.totalPaise),
    directExpenses: sum(exp.filter(e => e.direct && !e.isIncome), e => e.amountPaise),
    paymentInDiscount: sum(pays.filter(p => p.type === 'IN'), p => p.discountPaise),
    paymentOutDiscount: sum(pays.filter(p => p.type === 'OUT'), p => p.discountPaise),
    gstPayable: outTax(sales) - outTax(cns) + rcmTax(bills) - rcmTax(dns),
    gstReceivable: inTax(bills) - inTax(dns),
    // OPENING entries are dated on the period's first instant, so include moves up to and including `from`
    openingStock: totalStockValue(groups, new Date(from.getTime() + 1), fb), closingStock: totalStockValue(groups, to, fb),
    otherIncome: sum(exp.filter(e => e.isIncome), e => e.amountPaise),
    roundOff: sum(sales, d => d.totalPaise - sum(d.lines, l => l.amount)) - sum(cns, d => d.totalPaise - sum(d.lines, l => l.amount)),
  };
  const indirectTotal = sum([...indirect.values()], x => x);
  const grossProfit = v.sale - v.creditNote - v.purchase + v.debitNote - v.directExpenses - v.paymentInDiscount + v.paymentOutDiscount
    - v.gstPayable + v.gstReceivable - v.openingStock + v.closingStock;
  const netProfit = grossProfit + v.otherIncome - indirectTotal;
  return { ...v, indirect: Object.fromEntries(indirect), indirectTotal, grossProfit, netProfit };
}

export type { StockMove };
export { collectMoves, valueStock };
