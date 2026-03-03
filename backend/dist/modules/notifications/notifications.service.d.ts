import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { MessageLogRepository } from '../whatsapp/repositories/message-log.repository';
import { Order } from '../orders/schemas/order.schema';
export declare class NotificationsService {
    private readonly messageLogRepository;
    private whatsappService;
    private readonly logger;
    private readonly sentNotifications;
    constructor(messageLogRepository: MessageLogRepository, whatsappService: WhatsAppService);
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
    private sendNotification;
    private isDuplicate;
    private markAsSent;
}
