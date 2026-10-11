import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MovementType =
  | 'STOCK_IN'
  | 'RETURNED'
  | 'DAMAGED'
  | 'SALE_LOG'
  | 'ADJUST_SET'
  | 'ORDER_RESERVE'
  | 'ORDER_CANCEL'
  | 'ORDER_RETURN'
  | 'BILL_SALE'
  | 'BILL_VOID'
  | 'IMPORT_SET'
  | 'MIGRATION';

export type StockMovementDocument = StockMovement & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class StockMovement {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  store: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  variantId?: Types.ObjectId;

  @Prop({ required: true })
  type: MovementType;

  @Prop({ required: true })
  delta: number;

  @Prop()
  before: number;

  @Prop()
  after: number;

  @Prop()
  refType?: string;

  @Prop()
  refId?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  by?: Types.ObjectId;

  @Prop()
  note?: string;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

StockMovementSchema.index({ store: 1, createdAt: -1 });
StockMovementSchema.index({ refType: 1, refId: 1 });
StockMovementSchema.index({ product: 1, createdAt: -1 });
