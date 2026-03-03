import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StoreDocument = Store & Document;

@Schema({ timestamps: true })
export class Store {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  code: string;

  @Prop()
  address?: string;

  @Prop()
  phone?: string;

  @Prop({ default: false })
  isMainStore: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  adminEmail?: string;

  @Prop()
  adminPassword?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const StoreSchema = SchemaFactory.createForClass(Store);

StoreSchema.index({ isMainStore: 1 });
StoreSchema.index({ isActive: 1 });
