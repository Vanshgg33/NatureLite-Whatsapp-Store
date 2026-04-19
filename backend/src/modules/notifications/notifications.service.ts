import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { MessageLogRepository } from '../whatsapp/repositories/message-log.repository';
import { Order } from '../orders/schemas/order.schema';
import type { OrderStatus } from '../../common/constants/order-status';

interface NotificationPayload {
  phone: string;
  templateName?: string;
  params?: string[];
  text?: string;
  orderId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sentNotifications = new Set<string>();
  private readonly recentEvents = new Map<string, number>();
  private static readonly RECENT_EVENT_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly messageLogRepository: MessageLogRepository,
    private whatsappService: WhatsAppService,
  ) {}

  async notifyOrderCreated(order: Order): Promise<void> {
    const phone = order.shippingAddress?.phone;
    if (!phone) return;

    const orderId = order._id.toString();
    if (this.isRecentlySent({ entityId: orderId, type: 'order_created' })) return;

    const idempotencyKey = `order_created_${order._id.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;

    const message = this.formatOrderCreatedMessage(order);
    await this.sendNotification({
      phone,
      text: message,
      orderId,
      idempotencyKey,
    });
  }

  async notifyOrderStatusChanged(
    order: Order,
    previousStatus: OrderStatus,
  ): Promise<void> {
    const phone = order.shippingAddress?.phone;
    if (!phone) return;
    if (order.status === previousStatus) return;

    const orderId = order._id.toString();
    if (
      this.isRecentlySent({
        entityId: orderId,
        type: `order_status_${order.status}`,
      })
    ) {
      return;
    }

    const idempotencyKey = `order_status_${order._id.toString()}_${order.status}`;
    if (await this.isDuplicate(idempotencyKey)) return;

    const message = this.formatOrderStatusUpdateMessage(order);
    await this.sendNotification({
      phone,
      text: message,
      orderId,
      idempotencyKey,
    });

    if (order.status === 'delivered') {
      await this.notifyOrderDelivered(order);
    }
  }

  async notifyOrderDelivered(order: Order): Promise<void> {
    const phone = order.shippingAddress?.phone;
    if (!phone) return;

    const orderId = order._id.toString();
    if (this.isRecentlySent({ entityId: orderId, type: 'order_delivered' })) return;

    const idempotencyKey = `order_delivered_${order._id.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;

    const message = this.formatOrderDeliveredMessage(order);
    await this.sendNotification({
      phone,
      text: message,
      orderId: order._id.toString(),
      idempotencyKey,
    });
  }

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

  async sendAbandonedCartReminderDetailed(input: {
    cartId: string;
    phone: string;
    itemsSummary: string;
    cartTotal: number;
    itemCount: number;
  }): Promise<boolean> {
    const idempotencyKey = `abandoned_cart_${input.cartId}`;
    if (await this.isDuplicate(idempotencyKey)) return true;

    const message = this.formatAbandonedCartReminderMessage({
      itemsSummary: input.itemsSummary,
      cartTotal: input.cartTotal,
      itemCount: input.itemCount,
    });

    return this.sendNotification({
      phone: input.phone,
      text: message,
      idempotencyKey,
    });
  }

  /**
   * Ask the customer to rate a delivered order. Best-effort text message sent
   * inside the 24h session window (idempotent on orderId).
   */
  async sendFeedbackRequest(order: Order, phone: string): Promise<boolean> {
    const orderId = order._id.toString();
    const idempotencyKey = `feedback_request_${orderId}`;
    if (await this.isDuplicate(idempotencyKey)) return true;

    const message =
      `*How was order ${order.orderNumber}?* \u2b50\n` +
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
      `Reply with a rating from 1 to 5:\n` +
      `5 \u2605 Loved it\n` +
      `4 \u2605 Good\n` +
      `3 \u2605 Okay\n` +
      `2 \u2605 Poor\n` +
      `1 \u2605 Bad\n\n` +
      `You can also reply with any comments. Your feedback helps us improve.`;

    return this.sendNotification({
      phone,
      text: message,
      orderId,
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

      if (payload.text) {
        const messageId = await this.whatsappService.sendTextMessage({
          phone: payload.phone,
          message: payload.text,
          meta: payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : undefined,
        });
        return Boolean(messageId);
      }

      if (!payload.templateName) {
        return false;
      }

      const messageId = await this.whatsappService.sendTemplateMessage({
        phone: payload.phone,
        templateName: payload.templateName,
        bodyParams: payload.params,
        meta: payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : undefined,
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

    const existing = await this.messageLogRepository.findOneByIdempotencyKey(key);
    return !!existing;
  }

  private markAsSent(key: string): void {
    this.sentNotifications.add(key);

    setTimeout(() => {
      this.sentNotifications.delete(key);
    }, 60 * 60 * 1000);
  }

  private isRecentlySent(input: { entityId: string; type: string }): boolean {
    const key = `${input.type}:${input.entityId}`;
    const now = Date.now();
    const exp = this.recentEvents.get(key);
    if (typeof exp === 'number' && exp > now) return true;
    this.recentEvents.set(key, now + NotificationsService.RECENT_EVENT_TTL_MS);
    return false;
  }

  private formatOrderStatus(status: OrderStatus): string {
    switch (status) {
      case 'placed':
        return 'Placed';
      case 'confirmed':
        return 'Confirmed';
      case 'preparing':
        return 'Preparing';
      case 'out_for_delivery':
        return 'Out for delivery';
      case 'delivered':
        return 'Delivered';
      case 'cancelled':
        return 'Cancelled';
      case 'returned':
        return 'Returned';
      case 'refunded':
        return 'Refunded';
    }
  }

  private formatMoneyInr(value: number): string {
    // Stored as rupees in Order.total.
    return `₹${value.toFixed(0)}`;
  }

  private formatOrderCreatedMessage(order: Order): string {
    return [
      `Order received: ${order.orderNumber}`,
      `Total: ${this.formatMoneyInr(order.total)}`,
      `Status: ${this.formatOrderStatus(order.status)}`,
    ].join('\n');
  }

  private formatOrderStatusUpdateMessage(order: Order): string {
    return `Update: Your order ${order.orderNumber} is now ${this.formatOrderStatus(order.status)}.`;
  }

  private formatOrderDeliveredMessage(order: Order): string {
    return `Delivered: Your order ${order.orderNumber} has been delivered. Thank you for shopping with us.`;
  }

  private formatAbandonedCartReminderMessage(input: {
    itemsSummary: string;
    cartTotal: number;
    itemCount: number;
  }): string {
    const lines: string[] = [];
    lines.push('You left items in your cart.');
    lines.push(`Items (${input.itemCount}): ${input.itemsSummary}`);
    lines.push(`Total: ${this.formatMoneyInr(input.cartTotal)}`);
    lines.push('Complete your order now from the store.');
    return lines.join('\n');
  }
}
