import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BillingCustomerDocument = BillingCustomer & Document;

export type CustomerTag = 'B2B' | 'Transport' | 'Home Delivery' | 'Store/Retail' | 'Wholesale' | 'Retail';

export const TAG_PRIORITY: CustomerTag[] = [
  'Wholesale', 'B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Retail',
];

@Schema({ timestamps: true })
export class BillingCustomer {
  @Prop({ required: true })
  name: string; // display name (may include " (432)" suffix for duplicates)

  @Prop({ required: true, index: true })
  canonicalName: string; // original name without suffix

  @Prop({ required: true, unique: true, index: true })
  phone: string;

  @Prop()
  altPhone?: string;

  @Prop()
  gstNo?: string;

  @Prop({ type: [String], default: [] })
  tags: CustomerTag[];

  @Prop({
    type: [{ label: String, line: String, isDefault: Boolean }],
    default: [],
  })
  addresses: Array<{ label: string; line: string; isDefault: boolean }>;

  @Prop({ default: 0 })
  orderCount: number;

  @Prop({ default: 0 })
  totalPurchase: number;

  @Prop({ default: 0 })
  outstanding: number;

  // Phase 0 additions — all optional with safe defaults
  @Prop({ default: 'customer', enum: ['customer','supplier','both'] }) partyType: string
  @Prop() gstin: string
  @Prop({ default: 'unregistered', enum: ['registered','unregistered','composition','consumer','overseas','sez'] }) gstType: string
  @Prop() stateCode: string
  @Prop() pan: string
  @Prop({ default: 0 }) openingBalance: number
  @Prop({ default: 'to_receive', enum: ['to_receive','to_pay'] }) openingBalanceType: string
  @Prop() openingBalanceDate: Date
  @Prop({ default: 0 }) creditLimit: number
  @Prop({ default: 15 }) creditDays: number
  @Prop() partyGroup: string
  @Prop() email: string
  @Prop() notes: string

  createdAt: Date;
  updatedAt: Date;
}

export const BillingCustomerSchema = SchemaFactory.createForClass(BillingCustomer);

BillingCustomerSchema.index({ name: 'text', phone: 1 });
BillingCustomerSchema.index({ outstanding: -1 });
