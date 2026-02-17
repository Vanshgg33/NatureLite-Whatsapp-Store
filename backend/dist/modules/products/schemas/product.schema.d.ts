import { Document, Types } from 'mongoose';
export type ProductDocument = Product & Document;
export declare class ProductVariant {
    name: string;
    sku: string;
    price: number;
    compareAtPrice?: number;
    stock: number;
    attributes: Record<string, string>;
    isActive: boolean;
}
export declare const ProductVariantSchema: import("mongoose").Schema<ProductVariant, import("mongoose").Model<ProductVariant, any, any, any, Document<unknown, any, ProductVariant, any, {}> & ProductVariant & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ProductVariant, Document<unknown, {}, import("mongoose").FlatRecord<ProductVariant>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<ProductVariant> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
export declare class Product {
    _id: Types.ObjectId;
    name: string;
    slug: string;
    description?: string;
    shortDescription?: string;
    category: Types.ObjectId;
    images: string[];
    price: number;
    compareAtPrice?: number;
    sku: string;
    stock: number;
    trackStock: boolean;
    lowStockThreshold: number;
    variants: ProductVariant[];
    isActive: boolean;
    isFeatured: boolean;
    tags: string[];
    weight?: number;
    dimensions?: {
        length: number;
        width: number;
        height: number;
    };
    gstPercentage: number;
    hsnCode?: string;
    metadata: Record<string, unknown>;
    totalSold: number;
    viewCount: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ProductSchema: import("mongoose").Schema<Product, import("mongoose").Model<Product, any, any, any, Document<unknown, any, Product, any, {}> & Product & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Product, Document<unknown, {}, import("mongoose").FlatRecord<Product>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Product> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
