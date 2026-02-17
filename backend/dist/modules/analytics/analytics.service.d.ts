import { Model } from 'mongoose';
import { OrderDocument } from '../orders/schemas/order.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { ProductDocument } from '../products/schemas/product.schema';
import { ChatSessionDocument } from '../chatbot/schemas/chat-session.schema';
import { MessageLogDocument } from '../whatsapp/schemas/message-log.schema';
import { AnalyticsSnapshot, AnalyticsSnapshotDocument, SnapshotPeriod } from './schemas/analytics-snapshot.schema';
export declare class AnalyticsService {
    private orderModel;
    private userModel;
    private productModel;
    private chatSessionModel;
    private messageLogModel;
    private snapshotModel;
    private readonly logger;
    constructor(orderModel: Model<OrderDocument>, userModel: Model<UserDocument>, productModel: Model<ProductDocument>, chatSessionModel: Model<ChatSessionDocument>, messageLogModel: Model<MessageLogDocument>, snapshotModel: Model<AnalyticsSnapshotDocument>);
    generateDailySnapshot(): Promise<void>;
    generateWeeklySnapshot(): Promise<void>;
    generateMonthlySnapshot(): Promise<void>;
    private createSnapshot;
    getDashboardStats(): Promise<Record<string, unknown>>;
    getOrderMetrics(startDate: Date, endDate: Date): Promise<Record<string, unknown>>;
    getCustomerMetrics(startDate: Date, endDate: Date): Promise<Record<string, unknown>>;
    getProductMetrics(startDate: Date, endDate: Date): Promise<Record<string, unknown>>;
    getChatMetrics(startDate: Date, endDate: Date): Promise<Record<string, unknown>>;
    getRevenueByDay(days?: number): Promise<Array<{
        date: string;
        revenue: number;
        orders: number;
    }>>;
    getSnapshots(period: SnapshotPeriod, limit?: number): Promise<AnalyticsSnapshot[]>;
}
