import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PurchaseTagDocument = PurchaseTag & Document;

@Schema({ timestamps: true })
export class PurchaseTag {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ required: true })
  color: string;

  @Prop({ default: '' })
  icon: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object })
  createdBy?: any;

  createdAt: Date;
  updatedAt: Date;
}

export const PurchaseTagSchema = SchemaFactory.createForClass(PurchaseTag);
