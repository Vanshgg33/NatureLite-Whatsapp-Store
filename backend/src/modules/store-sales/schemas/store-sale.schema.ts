import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StoreSaleDocument = StoreSale & Document;

export type SaleType = 'walk_in' | 'delivery' | 'website';

@Schema({ _id: false })
export class SaleItem {
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
}

export const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

@Schema({ timestamps: true })
export class StoreSale {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  saleNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  store: Types.ObjectId;

  @Prop({ required: true })
  saleType: SaleType;

  @Prop({ type: [SaleItemSchema], required: true })
  items: SaleItem[];

  @Prop()
  customerName?: string;

  @Prop()
  customerPhone?: string;

  @Prop()
  customerAlternatePhone?: string;

  @Prop()
  customerAddress?: string;

  @Prop({ required: true })
  subtotal: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ required: true })
  total: number;

  @Prop({ default: 'cash' })
  paymentMethod: string;

  @Prop()
  paymentProofUrl?: string;

  @Prop({ type: [String], default: [] })
  images?: string[];

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser' })
  loggedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  linkedOrder?: Types.ObjectId;

  @Prop()
  invoiceUrl?: string;

  /** When set, this sale is excluded from revenue/stats (order cancelled or refunded) */
  @Prop()
  voidedAt?: Date;

  @Prop()
  voidedReason?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const StoreSaleSchema = SchemaFactory.createForClass(StoreSale);

StoreSaleSchema.index({ store: 1, createdAt: -1 });
StoreSaleSchema.index({ saleType: 1 });
StoreSaleSchema.index({ store: 1, saleType: 1, createdAt: -1 });
