import { DiscountType } from '../schemas/coupon.schema';
export declare class CreateCouponDto {
    code: string;
    description: string;
    discountType: DiscountType;
    discountValue: number;
    maxDiscount?: number;
    minOrderAmount?: number;
    maxUsageCount?: number;
    maxUsagePerUser?: number;
    allowedUsers?: string[];
    allowedCategories?: string[];
    allowedProducts?: string[];
    validFrom: Date;
    validUntil: Date;
    isActive?: boolean;
    isFirstOrderOnly?: boolean;
}
export declare class UpdateCouponDto {
    description?: string;
    discountType?: DiscountType;
    discountValue?: number;
    maxDiscount?: number;
    minOrderAmount?: number;
    maxUsageCount?: number;
    maxUsagePerUser?: number;
    allowedUsers?: string[];
    allowedCategories?: string[];
    allowedProducts?: string[];
    validFrom?: Date;
    validUntil?: Date;
    isActive?: boolean;
    isFirstOrderOnly?: boolean;
}
export declare class ValidateCouponDto {
    code: string;
    orderAmount: number;
    userId?: string;
    productIds?: string[];
    categoryIds?: string[];
}
export declare class CouponQueryDto {
    page?: number;
    limit?: number;
    isActive?: boolean;
    search?: string;
}
