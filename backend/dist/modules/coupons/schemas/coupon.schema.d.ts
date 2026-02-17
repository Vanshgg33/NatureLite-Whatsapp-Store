import { Document, Types } from 'mongoose';
export type CouponDocument = Coupon & Document;
export type DiscountType = 'percentage' | 'fixed';
export declare class Coupon {
    _id: Types.ObjectId;
    code: string;
    description: string;
    discountType: DiscountType;
    discountValue: number;
    maxDiscount?: number;
    minOrderAmount: number;
    maxUsageCount?: number;
    usedCount: number;
    maxUsagePerUser?: number;
    allowedUsers: Types.ObjectId[];
    allowedCategories: Types.ObjectId[];
    allowedProducts: Types.ObjectId[];
    validFrom: Date;
    validUntil: Date;
    isActive: boolean;
    isFirstOrderOnly: boolean;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const CouponSchema: import("mongoose").Schema<Coupon, import("mongoose").Model<Coupon, any, any, any, Document<unknown, any, Coupon, any, {}> & Coupon & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Coupon, Document<unknown, {}, import("mongoose").FlatRecord<Coupon>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Coupon> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
