import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema()
export class ProductVariant {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  price: number;

  @Prop()
  compareAtPrice?: number;

  @Prop({ default: 0 })
  stock: number;

  @Prop({ type: Object, default: {} })
  attributes: Record<string, string>;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  images: string[];
}

export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

@Schema({ timestamps: true })
export class Product {
  _id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop()
  description?: string;

  @Prop()
  shortDescription?: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  category: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: [String], default: [] })
  imageAlts: string[];

  @Prop()
  videoUrl?: string;

  @Prop({ type: [String], default: [] })
  videos: string[];

  @Prop({ required: true })
  price: number;

  @Prop()
  compareAtPrice?: number;

  @Prop()
  specialOfferPrice?: number;

  @Prop()
  specialOfferLabel?: string;

  @Prop({ default: false })
  specialOfferActive: boolean;

  @Prop({ required: true, unique: true })
  sku: string;

  @Prop({ default: 0 })
  stock: number;

  @Prop({ default: false })
  trackStock: boolean;

  @Prop({ default: 0 })
  lowStockThreshold: number;

  @Prop({ type: [ProductVariantSchema], default: [] })
  variants: ProductVariant[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  weight?: number;

  @Prop({ type: Object })
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };

  @Prop()
  hsnCode?: string;

  @Prop({ type: Object })
  seo?: {
    title?: string;
    description?: string;
    keywords?: string;
    canonicalUrl?: string;
  };

  @Prop({ type: Object })
  nutritionalFacts?: {
    isActive: boolean;
    rows: { name: string; per100g: string; perServing: string }[];
  };

  @Prop({ type: Object })
  ingredients?: {
    isActive: boolean;
    text: string;
  };

  @Prop({ type: Object })
  allergenDeclaration?: {
    isActive: boolean;
    text: string;
  };

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Product' }], default: [] })
  relatedProducts: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Product' }], default: [] })
  upsellProducts: Types.ObjectId[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ type: Object })
  batchInfo?: {
    batchNumber?: string;
    batchDate?: Date;
    yieldKg?: number;
    milkLitres?: number;
    origin?: string;
    nextBatchDays?: number;
    purityClaims?: string[];
  };

  @Prop()
  labReportUrl?: string;

  @Prop({ default: 0 })
  totalSold: number;

  @Prop({ default: 0 })
  viewCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ category: 1, isActive: 1 });
ProductSchema.index({ isActive: 1, isFeatured: 1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ name: 'text', description: 'text' });
