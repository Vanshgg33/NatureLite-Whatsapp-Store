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
const order_schema_1 = require("../orders/schemas/order.schema");
const user_schema_1 = require("../users/schemas/user.schema");
const product_schema_1 = require("../products/schemas/product.schema");
const chat_session_schema_1 = require("../chatbot/schemas/chat-session.schema");
const message_log_schema_1 = require("../whatsapp/schemas/message-log.schema");
let AnalyticsModule = class AnalyticsModule {
};
exports.AnalyticsModule = AnalyticsModule;
exports.AnalyticsModule = AnalyticsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            mongoose_1.MongooseModule.forFeature([
                { name: analytics_snapshot_schema_1.AnalyticsSnapshot.name, schema: analytics_snapshot_schema_1.AnalyticsSnapshotSchema },
                { name: order_schema_1.Order.name, schema: order_schema_1.OrderSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: product_schema_1.Product.name, schema: product_schema_1.ProductSchema },
                { name: chat_session_schema_1.ChatSession.name, schema: chat_session_schema_1.ChatSessionSchema },
                { name: message_log_schema_1.MessageLog.name, schema: message_log_schema_1.MessageLogSchema },
            ]),
        ],
        controllers: [analytics_controller_1.AnalyticsController],
        providers: [analytics_service_1.AnalyticsService],
        exports: [analytics_service_1.AnalyticsService],
    })
], AnalyticsModule);
//# sourceMappingURL=analytics.module.js.map