import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ChatSession, ChatSessionDocument } from '../chatbot/schemas/chat-session.schema';
import { MessageLog, MessageLogDocument } from '../whatsapp/schemas/message-log.schema';
import { AnalyticsSnapshot, AnalyticsSnapshotDocument, SnapshotPeriod } from './schemas/analytics-snapshot.schema';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ChatSession.name) private chatSessionModel: Model<ChatSessionDocument>,
    @InjectModel(MessageLog.name) private messageLogModel: Model<MessageLogDocument>,
    @InjectModel(AnalyticsSnapshot.name) private snapshotModel: Model<AnalyticsSnapshotDocument>,
  ) {}

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

      const snapshot = new this.snapshotModel({
        period,
        date: startDate,
        orders: orderMetrics,
        customers: customerMetrics,
        products: productMetrics,
        chat: chatMetrics,
      });

      await snapshot.save();
    } catch (error) {
      this.logger.error('Failed to create analytics snapshot', error);
    }
  }

  async getDashboardStats(): Promise<Record<string, unknown>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const [todayOrders, monthOrders, totalCustomers, pendingOrders] = await Promise.all([
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: today } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: '$total' },
          },
        },
      ]),
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: thisMonth } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: '$total' },
          },
        },
      ]),
      this.userModel.countDocuments(),
      this.orderModel.countDocuments({
        status: { $in: ['pending', 'confirmed', 'processing'] },
      }),
    ]);

    const recentOrders = await this.orderModel
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name phone')
      .select('orderNumber total status createdAt')
      .exec();

    return {
      todayOrders: todayOrders[0]?.count || 0,
      todayRevenue: todayOrders[0]?.revenue || 0,
      monthOrders: monthOrders[0]?.count || 0,
      monthRevenue: monthOrders[0]?.revenue || 0,
      totalCustomers,
      pendingOrders,
      recentOrders,
    };
  }

  async getOrderMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, unknown>> {
    const result = await this.orderModel.aggregate([
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
                { $in: ['$status', ['pending', 'confirmed', 'processing']] },
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
    const [totalCustomers, newCustomers, activeCustomers] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({
        createdAt: { $gte: startDate, $lt: endDate },
      }),
      this.userModel.countDocuments({
        lastOrderAt: { $gte: startDate },
      }),
    ]);

    const returningCustomers = await this.orderModel.aggregate([
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
    const [totalProducts, activeProducts, outOfStock, lowStock] = await Promise.all([
      this.productModel.countDocuments(),
      this.productModel.countDocuments({ isActive: true }),
      this.productModel.countDocuments({ isActive: true, stock: { $lte: 0 } }),
      this.productModel.countDocuments({
        isActive: true,
        trackStock: true,
        $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      }),
    ]);

    const topSelling = await this.orderModel.aggregate([
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
    const [totalSessions, messageStats, supportHandoffs] = await Promise.all([
      this.chatSessionModel.countDocuments({
        createdAt: { $gte: startDate, $lt: endDate },
      }),
      this.messageLogModel.aggregate([
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
      this.chatSessionModel.countDocuments({
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
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const result = await this.orderModel.aggregate([
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
      { $sort: { _id: 1 } },
    ]);

    return result.map((item) => ({
      date: item._id,
      revenue: item.revenue,
      orders: item.orders,
    }));
  }

  async getSnapshots(
    period: SnapshotPeriod,
    limit: number = 30,
  ): Promise<AnalyticsSnapshot[]> {
    return this.snapshotModel
      .find({ period })
      .sort({ date: -1 })
      .limit(limit)
      .exec();
  }
}
