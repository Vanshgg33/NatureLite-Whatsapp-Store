"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AnalyticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const analytics_snapshot_repository_1 = require("./repositories/analytics-snapshot.repository");
const order_repository_1 = require("../orders/repositories/order.repository");
const user_repository_1 = require("../users/repositories/user.repository");
const product_repository_1 = require("../products/repositories/product.repository");
const chat_session_repository_1 = require("../chatbot/repositories/chat-session.repository");
const message_log_repository_1 = require("../whatsapp/repositories/message-log.repository");
const store_sale_repository_1 = require("../store-sales/repositories/store-sale.repository");
const store_stock_repository_1 = require("../store-stock/repositories/store-stock.repository");
const store_repository_1 = require("../stores/repositories/store.repository");
const objectid_util_1 = require("../../common/utils/objectid.util");
let AnalyticsService = AnalyticsService_1 = class AnalyticsService {
    constructor(orderRepository, userRepository, productRepository, chatSessionRepository, messageLogRepository, snapshotRepository, storeSaleRepository, storeStockRepository, storeRepository) {
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
        this.productRepository = productRepository;
        this.chatSessionRepository = chatSessionRepository;
        this.messageLogRepository = messageLogRepository;
        this.snapshotRepository = snapshotRepository;
        this.storeSaleRepository = storeSaleRepository;
        this.storeStockRepository = storeStockRepository;
        this.storeRepository = storeRepository;
        this.logger = new common_1.Logger(AnalyticsService_1.name);
    }
    async generateDailySnapshot() {
        this.logger.log('Generating daily analytics snapshot');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await this.createSnapshot('daily', yesterday, today);
    }
    async generateWeeklySnapshot() {
        this.logger.log('Generating weekly analytics snapshot');
        const lastWeekStart = new Date();
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        lastWeekStart.setHours(0, 0, 0, 0);
        const lastWeekEnd = new Date();
        lastWeekEnd.setHours(0, 0, 0, 0);
        await this.createSnapshot('weekly', lastWeekStart, lastWeekEnd);
    }
    async generateMonthlySnapshot() {
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
    async createSnapshot(period, startDate, endDate) {
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
            });
        }
        catch (error) {
            this.logger.error('Failed to create analytics snapshot', error);
        }
    }
    async getDashboardStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        const orderModel = this.orderRepository.getModel();
        const storeSaleModel = this.storeSaleRepository.getModel();
        const [todayOrders, monthOrders, todayStoreSales, monthStoreSales, totalCustomers, pendingOrders,] = await Promise.all([
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
            orderModel.countDocuments({ status: { $in: ['pending', 'confirmed', 'processing'] } }),
        ]);
        const recentOrders = await orderModel
            .find()
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
    async getOrderMetrics(startDate, endDate) {
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
    async getCustomerMetrics(startDate, endDate) {
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
    async getProductMetrics(startDate, endDate) {
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
    async getChatMetrics(startDate, endDate) {
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
    async getRevenueByDay(days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);
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
        const dateMap = new Map();
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
            }
            else {
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
    async getSnapshots(period, limit = 30) {
        return this.snapshotRepository.findByPeriod(period, limit);
    }
    async getStoreDashboardStats(storeId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        const storeObjId = (0, objectid_util_1.parseObjectId)(storeId, 'storeId');
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
    async getTodayRevenuePerStore() {
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
    async getMultiStoreRevenue(days = 30) {
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
    async getStockSummaryPerStore() {
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
    async getTopSellingByStore(storeId, startDate, endDate, limit = 10) {
        const storeObjId = (0, objectid_util_1.parseObjectId)(storeId, 'storeId');
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
    async getTopSellingOverall(startDate, endDate, limit = 10) {
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
    async getMonthOverMonthByStore() {
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
    async getTopCustomersByStore(storeId, limit = 10) {
        const storeObjId = (0, objectid_util_1.parseObjectId)(storeId, 'storeId');
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
    async getTopCustomersOverall(limit = 10) {
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
};
exports.AnalyticsService = AnalyticsService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_MIDNIGHT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsService.prototype, "generateDailySnapshot", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_WEEK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsService.prototype, "generateWeeklySnapshot", null);
__decorate([
    (0, schedule_1.Cron)('0 0 1 * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsService.prototype, "generateMonthlySnapshot", null);
exports.AnalyticsService = AnalyticsService = AnalyticsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [order_repository_1.OrderRepository,
        user_repository_1.UserRepository,
        product_repository_1.ProductRepository,
        chat_session_repository_1.ChatSessionRepository,
        message_log_repository_1.MessageLogRepository,
        analytics_snapshot_repository_1.AnalyticsSnapshotRepository,
        store_sale_repository_1.StoreSaleRepository,
        store_stock_repository_1.StoreStockRepository,
        store_repository_1.StoreRepository])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map