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
  slug?: string;

  @Prop()
  image?: string;

  @Prop()
  addedAt: Date;

  /**
   * When this item's `price` was captured from the live product/variant.
   * Used by `CartService.getCart` to detect a stale price (admin or UCM
   * mutated the product since) and refresh on read so the customer never
   * sees a stale ₹ on the cart screen. The fix is read-side only — the
   * authoritative recompute still happens at order-create time.
   */
  @Prop()
  priceCapturedAt?: Date;
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

  @Prop({ default: 0 })
  abandonedReminderCount: number;

  @Prop()
  abandonedLastReminderAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const CartSchema = SchemaFactory.createForClass(Cart);

CartSchema.index({ abandonedAt: 1, abandonedReminderSent: 1 });
CartSchema.index({ abandonedReminderCount: 1, abandonedLastReminderAt: 1 });
CartSchema.index({ updatedAt: 1 });
