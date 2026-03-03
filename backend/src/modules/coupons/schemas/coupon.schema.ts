import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CouponDocument = Coupon & Document;

export type DiscountType = 'percentage' | 'fixed';

@Schema({ timestamps: true })
export class Coupon {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, uppercase: true, index: true })
  code: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  discountType: DiscountType;

  @Prop({ required: true })
  discountValue: number;

  @Prop()
  maxDiscount?: number;

  @Prop({ default: 0 })
  minOrderAmount: number;

  @Prop()
  maxUsageCount?: number;

  @Prop({ default: 0 })
  usedCount: number;

  @Prop()
  maxUsagePerUser?: number;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  allowedUsers: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'Category', default: [] })
  allowedCategories: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'Product', default: [] })
  allowedProducts: Types.ObjectId[];

  @Prop({ required: true })
  validFrom: Date;

  @Prop({ required: true })
  validUntil: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isFirstOrderOnly: boolean;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);

CouponSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });
