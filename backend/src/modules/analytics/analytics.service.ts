import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AnalyticsSnapshotRepository } from './repositories/analytics-snapshot.repository';
import { OrderRepository } from '../orders/repositories/order.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { ProductRepository } from '../products/repositories/product.repository';
import { ChatSessionRepository } from '../chatbot/repositories/chat-session.repository';
import { MessageLogRepository } from '../whatsapp/repositories/message-log.repository';
import { StoreSaleRepository } from '../store-sales/repositories/store-sale.repository';
import { StoreStockRepository } from '../store-stock/repositories/store-stock.repository';
import { StoreRepository } from '../stores/repositories/store.repository';
import { SettingsService } from '../settings/settings.service';
import { AnalyticsSnapshot, SnapshotPeriod } from './schemas/analytics-snapshot.schema';
import { parseObjectId } from '../../common/utils/objectid.util';
import { ORDER_STATUSES_PENDING_FULFILLMENT } from '../../common/constants/order-status';
import { QUEUE_ANALYTICS, ANALYTICS_JOBS, DEFAULT_JOB_OPTIONS } from '../queues/queues.constants';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly userRepository: UserRepository,
    private readonly productRepository: ProductRepository,
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly messageLogRepository: MessageLogRepository,
    private readonly snapshotRepository: AnalyticsSnapshotRepository,
    private readonly storeSaleRepository: StoreSaleRepository,
    private readonly storeStockRepository: StoreStockRepository,
    private readonly storeRepository: StoreRepository,
    private readonly settingsService: SettingsService,
    @InjectQueue(QUEUE_ANALYTICS) private readonly analyticsQueue: Queue,
  ) {}

  private effectiveStart(nominal: Date, resetAt: Date | null): Date {
    if (resetAt && resetAt > nominal) return resetAt;
    return nominal;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'Asia/Kolkata' })
  async generateDailySnapshot(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dateKey = yesterday.toISOString().slice(0, 10);
    await this.analyticsQueue.add(
      ANALYTICS_JOBS.DAILY_SNAPSHOT,
      { startDate: yesterday.toISOString(), endDate: today.toISOString() },
      { ...DEFAULT_JOB_OPTIONS, attempts: 2, jobId: `analytics-daily-${dateKey}` },
    );
    this.logger.log(`Enqueued daily analytics snapshot for ${dateKey}`);
  }

  @Cron(CronExpression.EVERY_WEEK)
  async generateWeeklySnapshot(): Promise<void> {
    const lastWeekStart = new Date();
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    lastWeekStart.setHours(0, 0, 0, 0);

    const lastWeekEnd = new Date();
    lastWeekEnd.setHours(0, 0, 0, 0);

    const dateKey = lastWeekStart.toISOString().slice(0, 10);
    await this.analyticsQueue.add(
      ANALYTICS_JOBS.WEEKLY_SNAPSHOT,
      { startDate: lastWeekStart.toISOString(), endDate: lastWeekEnd.toISOString() },
      { ...DEFAULT_JOB_OPTIONS, attempts: 2, jobId: `analytics-weekly-${dateKey}` },
    );
    this.logger.log(`Enqueued weekly analytics snapshot starting ${dateKey}`);
  }

  @Cron('0 0 1 * *')
  async generateMonthlySnapshot(): Promise<void> {
    const lastMonthStart = new Date();
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    lastMonthStart.setDate(1);
    lastMonthStart.setHours(0, 0, 0, 0);

    const lastMonthEnd = new Date();
    lastMonthEnd.setDate(1);
    lastMonthEnd.setHours(0, 0, 0, 0);

    const dateKey = lastMonthStart.toISOString().slice(0, 7);
    await this.analyticsQueue.add(
      ANALYTICS_JOBS.MONTHLY_SNAPSHOT,
      { startDate: lastMonthStart.toISOString(), endDate: lastMonthEnd.toISOString() },
      { ...DEFAULT_JOB_OPTIONS, attempts: 2, jobId: `analytics-monthly-${dateKey}` },
    );
    this.logger.log(`Enqueued monthly analytics snapshot for ${dateKey}`);
  }

  async _executeDailySnapshot(data: { startDate: string; endDate: string }): Promise<void> {
    this.logger.log('Executing daily analytics snapshot');
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    const [orderMetrics, customerMetrics, productMetrics, chatMetrics] = await Promise.all([
      this.getOrderMetrics(startDate, endDate),
      this.getCustomerMetrics(startDate, endDate),
      this.getProductMetrics(startDate, endDate),
      this.getChatMetrics(startDate, endDate),
    ]);

    await this.createSnapshotFromMetrics('daily', startDate, endDate, orderMetrics, customerMetrics, productMetrics, chatMetrics);
    await this.generateFullDailyReport(startDate, endDate, orderMetrics, customerMetrics, productMetrics, chatMetrics);
  }

  async _executeWeeklySnapshot(data: { startDate: string; endDate: string }): Promise<void> {
    this.logger.log('Executing weekly analytics snapshot');
    await this.createSnapshot('weekly', new Date(data.startDate), new Date(data.endDate));
  }

  async _executeMonthlySnapshot(data: { startDate: string; endDate: string }): Promise<void> {
    this.logger.log('Executing monthly analytics snapshot');
    await this.createSnapshot('monthly', new Date(data.startDate), new Date(data.endDate));
  }

  private async createSnapshotFromMetrics(
    period: SnapshotPeriod,
    startDate: Date,
    endDate: Date,
    orderMetrics: Record<string, unknown>,
    customerMetrics: Record<string, unknown>,
    productMetrics: Record<string, unknown>,
    chatMetrics: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.snapshotRepository.create({
        period,
        date: startDate,
        orders: orderMetrics,
        customers: customerMetrics,
        products: productMetrics,
        chat: chatMetrics,
      } as any);
    } catch (error) {
      this.logger.error('Failed to create analytics snapshot', error);
    }
  }

  private async createSnapshot(
    period: SnapshotPeriod,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    try {
      const [orderMetrics, customerMetrics, productMetrics, chatMetrics] = await Promise.all([
        this.getOrderMetrics(startDate, endDate),
        this.getCustomerMetrics(startDate, endDate),
        this.getProductMetrics(startDate, endDate),
        this.getChatMetrics(startDate, endDate),
      ]);

      await this.snapshotRepository.create({
        period,
        date: startDate,
        orders: orderMetrics,
        customers: customerMetrics,
        products: productMetrics,
        chat: chatMetrics,
      } as any);
    } catch (error) {
      this.logger.error('Failed to create analytics snapshot', error);
    }
  }

  private formatCurrency(amount: number): string {
    return `Rs ${Math.round(amount).toLocaleString('en-IN')}`;
  }

  private formatPercent(value: number): string {
    return `${Math.round(value * 10) / 10}%`;
  }

  private async generateFullDailyReport(
    startDate: Date,
    endDate: Date,
    preOrders?: Record<string, unknown>,
    preCustomers?: Record<string, unknown>,
    preProducts?: Record<string, unknown>,
    preChat?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const [orders, customers, products, chat, revenueSeries, topOverallProducts, topCustomersOverall] = await Promise.all([
        preOrders   ? Promise.resolve(preOrders)   : this.getOrderMetrics(startDate, endDate),
        preCustomers ? Promise.resolve(preCustomers) : this.getCustomerMetrics(startDate, endDate),
        preProducts  ? Promise.resolve(preProducts)  : this.getProductMetrics(startDate, endDate),
        preChat      ? Promise.resolve(preChat)      : this.getChatMetrics(startDate, endDate),
        this.getRevenueByDay(14),
        this.getTopSellingOverall(startDate, endDate, 5),
        this.getTopCustomersOverall(5),
      ]);

      const o = orders as Record<string, number>;
      const c = customers as Record<string, number>;
      const p = products as Record<string, unknown>;
      const m = chat as Record<string, number>;

      const totalOrders = Number(o.totalOrders || 0);
      const deliveredOrders = Number(o.completedOrders || 0);
      const cancelledOrders = Number(o.cancelledOrders || 0);
      const pendingOrders = Number(o.pendingOrders || 0);
      const totalRevenue = Number(o.totalRevenue || 0);
      const aov = Number(o.avgOrderValue || 0);
      const codOrders = Number(o.codOrders || 0);
      const prepaidOrders = Number(o.prepaidOrders || 0);

      const deliveredRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0;
      const cancelRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;
      const prepaidShare = totalOrders > 0 ? (prepaidOrders / totalOrders) * 100 : 0;

      const topSelling = (p.topSellingProducts as Array<{ name: string; quantitySold: number; revenue: number }> | undefined) ?? [];
      const reportDate = startDate.toISOString().split('T')[0];

      const summary = [
        `Daily Analytics Report (${reportDate})`,
        '',
        `Revenue: ${this.formatCurrency(totalRevenue)}`,
        `Orders: ${totalOrders} total | ${deliveredOrders} delivered | ${pendingOrders} pending | ${cancelledOrders} cancelled`,
        `AOV: ${this.formatCurrency(aov)} | Prepaid mix: ${this.formatPercent(prepaidShare)} | COD: ${codOrders}`,
        `Customer growth: +${Number(c.newCustomers || 0)} new | ${Number(c.returningCustomers || 0)} returning`,
        `Inventory risk: ${Number(p.outOfStockProducts || 0)} out-of-stock | ${Number(p.lowStockProducts || 0)} low-stock`,
      ].join('\n');

      const detailed = {
        date: reportDate,
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        kpis: {
          totalRevenue,
          totalOrders,
          deliveredOrders,
          pendingOrders,
          cancelledOrders,
          deliveredRate,
          cancelRate,
          averageOrderValue: aov,
          codOrders,
          prepaidOrders,
          prepaidShare,
          totalCustomers: Number(c.totalCustomers || 0),
          newCustomers: Number(c.newCustomers || 0),
          returningCustomers: Number(c.returningCustomers || 0),
          activeCustomers: Number(c.activeCustomers || 0),
          totalProducts: Number(p.totalProducts || 0),
          activeProducts: Number(p.activeProducts || 0),
          outOfStockProducts: Number(p.outOfStockProducts || 0),
          lowStockProducts: Number(p.lowStockProducts || 0),
          chatSessions: Number(m.totalSessions || 0),
          chatMessages: Number(m.totalMessages || 0),
          supportHandoffs: Number(m.supportHandoffs || 0),
        },
        topSellingProducts: topSelling.slice(0, 5),
        topProductsOverall: topOverallProducts,
        topCustomersOverall,
        revenueTrendLast14Days: revenueSeries,
      };

      await this.snapshotRepository.getModel().updateOne(
        { period: 'daily', date: startDate },
        {
          $set: {
            metadata: {
              dailyReportGeneratedAt: new Date().toISOString(),
              dailyReportSummary: summary,
              dailyReport: detailed,
            },
          },
        },
      ).exec();

      this.logger.log(`Generated full daily analytics report for ${reportDate}`);
    } catch (error) {
      this.logger.error('Failed to generate full daily analytics report', error);
    }
  }

  private buildMockDashboardStats(): Record<string, unknown> {
    const now = new Date();
    return {
      todayOrders: 12,
      todayRevenue: 8450,
      monthOrders: 284,
      monthRevenue: 198600,
      totalCustomers: 1247,
      pendingOrders: 23,
      recentOrders: [
        { _id: 'mock1', orderNumber: 'ORD-1001', total: 1250, status: 'confirmed', createdAt: new Date(now.getTime() - 900000), user: { name: 'Priya Sharma', phone: '+919876543210' } },
        { _id: 'mock2', orderNumber: 'ORD-1000', total: 750,  status: 'shipped',   createdAt: new Date(now.getTime() - 3600000), user: { name: 'Rahul Gupta',  phone: '+919871234567' } },
        { _id: 'mock3', orderNumber: 'ORD-999',  total: 2100, status: 'delivered', createdAt: new Date(now.getTime() - 7200000), user: { name: 'Anita Patel',  phone: '+919856789012' } },
        { _id: 'mock4', orderNumber: 'ORD-998',  total: 550,  status: 'confirmed', createdAt: new Date(now.getTime() - 10800000), user: { name: 'Vijay Kumar',  phone: '+919845678901' } },
        { _id: 'mock5', orderNumber: 'ORD-997',  total: 1800, status: 'shipped',   createdAt: new Date(now.getTime() - 14400000), user: { name: 'Sunita Reddy', phone: '+919834567890' } },
      ],
    };
  }

  private buildMockRevenueByDay(days: number): Array<{ date: string; revenue: number; orders: number }> {
    const BASE = [5200,7800,6400,8900,7200,9100,11200,6800,7400,8200,6100,9500,8300,7600,10200,5900,8700,7100,9800,6500,8100,7300,10500,6700,9200,8800,7500,11000,6300,9600];
    const result: Array<{ date: string; revenue: number; orders: number }> = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const revenue = BASE[i % BASE.length];
      result.push({ date: d.toISOString().split('T')[0], revenue, orders: Math.round(revenue / 650) });
    }
    return result;
  }

  async getDashboardStats(): Promise<Record<string, unknown>> {
    if (await this.settingsService.getMockDataEnabled()) {
      return this.buildMockDashboardStats();
    }

    const resetAt = await this.settingsService.getMetricsResetAt();

    const todayNominal = new Date();
    todayNominal.setHours(0, 0, 0, 0);

    const thisMonthNominal = new Date();
    thisMonthNominal.setDate(1);
    thisMonthNominal.setHours(0, 0, 0, 0);

    const today = this.effectiveStart(todayNominal, resetAt);
    const thisMonth = this.effectiveStart(thisMonthNominal, resetAt);

    const orderModel = this.orderRepository.getModel();
    const storeSaleModel = this.storeSaleRepository.getModel();
    const [
      todayOrders,
      monthOrders,
      todayStoreSales,
      monthStoreSales,
      totalCustomers,
      pendingOrders,
      recentOrders,
    ] = await Promise.all([
      orderModel.aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      orderModel.aggregate([
        { $match: { createdAt: { $gte: thisMonth } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      storeSaleModel.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
          },
        },
        { $match: { effectiveDate: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      storeSaleModel.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
          },
        },
        { $match: { effectiveDate: { $gte: thisMonth } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      this.userRepository.countDocuments(),
      orderModel.countDocuments({ status: { $in: [...ORDER_STATUSES_PENDING_FULFILLMENT] }, createdAt: { $gte: resetAt ?? new Date(0) } }),
      orderModel
        .find(resetAt ? { createdAt: { $gte: resetAt } } : {})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name phone')
        .select('orderNumber total status createdAt shippingAddress')
        .exec(),
    ]);

    return {
      todayOrders: (todayOrders[0]?.count || 0) + (todayStoreSales[0]?.count || 0),
      todayRevenue: (todayOrders[0]?.revenue || 0) + (todayStoreSales[0]?.revenue || 0),
      monthOrders: (monthOrders[0]?.count || 0) + (monthStoreSales[0]?.count || 0),
      monthRevenue: (monthOrders[0]?.revenue || 0) + (monthStoreSales[0]?.revenue || 0),
      totalCustomers,
      pendingOrders,
      recentOrders,
    };
  }

  async getOrderMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, unknown>> {
    const result = await this.orderRepository.getModel().aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          avgOrderValue: { $avg: '$total' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          pendingOrders: {
            $sum: {
              $cond: [
                { $in: ['$status', [...ORDER_STATUSES_PENDING_FULFILLMENT]] },
                1,
                0,
              ],
            },
          },
          codOrders: {
            $sum: { $cond: [{ $eq: ['$paymentMethod', 'cod'] }, 1, 0] },
          },
          prepaidOrders: {
            $sum: { $cond: [{ $ne: ['$paymentMethod', 'cod'] }, 1, 0] },
          },
        },
      },
    ]);

    return result[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      pendingOrders: 0,
      codOrders: 0,
      prepaidOrders: 0,
    };
  }

  async getCustomerMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, unknown>> {
    const userModel = this.userRepository.getModel();
    const [totalCustomers, newCustomers, activeCustomers, returningCustomers] = await Promise.all([
      userModel.countDocuments(),
      userModel.countDocuments({ createdAt: { $gte: startDate, $lt: endDate } }),
      userModel.countDocuments({ lastOrderAt: { $gte: startDate } }),
      this.orderRepository.getModel().aggregate([
        { $match: { createdAt: { $gte: startDate, $lt: endDate } } },
        { $group: { _id: '$user', orderCount: { $sum: 1 } } },
        { $match: { orderCount: { $gt: 1 } } },
        { $count: 'count' },
      ]),
    ]);

    return {
      totalCustomers,
      newCustomers,
      returningCustomers: returningCustomers[0]?.count || 0,
      activeCustomers,
    };
  }

  async getProductMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, unknown>> {
    const productModel = this.productRepository.getModel();
    const [totalProducts, activeProducts, outOfStock, lowStock] = await Promise.all([
      productModel.countDocuments(),
      productModel.countDocuments({ isActive: true }),
      productModel.countDocuments({ isActive: true, stock: { $lte: 0 } }),
      this.productRepository.countLowStock(),
    ]);

    const topSelling = await this.orderRepository.getModel().aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
          status: { $ne: 'cancelled' },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 10 },
    ]);

    return {
      totalProducts,
      activeProducts,
      outOfStockProducts: outOfStock,
      lowStockProducts: lowStock,
      topSellingProducts: topSelling.map((item) => ({
        productId: item._id?.toString(),
        name: item.name,
        quantitySold: item.quantitySold,
        revenue: item.revenue,
      })),
    };
  }

  async getChatMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, unknown>> {
    const chatSessionModel = this.chatSessionRepository.getModel();
    const messageLogModel = this.messageLogRepository.getModel();
    const [totalSessions, messageStats, supportHandoffs] = await Promise.all([
      chatSessionModel.countDocuments({
        createdAt: { $gte: startDate, $lt: endDate },
      }),
      messageLogModel.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lt: endDate },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            inbound: {
              $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] },
            },
            outbound: {
              $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] },
            },
          },
        },
      ]),
      chatSessionModel.countDocuments({
        isHandedOffToSupport: true,
        supportHandoffAt: { $gte: startDate, $lt: endDate },
      }),
    ]);

    return {
      totalSessions,
      totalMessages: messageStats[0]?.total || 0,
      inboundMessages: messageStats[0]?.inbound || 0,
      outboundMessages: messageStats[0]?.outbound || 0,
      supportHandoffs,
    };
  }

  async getRevenueByDay(days: number = 30): Promise<Array<{ date: string; revenue: number; orders: number }>> {
    if (await this.settingsService.getMockDataEnabled()) {
      return this.buildMockRevenueByDay(days);
    }

    const resetAt = await this.settingsService.getMetricsResetAt();
    const nominal = new Date();
    nominal.setDate(nominal.getDate() - days);
    nominal.setHours(0, 0, 0, 0);
    const startDate = this.effectiveStart(nominal, resetAt);

    const [orderResult, storeSaleResult] = await Promise.all([
      this.orderRepository.getModel().aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: { $ne: 'cancelled' },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            revenue: { $sum: '$total' },
            orders: { $sum: 1 },
          },
        },
      ]),
      this.storeSaleRepository.getModel().aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
          },
        },
        { $match: { effectiveDate: { $gte: startDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$effectiveDate' },
            },
            revenue: { $sum: '$total' },
            sales: { $sum: 1 },
          },
        },
      ]),
    ]);

    const dateMap = new Map<string, { revenue: number; orders: number }>();
    for (const item of orderResult) {
      dateMap.set(item._id, {
        revenue: item.revenue,
        orders: item.orders,
      });
    }
    for (const item of storeSaleResult) {
      const existing = dateMap.get(item._id);
      if (existing) {
        existing.revenue += item.revenue;
        existing.orders += item.sales;
      } else {
        dateMap.set(item._id, {
          revenue: item.revenue,
          orders: item.sales,
        });
      }
    }

    return Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, { revenue, orders }]) => ({ date, revenue, orders }));
  }

  async getSnapshots(
    period: SnapshotPeriod,
    limit: number = 30,
  ): Promise<AnalyticsSnapshot[]> {
    return this.snapshotRepository.findByPeriod(period, limit);
  }

  private buildFallbackNarrative(input: {
    startDate: Date;
    endDate: Date;
    orders: Record<string, unknown>;
    customers: Record<string, unknown>;
    products: Record<string, unknown>;
    chat: Record<string, unknown>;
    revenue: Array<{ date: string; revenue: number; orders: number }>;
    topProducts: Array<{ name: string; quantitySold: number; revenue: number }>;
    topCustomers: Array<{ customerName?: string; totalSpent?: number; totalOrders?: number }>;
  }): { headline: string; summary: string; highlights: string[]; watchouts: string[]; actions: string[]; generatedBy: string } {
    const totalRevenue = Number(input.orders.totalRevenue || 0);
    const totalOrders = Number(input.orders.totalOrders || 0);
    const deliveredOrders = Number(input.orders.completedOrders || 0);
    const cancelledOrders = Number(input.orders.cancelledOrders || 0);
    const pendingOrders = Number(input.orders.pendingOrders || 0);
    const aov = Number(input.orders.avgOrderValue || 0);
    const totalCustomers = Number(input.customers.totalCustomers || 0);
    const newCustomers = Number(input.customers.newCustomers || 0);
    const activeCustomers = Number(input.customers.activeCustomers || 0);
    const outOfStock = Number(input.products.outOfStockProducts || 0);
    const lowStock = Number(input.products.lowStockProducts || 0);
    const totalSessions = Number(input.chat.totalSessions || 0);
    const supportHandoffs = Number(input.chat.supportHandoffs || 0);

    const bestProduct = input.topProducts[0];
    const bestCustomer = input.topCustomers[0];
    const peakDay = [...input.revenue].sort((a, b) => b.revenue - a.revenue)[0];
    const periodLabel = `${input.startDate.toLocaleDateString('en-IN')} to ${input.endDate.toLocaleDateString('en-IN')}`;

    return {
      headline: `Analytics report for ${periodLabel}`,
      summary: `The business generated ${Math.round(totalRevenue).toLocaleString('en-IN')} in revenue from ${totalOrders} orders. ${
        deliveredOrders > 0 ? `${deliveredOrders} orders were delivered` : 'Delivery activity was limited'
      }, while ${cancelledOrders} were cancelled and ${pendingOrders} remain pending. Average order value stood at ${Math.round(aov).toLocaleString('en-IN')}. Customer activity included ${newCustomers} new customers out of ${totalCustomers} total, and operations showed ${outOfStock} out-of-stock products with ${lowStock} more running low. Chat activity reached ${totalSessions} sessions with ${supportHandoffs} support handoffs.`,
      highlights: [
        `Top revenue day: ${peakDay ? `${peakDay.date} (${Math.round(peakDay.revenue).toLocaleString('en-IN')})` : 'N/A'}`,
        bestProduct ? `Best-selling product: ${bestProduct.name} (${bestProduct.quantitySold} units)` : 'No top product available',
        bestCustomer ? `Top customer: ${bestCustomer.customerName || 'Customer'} (${Math.round(Number(bestCustomer.totalSpent || 0)).toLocaleString('en-IN')})` : 'No top customer available',
        `Active customers tracked: ${activeCustomers}`,
      ],
      watchouts: [
        `${outOfStock} products are fully out of stock`,
        `${lowStock} products are in the low-stock bucket`,
        `${supportHandoffs} support handoffs indicate service friction`,
      ],
      actions: [
        'Prioritize replenishing out-of-stock and low-stock products.',
        'Review the top selling SKUs and keep them featured in stock planning.',
        'Reduce support handoffs by improving product info and checkout clarity.',
      ],
      generatedBy: 'fallback',
    };
  }

  private async generateGeminiNarrative(prompt: string): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.5,
              maxOutputTokens: 700,
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      if (!response.ok) return null;

      const data = await response.json() as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      return data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim() || null;
    } catch (error) {
      this.logger.warn(`Gemini narrative generation failed: ${(error as Error).message}`);
      return null;
    }
  }

  async getLatestDailyReport(): Promise<Record<string, unknown> | null> {
    const latest = await this.snapshotRepository.getModel()
      .findOne({ period: 'daily' })
      .sort({ date: -1 })
      .lean()
      .exec();

    if (!latest) return null;

    const metadata = (latest.metadata ?? {}) as Record<string, unknown>;
    const report = metadata.dailyReport as Record<string, unknown> | undefined;

    if (report) {
      return {
        snapshotDate: latest.date,
        generatedAt: metadata.dailyReportGeneratedAt ?? latest.updatedAt,
        summary: metadata.dailyReportSummary ?? '',
        report,
      };
    }

    const start = new Date(latest.date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    await this.generateFullDailyReport(start, end);

    const refreshed = await this.snapshotRepository.getModel()
      .findById(latest._id)
      .lean()
      .exec();
    if (!refreshed) return null;

    const refreshedMetadata = (refreshed.metadata ?? {}) as Record<string, unknown>;
    return {
      snapshotDate: refreshed.date,
      generatedAt: refreshedMetadata.dailyReportGeneratedAt ?? refreshed.updatedAt,
      summary: refreshedMetadata.dailyReportSummary ?? '',
      report: refreshedMetadata.dailyReport ?? null,
    };
  }

  async getNarrativeReport(startDate: Date, endDate: Date): Promise<Record<string, unknown>> {
    const [orders, customers, products, chat, revenue, topProducts, topCustomers] = await Promise.all([
      this.getOrderMetrics(startDate, endDate),
      this.getCustomerMetrics(startDate, endDate),
      this.getProductMetrics(startDate, endDate),
      this.getChatMetrics(startDate, endDate),
      this.getRevenueByDay(Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000))),
      this.getTopSellingOverall(startDate, endDate, 5),
      this.getTopCustomersOverall(5),
    ]);

    const fallback = this.buildFallbackNarrative({
      startDate,
      endDate,
      orders,
      customers,
      products,
      chat,
      revenue,
      topProducts: topProducts as Array<{ name: string; quantitySold: number; revenue: number }>,
      topCustomers: topCustomers as Array<{ customerName?: string; totalSpent?: number; totalOrders?: number }>,
    });

    const prompt = [
      'You are writing an executive analytics summary for a modern retail admin dashboard.',
      'Return STRICT JSON only with the keys: headline (string), summary (string), highlights (string[]), watchouts (string[]), actions (string[]).',
      'Keep the tone polished, concise, and insightful. No markdown, no code fences.',
      `Date range: ${startDate.toISOString()} to ${endDate.toISOString()}.`,
      `Metrics: ${JSON.stringify({
        orders,
        customers,
        products,
        chat,
        topProducts: topProducts.slice(0, 5),
        topCustomers: topCustomers.slice(0, 5),
        revenue: revenue.slice(-14),
      })}`,
    ].join('\n\n');

    const aiText = await this.generateGeminiNarrative(prompt);
    if (!aiText) return fallback;

    try {
      const parsed = JSON.parse(aiText) as {
        headline?: string;
        summary?: string;
        highlights?: string[];
        watchouts?: string[];
        actions?: string[];
      };

      return {
        headline: parsed.headline || fallback.headline,
        summary: parsed.summary || fallback.summary,
        highlights: Array.isArray(parsed.highlights) && parsed.highlights.length > 0 ? parsed.highlights.slice(0, 4) : fallback.highlights,
        watchouts: Array.isArray(parsed.watchouts) && parsed.watchouts.length > 0 ? parsed.watchouts.slice(0, 3) : fallback.watchouts,
        actions: Array.isArray(parsed.actions) && parsed.actions.length > 0 ? parsed.actions.slice(0, 3) : fallback.actions,
        generatedBy: 'gemini',
      };
    } catch {
      return fallback;
    }
  }

  // ==================== MULTI-STORE ANALYTICS ====================

  async getStoreDashboardStats(storeId: string): Promise<Record<string, unknown>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const storeObjId = parseObjectId(storeId, 'storeId');

    const storeSaleModel = this.storeSaleRepository.getModel();
    const storeStockModel = this.storeStockRepository.getModel();
    const [todaySales, monthSales] = await Promise.all([
      storeSaleModel.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
          },
        },
        { $match: { store: storeObjId, effectiveDate: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      storeSaleModel.aggregate([
        {
          $addFields: {
            effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
          },
        },
        { $match: { store: storeObjId, effectiveDate: { $gte: thisMonth } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
    ]);

    const recentSales = await storeSaleModel
      .find({ store: storeObjId })
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    const lowStock = await this.storeStockRepository.findLowStockByStore(storeObjId);

    return {
      todaySales: todaySales[0]?.count || 0,
      todayRevenue: todaySales[0]?.revenue || 0,
      monthSales: monthSales[0]?.count || 0,
      monthRevenue: monthSales[0]?.revenue || 0,
      recentSales,
      lowStockProducts: lowStock,
    };
  }

  async getTodayRevenuePerStore(): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.storeSaleRepository.getModel().aggregate([
      {
        $addFields: {
          effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
        },
      },
      { $match: { effectiveDate: { $gte: today } } },
      {
        $group: {
          _id: '$store',
          revenue: { $sum: '$total' },
          salesCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'stores',
          localField: '_id',
          foreignField: '_id',
          as: 'storeInfo',
        },
      },
      { $unwind: '$storeInfo' },
      {
        $project: {
          storeId: { $toString: '$_id' },
          storeName: '$storeInfo.name',
          storeCode: '$storeInfo.code',
          revenue: 1,
          salesCount: 1,
        },
      },
      { $sort: { revenue: -1 } },
    ]);
  }

  async getMultiStoreRevenue(days: number = 30): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    return this.storeSaleRepository.getModel().aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            store: '$store',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          },
          revenue: { $sum: '$total' },
          sales: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.store',
          data: {
            $push: { date: '$_id.date', revenue: '$revenue', sales: '$sales' },
          },
        },
      },
      {
        $lookup: {
          from: 'stores',
          localField: '_id',
          foreignField: '_id',
          as: 'storeInfo',
        },
      },
      { $unwind: '$storeInfo' },
      {
        $project: {
          storeId: { $toString: '$_id' },
          storeName: '$storeInfo.name',
          data: { $sortArray: { input: '$data', sortBy: { date: 1 } } },
        },
      },
    ]);
  }

  async getStockSummaryPerStore(): Promise<any[]> {
    const storeModel = this.storeRepository.getModel();
    const storeStockModel = this.storeStockRepository.getModel();
    const stores = await storeModel.find({ isActive: true });
    const result = [];

    for (const store of stores) {
      const [total, inStock, outOfStock, lowStock] = await Promise.all([
        storeStockModel.countDocuments({ store: store._id }),
        storeStockModel.countDocuments({ store: store._id, stock: { $gt: 0 } }),
        storeStockModel.countDocuments({ store: store._id, stock: { $lte: 0 } }),
        this.storeStockRepository.countLowStockByStore(store._id),
      ]);

      result.push({
        storeId: store._id.toString(),
        storeName: store.name,
        storeCode: store.code,
        totalProducts: total,
        inStock,
        outOfStock,
        lowStock,
      });
    }

    return result;
  }

  async getTopSellingByStore(
    storeId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10,
  ): Promise<any[]> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    return this.storeSaleRepository.getModel().aggregate([
      {
        $addFields: {
          effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
        },
      },
      {
        $match: {
          store: storeObjId,
          effectiveDate: { $gte: startDate, $lte: endDate },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: limit },
    ]);
  }

  async getTopSellingOverall(
    startDate: Date,
    endDate: Date,
    limit: number = 10,
  ): Promise<any[]> {
    return this.storeSaleRepository.getModel().aggregate([
      {
        $addFields: {
          effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
        },
      },
      { $match: { effectiveDate: { $gte: startDate, $lte: endDate } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: limit },
    ]);
  }

  async getMonthOverMonthByStore(): Promise<any[]> {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const storeModel = this.storeRepository.getModel();
    const storeSaleModel = this.storeSaleRepository.getModel();
    const stores = await storeModel.find({ isActive: true });
    const result = [];

    for (const store of stores) {
      const [thisMonth, lastMonth] = await Promise.all([
        storeSaleModel.aggregate([
          {
            $addFields: {
              effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
            },
          },
          {
            $match: {
              store: store._id,
              effectiveDate: { $gte: thisMonthStart },
            },
          },
          { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
        ]),
        storeSaleModel.aggregate([
          {
            $addFields: {
              effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
            },
          },
          {
            $match: {
              store: store._id,
              effectiveDate: { $gte: lastMonthStart, $lt: thisMonthStart },
            },
          },
          { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
        ]),
      ]);

      const thisMonthRevenue = thisMonth[0]?.revenue || 0;
      const lastMonthRevenue = lastMonth[0]?.revenue || 0;
      const changePercent = lastMonthRevenue > 0
        ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : thisMonthRevenue > 0 ? 100 : 0;

      result.push({
        storeId: store._id.toString(),
        storeName: store.name,
        thisMonth: thisMonthRevenue,
        thisMonthSales: thisMonth[0]?.count || 0,
        lastMonth: lastMonthRevenue,
        lastMonthSales: lastMonth[0]?.count || 0,
        changePercent: Math.round(changePercent * 10) / 10,
      });
    }

    return result;
  }

  async getTopCustomersByStore(storeId: string, limit: number = 10): Promise<any[]> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    return this.storeSaleRepository.getModel().aggregate([
      {
        $match: {
          store: storeObjId,
          customerPhone: { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: '$customerPhone',
          customerName: { $last: '$customerName' },
          totalSpent: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          lastPurchase: { $max: '$createdAt' },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: limit },
    ]);
  }

  async getTopCustomersOverall(limit: number = 10): Promise<any[]> {
    return this.storeSaleRepository.getModel().aggregate([
      {
        $match: {
          customerPhone: { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: '$customerPhone',
          customerName: { $last: '$customerName' },
          totalSpent: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          lastPurchase: { $max: '$createdAt' },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: limit },
    ]);
  }

  async resetDashboardMetrics(): Promise<{ deletedSnapshots: number }> {
    const now = new Date();
    const [snapshotResult] = await Promise.all([
      this.snapshotRepository.getModel().deleteMany({}).exec(),
      this.settingsService.setMetricsResetAt(now),
    ]);
    this.logger.log(`Reset dashboard metrics: deleted ${snapshotResult.deletedCount} snapshots, baseline set to ${now.toISOString()}`);
    return { deletedSnapshots: snapshotResult.deletedCount };
  }

  async resetCustomerMetrics(): Promise<{ usersReset: number; productsReset: number }> {
    const [usersResult, productsResult] = await Promise.all([
      this.userRepository.getModel().updateMany(
        {},
        { $set: { totalOrders: 0, totalSpent: 0, lastOrderAt: null } },
      ).exec(),
      this.productRepository.getModel().updateMany(
        {},
        { $set: { totalSold: 0, viewCount: 0 } },
      ).exec(),
    ]);
    this.logger.log(
      `Reset customer metrics: ${usersResult.modifiedCount} users, ${productsResult.modifiedCount} products`,
    );
    return {
      usersReset: usersResult.modifiedCount,
      productsReset: productsResult.modifiedCount,
    };
  }
}
