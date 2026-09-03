import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PurchaseMaterialDocument = PurchaseMaterial & Document;

@Schema({ timestamps: true })
export class PurchaseMaterial {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ default: 'General' })
  category: string;

  @Prop({ default: 'KG' })
  unit: string;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const PurchaseMaterialSchema = SchemaFactory.createForClass(PurchaseMaterial);
