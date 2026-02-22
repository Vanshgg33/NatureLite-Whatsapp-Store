import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Order } from '../orders/schemas/order.schema';
import { MessageLog, MessageLogDocument } from '../whatsapp/schemas/message-log.schema';

interface NotificationPayload {
  phone: string;
  templateName: string;
  params: string[];
  orderId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sentNotifications = new Set<string>();

  constructor(
    @InjectModel(MessageLog.name) private messageLogModel: Model<MessageLogDocument>,
    private whatsappService: WhatsAppService,
  ) {}

  async sendOrderConfirmation(order: Order, phone: string): Promise<void> {
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

  async sendShippingUpdate(
    order: Order,
    phone: string,
    awbNumber: string,
    courierName: string,
  ): Promise<void> {
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

  async sendOutForDelivery(order: Order, phone: string): Promise<void> {
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

  async sendDeliveryConfirmation(order: Order, phone: string): Promise<void> {
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

  async sendAbandonedCartReminder(
    phone: string,
    cartTotal: number,
    itemCount: number,
  ): Promise<void> {
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

  async sendOrderCancelled(order: Order, phone: string, reason: string): Promise<void> {
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

  async sendBroadcast(
    phones: string[],
    templateName: string,
    params: string[],
  ): Promise<{ queued: number; skipped: number }> {
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
      } catch {
        skipped++;
      }
    }

    return { queued, skipped };
  }

  private async sendNotification(payload: NotificationPayload): Promise<boolean> {
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
    } catch (error) {
      this.logger.error('Failed to send notification', error);
      // Don't throw - just log and continue
      return false;
    }
  }

  private async isDuplicate(key: string): Promise<boolean> {
    if (this.sentNotifications.has(key)) {
      return true;
    }

    const existing = await this.messageLogModel.findOne({
      'metadata.idempotencyKey': key,
    });

    return !!existing;
  }

  private markAsSent(key: string): void {
    this.sentNotifications.add(key);

    setTimeout(() => {
      this.sentNotifications.delete(key);
    }, 60 * 60 * 1000);
  }
}
