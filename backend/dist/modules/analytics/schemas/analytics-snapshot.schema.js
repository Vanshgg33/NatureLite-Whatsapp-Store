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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsSnapshotSchema = exports.AnalyticsSnapshot = exports.ChatMetrics = exports.ProductMetrics = exports.CustomerMetrics = exports.OrderMetrics = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let OrderMetrics = class OrderMetrics {
};
exports.OrderMetrics = OrderMetrics;
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], OrderMetrics.prototype, "totalOrders", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], OrderMetrics.prototype, "completedOrders", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], OrderMetrics.prototype, "cancelledOrders", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], OrderMetrics.prototype, "pendingOrders", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], OrderMetrics.prototype, "totalRevenue", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], OrderMetrics.prototype, "averageOrderValue", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], OrderMetrics.prototype, "codOrders", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], OrderMetrics.prototype, "prepaidOrders", void 0);
exports.OrderMetrics = OrderMetrics = __decorate([
    (0, mongoose_1.Schema)()
], OrderMetrics);
let CustomerMetrics = class CustomerMetrics {
};
exports.CustomerMetrics = CustomerMetrics;
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], CustomerMetrics.prototype, "totalCustomers", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], CustomerMetrics.prototype, "newCustomers", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], CustomerMetrics.prototype, "returningCustomers", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], CustomerMetrics.prototype, "activeCustomers", void 0);
exports.CustomerMetrics = CustomerMetrics = __decorate([
    (0, mongoose_1.Schema)()
], CustomerMetrics);
let ProductMetrics = class ProductMetrics {
};
exports.ProductMetrics = ProductMetrics;
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ProductMetrics.prototype, "totalProducts", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ProductMetrics.prototype, "activeProducts", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ProductMetrics.prototype, "outOfStockProducts", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ProductMetrics.prototype, "lowStockProducts", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Object], default: [] }),
    __metadata("design:type", Array)
], ProductMetrics.prototype, "topSellingProducts", void 0);
exports.ProductMetrics = ProductMetrics = __decorate([
    (0, mongoose_1.Schema)()
], ProductMetrics);
let ChatMetrics = class ChatMetrics {
};
exports.ChatMetrics = ChatMetrics;
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ChatMetrics.prototype, "totalSessions", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ChatMetrics.prototype, "totalMessages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ChatMetrics.prototype, "inboundMessages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ChatMetrics.prototype, "outboundMessages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ChatMetrics.prototype, "supportHandoffs", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ChatMetrics.prototype, "averageSessionDuration", void 0);
exports.ChatMetrics = ChatMetrics = __decorate([
    (0, mongoose_1.Schema)()
], ChatMetrics);
let AnalyticsSnapshot = class AnalyticsSnapshot {
};
exports.AnalyticsSnapshot = AnalyticsSnapshot;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], AnalyticsSnapshot.prototype, "period", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", Date)
], AnalyticsSnapshot.prototype, "date", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", OrderMetrics)
], AnalyticsSnapshot.prototype, "orders", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", CustomerMetrics)
], AnalyticsSnapshot.prototype, "customers", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", ProductMetrics)
], AnalyticsSnapshot.prototype, "products", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", ChatMetrics)
], AnalyticsSnapshot.prototype, "chat", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Object], default: [] }),
    __metadata("design:type", Array)
], AnalyticsSnapshot.prototype, "topCategories", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], AnalyticsSnapshot.prototype, "metadata", void 0);
exports.AnalyticsSnapshot = AnalyticsSnapshot = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], AnalyticsSnapshot);
exports.AnalyticsSnapshotSchema = mongoose_1.SchemaFactory.createForClass(AnalyticsSnapshot);
exports.AnalyticsSnapshotSchema.index({ period: 1, date: -1 });
exports.AnalyticsSnapshotSchema.index({ date: -1 });
//# sourceMappingURL=analytics-snapshot.schema.js.map