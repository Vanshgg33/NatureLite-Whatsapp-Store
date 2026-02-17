"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatbotModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const chatbot_service_1 = require("./chatbot.service");
const chatbot_controller_1 = require("./chatbot.controller");
const chat_session_schema_1 = require("./schemas/chat-session.schema");
const whatsapp_module_1 = require("../whatsapp/whatsapp.module");
const users_module_1 = require("../users/users.module");
const products_module_1 = require("../products/products.module");
const categories_module_1 = require("../categories/categories.module");
const cart_module_1 = require("../cart/cart.module");
const orders_module_1 = require("../orders/orders.module");
let ChatbotModule = class ChatbotModule {
};
exports.ChatbotModule = ChatbotModule;
exports.ChatbotModule = ChatbotModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: chat_session_schema_1.ChatSession.name, schema: chat_session_schema_1.ChatSessionSchema }]),
            (0, common_1.forwardRef)(() => whatsapp_module_1.WhatsAppModule),
            users_module_1.UsersModule,
            products_module_1.ProductsModule,
            categories_module_1.CategoriesModule,
            (0, common_1.forwardRef)(() => cart_module_1.CartModule),
            (0, common_1.forwardRef)(() => orders_module_1.OrdersModule),
        ],
        controllers: [chatbot_controller_1.ChatbotController],
        providers: [chatbot_service_1.ChatbotService],
        exports: [chatbot_service_1.ChatbotService],
    })
], ChatbotModule);
//# sourceMappingURL=chatbot.module.js.map