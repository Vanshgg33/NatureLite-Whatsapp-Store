import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
  _id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  user: Types.ObjectId;

  /**
   * Balance stored in paise (integer) to avoid floating point issues.
   * Example: ₹100.50 => 10050
   */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  balance: number;

  createdAt: Date;
  updatedAt: Date;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

WalletSchema.index({ user: 1 });

