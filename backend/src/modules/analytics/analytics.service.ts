import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  ) {}

  private effectiveStart(nominal: Date, resetAt: Date | null): Date {
    if (resetAt && resetAt > nominal) return resetAt;
    return nominal;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDailySnapshot(): Promise<void> {
    this.logger.log('Generating daily analytics snapshot');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.createSnapshot('daily', yesterday, today);
  }

  @Cron(CronExpression.EVERY_WEEK)
  async generateWeeklySnapshot(): Promise<void> {
    this.logger.log('Generating weekly analytics snapshot');

    const lastWeekStart = new Date();
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    lastWeekStart.setHours(0, 0, 0, 0);

    const lastWeekEnd = new Date();
    lastWeekEnd.setHours(0, 0, 0, 0);

    await this.createSnapshot('weekly', lastWeekStart, lastWeekEnd);
  }

  @Cron('0 0 1 * *')
  async generateMonthlySnapshot(): Promise<void> {
    this.logger.log('Generating monthly analytics snapshot');

    const lastMonthStart = new Date();
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    lastMonthStart.setDate(1);
    lastMonthStart.setHours(0, 0, 0, 0);

    const lastMonthEnd = new Date();
    lastMonthEnd.setDate(1);
    lastMonthEnd.setHours(0, 0, 0, 0);

    await this.createSnapshot('monthly', lastMonthStart, lastMonthEnd);
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
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      storeSaleModel.aggregate([
        { $match: { createdAt: { $gte: thisMonth } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      this.userRepository.countDocuments(),
      orderModel.countDocuments({ status: { $in: [...ORDER_STATUSES_PENDING_FULFILLMENT] }, createdAt: { $gte: resetAt ?? new Date(0) } }),
    ]);

    const recentOrders = await orderModel
      .find(resetAt ? { createdAt: { $gte: resetAt } } : {})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name phone')
      .select('orderNumber total status createdAt')
      .exec();

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
    const [totalCustomers, newCustomers, activeCustomers] = await Promise.all([
      userModel.countDocuments(),
      userModel.countDocuments({
        createdAt: { $gte: startDate, $lt: endDate },
      }),
      userModel.countDocuments({
        lastOrderAt: { $gte: startDate },
      }),
    ]);

    const returningCustomers = await this.orderRepository.getModel().aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: '$user',
          orderCount: { $sum: 1 },
        },
      },
      {
        $match: {
          orderCount: { $gt: 1 },
        },
      },
      {
        $count: 'count',
      },
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
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
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
        { $match: { store: storeObjId, createdAt: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      storeSaleModel.aggregate([
        { $match: { store: storeObjId, createdAt: { $gte: thisMonth } } },
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
      { $match: { createdAt: { $gte: today } } },
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
        $match: {
          store: storeObjId,
          createdAt: { $gte: startDate, $lte: endDate },
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
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
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
            $match: {
              store: store._id,
              createdAt: { $gte: thisMonthStart },
            },
          },
          { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
        ]),
        storeSaleModel.aggregate([
          {
            $match: {
              store: store._id,
              createdAt: { $gte: lastMonthStart, $lt: thisMonthStart },
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
