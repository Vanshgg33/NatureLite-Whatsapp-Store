import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CrmMarketingSpendDocument = CrmMarketingSpend & Document;

/** Manual monthly ad/marketing spend per channel; feeds CAC (blueprint M20). */
@Schema({ timestamps: true })
export class CrmMarketingSpend {
  @Prop({ required: true, trim: true, lowercase: true, maxlength: 50 })
  channel: string;

  @Prop({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/, index: true })
  month: string; // IST "YYYY-MM"

  @Prop({ required: true, min: 0 })
  amount: number; // rupees

  @Prop({ default: '', maxlength: 200 })
  note: string;
}

export const CrmMarketingSpendSchema = SchemaFactory.createForClass(CrmMarketingSpend);
