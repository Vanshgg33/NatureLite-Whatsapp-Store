import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WishlistDocument = Wishlist & Document;

@Schema()
export class WishlistItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  slug: string;

  @Prop()
  image?: string;

  @Prop({ required: true })
  price: number;

  @Prop({ default: Date.now })
  addedAt: Date;
}

export const WishlistItemSchema = SchemaFactory.createForClass(WishlistItem);

@Schema({ timestamps: true })
export class Wishlist {
  _id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  user: Types.ObjectId;

  @Prop({ type: [WishlistItemSchema], default: [] })
  items: WishlistItem[];

  createdAt: Date;
  updatedAt: Date;
}

export const WishlistSchema = SchemaFactory.createForClass(Wishlist);

WishlistSchema.index({ 'items.product': 1 });

