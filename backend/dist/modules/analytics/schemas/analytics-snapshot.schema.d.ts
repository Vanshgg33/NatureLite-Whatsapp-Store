import { Document, Types } from 'mongoose';
export type AnalyticsSnapshotDocument = AnalyticsSnapshot & Document;
export type SnapshotPeriod = 'daily' | 'weekly' | 'monthly';
export declare class OrderMetrics {
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    pendingOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    codOrders: number;
    prepaidOrders: number;
}
export declare class CustomerMetrics {
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    activeCustomers: number;
}
export declare class ProductMetrics {
    totalProducts: number;
    activeProducts: number;
    outOfStockProducts: number;
    lowStockProducts: number;
    topSellingProducts: Array<{
        productId: string;
        name: string;
        quantitySold: number;
        revenue: number;
    }>;
}
export declare class ChatMetrics {
    totalSessions: number;
    totalMessages: number;
    inboundMessages: number;
    outboundMessages: number;
    supportHandoffs: number;
    averageSessionDuration: number;
}
export declare class AnalyticsSnapshot {
    _id: Types.ObjectId;
    period: SnapshotPeriod;
    date: Date;
    orders: OrderMetrics;
    customers: CustomerMetrics;
    products: ProductMetrics;
    chat: ChatMetrics;
    topCategories: Array<{
        categoryId: string;
        name: string;
        orderCount: number;
        revenue: number;
    }>;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const AnalyticsSnapshotSchema: import("mongoose").Schema<AnalyticsSnapshot, import("mongoose").Model<AnalyticsSnapshot, any, any, any, Document<unknown, any, AnalyticsSnapshot, any, {}> & AnalyticsSnapshot & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AnalyticsSnapshot, Document<unknown, {}, import("mongoose").FlatRecord<AnalyticsSnapshot>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<AnalyticsSnapshot> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
