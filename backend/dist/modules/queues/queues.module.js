"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueuesModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const config_1 = require("@nestjs/config");
const notification_processor_1 = require("./notification.processor");
const abandoned_cart_processor_1 = require("./abandoned-cart.processor");
const notifications_module_1 = require("../notifications/notifications.module");
const cart_module_1 = require("../cart/cart.module");
const settings_module_1 = require("../settings/settings.module");
let QueuesModule = class QueuesModule {
};
exports.QueuesModule = QueuesModule;
exports.QueuesModule = QueuesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    connection: {
                        host: configService.get('redis.host'),
                        port: configService.get('redis.port'),
                        password: configService.get('redis.password') || undefined,
                    },
                }),
            }),
            bullmq_1.BullModule.registerQueue({ name: 'notifications' }, { name: 'shiprocket' }, { name: 'broadcast' }),
            notifications_module_1.NotificationsModule,
            cart_module_1.CartModule,
            settings_module_1.SettingsModule,
        ],
        providers: [notification_processor_1.NotificationProcessor, abandoned_cart_processor_1.AbandonedCartProcessor],
        exports: [bullmq_1.BullModule],
    })
], QueuesModule);
//# sourceMappingURL=queues.module.js.map