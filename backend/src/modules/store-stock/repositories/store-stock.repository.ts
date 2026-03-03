import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StoreStock, StoreStockDocument } from '../schemas/store-stock.schema';
import { BaseRepository } from '@/common/repository/base.repository';
import { StockQueryDto } from '../dto/store-stock.dto';
import { PaginatedResult, paginate } from '@/common/types/pagination.types';
import { buildSearchOrFilter } from '@/common/utils/query.util';
import { parseObjectId, isValidObjectIdString } from '@/common/utils/objectid.util';
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

    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await this.model.aggregate(countPipeline).exec();
    const total = countResult[0]?.total ?? 0;

    pipeline.push(
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
    );

    const data = await this.model.aggregate(pipeline).exec();
    return paginate(data, total, { page, limit });
  }

  async findForProduct(productId: string): Promise<StoreStockDocument[]> {
    const productObjId = parseObjectId(productId, 'productId');
    return this.model.find({ product: productObjId }).populate('store', 'name code').exec();
  }

  async findOneByStoreAndProduct(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
  ): Promise<StoreStockDocument | null> {
    return this.model.findOne({ store: storeId, product: productId }).exec();
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
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateOne(
      {
        store: storeId,
        product: productId,
        'variantStocks.variantSku': variantSku,
        'variantStocks.stock': { $gte: quantity },
      },
      { $inc: { 'variantStocks.$.stock': -quantity } },
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }

  async decrementMain(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
    quantity: number,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateOne(
      { store: storeId, product: productId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
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

  async initializeStockForProduct(
    productId: Types.ObjectId,
    storeIds: Types.ObjectId[],
  ): Promise<void> {
    const ops = storeIds.map((storeId) => ({
      updateOne: {
        filter: { store: storeId, product: productId },
        update: {
          $setOnInsert: {
            store: storeId,
            product: productId,
            stock: 0,
            variantStocks: [],
            lowStockThreshold: 5,
          },
        },
        upsert: true,
      },
    }));
    await this.model.bulkWrite(ops);
  }
}
