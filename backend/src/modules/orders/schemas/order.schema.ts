import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'refunded';

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

  @Prop({ required: true })
  street: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  state: string;

  @Prop({ required: true })
  pincode: string;

  @Prop()
  landmark?: string;
}

export const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);

@Schema()
export class TimelineEntry {
  @Prop({ required: true })
  status: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop()
  updatedBy?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const TimelineEntrySchema = SchemaFactory.createForClass(TimelineEntry);

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

  @Prop({ default: 'pending', index: true })
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
  shiprocketOrderId?: string;

  @Prop()
  shiprocketShipmentId?: string;

  @Prop()
  trackingUrl?: string;

  @Prop()
  expectedDeliveryDate?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancelReason?: string;

  @Prop()
  invoiceUrl?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ orderNumber: 1 });
OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ awbNumber: 1 });
