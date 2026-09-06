import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CustomerTag } from './billing-customer.schema';

export type BillingTagPriceDocument = BillingTagPrice & Document;

@Schema({ timestamps: true })
export class BillingTagPrice {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  tag: CustomerTag;

  @Prop({ required: true })
  price: number;

  createdAt: Date;
  updatedAt: Date;
}

export const BillingTagPriceSchema = SchemaFactory.createForClass(BillingTagPrice);

// enforce one price per product+tag
BillingTagPriceSchema.index({ productId: 1, tag: 1 }, { unique: true });
