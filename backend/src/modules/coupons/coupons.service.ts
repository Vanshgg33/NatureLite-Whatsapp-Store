import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { parseObjectId, parseObjectIdArray } from '../../common/utils/objectid.util';
import { Coupon } from './schemas/coupon.schema';
import { CouponRepository } from './repositories/coupon.repository';
import {
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
  CouponQueryDto,
} from './dto/coupon.dto';
import { PaginatedResult } from '../../common/types/pagination.types';
import { RedisService } from '../redis/redis.service';

export interface CouponValidationResult {
  valid: boolean;
  message: string;
  discountAmount: number;
  coupon?: Coupon;
  minOrderAmount?: number;
}

@Injectable()
export class CouponsService {
  constructor(
    private readonly couponRepository: CouponRepository,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateCouponDto): Promise<Coupon> {
    if (dto.discountType === 'percentage' && dto.discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }
    const existingCoupon = await this.couponRepository.findOneByCode(dto.code.toUpperCase());
    if (existingCoupon) {
      throw new BadRequestException('Coupon with this code already exists');
    }
    const saved = await this.couponRepository.create({
      ...dto,
      code: dto.code.toUpperCase(),
      allowedUsers: parseObjectIdArray(dto.allowedUsers, 'allowedUsers'),
      allowedCategories: parseObjectIdArray(dto.allowedCategories, 'allowedCategories'),
      allowedProducts: parseObjectIdArray(dto.allowedProducts, 'allowedProducts'),
    } as Partial<Coupon>);
    this.clearChatbotCache();
    return saved;
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
    if (coupon.isFirstOrderOnly && typeof dto.userOrderCount === 'number' && dto.userOrderCount > 0) {
      return {
        valid: false,
        message: 'This coupon is for first orders only',
        discountAmount: 0,
      };
    }
    if (
      coupon.maxUsagePerUser &&
      coupon.maxUsagePerUser > 0 &&
      typeof dto.userCouponUsageCount === 'number' &&
      dto.userCouponUsageCount >= coupon.maxUsagePerUser
    ) {
      return {
        valid: false,
        message: 'You have already used this coupon the maximum number of times',
        discountAmount: 0,
      };
    }
    if (coupon.allowedProducts && coupon.allowedProducts.length > 0) {
      // If the coupon is product-restricted but the caller didn't supply the
      // cart's productIds, conservatively reject — silently accepting would
      // mean the restriction is unenforceable.
      const cartProductIds = new Set((dto.productIds || []).map((id) => id.toString()));
      const matches = coupon.allowedProducts.some((id) => cartProductIds.has(id.toString()));
      if (!matches) {
        return {
          valid: false,
          message: 'Coupon is not valid for the items in your cart',
          discountAmount: 0,
        };
      }
    }
    if (coupon.allowedCategories && coupon.allowedCategories.length > 0) {
      const cartCategoryIds = new Set((dto.categoryIds || []).map((id) => id.toString()));
      const matches = coupon.allowedCategories.some((id) => cartCategoryIds.has(id.toString()));
      if (!matches) {
        return {
          valid: false,
          message: 'Coupon is not valid for the categories in your cart',
          discountAmount: 0,
        };
      }
    }
    let discountAmount: number;
    if (coupon.discountType === 'percentage') {
      // Cap percentage at 100% defensively so a misconfigured coupon can't
      // exceed the order amount before the Math.min clamp below.
      const pct = Math.min(Math.max(0, coupon.discountValue), 100);
      discountAmount = (dto.orderAmount * pct) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = Math.max(0, coupon.discountValue);
    }
    discountAmount = Math.min(discountAmount, dto.orderAmount);
    return {
      valid: true,
      message: 'Coupon applied successfully',
      discountAmount,
      coupon,
    };
  }

  /**
   * Atomically reserves a usage slot on a coupon. The conditional update
   * succeeds only if `usedCount < maxUsageCount` (or no cap is set), so
   * concurrent callers cannot both reserve the last slot. When called inside
   * a Mongo transaction (pass `session`), the reservation is rolled back if
   * the surrounding transaction aborts — meaning a failed order won't burn a
   * coupon use. Throws `BadRequestException('Coupon usage limit reached')`
   * when the cap was just hit by another caller.
   */
  async incrementUsageCount(couponCode: string, session?: ClientSession): Promise<void> {
    const result = await this.couponRepository.incrementUsageCount(couponCode, session);
    if (result.modifiedCount === 0) {
      throw new BadRequestException('Coupon usage limit reached');
    }
  }

  async update(id: string, dto: UpdateCouponDto): Promise<Coupon> {
    if (dto.discountType === 'percentage' && dto.discountValue !== undefined && dto.discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }
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
    this.clearChatbotCache();
    return coupon;
  }

  async delete(id: string): Promise<void> {
    const result = await this.couponRepository.deleteOne({
      _id: parseObjectId(id, 'id'),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Coupon not found');
    }
    this.clearChatbotCache();
  }

  async getActiveCoupons(): Promise<Coupon[]> {
    return this.couponRepository.findActiveCoupons();
  }

  private clearChatbotCache(): void {
    this.redisService.delPattern('chatbot:tool:*').catch(() => {});
  }
}
