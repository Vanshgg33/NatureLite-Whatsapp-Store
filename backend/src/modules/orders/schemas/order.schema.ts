import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { OrderStatus } from '../../../common/constants/order-status';
import type { OrderMetadata, TimelineMetadata } from '../../../common/types/order-types';

export type OrderDocument = Order & Document;

export type { OrderStatus } from '../../../common/constants/order-status';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type PaymentMethod = 'cod' | 'prepaid' | 'upi' | 'card' | 'netbanking' | 'wallet';

@Schema()
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  variantSku?: string;

  @Prop()
  variantName?: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  total: number;

  @Prop()
  image?: string;

  @Prop({ default: 0 })
  gstAmount: number;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema()
export class ShippingAddress {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  alternatePhone?: string;

  @Prop({ required: true })
  street: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  state: string;

  @Prop()
  pincode?: string;

  @Prop()
  landmark?: string;
}

export const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);

@Schema()
export class TimelineEntry {
  @Prop({ required: true })
  status: OrderStatus;

  @Prop({ required: true })
  message: string;

  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop()
  updatedBy?: string;

  @Prop({ type: Object })
  metadata?: TimelineMetadata;
}

export const TimelineEntrySchema = SchemaFactory.createForClass(TimelineEntry);

@Schema({ _id: false })
export class EditChange {
  @Prop({ required: true, enum: ['qty_changed', 'item_added', 'item_removed'] })
  type: string;

  @Prop({ required: true })
  productId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  variantSku?: string;

  @Prop()
  variantName?: string;

  @Prop()
  oldQty?: number;

  @Prop()
  newQty?: number;
}

export const EditChangeSchema = SchemaFactory.createForClass(EditChange);

@Schema({ timestamps: true })
export class Order {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  @Prop({ type: ShippingAddressSchema, required: true })
  shippingAddress: ShippingAddress;

  @Prop({ default: 'website', index: true })
  source: string;

  @Prop({ index: true })
  orderType?: string;

  @Prop({ default: 'placed', index: true })
  status: OrderStatus;

  @Prop({ default: 'pending' })
  paymentStatus: PaymentStatus;

  @Prop({ required: true })
  paymentMethod: PaymentMethod;

  @Prop({ required: true })
  subtotal: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop()
  couponCode?: string;

  /**
   * Wallet amount used for this order, in paise.
   */
  @Prop({ default: 0 })
  walletUsed: number;

  /**
   * Amount sent to online payment gateway (e.g. Razorpay), in paise.
   * Useful when combining wallet + prepaid.
   */
  @Prop({ default: 0 })
  paymentGatewayAmount: number;

  @Prop({ default: 0 })
  shippingCharge: number;

  @Prop({ default: 0 })
  gstTotal: number;

  @Prop({ required: true })
  total: number;

  @Prop()
  notes?: string;

  @Prop()
  adminNotes?: string;

  @Prop({ type: [String], default: [] })
  priorityTags: string[];

  @Prop({ type: [TimelineEntrySchema], default: [] })
  timeline: TimelineEntry[];

  @Prop()
  awbNumber?: string;

  @Prop()
  courierName?: string;

  @Prop()
  trackingUrl?: string;

  @Prop()
  expectedDeliveryDate?: Date;

  @Prop()
  deliveredAt?: Date;

  /** When the post-delivery feedback request was sent via WhatsApp (dedup). */
  @Prop()
  feedbackRequestedAt?: Date;

  @Prop()
  packedAt?: Date;

  @Prop()
  packedBy?: string;

  @Prop()
  packedByName?: string;

  @Prop({ default: false })
  repackRequired: boolean;

  @Prop({ type: [EditChangeSchema], default: [] })
  editChanges: EditChange[];

  @Prop()
  billedAt?: Date;

  @Prop()
  billedBy?: string;

  @Prop()
  outForDeliveryAt?: Date;

  @Prop()
  assignedDeliveryUserId?: string;

  @Prop()
  assignedDeliveryAt?: Date;

  @Prop()
  deliveryProofUrl?: string;

  @Prop()
  paymentProofUrl?: string;

  @Prop()
  amountCollected?: number;

  @Prop({ default: 'pending', enum: ['pending', 'settled'] })
  collectionStatus: string;

  @Prop()
  settledAt?: Date;

  @Prop()
  settledBy?: string;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancelReason?: string;

  @Prop()
  returnRequestedAt?: Date;

  @Prop()
  returnRequestReason?: string;

  @Prop()
  returnRequestStatus?: 'requested' | 'approved' | 'rejected' | 'completed';

  @Prop()
  invoiceUrl?: string;

  @Prop({ type: Object, default: {} })
  metadata: OrderMetadata;

  createdAt: Date;
  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ user: 1, createdAt: -1 });
// partialFilterExpression is used instead of sparse:true because in a compound index
// MongoDB's sparse only excludes docs where ALL fields are missing — since 'user' always
// exists every document would be indexed, making null/missing idempotencyKey collide.
OrderSchema.index(
  { user: 1, 'metadata.idempotencyKey': 1 },
  {
    unique: true,
    partialFilterExpression: { 'metadata.idempotencyKey': { $exists: true, $type: 'string' } },
  },
);
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1 });
OrderSchema.index({ createdAt: -1 });
