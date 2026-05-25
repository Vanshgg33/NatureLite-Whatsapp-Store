import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RawMaterialDailyEntryDocument = RawMaterialDailyEntry & Document;

@Schema({ timestamps: true })
export class RawMaterialDailyEntry {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  store: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'RawMaterial', required: true, index: true })
  rawMaterial: Types.ObjectId;

  @Prop({ required: true, index: true })
  date: string;

  @Prop({ default: 0 })
  openingStock: number;

  @Prop({ default: 0 })
  stockIn: number;

  @Prop({ default: 0 })
  processed: number;

  @Prop({ default: 0 })
  outputLitres: number;

  // closing = openingStock + stockIn - processed (clamped to 0)
  @Prop({ default: 0 })
  closing: number;

  createdAt: Date;
  updatedAt: Date;
}

export const RawMaterialDailyEntrySchema = SchemaFactory.createForClass(RawMaterialDailyEntry);

RawMaterialDailyEntrySchema.index({ store: 1, rawMaterial: 1, date: 1 }, { unique: true });
RawMaterialDailyEntrySchema.index({ store: 1, date: 1 });
RawMaterialDailyEntrySchema.index({ rawMaterial: 1, date: 1 });
