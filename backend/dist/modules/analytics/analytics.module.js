"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const schedule_1 = require("@nestjs/schedule");
const analytics_service_1 = require("./analytics.service");
const analytics_controller_1 = require("./analytics.controller");
const analytics_snapshot_schema_1 = require("./schemas/analytics-snapshot.schema");
const analytics_snapshot_repository_1 = require("./repositories/analytics-snapshot.repository");
const orders_module_1 = require("../orders/orders.module");
const users_module_1 = require("../users/users.module");
const products_module_1 = require("../products/products.module");
const chatbot_module_1 = require("../chatbot/chatbot.module");
const whatsapp_module_1 = require("../whatsapp/whatsapp.module");
const store_sales_module_1 = require("../store-sales/store-sales.module");
const store_stock_module_1 = require("../store-stock/store-stock.module");
const stores_module_1 = require("../stores/stores.module");
let AnalyticsModule = class AnalyticsModule {
};
exports.AnalyticsModule = AnalyticsModule;
exports.AnalyticsModule = AnalyticsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            mongoose_1.MongooseModule.forFeature([
                { name: analytics_snapshot_schema_1.AnalyticsSnapshot.name, schema: analytics_snapshot_schema_1.AnalyticsSnapshotSchema },
            ]),
            orders_module_1.OrdersModule,
            users_module_1.UsersModule,
            products_module_1.ProductsModule,
            chatbot_module_1.ChatbotModule,
            whatsapp_module_1.WhatsAppModule,
            store_sales_module_1.StoreSalesModule,
            store_stock_module_1.StoreStockModule,
            stores_module_1.StoresModule,
        ],
        controllers: [analytics_controller_1.AnalyticsController],
        providers: [analytics_snapshot_repository_1.AnalyticsSnapshotRepository, analytics_service_1.AnalyticsService],
        exports: [analytics_snapshot_repository_1.AnalyticsSnapshotRepository, analytics_service_1.AnalyticsService],
    })
], AnalyticsModule);
//# sourceMappingURL=analytics.module.js.map