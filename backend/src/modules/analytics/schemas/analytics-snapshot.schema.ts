import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AnalyticsSnapshotDocument = AnalyticsSnapshot & Document;

export type SnapshotPeriod = 'daily' | 'weekly' | 'monthly';

@Schema()
export class OrderMetrics {
  @Prop({ default: 0 })
  totalOrders: number;

  @Prop({ default: 0 })
  completedOrders: number;

  @Prop({ default: 0 })
  cancelledOrders: number;

  @Prop({ default: 0 })
  pendingOrders: number;

  @Prop({ default: 0 })
  totalRevenue: number;

  @Prop({ default: 0 })
  averageOrderValue: number;

  @Prop({ default: 0 })
  codOrders: number;

  @Prop({ default: 0 })
  prepaidOrders: number;
}

@Schema()
export class CustomerMetrics {
  @Prop({ default: 0 })
  totalCustomers: number;

  @Prop({ default: 0 })
  newCustomers: number;

  @Prop({ default: 0 })
  returningCustomers: number;

  @Prop({ default: 0 })
  activeCustomers: number;
}

@Schema()
export class ProductMetrics {
  @Prop({ default: 0 })
  totalProducts: number;

  @Prop({ default: 0 })
  activeProducts: number;

  @Prop({ default: 0 })
  outOfStockProducts: number;

  @Prop({ default: 0 })
  lowStockProducts: number;

  @Prop({ type: [Object], default: [] })
  topSellingProducts: Array<{
    productId: string;
    name: string;
    quantitySold: number;
    revenue: number;
  }>;
}

@Schema()
export class ChatMetrics {
  @Prop({ default: 0 })
  totalSessions: number;

  @Prop({ default: 0 })
  totalMessages: number;

  @Prop({ default: 0 })
  inboundMessages: number;

  @Prop({ default: 0 })
  outboundMessages: number;

  @Prop({ default: 0 })
  supportHandoffs: number;

  @Prop({ default: 0 })
  averageSessionDuration: number;
}

@Schema({ timestamps: true })
export class AnalyticsSnapshot {
  _id: Types.ObjectId;

  @Prop({ required: true })
  period: SnapshotPeriod;

  @Prop({ required: true, index: true })
  date: Date;

  @Prop({ type: Object })
  orders: OrderMetrics;

  @Prop({ type: Object })
  customers: CustomerMetrics;

  @Prop({ type: Object })
  products: ProductMetrics;

  @Prop({ type: Object })
  chat: ChatMetrics;

  @Prop({ type: [Object], default: [] })
  topCategories: Array<{
    categoryId: string;
    name: string;
    orderCount: number;
    revenue: number;
  }>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const AnalyticsSnapshotSchema = SchemaFactory.createForClass(AnalyticsSnapshot);

AnalyticsSnapshotSchema.index({ period: 1, date: -1 });
AnalyticsSnapshotSchema.index({ date: -1 });
