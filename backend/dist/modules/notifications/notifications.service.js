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
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const message_log_repository_1 = require("../whatsapp/repositories/message-log.repository");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    constructor(messageLogRepository, whatsappService) {
        this.messageLogRepository = messageLogRepository;
        this.whatsappService = whatsappService;
        this.logger = new common_1.Logger(NotificationsService_1.name);
        this.sentNotifications = new Set();
    }
    async sendOrderConfirmation(order, phone) {
        const idempotencyKey = `order_confirm_${order._id.toString()}`;
        if (await this.isDuplicate(idempotencyKey)) {
            return;
        }
        await this.sendNotification({
            phone,
            templateName: 'order_confirmation',
            params: [
                order.orderNumber,
                order.total.toString(),
                order.items.length.toString(),
            ],
            orderId: order._id.toString(),
            idempotencyKey,
        });
    }
    async sendShippingUpdate(order, phone, awbNumber, courierName) {
        const idempotencyKey = `shipping_${order._id.toString()}_${awbNumber}`;
        if (await this.isDuplicate(idempotencyKey)) {
            return;
        }
        await this.sendNotification({
            phone,
            templateName: 'shipping_update',
            params: [order.orderNumber, courierName, awbNumber],
            orderId: order._id.toString(),
            idempotencyKey,
        });
    }
    async sendOutForDelivery(order, phone) {
        const idempotencyKey = `out_delivery_${order._id.toString()}`;
        if (await this.isDuplicate(idempotencyKey)) {
            return;
        }
        await this.sendNotification({
            phone,
            templateName: 'out_for_delivery',
            params: [order.orderNumber],
            orderId: order._id.toString(),
            idempotencyKey,
        });
    }
    async sendDeliveryConfirmation(order, phone) {
        const idempotencyKey = `delivered_${order._id.toString()}`;
        if (await this.isDuplicate(idempotencyKey)) {
            return;
        }
        await this.sendNotification({
            phone,
            templateName: 'delivery_confirmation',
            params: [order.orderNumber],
            orderId: order._id.toString(),
            idempotencyKey,
        });
    }
    async sendAbandonedCartReminder(phone, cartTotal, itemCount) {
        const today = new Date().toISOString().slice(0, 10);
        const idempotencyKey = `abandoned_cart_${phone}_${today}`;
        if (await this.isDuplicate(idempotencyKey)) {
            return;
        }
        await this.sendNotification({
            phone,
            templateName: 'abandoned_cart',
            params: [itemCount.toString(), cartTotal.toString()],
            idempotencyKey,
        });
    }
    async sendOrderCancelled(order, phone, reason) {
        const idempotencyKey = `cancelled_${order._id.toString()}`;
        if (await this.isDuplicate(idempotencyKey)) {
            return;
        }
        await this.sendNotification({
            phone,
            templateName: 'order_cancelled',
            params: [order.orderNumber, reason],
            orderId: order._id.toString(),
            idempotencyKey,
        });
    }
    async sendBroadcast(phones, templateName, params) {
        let queued = 0;
        let skipped = 0;
        for (const phone of phones) {
            const idempotencyKey = `broadcast_${templateName}_${phone}_${Date.now()}`;
            try {
                await this.sendNotification({
                    phone,
                    templateName,
                    params,
                    idempotencyKey,
                });
                queued++;
            }
            catch {
                skipped++;
            }
        }
        return { queued, skipped };
    }
    async sendNotification(payload) {
        try {
            if (payload.idempotencyKey) {
                if (await this.isDuplicate(payload.idempotencyKey)) {
                    return true;
                }
                this.markAsSent(payload.idempotencyKey);
            }
            const messageId = await this.whatsappService.sendTemplateMessage({
                phone: payload.phone,
                templateName: payload.templateName,
                bodyParams: payload.params,
            });
            return !!messageId;
        }
        catch (error) {
            this.logger.error('Failed to send notification', error);
            return false;
        }
    }
    async isDuplicate(key) {
        if (this.sentNotifications.has(key)) {
            return true;
        }
        const existing = await this.messageLogRepository.findOneByIdempotencyKey(key);
        return !!existing;
    }
    markAsSent(key) {
        this.sentNotifications.add(key);
        setTimeout(() => {
            this.sentNotifications.delete(key);
        }, 60 * 60 * 1000);
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [message_log_repository_1.MessageLogRepository,
        whatsapp_service_1.WhatsAppService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map