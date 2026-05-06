import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

export type PaymentGateway = 'razorpay' | 'phonepe' | 'paytm' | 'manual' | 'cod';

export type TransactionStatus = 'initiated' | 'pending' | 'success' | 'failed' | 'refunded';

@Schema({ timestamps: true })
export class Payment {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  order: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ required: true })
  gateway: PaymentGateway;

  @Prop({ default: 'initiated' })
  status: TransactionStatus;

  @Prop()
  gatewayOrderId?: string;

  @Prop()
  gatewayPaymentId?: string;

  @Prop()
  gatewaySignature?: string;

  @Prop({ type: Object })
  gatewayResponse?: Record<string, string | number | boolean | null>;

  @Prop()
  refundId?: string;

  @Prop()
  refundAmount?: number;

  @Prop()
  refundedAt?: Date;

  @Prop()
  refundReason?: string;

  @Prop()
  refundProcessedAt?: Date;

  @Prop()
  refundFailedAt?: Date;

  @Prop()
  refundFailureReason?: string;

  @Prop()
  failureReason?: string;

  @Prop()
  disputeId?: string;

  @Prop()
  disputeStatus?: string;

  @Prop()
  disputeAmount?: number;

  @Prop()
  disputeReasonCode?: string;

  @Prop()
  disputePhase?: string;

  @Prop()
  disputeRaisedAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, string | number | boolean | null>;

  createdAt: Date;
  updatedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ user: 1, createdAt: -1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ gatewayOrderId: 1 });
PaymentSchema.index({ gatewayPaymentId: 1 }, { unique: true, sparse: true });
PaymentSchema.index({ refundId: 1 }, { sparse: true });
PaymentSchema.index({ disputeId: 1 }, { sparse: true });
