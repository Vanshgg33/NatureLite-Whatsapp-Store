import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Coupon, CouponDocument } from '../schemas/coupon.schema';
import { BaseRepository } from '../../../common/repository/base.repository';
import { CouponQueryDto } from '../dto/coupon.dto';
import { PaginatedResult, paginate } from '../../../common/types/pagination.types';
import { buildSearchOrFilter } from '../../../common/utils/query.util';

@Injectable()
export class CouponRepository extends BaseRepository<CouponDocument> {
  constructor(
    @InjectModel(Coupon.name) model: Model<CouponDocument>,
  ) {
    super(model);
  }

  async findOneByCode(code: string): Promise<CouponDocument | null> {
    return this.model.findOne({ code: code.toUpperCase() }).exec();
  }

  async findAllPaginated(query: CouponQueryDto): Promise<PaginatedResult<Coupon>> {
    const { page = 1, limit = 20, isActive, search } = query;
    const filter: Record<string, unknown> = {};
    if (isActive !== undefined) filter.isActive = isActive;
    const searchOr = buildSearchOrFilter(search, ['code', 'description']);
    if (searchOr.length) filter.$or = searchOr;
    const skip = (page - 1) * limit;
    const [coupons, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter),
    ]);
    return paginate(coupons, total, { page, limit });
  }

  async incrementUsageCount(code: string): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateOne(
      {
        code: code.toUpperCase(),
        $or: [
          { maxUsageCount: { $exists: false } },
          { maxUsageCount: null },
          { $expr: { $lt: ['$usedCount', '$maxUsageCount'] } },
        ],
      },
      { $inc: { usedCount: 1 } },
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }

  async findActiveCoupons(): Promise<CouponDocument[]> {
    const now = new Date();
    return this.model.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $or: [
        { maxUsageCount: { $exists: false } },
        { $expr: { $lt: ['$usedCount', '$maxUsageCount'] } },
      ],
    }).exec();
  }
}
