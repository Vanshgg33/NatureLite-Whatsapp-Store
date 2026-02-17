import { Document, Types } from 'mongoose';
export type CartDocument = Cart & Document;
export declare class CartItem {
    product: Types.ObjectId;
    variantSku?: string;
    quantity: number;
    price: number;
    name: string;
    image?: string;
    addedAt: Date;
}
export declare const CartItemSchema: import("mongoose").Schema<CartItem, import("mongoose").Model<CartItem, any, any, any, Document<unknown, any, CartItem, any, {}> & CartItem & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, CartItem, Document<unknown, {}, import("mongoose").FlatRecord<CartItem>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<CartItem> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
export declare class Cart {
    _id: Types.ObjectId;
    user: Types.ObjectId;
    items: CartItem[];
    couponCode?: string;
    discount: number;
    subtotal: number;
    total: number;
    abandonedAt?: Date;
    abandonedReminderSent: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const CartSchema: import("mongoose").Schema<Cart, import("mongoose").Model<Cart, any, any, any, Document<unknown, any, Cart, any, {}> & Cart & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Cart, Document<unknown, {}, import("mongoose").FlatRecord<Cart>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Cart> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
