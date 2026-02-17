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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AnalyticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const schedule_1 = require("@nestjs/schedule");
const order_schema_1 = require("../orders/schemas/order.schema");
const user_schema_1 = require("../users/schemas/user.schema");
const product_schema_1 = require("../products/schemas/product.schema");
const chat_session_schema_1 = require("../chatbot/schemas/chat-session.schema");
const message_log_schema_1 = require("../whatsapp/schemas/message-log.schema");
const analytics_snapshot_schema_1 = require("./schemas/analytics-snapshot.schema");
let AnalyticsService = AnalyticsService_1 = class AnalyticsService {
    constructor(orderModel, userModel, productModel, chatSessionModel, messageLogModel, snapshotModel) {
        this.orderModel = orderModel;
        this.userModel = userModel;
        this.productModel = productModel;
        this.chatSessionModel = chatSessionModel;
        this.messageLogModel = messageLogModel;
        this.snapshotModel = snapshotModel;
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
            const snapshot = new this.snapshotModel({
                period,
                date: startDate,
                orders: orderMetrics,
                customers: customerMetrics,
                products: productMetrics,
                chat: chatMetrics,
            });
            await snapshot.save();
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
    async getOrderMetrics(startDate, endDate) {
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
    async getCustomerMetrics(startDate, endDate) {
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
    async getProductMetrics(startDate, endDate) {
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
    async getChatMetrics(startDate, endDate) {
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
    async getRevenueByDay(days = 30) {
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
    async getSnapshots(period, limit = 30) {
        return this.snapshotModel
            .find({ period })
            .sort({ date: -1 })
            .limit(limit)
            .exec();
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
    __param(0, (0, mongoose_1.InjectModel)(order_schema_1.Order.name)),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(2, (0, mongoose_1.InjectModel)(product_schema_1.Product.name)),
    __param(3, (0, mongoose_1.InjectModel)(chat_session_schema_1.ChatSession.name)),
    __param(4, (0, mongoose_1.InjectModel)(message_log_schema_1.MessageLog.name)),
    __param(5, (0, mongoose_1.InjectModel)(analytics_snapshot_schema_1.AnalyticsSnapshot.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map