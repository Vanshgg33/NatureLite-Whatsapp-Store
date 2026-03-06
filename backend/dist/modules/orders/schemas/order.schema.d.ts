import { Document, Types } from 'mongoose';
export type OrderDocument = Order & Document;
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned' | 'refunded';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'cod' | 'prepaid' | 'upi' | 'card' | 'netbanking' | 'wallet';
export declare class OrderItem {
    product: Types.ObjectId;
    name: string;
    variantSku?: string;
    variantName?: string;
    quantity: number;
    price: number;
    total: number;
    image?: string;
    gstAmount: number;
}
export declare const OrderItemSchema: import("mongoose").Schema<OrderItem, import("mongoose").Model<OrderItem, any, any, any, Document<unknown, any, OrderItem, any, {}> & OrderItem & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, OrderItem, Document<unknown, {}, import("mongoose").FlatRecord<OrderItem>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<OrderItem> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
export declare class ShippingAddress {
    name: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
}
export declare const ShippingAddressSchema: import("mongoose").Schema<ShippingAddress, import("mongoose").Model<ShippingAddress, any, any, any, Document<unknown, any, ShippingAddress, any, {}> & ShippingAddress & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ShippingAddress, Document<unknown, {}, import("mongoose").FlatRecord<ShippingAddress>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<ShippingAddress> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
export declare class TimelineEntry {
    status: string;
    message: string;
    timestamp: Date;
    updatedBy?: string;
    metadata?: Record<string, unknown>;
}
export declare const TimelineEntrySchema: import("mongoose").Schema<TimelineEntry, import("mongoose").Model<TimelineEntry, any, any, any, Document<unknown, any, TimelineEntry, any, {}> & TimelineEntry & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TimelineEntry, Document<unknown, {}, import("mongoose").FlatRecord<TimelineEntry>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<TimelineEntry> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
export declare class Order {
    _id: Types.ObjectId;
    orderNumber: string;
    user: Types.ObjectId;
    items: OrderItem[];
    shippingAddress: ShippingAddress;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    subtotal: number;
    discount: number;
    couponCode?: string;
    walletUsed: number;
    paymentGatewayAmount: number;
    shippingCharge: number;
    gstTotal: number;
    total: number;
    notes?: string;
    adminNotes?: string;
    priorityTags: string[];
    timeline: TimelineEntry[];
    awbNumber?: string;
    courierName?: string;
    trackingUrl?: string;
    expectedDeliveryDate?: Date;
    deliveredAt?: Date;
    packedAt?: Date;
    packedBy?: string;
    billedAt?: Date;
    billedBy?: string;
    outForDeliveryAt?: Date;
    cancelledAt?: Date;
    cancelReason?: string;
    returnRequestedAt?: Date;
    returnRequestReason?: string;
    returnRequestStatus?: 'requested' | 'approved' | 'rejected' | 'completed';
    invoiceUrl?: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const OrderSchema: import("mongoose").Schema<Order, import("mongoose").Model<Order, any, any, any, Document<unknown, any, Order, any, {}> & Order & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Order, Document<unknown, {}, import("mongoose").FlatRecord<Order>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Order> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
