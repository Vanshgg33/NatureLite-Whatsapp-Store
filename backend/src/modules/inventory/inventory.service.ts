import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection, ClientSession } from 'mongoose';
import { StoreStock, StoreStockDocument } from '../store-stock/schemas/store-stock.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Store, StoreDocument } from '../stores/schemas/store.schema';
import { StockMovement, StockMovementDocument, MovementType } from './schemas/stock-movement.schema';

export const MOVEMENT_SIGN: Record<string, 1 | -1> = {
  STOCK_IN: 1,
  RETURNED: 1,
  ORDER_CANCEL: 1,
  ORDER_RETURN: 1,
  BILL_VOID: 1,
  DAMAGED: -1,
  SALE_LOG: -1,
  ORDER_RESERVE: -1,
  BILL_SALE: -1,
};

export interface MoveLine {
  storeId: string;
  productId: string;
  variantId?: string | null;
  type: MovementType;
  qty: number;
  setTo?: number;
}

export class InsufficientStockError extends BadRequestException {
  constructor(
    public readonly lines: {
      productId: string;
      variantId?: string;
      name: string;
      available: number;
      requested: number;
    }[],
  ) {
    super({ code: 'INSUFFICIENT_STOCK', message: 'Insufficient stock', lines });
  }
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(StoreStock.name) private ss: Model<StoreStockDocument>,
    @InjectModel(Product.name) private products: Model<ProductDocument>,
    @InjectModel(StockMovement.name) private moves: Model<StockMovementDocument>,
    @InjectModel(Store.name) private stores: Model<StoreDocument>,
    @InjectConnection() private conn: Connection,
  ) {}

  /** Ensure a StoreStock row exists with an entry for every current variant. No-op if already present. */
  async ensureRow(storeId: string, productId: string, session?: ClientSession): Promise<void> {
    const p = await this.products
      .findById(productId, { variants: 1 })
      .lean()
      .session(session ?? null);
    if (!p) throw new NotFoundException('Product not found');

    await this.ss.updateOne(
      { store: storeId, product: productId },
      { $setOnInsert: { store: storeId, product: productId, stock: 0, variantStocks: [] } },
      { upsert: true, session },
    );

    for (const v of (p as any).variants ?? []) {
      await this.ss.updateOne(
        { store: storeId, product: productId, 'variantStocks.variantId': { $ne: v._id } },
        { $push: { variantStocks: { variantId: v._id, variantSku: v.sku, stock: 0 } } },
        { session },
      );
    }
  }

  /** Apply one or many movements atomically. Throws InsufficientStockError on under-stock. */
  async apply(
    lines: MoveLine[],
    ctx: {
      by?: string;
      refType?: string;
      refId?: string;
      note?: string;
      allowNegative?: boolean;
      session?: ClientSession;
    } = {},
  ): Promise<void> {
    const run = async (session: ClientSession) => {
      const failures: InsufficientStockError['lines'] = [];

      for (const l of lines) {
        await this.ensureRow(l.storeId, l.productId, session);
        const isSet = l.type === 'ADJUST_SET' || l.type === 'IMPORT_SET';
        const sign = MOVEMENT_SIGN[l.type] ?? 1;
        const delta = isSet ? 0 : sign * Math.abs(l.qty);
        const guard = !isSet && delta < 0 && !ctx.allowNegative;

        let before: number;
        let after: number;

        if (l.variantId) {
          const variantObjId = new Types.ObjectId(l.variantId);
          const filter: Record<string, unknown> = {
            store: l.storeId,
            product: l.productId,
            variantStocks: {
              $elemMatch: {
                variantId: variantObjId,
                ...(guard ? { stock: { $gte: -delta } } : {}),
              },
            },
          };
          const update = isSet
            ? { $set: { 'variantStocks.$[v].stock': Math.max(0, l.setTo!) }, $inc: { version: 1 } }
            : { $inc: { 'variantStocks.$[v].stock': delta, version: 1 } };

          const prev = await this.ss.findOneAndUpdate(filter, update, {
            arrayFilters: [{ 'v.variantId': variantObjId }],
            session,
            new: false,
            lean: true,
          });

          if (!prev) {
            failures.push(await this.describe(l, session));
            continue;
          }

          const prevV = (prev as any).variantStocks?.find(
            (v: any) => String(v.variantId) === String(l.variantId),
          );
          before = prevV?.stock ?? 0;
          after = isSet ? Math.max(0, l.setTo!) : before + delta;
        } else {
          const filter: Record<string, unknown> = {
            store: l.storeId,
            product: l.productId,
            ...(guard ? { stock: { $gte: -delta } } : {}),
          };
          const update = isSet
            ? { $set: { stock: Math.max(0, l.setTo!) }, $inc: { version: 1 } }
            : { $inc: { stock: delta, version: 1 } };

          const prev = await this.ss.findOneAndUpdate(filter, update, {
            session,
            new: false,
            lean: true,
          });

          if (!prev) {
            failures.push(await this.describe(l, session));
            continue;
          }

          before = (prev as any).stock ?? 0;
          after = isSet ? Math.max(0, l.setTo!) : before + delta;
        }

        await this.moves.create(
          [
            {
              store: l.storeId,
              product: l.productId,
              variantId: l.variantId ? new Types.ObjectId(l.variantId) : undefined,
              type: l.type,
              delta: after - before,
              before,
              after,
              by: ctx.by ? new Types.ObjectId(ctx.by) : undefined,
              refType: ctx.refType,
              refId: ctx.refId,
              note: ctx.note,
            },
          ],
          { session },
        );
      }

      if (failures.length) throw new InsufficientStockError(failures);

      await this.refreshProductCache(
        [...new Set(lines.map((l) => l.productId))],
        session,
      );
    };

    if (ctx.session) {
      await run(ctx.session);
    } else {
      await this.conn.transaction(run);
    }
  }

  /** Recompute product.stock / product.variants[].stock = Σ over all active stores. */
  async refreshProductCache(productIds: string[], session?: ClientSession): Promise<void> {
    if (!productIds.length) return;

    const activeStores = await this.stores
      .find({ isActive: true }, { _id: 1 })
      .lean()
      .session(session ?? null);
    const activeStoreIds = activeStores.map((s: any) => s._id);

    const rows = await this.ss
      .find({ product: { $in: productIds }, store: { $in: activeStoreIds } })
      .lean()
      .session(session ?? null);

    const ops: any[] = [];

    for (const pid of productIds) {
      const mine = rows.filter((r: any) => String(r.product) === String(pid));
      const p = await this.products
        .findById(pid, { variants: 1 })
        .lean()
        .session(session ?? null);
      if (!p) continue;

      const variants = (p as any).variants ?? [];

      if (variants.length) {
        const perVariant = new Map<string, number>();
        for (const r of mine) {
          for (const v of (r as any).variantStocks ?? []) {
            const key = String(v.variantId ?? v.variantSku);
            perVariant.set(key, (perVariant.get(key) ?? 0) + (v.stock ?? 0));
          }
        }
        const set: Record<string, number> = {
          stock: [...perVariant.values()].reduce((a, b) => a + b, 0),
        };
        variants.forEach((v: any, i: number) => {
          const key = String(v._id);
          set[`variants.${i}.stock`] = perVariant.get(key) ?? perVariant.get(v.sku) ?? 0;
        });
        ops.push({ updateOne: { filter: { _id: pid }, update: { $set: set } } });
      } else {
        const total = mine.reduce((a: number, r: any) => a + (r.stock ?? 0), 0);
        ops.push({ updateOne: { filter: { _id: pid }, update: { $set: { stock: total } } } });
      }
    }

    if (ops.length) await this.products.bulkWrite(ops, { session });
  }

  /** Available qty for one store — used by order picker, billing, website checkout. */
  async availability(
    storeId: string,
    productIds: string[],
  ): Promise<Map<string, { base: number; variants: Record<string, number> }>> {
    if (!productIds.length) return new Map();

    const rows = await this.ss
      .find({ store: storeId, product: { $in: productIds } }, { product: 1, stock: 1, variantStocks: 1 })
      .lean();

    const map = new Map<string, { base: number; variants: Record<string, number> }>();
    for (const r of rows as any[]) {
      const variants: Record<string, number> = {};
      for (const v of r.variantStocks ?? []) {
        if (v.variantId) variants[String(v.variantId)] = v.stock ?? 0;
        if (v.variantSku) variants[v.variantSku] = v.stock ?? 0;
      }
      map.set(String(r.product), { base: r.stock ?? 0, variants });
    }
    return map;
  }

  /** Resolve which store should fulfil an order based on city. Fallback = main store. */
  async resolveFulfilmentStore(city?: string): Promise<StoreDocument | null> {
    const c = (city ?? '').trim().toLowerCase();
    const stores = await this.stores.find({ isActive: true }).lean();
    return (
      stores.find((s: any) => (s.cities ?? []).some((x: string) => x.toLowerCase() === c)) ??
      stores.find((s: any) => s.isMainStore) ??
      (stores[0] as StoreDocument | undefined) ??
      null
    );
  }

  /** Get recent stock movements for a product at a store. */
  async getMovements(
    storeId: string,
    productId: string,
    limit = 50,
  ): Promise<StockMovement[]> {
    return this.moves
      .find({ store: storeId, product: productId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean() as Promise<StockMovement[]>;
  }

  private async describe(
    l: MoveLine,
    session?: ClientSession,
  ): Promise<InsufficientStockError['lines'][number]> {
    const p = await this.products
      .findById(l.productId, { name: 1, variants: 1 })
      .lean()
      .session(session ?? null);
    const row = await this.ss
      .findOne({ store: l.storeId, product: l.productId })
      .lean()
      .session(session ?? null);

    const v = l.variantId
      ? (p as any)?.variants?.find((x: any) => String(x._id) === String(l.variantId))
      : null;
    const available = l.variantId
      ? ((row as any)?.variantStocks?.find((x: any) => String(x.variantId) === String(l.variantId))?.stock ?? 0)
      : ((row as any)?.stock ?? 0);

    return {
      productId: l.productId,
      variantId: l.variantId ?? undefined,
      name: v ? `${(p as any)?.name} · ${v.name}` : (p as any)?.name ?? '?',
      available,
      requested: l.qty,
    };
  }
}
