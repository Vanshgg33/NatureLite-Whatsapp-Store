import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BillingCounterDocument = BillingCounter & Document;

@Schema()
export class BillingCounter {
  @Prop({ required: true, unique: true })
  key: string; // e.g. 'invoice-2025'

  @Prop({ default: 0 })
  value: number;
}

export const BillingCounterSchema = SchemaFactory.createForClass(BillingCounter);
