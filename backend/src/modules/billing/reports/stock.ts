import { RDoc } from './docs';
import { PDoc } from './books';

export type MoveKind = 'OPENING' | 'PURCHASE' | 'ADJUST' | 'CN' | 'SALE' | 'DN';
export interface StockMove { productId: string; date: Date; qty: number; kind: MoveKind; unitCostPaise?: number }

const ORDER: Record<MoveKind, number> = { OPENING: 0, PURCHASE: 1, ADJUST: 2, CN: 3, SALE: 4, DN: 5 };

/**
 * Moving weighted-average valuation (single source of truth for P&L, Stock Summary, Trial Balance and Balance Sheet).
 * Only moves strictly before `before` count. Negative stock is valued at 0.
 */
export function valueStock(moves: StockMove[], before: Date, fallbackCostPaise = 0) {
  let qty = 0, avg = 0;
  const sorted = moves.filter(m => m.date < before).sort((a, b) => a.date.getTime() - b.date.getTime() || ORDER[a.kind] - ORDER[b.kind]);
  for (const m of sorted) {
    const inbound = (m.kind === 'OPENING' || m.kind === 'PURCHASE' || m.kind === 'ADJUST') && m.qty > 0;
    // stock added without a cost (e.g. opening quantity) is priced at the running average, else the product fallback,
    // so it is not counted as free when a later purchase re-averages the cost
    const cost = m.unitCostPaise ?? (avg > 0 ? avg : fallbackCostPaise);
    if (inbound && cost > 0) {
      avg = qty > 0 ? (qty * avg + m.qty * cost) / (qty + m.qty) : cost;
    }
    qty += m.qty;
  }
  const costPaise = avg > 0 ? avg : fallbackCostPaise;
  return { qty, costPaise, valuePaise: Math.round(Math.max(qty, 0) * costPaise) };
}

/** Derive every movement from documents (sales, credit notes, purchases, debit notes) plus manual entries. */
export function collectMoves(docs: RDoc[], purchases: PDoc[], manual: Array<{ productId: string; date: Date; kind: string; qty: number; unitCostPaise?: number }>): StockMove[] {
  const moves: StockMove[] = manual.map(m => ({ productId: m.productId, date: m.date, qty: m.qty, kind: m.kind as MoveKind, unitCostPaise: m.unitCostPaise }));
  for (const d of docs) {
    if (d.cancelled || d.docType === 'SALE_ORDER') continue;
    for (const l of d.lines) {
      if (!l.productId || l.isCharge || !l.qty) continue;
      moves.push({ productId: l.productId, date: d.date, qty: d.docType === 'SALE' ? -l.qty : l.qty, kind: d.docType === 'SALE' ? 'SALE' : 'CN' });
    }
  }
  for (const p of purchases) {
    if (p.cancelled) continue;
    for (const l of p.lines) {
      if (!l.productId || !l.qty) continue;
      if (p.isDebitNote) moves.push({ productId: l.productId, date: p.date, qty: -l.qty, kind: 'DN' });
      else {
        // cost = taxable value (+ GST that cannot be claimed back)
        const cost = l.taxable + (p.itc === 'ELIGIBLE' ? 0 : l.cgst + l.sgst + l.igst);
        moves.push({ productId: l.productId, date: p.date, qty: l.qty, kind: 'PURCHASE', unitCostPaise: cost / l.qty });
      }
    }
  }
  return moves;
}

export function groupByProduct(moves: StockMove[]): Map<string, StockMove[]> {
  const m = new Map<string, StockMove[]>();
  for (const x of moves) { const a = m.get(x.productId) ?? []; a.push(x); m.set(x.productId, a); }
  return m;
}

/** Total stock value across all products at `before`. */
export function totalStockValue(byProduct: Map<string, StockMove[]>, before: Date, fallbackCost: (productId: string) => number): number {
  let t = 0;
  for (const [pid, mv] of byProduct) t += valueStock(mv, before, fallbackCost(pid)).valuePaise;
  return t;
}
