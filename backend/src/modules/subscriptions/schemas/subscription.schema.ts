import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'completed';
export type SubscriptionFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

@Schema()
export class SubscriptionItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  variantSku?: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true })
  price: number;
}

export const SubscriptionItemSchema = SchemaFactory.createForClass(SubscriptionItem);

@Schema({ timestamps: true })
export class Subscription {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: [SubscriptionItemSchema], required: true })
  items: SubscriptionItem[];

  @Prop({ required: true })
  frequency: SubscriptionFrequency;

  @Prop({ default: 'active' })
  status: SubscriptionStatus;

  @Prop({ required: true })
  nextDeliveryDate: Date;

  @Prop()
  lastDeliveryDate?: Date;

  @Prop({ default: 0 })
  totalDeliveries: number;

  @Prop()
  maxDeliveries?: number;

  @Prop({ type: Object })
  shippingAddress: {
    name: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
  };

  @Prop({ required: true })
  paymentMethod: string;

  @Prop({ required: true })
  totalAmount: number;

  @Prop()
  pausedAt?: Date;

  @Prop()
  pauseReason?: string;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancelReason?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ user: 1, status: 1 });
SubscriptionSchema.index({ status: 1, nextDeliveryDate: 1 });
