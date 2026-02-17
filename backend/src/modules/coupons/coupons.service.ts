import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Coupon, CouponDocument } from './schemas/coupon.schema';
import {
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
  CouponQueryDto,
} from './dto/coupon.dto';
import { PaginatedResult, paginate } from '@/common/types/pagination.types';

export interface CouponValidationResult {
  valid: boolean;
  message: string;
  discountAmount: number;
  coupon?: Coupon;
}

@Injectable()
export class CouponsService {
  constructor(
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
  ) {}

  async create(dto: CreateCouponDto): Promise<Coupon> {
    const existingCoupon = await this.couponModel.findOne({
      code: dto.code.toUpperCase(),
    });

    if (existingCoupon) {
      throw new BadRequestException('Coupon with this code already exists');
    }

    const coupon = new this.couponModel({
      ...dto,
      code: dto.code.toUpperCase(),
      allowedUsers: dto.allowedUsers?.map((id) => new Types.ObjectId(id)),
      allowedCategories: dto.allowedCategories?.map((id) => new Types.ObjectId(id)),
      allowedProducts: dto.allowedProducts?.map((id) => new Types.ObjectId(id)),
    });

    return coupon.save();
  }

  async findAll(query: CouponQueryDto): Promise<PaginatedResult<Coupon>> {
    const { page = 1, limit = 20, isActive, search } = query;

    const filter: Record<string, unknown> = {};

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [coupons, total] = await Promise.all([
      this.couponModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.couponModel.countDocuments(filter),
    ]);

    return paginate(coupons, total, { page, limit });
  }

  async findById(id: string): Promise<Coupon> {
    const coupon = await this.couponModel.findById(id);

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return coupon;
  }

  async findByCode(code: string): Promise<Coupon> {
    const coupon = await this.couponModel.findOne({ code: code.toUpperCase() });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return coupon;
  }

  async validateCoupon(dto: ValidateCouponDto): Promise<CouponValidationResult> {
    const coupon = await this.couponModel.findOne({
      code: dto.code.toUpperCase(),
    });

    if (!coupon) {
      return { valid: false, message: 'Coupon not found', discountAmount: 0 };
    }

    if (!coupon.isActive) {
      return { valid: false, message: 'Coupon is not active', discountAmount: 0 };
    }

    const now = new Date();

    if (now < coupon.validFrom) {
      return { valid: false, message: 'Coupon is not yet valid', discountAmount: 0 };
    }

    if (now > coupon.validUntil) {
      return { valid: false, message: 'Coupon has expired', discountAmount: 0 };
    }

    if (coupon.maxUsageCount && coupon.usedCount >= coupon.maxUsageCount) {
      return { valid: false, message: 'Coupon usage limit reached', discountAmount: 0 };
    }

    if (coupon.minOrderAmount && dto.orderAmount < coupon.minOrderAmount) {
      return {
        valid: false,
        message: `Minimum order amount is ₹${coupon.minOrderAmount}`,
        discountAmount: 0,
      };
    }

    if (coupon.allowedUsers && coupon.allowedUsers.length > 0) {
      const isAllowed = coupon.allowedUsers.some(
        (id) => id.toString() === dto.userId,
      );

      if (!isAllowed) {
        return { valid: false, message: 'Coupon is not valid for your account', discountAmount: 0 };
      }
    }

    let discountAmount: number;

    if (coupon.discountType === 'percentage') {
      discountAmount = (dto.orderAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = coupon.discountValue;
    }

    discountAmount = Math.min(discountAmount, dto.orderAmount);

    return {
      valid: true,
      message: 'Coupon applied successfully',
      discountAmount,
      coupon,
    };
  }

  async incrementUsageCount(couponCode: string): Promise<void> {
    await this.couponModel.updateOne(
      { code: couponCode.toUpperCase() },
      { $inc: { usedCount: 1 } },
    );
  }

  async update(id: string, dto: UpdateCouponDto): Promise<Coupon> {
    const updateData: Record<string, unknown> = { ...dto };

    if (dto.allowedUsers) {
      updateData.allowedUsers = dto.allowedUsers.map((id) => new Types.ObjectId(id));
    }
    if (dto.allowedCategories) {
      updateData.allowedCategories = dto.allowedCategories.map((id) => new Types.ObjectId(id));
    }
    if (dto.allowedProducts) {
      updateData.allowedProducts = dto.allowedProducts.map((id) => new Types.ObjectId(id));
    }

    const coupon = await this.couponModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true },
    );

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return coupon;
  }

  async delete(id: string): Promise<void> {
    const result = await this.couponModel.deleteOne({
      _id: new Types.ObjectId(id),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Coupon not found');
    }
  }

  async getActiveCoupons(): Promise<Coupon[]> {
    const now = new Date();

    return this.couponModel
      .find({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
        $or: [
          { maxUsageCount: { $exists: false } },
          { $expr: { $lt: ['$usedCount', '$maxUsageCount'] } },
        ],
      })
      .exec();
  }
}
