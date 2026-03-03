"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const configuration_1 = require("./config/configuration");
const jwt_auth_guard_1 = require("./common/guards/jwt-auth.guard");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const products_module_1 = require("./modules/products/products.module");
const categories_module_1 = require("./modules/categories/categories.module");
const cart_module_1 = require("./modules/cart/cart.module");
const orders_module_1 = require("./modules/orders/orders.module");
const coupons_module_1 = require("./modules/coupons/coupons.module");
const whatsapp_module_1 = require("./modules/whatsapp/whatsapp.module");
const chatbot_module_1 = require("./modules/chatbot/chatbot.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
const admin_module_1 = require("./modules/admin/admin.module");
const settings_module_1 = require("./modules/settings/settings.module");
const media_module_1 = require("./modules/media/media.module");
const audit_module_1 = require("./modules/audit/audit.module");
const payments_module_1 = require("./modules/payments/payments.module");
const email_module_1 = require("./modules/email/email.module");
const feedback_module_1 = require("./modules/feedback/feedback.module");
const stores_module_1 = require("./modules/stores/stores.module");
const store_stock_module_1 = require("./modules/store-stock/store-stock.module");
const store_sales_module_1 = require("./modules/store-sales/store-sales.module");
const reminders_module_1 = require("./modules/reminders/reminders.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
                envFilePath: ['.env.local', '.env'],
            }),
            mongoose_1.MongooseModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    uri: configService.get('database.uri'),
                }),
            }),
            throttler_1.ThrottlerModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ([{
                        ttl: configService.get('throttle.ttl') || 60,
                        limit: configService.get('throttle.limit') || 100,
                    }]),
            }),
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            products_module_1.ProductsModule,
            categories_module_1.CategoriesModule,
            cart_module_1.CartModule,
            orders_module_1.OrdersModule,
            coupons_module_1.CouponsModule,
            whatsapp_module_1.WhatsAppModule,
            chatbot_module_1.ChatbotModule,
            notifications_module_1.NotificationsModule,
            analytics_module_1.AnalyticsModule,
            admin_module_1.AdminModule,
            settings_module_1.SettingsModule,
            media_module_1.MediaModule,
            audit_module_1.AuditModule,
            payments_module_1.PaymentsModule,
            email_module_1.EmailModule,
            feedback_module_1.FeedbackModule,
            stores_module_1.StoresModule,
            store_stock_module_1.StoreStockModule,
            store_sales_module_1.StoreSalesModule,
            reminders_module_1.RemindersModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_FILTER,
                useClass: http_exception_filter_1.HttpExceptionFilter,
            },
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: transform_interceptor_1.TransformInterceptor,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map