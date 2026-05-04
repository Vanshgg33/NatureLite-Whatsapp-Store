import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsArray,
  IsDate,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType } from '../schemas/coupon.schema';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(['percentage', 'fixed'])
  discountType: DiscountType;

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  maxDiscount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minOrderAmount?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxUsageCount?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxUsagePerUser?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedUsers?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedCategories?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedProducts?: string[];

  @Type(() => Date)
  @IsDate()
  validFrom: Date;

  @Type(() => Date)
  @IsDate()
  validUntil: Date;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isFirstOrderOnly?: boolean;
}

export class UpdateCouponDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['percentage', 'fixed'])
  @IsOptional()
  discountType?: DiscountType;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discountValue?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  maxDiscount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minOrderAmount?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxUsageCount?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxUsagePerUser?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedUsers?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedCategories?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedProducts?: string[];

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  validFrom?: Date;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  validUntil?: Date;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isFirstOrderOnly?: boolean;
}

export class ValidateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsNumber()
  @Min(0)
  orderAmount: number;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categoryIds?: string[];

  /**
   * Total non-cancelled orders the user has placed. Used to enforce
   * `isFirstOrderOnly`. Caller (orders/cart service) precomputes this.
   * If undefined, the first-order check is skipped (i.e. assumed satisfied).
   */
  @IsNumber()
  @IsOptional()
  @Min(0)
  userOrderCount?: number;

  /**
   * Times this user has already redeemed THIS coupon on non-cancelled orders.
   * Used to enforce `maxUsagePerUser`. If undefined, the per-user-cap check
   * is skipped.
   */
  @IsNumber()
  @IsOptional()
  @Min(0)
  userCouponUsageCount?: number;
}

export class CouponQueryDto {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsString()
  @IsOptional()
  search?: string;
}
