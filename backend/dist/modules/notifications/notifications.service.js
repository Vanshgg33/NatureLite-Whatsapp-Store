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
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const message_log_schema_1 = require("../whatsapp/schemas/message-log.schema");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    constructor(messageLogModel, whatsappService, notificationQueue) {
        this.messageLogModel = messageLogModel;
        this.whatsappService = whatsappService;
        this.notificationQueue = notificationQueue;
        this.logger = new common_1.Logger(NotificationsService_1.name);
        this.sentNotifications = new Set();
    }
    async sendOrderConfirmation(order, phone) {
        const idempotencyKey = `order_confirm_${order._id.toString()}`;
        if (await this.isDuplicate(idempotencyKey)) {
            return;
        }
        await this.queueNotification({
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
        await this.queueNotification({
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
        await this.queueNotification({
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
        await this.queueNotification({
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
        await this.queueNotification({
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
        await this.queueNotification({
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
                await this.queueNotification({
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
    async queueNotification(payload) {
        await this.notificationQueue.add('send', payload, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000,
            },
            removeOnComplete: true,
            removeOnFail: 100,
        });
    }
    async processNotification(payload) {
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
            this.logger.error('Failed to process notification', error);
            throw error;
        }
    }
    async isDuplicate(key) {
        if (this.sentNotifications.has(key)) {
            return true;
        }
        const existing = await this.messageLogModel.findOne({
            'metadata.idempotencyKey': key,
        });
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
    __param(0, (0, mongoose_1.InjectModel)(message_log_schema_1.MessageLog.name)),
    __param(2, (0, bullmq_1.InjectQueue)('notifications')),
    __metadata("design:paramtypes", [mongoose_2.Model,
        whatsapp_service_1.WhatsAppService,
        bullmq_2.Queue])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map