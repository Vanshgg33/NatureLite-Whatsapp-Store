import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Order } from '../orders/schemas/order.schema';
import { MessageLogDocument } from '../whatsapp/schemas/message-log.schema';
interface NotificationPayload {
    phone: string;
    templateName: string;
    params: string[];
    orderId?: string;
    idempotencyKey?: string;
}
export declare class NotificationsService {
    private messageLogModel;
    private whatsappService;
    private notificationQueue;
    private readonly logger;
    private readonly sentNotifications;
    constructor(messageLogModel: Model<MessageLogDocument>, whatsappService: WhatsAppService, notificationQueue: Queue);
    sendOrderConfirmation(order: Order, phone: string): Promise<void>;
    sendShippingUpdate(order: Order, phone: string, awbNumber: string, courierName: string): Promise<void>;
    sendOutForDelivery(order: Order, phone: string): Promise<void>;
    sendDeliveryConfirmation(order: Order, phone: string): Promise<void>;
    sendAbandonedCartReminder(phone: string, cartTotal: number, itemCount: number): Promise<void>;
    sendOrderCancelled(order: Order, phone: string, reason: string): Promise<void>;
    sendBroadcast(phones: string[], templateName: string, params: string[]): Promise<{
        queued: number;
        skipped: number;
    }>;
    private queueNotification;
    processNotification(payload: NotificationPayload): Promise<boolean>;
    private isDuplicate;
    private markAsSent;
}
export {};
