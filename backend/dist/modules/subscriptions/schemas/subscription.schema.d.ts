import { Document, Types } from 'mongoose';
export type SubscriptionDocument = Subscription & Document;
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'completed';
export type SubscriptionFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export declare class SubscriptionItem {
    product: Types.ObjectId;
    name: string;
    variantSku?: string;
    quantity: number;
    price: number;
}
export declare const SubscriptionItemSchema: import("mongoose").Schema<SubscriptionItem, import("mongoose").Model<SubscriptionItem, any, any, any, Document<unknown, any, SubscriptionItem, any, {}> & SubscriptionItem & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, SubscriptionItem, Document<unknown, {}, import("mongoose").FlatRecord<SubscriptionItem>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<SubscriptionItem> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
export declare class Subscription {
    _id: Types.ObjectId;
    user: Types.ObjectId;
    items: SubscriptionItem[];
    frequency: SubscriptionFrequency;
    status: SubscriptionStatus;
    nextDeliveryDate: Date;
    lastDeliveryDate?: Date;
    totalDeliveries: number;
    maxDeliveries?: number;
    shippingAddress: {
        name: string;
        phone: string;
        street: string;
        city: string;
        state: string;
        pincode: string;
        landmark?: string;
    };
    paymentMethod: string;
    totalAmount: number;
    pausedAt?: Date;
    pauseReason?: string;
    cancelledAt?: Date;
    cancelReason?: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const SubscriptionSchema: import("mongoose").Schema<Subscription, import("mongoose").Model<Subscription, any, any, any, Document<unknown, any, Subscription, any, {}> & Subscription & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Subscription, Document<unknown, {}, import("mongoose").FlatRecord<Subscription>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Subscription> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
