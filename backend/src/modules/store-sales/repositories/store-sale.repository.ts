import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StoreSale, StoreSaleDocument } from '../schemas/store-sale.schema';
import { BaseRepository } from '@/common/repository/base.repository';
import { SaleQueryDto } from '../dto/store-sale.dto';
import { PaginatedResult, paginate } from '@/common/types/pagination.types';
import { buildCreatedAtFilter, buildSearchOrFilter } from '@/common/utils/query.util';
import { parseObjectId } from '@/common/utils/objectid.util';
import { PipelineStage } from 'mongoose';

@Injectable()
export class StoreSaleRepository extends BaseRepository<StoreSaleDocument> {
  constructor(
    @InjectModel(StoreSale.name) model: Model<StoreSaleDocument>,
  ) {
    super(model);
  }

  async findAllPaginated(query: SaleQueryDto): Promise<PaginatedResult<StoreSale>> {
    const { page = 1, limit = 20, saleType, startDate, endDate, search } = query;
    const filter = this.buildSaleFilter({ saleType, startDate, endDate, search });
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .populate('store', 'name code')
        .populate('loggedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter),
    ]);
    return paginate(data, total, { page, limit });
  }

  async findByStorePaginated(
    storeId: string,
    query: SaleQueryDto,
  ): Promise<PaginatedResult<StoreSale>> {
    const { page = 1, limit = 20, saleType, startDate, endDate, search } = query;
    const filter = this.buildSaleFilter({ saleType, startDate, endDate, search });
    filter.store = new Types.ObjectId(storeId);
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .populate('store', 'name code')
        .populate('loggedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter),
    ]);
    return paginate(data, total, { page, limit });
  }

  async findByIdWithPopulate(id: string): Promise<StoreSaleDocument | null> {
    const idObj = parseObjectId(id, 'id');
    return this.model
      .findById(idObj)
      .populate('store', 'name code')
      .populate('loggedBy', 'name')
      .populate('items.product', 'name sku images')
      .exec();
  }

  async getSaleStats(
    storeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, unknown>> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    const pipeline: PipelineStage[] = [
      {
        $match: {
          store: storeObjId,
          createdAt: { $gte: startDate, $lte: endDate },
          $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }],
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          avgSaleValue: { $avg: '$total' },
          walkInSales: {
            $sum: { $cond: [{ $eq: ['$saleType', 'walk_in'] }, 1, 0] },
          },
          deliverySales: {
            $sum: { $cond: [{ $eq: ['$saleType', 'delivery'] }, 1, 0] },
          },
          websiteSales: {
            $sum: { $cond: [{ $eq: ['$saleType', 'website'] }, 1, 0] },
          },
          walkInRevenue: {
            $sum: { $cond: [{ $eq: ['$saleType', 'walk_in'] }, '$total', 0] },
          },
          deliveryRevenue: {
            $sum: { $cond: [{ $eq: ['$saleType', 'delivery'] }, '$total', 0] },
          },
          websiteRevenue: {
            $sum: { $cond: [{ $eq: ['$saleType', 'website'] }, '$total', 0] },
          },
        },
      },
    ];
    const result = await this.aggregate<Record<string, unknown>>(pipeline);
    return result[0] || {
      totalSales: 0,
      totalRevenue: 0,
      avgSaleValue: 0,
      walkInSales: 0,
      deliverySales: 0,
      websiteSales: 0,
      walkInRevenue: 0,
      deliveryRevenue: 0,
      websiteRevenue: 0,
    };
  }

  async getRevenueByStoreByDay(
    days: number = 30,
  ): Promise<Array<{ storeId: string; storeName: string; data: Array<{ date: string; revenue: number; sales: number }> }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const pipeline: PipelineStage[] = [
      {
        $match: {
          createdAt: { $gte: startDate },
          $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }],
        },
      },
      {
        $group: {
          _id: {
            store: '$store',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          },
          revenue: { $sum: '$total' },
          sales: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.store',
          data: {
            $push: {
              date: '$_id.date',
              revenue: '$revenue',
              sales: '$sales',
            },
          },
        },
      },
      {
        $lookup: {
          from: 'stores',
          localField: '_id',
          foreignField: '_id',
          as: 'storeInfo',
        },
      },
      { $unwind: '$storeInfo' },
      {
        $project: {
          storeId: { $toString: '$_id' },
          storeName: '$storeInfo.name',
          data: { $sortArray: { input: '$data', sortBy: { date: 1 } } },
        },
      },
    ];
    return this.aggregate(pipeline);
  }

  async findOneByLinkedOrder(orderId: Types.ObjectId): Promise<StoreSaleDocument | null> {
    return this.model.findOne({ linkedOrder: orderId }).exec();
  }

  async voidByLinkedOrder(orderId: Types.ObjectId, reason: string): Promise<StoreSaleDocument | null> {
    return this.model
      .findOneAndUpdate(
        { linkedOrder: orderId, voidedAt: { $exists: false } },
        { $set: { voidedAt: new Date(), voidedReason: reason } },
        { new: true },
      )
      .exec();
  }

  async findOneBySaleNumberPrefix(prefix: string): Promise<StoreSaleDocument | null> {
    return this.model
      .findOne({ saleNumber: { $regex: `^${prefix}` } })
      .sort({ saleNumber: -1 })
      .exec();
  }

  private buildSaleFilter(opts: {
    saleType?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (opts.saleType) filter.saleType = opts.saleType;
    const createdAtFilter = buildCreatedAtFilter(opts.startDate, opts.endDate);
    if (createdAtFilter) filter.createdAt = createdAtFilter;
    const searchOr = buildSearchOrFilter(opts.search, ['saleNumber', 'customerName', 'customerPhone']);
    if (searchOr.length) filter.$or = searchOr;
    return filter;
  }
}
