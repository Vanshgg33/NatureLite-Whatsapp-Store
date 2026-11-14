import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillingBill, BillingBillDocument } from './schemas/billing-bill.schema';
import { BillingPurchase, BillingStockEntry } from './schemas/books.schemas';
import { toRDoc } from './reports/docs';
import { toPDoc } from './reports/books';
import { collectMoves, movesForLocation, productOfKey, StockLocation, StockMove, STOCK_LOCATIONS, stockKey, valueStock } from './reports/stock';

const FAR_FUTURE = new Date(8.64e15);
const LABEL: Record<StockLocation, string> = { godown: 'Godown', store: 'Store' };

/**
 * Per-location stock for the bill screen and transfers. It reads the SAME move list and FIFO valuation the reports use
 * (collectMoves + valueStock), so a bill, a report and a transfer can never disagree.
 * shortcut: reads every bill/purchase that touched the requested products, indexed by items.productId; cache or keep a
 * running balance if search over many years of bills gets slow.
 */
@Injectable()
export class BillingStockService {
  constructor(
    @InjectModel(BillingBill.name) private readonly billModel: Model<BillingBillDocument>,
    @InjectModel(BillingPurchase.name) private readonly purchaseModel: Model<BillingPurchase>,
    @InjectModel(BillingStockEntry.name) private readonly entryModel: Model<BillingStockEntry>,
  ) {}

  /** keys are stock keys: "<productId>" or "<productId>#<variantSku>" (see stockKey). */
  private async movesFor(keys: string[]): Promise<Map<string, StockMove[]>> {
    const productIds = [...new Set(keys.map(productOfKey))];
    const oids = productIds.filter(Types.ObjectId.isValid).map(id => new Types.ObjectId(id));
    const [bills, purchases, entries] = await Promise.all([
      this.billModel.find({ 'items.productId': { $in: oids } }).setOptions({ allDocTypes: true }).select('items.productId items.variantSku items.qty items.name invoiceDate createdAt docType status stockLocation').lean(),
      this.purchaseModel.find({ 'items.productId': { $in: [...productIds, ...oids] } }).lean(),
      this.entryModel.find({ productId: { $in: productIds } }).lean(),
    ]);
    const wanted = new Set(keys);
    const all = collectMoves(
      bills.map((b: any) => toRDoc(b)),
      purchases.map(toPDoc),
      entries.map((e: any) => ({ productId: stockKey(e.productId, e.variantSku), date: new Date(e.date), kind: e.kind, qty: e.qty, unitCostPaise: e.unitCostPaise, location: e.location })),
    ).filter(m => wanted.has(m.productId));
    const out = new Map<string, StockMove[]>();
    for (const m of all) { const a = out.get(m.productId) ?? []; a.push(m); out.set(m.productId, a); }
    return out;
  }

  /** { [stockKey]: { godown, store } } on-hand quantity now. */
  async availability(productIds: string[]): Promise<Record<string, Record<StockLocation, number>>> {
    const moves = await this.movesFor(productIds);
    const res: Record<string, Record<StockLocation, number>> = {};
    for (const id of productIds) {
      const mv = moves.get(id) ?? [];
      res[id] = { godown: valueStock(movesForLocation(mv, 'godown'), FAR_FUTURE).qty, store: valueStock(movesForLocation(mv, 'store'), FAR_FUTURE).qty };
    }
    return res;
  }

  /** Blocks a sale that would take a location below zero, unless a role-approved override with a reason is given. */
  async assertAvailable(items: Array<{ productId: string; variantSku?: string; name: string; qty: number }>, location: StockLocation, override?: { reason?: string; allowed: boolean }) {
    // escape hatch for a deployment that has not entered opening stock yet
    if (process.env.BILLING_ALLOW_NEGATIVE_STOCK === 'true') return { overridden: false as const, short: [] as string[] };
    const need = new Map<string, { name: string; qty: number }>();
    for (const i of items) { const k = stockKey(i.productId, i.variantSku); const n = need.get(k); need.set(k, { name: i.name, qty: (n?.qty ?? 0) + i.qty }); }
    const have = await this.availability([...need.keys()]);
    const short = [...need.entries()]
      .filter(([id, n]) => (have[id]?.[location] ?? 0) < n.qty)
      .map(([id, n]) => `${n.name}: need ${n.qty}, ${LABEL[location]} has ${have[id]?.[location] ?? 0}`);
    if (!short.length) return { overridden: false as const, short: [] as string[] };
    if (override?.allowed && override.reason?.trim()) return { overridden: true as const, short };
    throw new BadRequestException(`Not enough stock in ${LABEL[location]}: ${short.join('; ')}`);
  }

  /** Godown <-> Store: two linked entries. Not a sale or a purchase; moves cost with the stock so total value is unchanged. */
  async transfer(d: { productId: string; variantSku?: string; name: string; qty: number; from: StockLocation; to: StockLocation; date?: string; note?: string }) {
    if (!STOCK_LOCATIONS.includes(d.from) || !STOCK_LOCATIONS.includes(d.to) || d.from === d.to) throw new BadRequestException('Pick two different locations: godown and store');
    if (!(d.qty > 0)) throw new BadRequestException('Quantity must be positive');
    const key = stockKey(d.productId, d.variantSku);
    const moves = (await this.movesFor([key])).get(key) ?? [];
    const src = valueStock(movesForLocation(moves, d.from), FAR_FUTURE);
    if (src.qty < d.qty) throw new BadRequestException(`${LABEL[d.from]} has only ${src.qty} of ${d.name}`);
    const date = d.date ? new Date(d.date) : new Date();
    const transferId = new Types.ObjectId().toString();
    const unitCostPaise = src.costPaise;
    const base = { productId: d.productId, variantSku: d.variantSku || undefined, name: d.name, date, note: d.note, transferId };
    await this.entryModel.insertMany([
      { ...base, kind: 'TRANSFER_OUT', qty: -d.qty, location: d.from, unitCostPaise },
      { ...base, kind: 'TRANSFER_IN', qty: d.qty, location: d.to, unitCostPaise },
    ]);
    return { ok: true, transferId };
  }
}
