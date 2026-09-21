import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PurchaseVendorDocument = PurchaseVendor & Document;

@Schema({ timestamps: true })
export class PurchaseVendor {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ default: '' })
  gstin: string;

  @Prop({ default: '' })
  paymentTerms: string;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const PurchaseVendorSchema = SchemaFactory.createForClass(PurchaseVendor);
