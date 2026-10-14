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
  unitPrice: number;      // backward compat: GST-inclusive price per unit (rupees float)
  gstRate: number;        // e.g. 5, 12, 18
  taxableAmount: number;  // backward compat: rupees float
  gstAmount: number;      // backward compat: rupees float
  total: number;          // backward compat: rupees float
  // Phase 1 additions (paise integers):
  mrp?: number;           // rupees display
  unit?: string;
  rate?: number;          // rupees as entered
  priceInclTax?: boolean;
  discountPct?: number;
  discountAmt?: number;   // paise
  taxable?: number;       // paise
  cgst?: number;          // paise
  sgst?: number;          // paise
  igst?: number;          // paise (overrides cgst+sgst when inter-state)
}

@Schema({ timestamps: true })
export class BillingBill {
  @Prop({ required: true, unique: true, index: true })
  invoiceNo: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
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
      // Phase 1:
      mrp: { type: Number, default: 0 },
      unit: { type: String, default: 'NOS' },
      rate: { type: Number, default: 0 },
      priceInclTax: { type: Boolean, default: true },
      discountPct: { type: Number, default: 0 },
      discountAmt: { type: Number, default: 0 },
      taxable: { type: Number, default: 0 },
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      igst: { type: Number, default: 0 },
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
  deliveryUserId?: string;

  @Prop()
  deliveryUserName?: string;

  @Prop()
  notes?: string;

  // Phase 1 fields:
  @Prop({ default: 'credit' }) paymentTerm: string;
  @Prop() invoiceDate?: Date;
  @Prop({ default: '22' }) placeOfSupply: string;
  @Prop({ default: false }) isInterState: boolean;
  @Prop() godownId?: string;
  @Prop() shippingAddress?: string;
  @Prop({ default: true }) sameAsBilling: boolean;
  @Prop({ default: 'credit' }) paymentMode: string;
  @Prop({ default: 0 }) billDiscountPct: number;
  @Prop({ default: 0 }) billDiscountAmtPaise: number;
  @Prop({ type: [{ label: String, amtPaise: Number }], default: [] }) charges: Array<{ label: string; amtPaise: number }>;
  @Prop({ default: 0 }) roundOffPaise: number;
  @Prop({ default: 0 }) cgstTotalPaise: number;
  @Prop({ default: 0 }) sgstTotalPaise: number;
  @Prop({ default: 0 }) igstTotalPaise: number;
  @Prop({ default: 0 }) grandTotalPaise: number;
  @Prop({ default: 0 }) amountPaidPaise: number;
  @Prop({ default: 0 }) amountDuePaise: number;
  @Prop({ default: 'B2CS' }) gstr1Section: string;
  @Prop() terms?: string;
  @Prop() cancelReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const BillingBillSchema = SchemaFactory.createForClass(BillingBill);

BillingBillSchema.index({ customerId: 1, createdAt: -1 });
BillingBillSchema.index({ paymentStatus: 1, createdAt: -1 });
BillingBillSchema.index({ createdAt: -1 });
BillingBillSchema.index({ orderTag: 1, createdAt: -1 });
