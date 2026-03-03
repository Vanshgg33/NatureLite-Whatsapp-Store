import { AnalyticsService } from './analytics.service';
import { SnapshotPeriod } from './schemas/analytics-snapshot.schema';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    getDashboardStats(): Promise<Record<string, unknown>>;
    getOrderMetrics(startDate: string, endDate: string): Promise<Record<string, unknown>>;
    getCustomerMetrics(startDate: string, endDate: string): Promise<Record<string, unknown>>;
    getProductMetrics(startDate: string, endDate: string): Promise<Record<string, unknown>>;
    getChatMetrics(startDate: string, endDate: string): Promise<Record<string, unknown>>;
    getRevenueByDay(days?: string): Promise<Array<{
        date: string;
        revenue: number;
        orders: number;
    }>>;
    getSnapshots(period?: SnapshotPeriod, limit?: string): Promise<unknown[]>;
    getStoreDashboardStats(storeId: string): Promise<Record<string, unknown>>;
    getTodayRevenuePerStore(): Promise<any[]>;
    getMultiStoreRevenue(days?: string): Promise<any[]>;
    getStockSummaryPerStore(): Promise<any[]>;
    getTopSellingByStore(storeId: string, startDate?: string, endDate?: string): Promise<any[]>;
    getTopSellingOverall(startDate?: string, endDate?: string): Promise<any[]>;
    getMonthOverMonthByStore(): Promise<any[]>;
    getTopCustomersByStore(storeId: string): Promise<any[]>;
    getTopCustomersOverall(): Promise<any[]>;
}
