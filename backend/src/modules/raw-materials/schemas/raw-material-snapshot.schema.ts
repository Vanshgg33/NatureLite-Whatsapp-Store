import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RawMaterialDailyEntryDocument = RawMaterialDailyEntry & Document;

@Schema({ _id: true, timestamps: false })
export class RawMaterialEntryLog {
  _id: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  loggedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser' })
  loggedBy?: Types.ObjectId;

  @Prop()
  loggedByName?: string;

  @Prop({ default: 0 })
  openingStock: number;

  @Prop({ default: 0 })
  stockIn: number;

  @Prop({ default: 0 })
  processed: number;

  @Prop({ default: 0 })
  outputLitres: number;

  @Prop({ default: 0 })
  closing: number;
}

export const RawMaterialEntryLogSchema = SchemaFactory.createForClass(RawMaterialEntryLog);

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

  @Prop({ type: [RawMaterialEntryLogSchema], default: [] })
  entries: RawMaterialEntryLog[];

  createdAt: Date;
  updatedAt: Date;
}

export const RawMaterialDailyEntrySchema = SchemaFactory.createForClass(RawMaterialDailyEntry);

RawMaterialDailyEntrySchema.index({ store: 1, rawMaterial: 1, date: 1 }, { unique: true });
RawMaterialDailyEntrySchema.index({ store: 1, date: 1 });
RawMaterialDailyEntrySchema.index({ rawMaterial: 1, date: 1 });
