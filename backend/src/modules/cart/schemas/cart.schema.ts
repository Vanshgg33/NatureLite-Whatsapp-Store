import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CartDocument = Cart & Document;

@Schema()
export class CartItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop()
  variantSku?: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  name: string;

  @Prop()
  image?: string;

  @Prop()
  addedAt: Date;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

@Schema({ timestamps: true })
export class Cart {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: [CartItemSchema], default: [] })
  items: CartItem[];

  @Prop()
  couponCode?: string;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ default: 0 })
  subtotal: number;

  @Prop({ default: 0 })
  total: number;

  @Prop()
  abandonedAt?: Date;

  @Prop({ default: false })
  abandonedReminderSent: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const CartSchema = SchemaFactory.createForClass(Cart);

CartSchema.index({ user: 1 });
CartSchema.index({ abandonedAt: 1, abandonedReminderSent: 1 });
CartSchema.index({ updatedAt: 1 });
