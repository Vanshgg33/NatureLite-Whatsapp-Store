import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BillingBillDocument = BillingBill & Document;

export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface BillLineItem {
  productId: Types.ObjectId;
  name: string;
  sku: string;
  hsnCode: string;
  qty: number;
  unitPrice: number;   // GST-inclusive price per unit
  gstRate: number;     // e.g. 5, 12, 18
  taxableAmount: number; // total / (1 + rate/100)
  gstAmount: number;   // total - taxableAmount
  total: number;       // unitPrice * qty
}

@Schema({ timestamps: true })
export class BillingBill {
  @Prop({ required: true, unique: true, index: true })
  invoiceNo: string;

  @Prop({ type: Types.ObjectId, ref: 'BillingCustomer', required: true, index: true })
  customerId: Types.ObjectId;

  // Snapshot of customer info at billing time
  @Prop({ required: true }) customerName: string;
  @Prop({ required: true }) customerPhone: string;
  @Prop() customerGstNo?: string;
  @Prop() billingAddress?: string;
  @Prop({ type: [String], default: [] }) customerTags: string[];

  @Prop({ required: true })
  orderTag: string; // B2B | Transport | Home Delivery | Store/Retail | Wholesale | Retail

  @Prop({
    type: [{
      productId: { type: Types.ObjectId, ref: 'Product' },
      name: String,
      sku: String,
      hsnCode: String,
      qty: Number,
      unitPrice: Number,
      gstRate: Number,
      taxableAmount: Number,
      gstAmount: Number,
      total: Number,
    }],
    required: true,
  })
  items: BillLineItem[];

  @Prop({ required: true }) subtotal: number;  // sum of taxableAmounts
  @Prop({ required: true }) totalGst: number;
  @Prop({ required: true }) grandTotal: number;
  @Prop({ required: true, default: 0 }) amountPaid: number;
  @Prop({ required: true }) amountDue: number;

  @Prop({ default: 'unpaid' })
  paymentStatus: PaymentStatus;

  @Prop({ default: 'active' }) // 'active' | 'cancelled'
  status: string;

  @Prop()
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const BillingBillSchema = SchemaFactory.createForClass(BillingBill);

BillingBillSchema.index({ customerId: 1, createdAt: -1 });
BillingBillSchema.index({ paymentStatus: 1, createdAt: -1 });
BillingBillSchema.index({ createdAt: -1 });
BillingBillSchema.index({ orderTag: 1, createdAt: -1 });
