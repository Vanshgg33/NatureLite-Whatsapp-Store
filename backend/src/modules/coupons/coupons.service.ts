import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { parseObjectId, parseObjectIdArray } from '@/common/utils/objectid.util';
import { Coupon } from './schemas/coupon.schema';
import { CouponRepository } from './repositories/coupon.repository';
import {
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
  CouponQueryDto,
} from './dto/coupon.dto';
import { PaginatedResult } from '@/common/types/pagination.types';

export interface CouponValidationResult {
  valid: boolean;
  message: string;
  discountAmount: number;
  coupon?: Coupon;
  minOrderAmount?: number;
}

@Injectable()
export class CouponsService {
  constructor(private readonly couponRepository: CouponRepository) {}

  async create(dto: CreateCouponDto): Promise<Coupon> {
    const existingCoupon = await this.couponRepository.findOneByCode(dto.code.toUpperCase());
    if (existingCoupon) {
      throw new BadRequestException('Coupon with this code already exists');
    }
    return this.couponRepository.create({
      ...dto,
      code: dto.code.toUpperCase(),
      allowedUsers: parseObjectIdArray(dto.allowedUsers, 'allowedUsers'),
      allowedCategories: parseObjectIdArray(dto.allowedCategories, 'allowedCategories'),
      allowedProducts: parseObjectIdArray(dto.allowedProducts, 'allowedProducts'),
    } as Partial<Coupon>);
  }

  async findAll(query: CouponQueryDto): Promise<PaginatedResult<Coupon>> {
    return this.couponRepository.findAllPaginated(query);
  }

  async findById(id: string): Promise<Coupon> {
    const coupon = await this.couponRepository.findByIdString(id);
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  async findByCode(code: string): Promise<Coupon> {
    const coupon = await this.couponRepository.findOneByCode(code.toUpperCase());
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  async validateCoupon(dto: ValidateCouponDto): Promise<CouponValidationResult> {
    const coupon = await this.couponRepository.findOneByCode(dto.code.toUpperCase());
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
        minOrderAmount: coupon.minOrderAmount,
      };
    }
    if (coupon.allowedUsers && coupon.allowedUsers.length > 0) {
      const isAllowed = coupon.allowedUsers.some((id) => id.toString() === dto.userId);
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
    const result = await this.couponRepository.incrementUsageCount(couponCode);
    if (result.modifiedCount === 0) {
      throw new BadRequestException('Coupon usage limit reached');
    }
  }

  async update(id: string, dto: UpdateCouponDto): Promise<Coupon> {
    const idObj = parseObjectId(id, 'id');
    const updateData: Record<string, unknown> = { ...dto };
    if (dto.allowedUsers) {
      updateData.allowedUsers = parseObjectIdArray(dto.allowedUsers, 'allowedUsers');
    }
    if (dto.allowedCategories) {
      updateData.allowedCategories = parseObjectIdArray(dto.allowedCategories, 'allowedCategories');
    }
    if (dto.allowedProducts) {
      updateData.allowedProducts = parseObjectIdArray(dto.allowedProducts, 'allowedProducts');
    }
    const coupon = await this.couponRepository.findByIdAndUpdate(idObj, { $set: updateData });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  async delete(id: string): Promise<void> {
    const result = await this.couponRepository.deleteOne({
      _id: parseObjectId(id, 'id'),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Coupon not found');
    }
  }

  async getActiveCoupons(): Promise<Coupon[]> {
    return this.couponRepository.findActiveCoupons();
  }
}
