import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StockSnapshot, StockSnapshotDocument } from '../schemas/stock-snapshot.schema';

@Injectable()
export class StockSnapshotRepository {
  constructor(
    @InjectModel(StockSnapshot.name) private readonly model: Model<StockSnapshotDocument>,
  ) {}

  async upsertSnapshot(
    storeId: Types.ObjectId,
    productId: Types.ObjectId,
    date: string,
    deltas: {
      stockInDelta: number;
      returnedDelta: number;
      damagedDelta: number;
      saleLogDelta: number;
    },
    totalStock: number,
    entryMeta?: {
      loggedBy?: Types.ObjectId;
      loggedByName?: string;
      variantSku?: string;
    },
  ): Promise<void> {
    await this.model.findOneAndUpdate(
      { store: storeId, product: productId, date },
      {
        $inc: {
          stockInDelta: deltas.stockInDelta,
          returnedDelta: deltas.returnedDelta,
          damagedDelta: deltas.damagedDelta,
          saleLogDelta: deltas.saleLogDelta,
        },
        $set: { totalStock },
        $push: {
          entries: {
            loggedAt: new Date(),
            loggedBy: entryMeta?.loggedBy,
            loggedByName: entryMeta?.loggedByName,
            variantSku: entryMeta?.variantSku,
            stockInDelta: deltas.stockInDelta,
            returnedDelta: deltas.returnedDelta,
            damagedDelta: deltas.damagedDelta,
            saleLogDelta: deltas.saleLogDelta,
            resultingStock: totalStock,
          },
        },
        $setOnInsert: { store: storeId, product: productId, date },
      },
      { upsert: true },
    ).exec();
  }

  async getSnapshotsByStoreAndDate(
    storeId: Types.ObjectId,
    date: string,
  ): Promise<unknown[]> {
    return this.model.aggregate([
      { $match: { store: storeId, date } },
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      { $sort: { 'productInfo.name': 1 } },
      {
        $project: {
          _id: 1,
          date: 1,
          stockInDelta: 1,
          returnedDelta: 1,
          damagedDelta: 1,
          saleLogDelta: 1,
          totalStock: 1,
          entries: 1,
          entryCount: { $size: { $ifNull: ['$entries', []] } },
          productName: '$productInfo.name',
          productSku: '$productInfo.sku',
        },
      },
    ]).exec();
  }

  async getAvailableDates(storeId: Types.ObjectId): Promise<string[]> {
    const results = await this.model
      .distinct('date', { store: storeId })
      .exec();
    return (results as string[]).sort().reverse();
  }

  async updateSnapshot(
    snapshotId: Types.ObjectId,
    data: Partial<Pick<StockSnapshot, 'stockInDelta' | 'returnedDelta' | 'damagedDelta' | 'saleLogDelta' | 'totalStock'>>,
  ): Promise<StockSnapshotDocument | null> {
    return this.model.findByIdAndUpdate(snapshotId, { $set: data }, { new: true }).exec();
  }
}
