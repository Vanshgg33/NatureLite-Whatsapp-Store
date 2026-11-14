import { RDoc } from './docs';
import { PDoc } from './books';

export type StockLocation = 'godown' | 'store';
export const STOCK_LOCATIONS: readonly StockLocation[] = ['godown', 'store'];
/**
 * A stock item is a product, or one variant of a product. The ledger keys every move by this string:
 * "<productId>" for a plain product, "<productId>#<variantSku>" for a variant (each variant has its own stock).
 */
export const stockKey = (productId: string, variantSku?: string | null) => (variantSku ? `${productId}#${variantSku}` : productId);
/** The product id inside a stock key. */
export const productOfKey = (key: string) => key.split('#')[0];
export type MoveKind = 'OPENING' | 'PURCHASE' | 'ADJUST' | 'CN' | 'SALE' | 'DN' | 'TRANSFER_OUT' | 'TRANSFER_IN';
export interface StockMove { productId: string; date: Date; qty: number; kind: MoveKind; unitCostPaise?: number; location?: StockLocation }

const ORDER: Record<MoveKind, number> = { OPENING: 0, PURCHASE: 1, TRANSFER_IN: 1, ADJUST: 2, CN: 3, SALE: 4, TRANSFER_OUT: 4, DN: 5 };

/**
 * FIFO valuation (single source of truth for P&L, Stock Summary, Trial Balance and Balance Sheet).
 * Sales, debit notes and transfers-out consume the oldest layer first. Only moves strictly before `before` count.
 * Negative stock is valued at 0 and is repaid by the next receipts before they form a new layer.
 * shortcut: a credit-note return comes back at the cost of the latest issue, not the exact original layer; upgrade if returns need layer tracing.
 */
export function valueStock(moves: StockMove[], before: Date, fallbackCostPaise = 0) {
  const sorted = moves.filter(m => m.date < before).sort((a, b) => a.date.getTime() - b.date.getTime() || ORDER[a.kind] - ORDER[b.kind]);
  const layers: Array<{ qty: number; cost: number }> = [];
  let short = 0;
  let lastIssueCost = fallbackCostPaise;
  for (const m of sorted) {
    if (m.qty > 0) {
      // uncosted stock is priced like the newest layer, else the product fallback, so it is never counted as free
      const lastLayer = layers.length ? layers[layers.length - 1].cost : fallbackCostPaise;
      const cost = m.unitCostPaise ?? (m.kind === 'CN' ? lastIssueCost : lastLayer);
      const repay = Math.min(short, m.qty);
      short -= repay;
      if (m.qty - repay > 0) layers.push({ qty: m.qty - repay, cost });
    } else if (m.qty < 0) {
      let need = -m.qty;
      while (need > 0 && layers.length) {
        const L = layers[0];
        const take = Math.min(need, L.qty);
        lastIssueCost = L.cost;
        L.qty -= take; need -= take;
        if (L.qty <= 0) layers.shift();
      }
      short += need;
    }
  }
  const onHand = layers.reduce((s, l) => s + l.qty, 0);
  const value = layers.reduce((s, l) => s + l.qty * l.cost, 0);
  return {
    qty: onHand - short,
    costPaise: onHand > 0 ? value / onHand : fallbackCostPaise,
    valuePaise: Math.round(value),
  };
}

/** Moves for one view: a location, or everything (transfers net to zero company-wide, so they are left out). */
export function movesForLocation(moves: StockMove[], location?: StockLocation | 'all'): StockMove[] {
  if (!location || location === 'all') return moves.filter(m => m.kind !== 'TRANSFER_IN' && m.kind !== 'TRANSFER_OUT');
  return moves.filter(m => (m.location ?? 'godown') === location);
}

/** Derive every movement from documents (sales, credit notes, purchases, debit notes) plus manual entries. */
export function collectMoves(docs: RDoc[], purchases: PDoc[], manual: Array<{ productId: string; date: Date; kind: string; qty: number; unitCostPaise?: number; location?: StockLocation }>): StockMove[] {
  const moves: StockMove[] = manual.map(m => ({ productId: m.productId, date: m.date, qty: m.qty, kind: m.kind as MoveKind, unitCostPaise: m.unitCostPaise, location: m.location ?? 'godown' }));
  for (const d of docs) {
    if (d.cancelled || d.docType === 'SALE_ORDER') continue;
    for (const l of d.lines) {
      if (!l.productId || l.isCharge || !l.qty) continue;
      moves.push({ productId: l.productId, date: d.date, qty: d.docType === 'SALE' ? -l.qty : l.qty, kind: d.docType === 'SALE' ? 'SALE' : 'CN', location: d.location ?? 'godown' });
    }
  }
  for (const p of purchases) {
    if (p.cancelled) continue;
    for (const l of p.lines) {
      if (!l.productId || !l.qty) continue;
      // purchases are received into the godown; move stock to the store with a transfer
      if (p.isDebitNote) moves.push({ productId: l.productId, date: p.date, qty: -l.qty, kind: 'DN', location: 'godown' });
      else {
        // cost = taxable value (+ GST that cannot be claimed back)
        const cost = l.taxable + (p.itc === 'ELIGIBLE' ? 0 : l.cgst + l.sgst + l.igst);
        moves.push({ productId: l.productId, date: p.date, qty: l.qty, kind: 'PURCHASE', unitCostPaise: cost / l.qty, location: 'godown' });
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
