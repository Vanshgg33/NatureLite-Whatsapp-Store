import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StoreStockDocument = StoreStock & Document;

@Schema({ _id: false })
export class VariantStock {
  @Prop({ required: true })
  variantSku: string;

  @Prop({ default: 0 })
  stock: number;
}

export const VariantStockSchema = SchemaFactory.createForClass(VariantStock);

@Schema({ timestamps: true })
export class StoreStock {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  store: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product: Types.ObjectId;

  @Prop({ default: 0 })
  stock: number;

  @Prop({ default: 0 })
  stockIn: number;

  @Prop({ default: 0 })
  returned: number;

  @Prop({ default: 0 })
  damaged: number;

  @Prop({ default: 0 })
  saleLog: number;

  @Prop({ type: [VariantStockSchema], default: [] })
  variantStocks: VariantStock[];

  @Prop({ default: 5 })
  lowStockThreshold: number;

  createdAt: Date;
  updatedAt: Date;
}

export const StoreStockSchema = SchemaFactory.createForClass(StoreStock);

StoreStockSchema.index({ store: 1, product: 1 }, { unique: true });
StoreStockSchema.index({ store: 1, stock: 1 });
