import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RawMaterialDocument = RawMaterial & Document;

@Schema({ timestamps: true })
export class RawMaterial {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  store: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: 'kg' })
  unit: string;

  // Current closing stock (updated after each daily entry)
  @Prop({ default: 0 })
  totalStock: number;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const RawMaterialSchema = SchemaFactory.createForClass(RawMaterial);

RawMaterialSchema.index(
  { store: 1, name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
