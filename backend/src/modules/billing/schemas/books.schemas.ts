import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Cash / bank / wallet accounts that payments settle into. */
@Schema({ timestamps: true, collection: 'billing_accounts' })
export class BillingAccount extends Document {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, enum: ['CASH', 'BANK', 'WALLET'] }) kind: string;
  @Prop({ default: 0 }) openingBalancePaise: number;
}
export const BillingAccountSchema = SchemaFactory.createForClass(BillingAccount);

/** Standalone Payment-In / Payment-Out (settlements and advances; bill-time payments live on the bill). */
@Schema({ timestamps: true, collection: 'billing_payments' })
export class BillingPayment extends Document {
  @Prop({ required: true, enum: ['IN', 'OUT'] }) type: string;
  @Prop() partyId?: string;
  @Prop({ required: true }) partyName: string;
  @Prop({ required: true }) mode: string; // cash | upi | card | bank | cheque
  @Prop({ required: true }) amountPaise: number;
  @Prop({ default: 0 }) discountPaise: number;
  @Prop() accountId?: string;
  @Prop({ required: true }) date: Date;
  @Prop() refDocNo?: string;
  @Prop() note?: string;
  // cheque ledger: UNDEPOSITED until cleared; BOUNCED payments post nothing
  @Prop({ default: 'CLEARED', enum: ['UNDEPOSITED', 'CLEARED', 'BOUNCED'] }) status: string;
  @Prop() clearedOn?: Date;
}
export const BillingPaymentSchema = SchemaFactory.createForClass(BillingPayment);
BillingPaymentSchema.index({ date: 1 });

@Schema({ timestamps: true, collection: 'billing_expenses' })
export class BillingExpense extends Document {
  @Prop({ required: true }) date: Date;
  @Prop({ required: true }) category: string;
  @Prop({ required: true }) amountPaise: number;
  @Prop() accountId?: string;
  @Prop({ default: 'cash' }) mode: string;
  @Prop({ default: false }) direct: boolean;   // direct vs indirect expense
  @Prop({ default: false }) isIncome: boolean; // other income instead of an expense
  @Prop() note?: string;
}
export const BillingExpenseSchema = SchemaFactory.createForClass(BillingExpense);
BillingExpenseSchema.index({ date: 1 });

export interface PurchaseItem {
  productId?: string; name: string; hsnCode: string; qty: number; unit?: string;
  gstRate: number; gstTreatment?: string;
  taxable: number; cgst: number; sgst: number; igst: number; // paise
}

/** Purchase bill or debit note. */
@Schema({ timestamps: true, collection: 'billing_purchases' })
export class BillingPurchase extends Document {
  @Prop({ required: true, unique: true }) docNo: string;
  @Prop() supplierId?: string;
  @Prop({ required: true }) supplierName: string;
  @Prop() supplierGstin?: string;
  @Prop({ default: '22' }) stateOfSupply: string;
  @Prop({ required: true }) date: Date;
  @Prop({ default: false }) isDebitNote: boolean;
  @Prop() refDocNo?: string;
  @Prop({ default: 'ELIGIBLE', enum: ['ELIGIBLE', 'INELIGIBLE_17_5', 'OTHER_INELIGIBLE'] }) itcEligibility: string;
  @Prop({ default: false }) reverseCharge: boolean;
  @Prop({ default: 'active' }) status: string;
  @Prop({ type: [Object], default: [] }) items: PurchaseItem[];
  @Prop({ default: 0 }) totalPaise: number;   // supplier payable (excludes GST when reverseCharge)
  @Prop({ default: 0 }) paidPaise: number;    // paid (or refunded, for a debit note) at creation
  @Prop({ default: 'cash' }) paymentMode: string;
  @Prop() notes?: string;
}
export const BillingPurchaseSchema = SchemaFactory.createForClass(BillingPurchase);
BillingPurchaseSchema.index({ date: 1 });

/** Manual stock entries: opening stock and adjustments. Purchases and sales are derived from their documents. */
@Schema({ timestamps: true, collection: 'billing_stock_entries' })
export class BillingStockEntry extends Document {
  @Prop({ required: true }) productId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) date: Date;
  @Prop({ required: true, enum: ['OPENING', 'ADJUST'] }) kind: string;
  @Prop({ required: true }) qty: number;        // signed delta
  @Prop() unitCostPaise?: number;
  @Prop() note?: string;
}
export const BillingStockEntrySchema = SchemaFactory.createForClass(BillingStockEntry);
BillingStockEntrySchema.index({ productId: 1, date: 1 });

/** Singleton: books opening date, retained earnings, party openings and payment-mode -> account routing. */
@Schema({ timestamps: true, collection: 'billing_opening_balances' })
export class BillingOpening extends Document {
  @Prop({ required: true, unique: true, default: 'default' }) key: string;
  @Prop({ required: true }) asOn: Date;
  @Prop({ default: 0 }) retainedEarningsPaise: number;
  /** balancePaise > 0 = customer owes us (debtor), < 0 = we owe them (creditor) */
  @Prop({ type: [Object], default: [] }) partyOpenings: Array<{ partyId: string; name: string; balancePaise: number }>;
  @Prop({ type: Object, default: {} }) modeAccountMap: Record<string, string>;
}
export const BillingOpeningSchema = SchemaFactory.createForClass(BillingOpening);
