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
var AbandonedCartProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbandonedCartProcessor = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const cart_service_1 = require("../cart/cart.service");
const notifications_service_1 = require("../notifications/notifications.service");
const settings_service_1 = require("../settings/settings.service");
let AbandonedCartProcessor = AbandonedCartProcessor_1 = class AbandonedCartProcessor {
    constructor(cartService, notificationsService, settingsService) {
        this.cartService = cartService;
        this.notificationsService = notificationsService;
        this.settingsService = settingsService;
        this.logger = new common_1.Logger(AbandonedCartProcessor_1.name);
    }
    async processAbandonedCarts() {
        this.logger.log('Processing abandoned carts');
        try {
            const settings = await this.settingsService.getWhatsAppSettings();
            const isEnabled = settings.abandonedCartReminderEnabled;
            const delayMinutes = settings.abandonedCartReminderDelayMinutes || 60;
            if (!isEnabled) {
                return;
            }
            const abandonedCarts = await this.cartService.getAbandonedCarts(delayMinutes, 50);
            this.logger.log(`Found ${abandonedCarts.length} abandoned carts`);
            for (const cart of abandonedCarts) {
                try {
                    const user = cart.user;
                    if (user?.phone) {
                        await this.notificationsService.sendAbandonedCartReminder(user.phone, cart.total, cart.items.length);
                        await this.cartService.markAbandonedReminderSent(cart._id.toString());
                    }
                }
                catch (error) {
                    this.logger.error(`Failed to send reminder for cart ${cart._id}`, error);
                }
            }
        }
        catch (error) {
            this.logger.error('Failed to process abandoned carts', error);
        }
    }
};
exports.AbandonedCartProcessor = AbandonedCartProcessor;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AbandonedCartProcessor.prototype, "processAbandonedCarts", null);
exports.AbandonedCartProcessor = AbandonedCartProcessor = AbandonedCartProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cart_service_1.CartService,
        notifications_service_1.NotificationsService,
        settings_service_1.SettingsService])
], AbandonedCartProcessor);
//# sourceMappingURL=abandoned-cart.processor.js.map