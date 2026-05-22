import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StockSnapshotDocument = StockSnapshot & Document;

@Schema({ timestamps: true })
export class StockSnapshot {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  store: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product: Types.ObjectId;

  @Prop({ required: true, index: true })
  date: string;

  @Prop({ default: 0 })
  stockInDelta: number;

  @Prop({ default: 0 })
  returnedDelta: number;

  @Prop({ default: 0 })
  damagedDelta: number;

  @Prop({ default: 0 })
  saleLogDelta: number;

  @Prop({ default: 0 })
  totalStock: number;

  createdAt: Date;
  updatedAt: Date;
}

export const StockSnapshotSchema = SchemaFactory.createForClass(StockSnapshot);

StockSnapshotSchema.index({ store: 1, product: 1, date: 1 }, { unique: true });
StockSnapshotSchema.index({ store: 1, date: 1 });
