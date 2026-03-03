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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const analytics_service_1 = require("./analytics.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let AnalyticsController = class AnalyticsController {
    constructor(analyticsService) {
        this.analyticsService = analyticsService;
    }
    async getDashboardStats() {
        return this.analyticsService.getDashboardStats();
    }
    async getOrderMetrics(startDate, endDate) {
        return this.analyticsService.getOrderMetrics(new Date(startDate), new Date(endDate));
    }
    async getCustomerMetrics(startDate, endDate) {
        return this.analyticsService.getCustomerMetrics(new Date(startDate), new Date(endDate));
    }
    async getProductMetrics(startDate, endDate) {
        return this.analyticsService.getProductMetrics(new Date(startDate), new Date(endDate));
    }
    async getChatMetrics(startDate, endDate) {
        return this.analyticsService.getChatMetrics(new Date(startDate), new Date(endDate));
    }
    async getRevenueByDay(days) {
        return this.analyticsService.getRevenueByDay(days ? parseInt(days, 10) : 30);
    }
    async getSnapshots(period = 'daily', limit) {
        return this.analyticsService.getSnapshots(period, limit ? parseInt(limit, 10) : 30);
    }
    async getStoreDashboardStats(storeId) {
        return this.analyticsService.getStoreDashboardStats(storeId);
    }
    async getTodayRevenuePerStore() {
        return this.analyticsService.getTodayRevenuePerStore();
    }
    async getMultiStoreRevenue(days) {
        return this.analyticsService.getMultiStoreRevenue(days ? parseInt(days, 10) : 30);
    }
    async getStockSummaryPerStore() {
        return this.analyticsService.getStockSummaryPerStore();
    }
    async getTopSellingByStore(storeId, startDate, endDate) {
        const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(endDate) : new Date();
        return this.analyticsService.getTopSellingByStore(storeId, start, end);
    }
    async getTopSellingOverall(startDate, endDate) {
        const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(endDate) : new Date();
        return this.analyticsService.getTopSellingOverall(start, end);
    }
    async getMonthOverMonthByStore() {
        return this.analyticsService.getMonthOverMonthByStore();
    }
    async getTopCustomersByStore(storeId) {
        return this.analyticsService.getTopCustomersByStore(storeId);
    }
    async getTopCustomersOverall() {
        return this.analyticsService.getTopCustomersOverall();
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getDashboardStats", null);
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getOrderMetrics", null);
__decorate([
    (0, common_1.Get)('customers'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getCustomerMetrics", null);
__decorate([
    (0, common_1.Get)('products'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getProductMetrics", null);
__decorate([
    (0, common_1.Get)('chat'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getChatMetrics", null);
__decorate([
    (0, common_1.Get)('revenue'),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getRevenueByDay", null);
__decorate([
    (0, common_1.Get)('snapshots'),
    __param(0, (0, common_1.Query)('period')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getSnapshots", null);
__decorate([
    (0, common_1.Get)('stores/dashboard/:storeId'),
    __param(0, (0, common_1.Param)('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getStoreDashboardStats", null);
__decorate([
    (0, common_1.Get)('stores/today'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getTodayRevenuePerStore", null);
__decorate([
    (0, common_1.Get)('stores/revenue-comparison'),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getMultiStoreRevenue", null);
__decorate([
    (0, common_1.Get)('stores/stock-summary'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getStockSummaryPerStore", null);
__decorate([
    (0, common_1.Get)('stores/top-products/:storeId'),
    __param(0, (0, common_1.Param)('storeId')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getTopSellingByStore", null);
__decorate([
    (0, common_1.Get)('stores/top-products'),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getTopSellingOverall", null);
__decorate([
    (0, common_1.Get)('stores/month-over-month'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getMonthOverMonthByStore", null);
__decorate([
    (0, common_1.Get)('stores/top-customers/:storeId'),
    __param(0, (0, common_1.Param)('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getTopCustomersByStore", null);
__decorate([
    (0, common_1.Get)('stores/top-customers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getTopCustomersOverall", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, common_1.Controller)('analytics'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __metadata("design:paramtypes", [analytics_service_1.AnalyticsService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map