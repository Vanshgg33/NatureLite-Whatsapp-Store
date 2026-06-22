import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { StoreStock, StoreStockDocument } from '../schemas/store-stock.schema';
import { BaseRepository } from '../../../common/repository/base.repository';
import { StockQueryDto } from '../dto/store-stock.dto';
import { PaginatedResult, paginate } from '../../../common/types/pagination.types';
import { buildSearchOrFilter } from '../../../common/utils/query.util';
import { parseObjectId, isValidObjectIdString } from '../../../common/utils/objectid.util';
import { PipelineStage } from 'mongoose';

@Injectable()
export class StoreStockRepository extends BaseRepository<StoreStockDocument> {
  constructor(
    @InjectModel(StoreStock.name) model: Model<StoreStockDocument>,
  ) {
    super(model);
  }

  async getStockByStore(storeId: string, query: StockQueryDto): Promise<PaginatedResult<unknown>> {
    const { page = 1, limit = 20, search, category, lowStockOnly, inStockOnly } = query;
    const skip = (page - 1) * limit;
    const storeObjId = parseObjectId(storeId, 'storeId');

    const pipeline: PipelineStage[] = [
      { $match: { store: storeObjId } },
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: '$productInfo' },
      { $match: { 'productInfo.isActive': true } },
    ];

    const searchOr = buildSearchOrFilter(search, ['productInfo.name', 'productInfo.sku']);
    if (searchOr.length) {
      pipeline.push({ $match: { $or: searchOr } });
    }
    if (isValidObjectIdString(category)) {
      pipeline.push({
        $match: { 'productInfo.category': parseObjectId(category, 'category') },
      });
    }
    pipeline.push({
      $addFields: {
        totalStock: {
          $add: ['$stock', { $ifNull: [{ $sum: '$variantStocks.stock' }, 0] }],
        },
      },
    });
    if (lowStockOnly) {
      pipeline.push({
        $match: { $expr: { $lte: ['$totalStock', '$lowStockThreshold'] } },
      });
    }
    if (inStockOnly) {
      pipeline.push({
        $match: {
          $or: [
            { stock: { $gt: 0 } },
            { 'variantStocks.stock': { $gt: 0 } },
          ],
        },
      });
    }

    pipeline.push({
      $facet: {
        data: [
          { $sort: { 'productInfo.name': 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'categories',
              localField: 'productInfo.category',
              foreignField: '_id',
              as: 'categoryInfo',
            },
          },
          { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              store: 1,
              product: 1,
              stock: 1,
              variantStocks: 1,
              lowStockThreshold: 1,
              createdAt: 1,
              updatedAt: 1,
              productName: '$productInfo.name',
              productSku: '$productInfo.sku',
              productPrice: '$productInfo.price',
              productImages: '$productInfo.images',
              productVariants: '$productInfo.variants',
              categoryName: '$categoryInfo.name',
            },
          },
        ],
        count: [{ $count: 'total' }],
      },
    });

    const [result] = await this.model.aggregate(pipeline).exec();
    const total = result?.count?.[0]?.total ?? 0;
    const data = result?.data ?? [];
    return paginate(data, total, { page, limit });
  }

  async findForProduct(productId: string): Promise<StoreStockDocument[]> {
    const productObjId = parseObjectId(productId, 'productId');
    return this.model.find({ product: productObjId }).populate('store', 'name code').exec();
  }

  /**
   * Sum stock across every store for the given products. Returns aggregated
   * main stock and per-variant-SKU stock keyed by productId. Used by the
   * Products list to display StoreStock as the single source of truth.
   */
  async aggregateStockByProducts(
    productIds: Types.ObjectId[],
  ): Promise<
    Map<string, { stock: number; variantStocks: Map<string, number> }>
  > {
    const out = new Map<string, { stock: number; variantStocks: Map<string, number> }>();
    if (productIds.length === 0) return out;

    const rows = await this.model
      .find({ product: { $in: productIds } })
      .select('product stock variantStocks')
      .lean()
      .exec();

    for (const row of rows as Array<{
      product: Types.ObjectId;
      stock?: number;
      variantStocks?: Array<{ variantSku: string; stock: number }>;
    }>) {
      const key = row.product.toString();
      let agg = out.get(key);
      if (!agg) {
        agg = { stock: 0, variantStocks: new Map<string, number>() };
        out.set(key, agg);
      }
      agg.stock += row.stock ?? 0;
      for (const v of row.variantStocks ?? []) {
        if (!v?.variantSku) continue;
        agg.variantStocks.set(
          v.variantSku,
          (agg.variantStocks.get(v.variantSku) ?? 0) + (v.stock ?? 0),
        );
      }
    }
    return out;
  }

  async findOneByStoreAndProduct(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
  ): Promise<StoreStockDocument | null> {
    return this.model.findOne({ store: storeId, product: productId }).exec();
  }

  /** Batch lookup: all StoreStock rows for the given productIds at a single store. */
  async findByStoreAndProducts(
    storeId: Types.ObjectId,
    productIds: Types.ObjectId[],
  ): Promise<StoreStockDocument[]> {
    if (!productIds.length) return [];
    return this.model
      .find({ store: storeId, product: { $in: productIds } })
      .exec();
  }

  async applyStockDeltas(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
    deltas: {
      stockInDelta: number;
      returnedDelta: number;
      damagedDelta: number;
      saleLogDelta: number;
      netDelta: number;
      lowStockThreshold?: number;
    },
  ): Promise<StoreStockDocument> {
    const inc: Record<string, number> = {
      stock: deltas.netDelta,
      stockIn: deltas.stockInDelta,
      returned: deltas.returnedDelta,
      damaged: deltas.damagedDelta,
      saleLog: deltas.saleLogDelta,
    };
    const set: Record<string, unknown> = {};
    if (deltas.lowStockThreshold !== undefined) {
      set.lowStockThreshold = deltas.lowStockThreshold;
    }
    const update: Record<string, unknown> = { $inc: inc };
    if (Object.keys(set).length > 0) update.$set = set;

    const doc = await this.model.findOneAndUpdate(
      { store: storeId, product: productId },
      { ...update, $setOnInsert: { store: storeId, product: productId } },
      { new: true, upsert: true },
    ).exec();

    // Clamp stock to 0 if it went negative (e.g. saleLogDelta exceeded available stock)
    if (doc!.stock < 0) {
      return (await this.model.findOneAndUpdate(
        { store: storeId, product: productId, stock: { $lt: 0 } },
        { $set: { stock: 0 } },
        { new: true },
      ).exec())!;
    }

    return doc!;
  }

  async applyVariantStockDeltas(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
    variantSku: string,
    deltas: {
      stockInDelta: number;
      returnedDelta: number;
      damagedDelta: number;
      saleLogDelta: number;
      netDelta: number;
      lowStockThreshold?: number;
    },
  ): Promise<StoreStockDocument> {
    let doc = await this.model.findOne({ store: storeId, product: productId }).exec();
    if (!doc) {
      doc = await this.model.create({
        store: storeId,
        product: productId,
        stock: 0,
        stockIn: 0,
        returned: 0,
        damaged: 0,
        saleLog: 0,
        variantStocks: [{ variantSku, stock: 0 }],
        lowStockThreshold: deltas.lowStockThreshold ?? 5,
      });
    }

    const variantIdx = doc.variantStocks.findIndex((v) => v.variantSku === variantSku);
    if (variantIdx >= 0) {
      doc.variantStocks[variantIdx].stock = Math.max(0, (doc.variantStocks[variantIdx].stock ?? 0) + deltas.netDelta);
    } else {
      doc.variantStocks.push({ variantSku, stock: Math.max(0, deltas.netDelta) });
    }
    doc.stockIn = (doc.stockIn ?? 0) + deltas.stockInDelta;
    doc.returned = (doc.returned ?? 0) + deltas.returnedDelta;
    doc.damaged = (doc.damaged ?? 0) + deltas.damagedDelta;
    doc.saleLog = (doc.saleLog ?? 0) + deltas.saleLogDelta;
    if (deltas.lowStockThreshold !== undefined) {
      doc.lowStockThreshold = deltas.lowStockThreshold;
    }
    await doc.save();
    return doc;
  }

  async setStockMain(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
    update: Record<string, unknown>,
  ): Promise<StoreStockDocument> {
    const doc = await this.model.findOneAndUpdate(
      { store: storeId, product: productId },
      { $set: update, $setOnInsert: { store: storeId, product: productId } },
      { new: true, upsert: true },
    ).exec();
    return doc!;
  }

  async decrementVariant(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
    variantSku: string,
    quantity: number,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateOne(
      {
        store: storeId,
        product: productId,
        'variantStocks.variantSku': variantSku,
        'variantStocks.stock': { $gte: quantity },
      },
      { $inc: { 'variantStocks.$.stock': -quantity } },
      { session },
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }

  async decrementMain(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
    quantity: number,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateOne(
      { store: storeId, product: productId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { session },
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }

  async incrementVariant(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
    variantSku: string,
    quantity: number,
  ): Promise<void> {
    await this.model.updateOne(
      { store: storeId, product: productId, 'variantStocks.variantSku': variantSku },
      { $inc: { 'variantStocks.$.stock': quantity } },
    ).exec();
  }

  async incrementMain(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
    quantity: number,
  ): Promise<void> {
    await this.model.updateOne(
      { store: storeId, product: productId },
      { $inc: { stock: quantity } },
      { upsert: true },
    ).exec();
  }

  async bulkSetStock(
    storeId: Types.ObjectId,
    items: Array<{ productId: Types.ObjectId; stock: number }>,
  ): Promise<void> {
    const ops = items.map((item) => ({
      updateOne: {
        filter: { store: storeId, product: item.productId },
        update: {
          $set: { stock: item.stock },
          $setOnInsert: { store: storeId, product: item.productId },
        },
        upsert: true,
      },
    }));
    await this.model.bulkWrite(ops);
  }

  async getStockSummaryByStore(storeId: Types.ObjectId): Promise<{
    total: number;
    lowStock: number;
    outOfStock: number;
    healthyStock: number;
  }> {
    const result = await this.model
      .aggregate([
        { $match: { store: storeId } },
        {
          $addFields: {
            totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variantStocks.stock' }, 0] }] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            outOfStock: { $sum: { $cond: [{ $lte: ['$totalStock', 0] }, 1, 0] } },
            lowStock: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: ['$totalStock', 0] }, { $lte: ['$totalStock', '$lowStockThreshold'] }] },
                  1,
                  0,
                ],
              },
            },
            healthyStock: { $sum: { $cond: [{ $gt: ['$totalStock', '$lowStockThreshold'] }, 1, 0] } },
          },
        },
      ])
      .exec();
    const r = result[0];
    return r
      ? { total: r.total, lowStock: r.lowStock, outOfStock: r.outOfStock, healthyStock: r.healthyStock }
      : { total: 0, lowStock: 0, outOfStock: 0, healthyStock: 0 };
  }

  async countLowStockByStore(storeId: Types.ObjectId): Promise<number> {
    const result = await this.model
      .aggregate([
        { $match: { store: storeId } },
        {
          $addFields: {
            totalStock: {
              $add: ['$stock', { $ifNull: [{ $sum: '$variantStocks.stock' }, 0] }],
            },
          },
        },
        {
          $match: {
            $and: [
              { $expr: { $lte: ['$totalStock', '$lowStockThreshold'] } },
              { $expr: { $gt: ['$totalStock', 0] } },
            ],
          },
        },
        { $count: 'n' },
      ])
      .exec();
    return result[0]?.n ?? 0;
  }

  async findLowStockByStore(storeId: Types.ObjectId): Promise<StoreStockDocument[]> {
    const docs = await this.model
      .aggregate([
        { $match: { store: storeId } },
        {
          $addFields: {
            totalStock: {
              $add: ['$stock', { $ifNull: [{ $sum: '$variantStocks.stock' }, 0] }],
            },
          },
        },
        { $match: { $expr: { $lte: ['$totalStock', '$lowStockThreshold'] } } },
        { $limit: 10 },
        { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'productInfo' } },
        { $unwind: '$productInfo' },
        { $addFields: { product: '$productInfo' } },
        { $project: { productInfo: 0 } },
      ])
      .exec();
    return this.model.populate(docs as StoreStockDocument[], { path: 'product', select: 'name sku images price' });
  }

  async deleteAllByProductId(productId: Types.ObjectId): Promise<void> {
    await this.model.deleteMany({ product: productId }).exec();
  }

  async initializeStockForProduct(
    productId: Types.ObjectId,
    storeIds: Types.ObjectId[],
    mainStoreSeed?: {
      storeId: Types.ObjectId;
      stock: number;
      variantStocks?: Array<{ variantSku: string; stock: number }>;
    },
  ): Promise<void> {
    if (storeIds.length === 0) return;
    const ops = storeIds.map((storeId) => {
      const isMain = mainStoreSeed && storeId.equals(mainStoreSeed.storeId);
      return {
        updateOne: {
          filter: { store: storeId, product: productId },
          update: {
            $setOnInsert: {
              store: storeId,
              product: productId,
              stock: isMain ? mainStoreSeed!.stock : 0,
              variantStocks: isMain ? (mainStoreSeed!.variantStocks ?? []) : [],
              lowStockThreshold: 5,
            },
          },
          upsert: true,
        },
      };
    });
    await this.model.bulkWrite(ops);
  }
}
