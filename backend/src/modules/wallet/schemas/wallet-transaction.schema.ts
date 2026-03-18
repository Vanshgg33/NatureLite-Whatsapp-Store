import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

export type WalletTransactionType = 'credit' | 'debit';

@Schema({ timestamps: true })
export class WalletTransaction {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true, index: true })
  wallet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true, enum: ['credit', 'debit'] })
  type: WalletTransactionType;

  /**
   * Amount in paise (integer). Always positive; type determines direction.
   */
  @Prop({ type: Number, required: true, min: 1 })
  amount: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  @Prop({ type: Object })
  meta?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

WalletTransactionSchema.index({ user: 1, createdAt: -1 });
WalletTransactionSchema.index({ wallet: 1, createdAt: -1 });

