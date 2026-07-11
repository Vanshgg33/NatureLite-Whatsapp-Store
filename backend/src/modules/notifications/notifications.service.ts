import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { MessageLogRepository } from '../whatsapp/repositories/message-log.repository';
import { Order } from '../orders/schemas/order.schema';
import type { OrderStatus } from '../../common/constants/order-status';
import { QUEUE_NOTIFICATIONS, NOTIFICATION_JOBS, DEFAULT_JOB_OPTIONS } from '../queues/queues.constants';
import { RedisService } from '../redis/redis.service';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';

interface NotificationPayload {
  phone: string;
  templateName?: string;
  params?: string[];
  languageCode?: string;
  headerParams?: string[];
  bodyParams?: string[];
  buttonParams?: string[];
  headerImageUrl?: string;
  text?: string;
  orderId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly recentEvents = new Map<string, number>();
  private static readonly RECENT_EVENT_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly messageLogRepository: MessageLogRepository,
    private whatsappService: WhatsAppService,
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly notifQueue: Queue,
    private readonly redisService: RedisService,
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
  ) {}

  private serializeOrder(order: Order | any): Record<string, any> {
    if (order && typeof order.toObject === 'function') return order.toObject();
    if (order && typeof order.toJSON === 'function') return order.toJSON();
    return { ...order };
  }

  // ─── Enqueue helpers ───────────────────────────────────────────────────────

  async notifyOrderCreated(order: Order): Promise<void> {
    const phone = order.shippingAddress?.phone;
    if (!phone) return;

    const orderId = order._id.toString();
    if (this.isRecentlySent({ entityId: orderId, type: 'order_created' })) return;

    const idempotencyKey = `order_created_${orderId}`;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.ORDER_CREATED,
      { order: this.serializeOrder(order) },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  // ─── Execute methods (called by processor) ─────────────────────────────────

  async _executeOrderCreated(data: { order: any }): Promise<void> {
    const order = data.order;
    const phone = order.shippingAddress?.phone;
    if (!phone) return;

    const idempotencyKey = `order_created_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;

    const message = this.formatOrderCreatedMessage(order);
    await this.sendNotification({ phone, text: message, orderId: order._id?.toString(), idempotencyKey });
  }

  async notifyOrderStatusChanged(order: Order, previousStatus: OrderStatus): Promise<void> {
    const phone = order.shippingAddress?.phone;
    if (!phone) return;
    if (order.status === previousStatus) return;

    const orderId = order._id.toString();
    if (this.isRecentlySent({ entityId: orderId, type: `order_status_${order.status}` })) return;

    const idempotencyKey = `order_status_${orderId}_${order.status}`;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.ORDER_STATUS_CHANGED,
      { order: this.serializeOrder(order), previousStatus },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  async _executeOrderStatusChanged(data: { order: any; previousStatus: string }): Promise<void> {
    const { order, previousStatus } = data;
    const phone = order.shippingAddress?.phone;
    if (!phone || order.status === previousStatus) return;

    const idempotencyKey = `order_status_${order._id?.toString()}_${order.status}`;
    if (await this.isDuplicate(idempotencyKey)) return;

    const message = this.formatOrderStatusUpdateMessage(order);
    await this.sendNotification({ phone, text: message, orderId: order._id?.toString(), idempotencyKey });

    if (order.status === 'delivered') {
      await this._executeOrderDelivered({ order });
    }
  }

  async notifyOrderDelivered(order: Order): Promise<void> {
    const phone = order.shippingAddress?.phone;
    if (!phone) return;
    const orderId = order._id.toString();
    if (this.isRecentlySent({ entityId: orderId, type: 'order_delivered' })) return;

    const idempotencyKey = `order_delivered_${orderId}`;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.ORDER_DELIVERED,
      { order: this.serializeOrder(order) },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  async _executeOrderDelivered(data: { order: any }): Promise<void> {
    const { order } = data;
    const phone = order.shippingAddress?.phone;
    if (!phone) return;

    const idempotencyKey = `order_delivered_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;

    const message = this.formatOrderDeliveredMessage(order);
    await this.sendNotification({ phone, text: message, orderId: order._id?.toString(), idempotencyKey });
  }

  /** Notify customer when admin confirms the order. */
  async sendOrderConfirmed(order: Order, phone: string): Promise<void> {
    const idempotencyKey = `order_confirmed_${order._id.toString()}`;
    if (this.isRecentlySent({ entityId: order._id.toString(), type: 'order_confirmed' })) return;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.ORDER_CONFIRMED_BTN,
      { order: this.serializeOrder(order), phone },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  async _executeOrderConfirmed(data: { order: any; phone: string }): Promise<void> {
    const { order, phone } = data;
    const idempotencyKey = `order_confirmed_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    this.markAsSent(idempotencyKey);

    const name = order.shippingAddress?.name || 'there';
    const itemLines = order.items
      .slice(0, 4)
      .map((item) => `• ${item.name}  ×${item.quantity}`)
      .join('\n');
    const moreItems = order.items.length > 4 ? `\n_… and ${order.items.length - 4} more_` : '';

    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: '✅ Order Confirmed',
      bodyText:
        `Hi ${name}! 👋\n\n` +
        `📦 *Here are the items you ordered (${order.items.length})*\n${itemLines}${moreItems}\n\n` +
        `*Total:  ${this.formatMoneyInr(order.total)}*\n\n` +
        `We've confirmed your order and are preparing it now.`,
      footerText: order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Prepaid',
      buttons: [
        { id: `order_${order._id.toString()}`, title: '📦 Track order' },
        { id: 'browse', title: '🛍 Shop more' },
      ],
      meta: { idempotencyKey },
    });
  }

  /** Notify customer when packing marks the order packed and ready for dispatch. */
  async sendOrderPacked(order: Order, phone: string): Promise<void> {
    const idempotencyKey = `order_packed_${order._id.toString()}`;
    if (this.isRecentlySent({ entityId: order._id.toString(), type: 'order_packed' })) return;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.ORDER_PACKED_BTN,
      { order: this.serializeOrder(order), phone },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  async _executeOrderPacked(data: { order: any; phone: string }): Promise<void> {
    const { order, phone } = data;
    const idempotencyKey = `order_packed_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    this.markAsSent(idempotencyKey);

    const namePacked = order.shippingAddress?.name || 'there';
    const packedItemLines = (order.items || [])
      .slice(0, 3)
      .map((item: any) => `• ${item.name}  ×${item.quantity}`)
      .join('\n');

    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: '📦 Order Packed',
      bodyText:
        `Hi ${namePacked}! Your order has been packed and is ready for dispatch.\n\n` +
        (packedItemLines ? `*Items ordered:*\n${packedItemLines}\n\n` : '') +
        `We'll notify you as soon as it's on its way!`,
      buttons: [
        { id: `order_${order._id?.toString()}`, title: '📦 Track order' },
      ],
      meta: { idempotencyKey },
    });
  }

  /** Notify customer when their order goes out for delivery, with courier details if available. */
  async sendOutForDeliveryNotification(
    order: Order,
    phone: string,
    deliveryPerson?: { name: string; phone?: string },
  ): Promise<void> {
    const idempotencyKey = `out_for_delivery_${order._id.toString()}`;
    if (this.isRecentlySent({ entityId: order._id.toString(), type: 'out_for_delivery' })) return;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.OUT_FOR_DELIVERY_BTN,
      { order: this.serializeOrder(order), phone, deliveryPerson },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  async _executeOutForDelivery(data: {
    order: any;
    phone: string;
    deliveryPerson?: { name: string; phone?: string };
  }): Promise<void> {
    const { order, phone, deliveryPerson } = data;
    const idempotencyKey = `out_for_delivery_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    this.markAsSent(idempotencyKey);

    const courierLines: string[] = [];
    if (order.courierName) courierLines.push(`🚚 Courier:  *${order.courierName}*`);
    if (order.awbNumber) courierLines.push(`📋 AWB:  *${order.awbNumber}*`);
    if (order.trackingUrl) courierLines.push(`🔗 Track:  ${order.trackingUrl}`);
    const courierBlock = courierLines.length > 0 ? `\n\n${courierLines.join('\n')}` : '';

    const deliveryLines: string[] = [];
    if (deliveryPerson?.name) deliveryLines.push(`👤 Delivery:  *${deliveryPerson.name}*`);
    if (deliveryPerson?.phone) deliveryLines.push(`📞 Contact:  *${deliveryPerson.phone}*`);
    const deliveryBlock = deliveryLines.length > 0 ? `\n\n${deliveryLines.join('\n')}` : '';

    const nameOutForDelivery = order.shippingAddress?.name || 'there';

    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: '🚚 Out for Delivery',
      bodyText:
        `Hi ${nameOutForDelivery}! Your order is on its way! 🎉\n\n` +
        `Your order will be delivered today or tomorrow.` +
        deliveryBlock +
        courierBlock,
      buttons: [{ id: `order_${order._id?.toString()}`, title: '📦 Track order' }],
      meta: { idempotencyKey },
    });
  }

  /** Notify customer about a failed delivery attempt. */
  async sendDeliveryAttemptNotification(
    order: Order,
    phone: string,
    deliveryStatus: 'customer_ringing' | 'customer_tomorrow' | 'customer_cancelled',
    note?: string,
  ): Promise<void> {
    const idempotencyKey = `delivery_attempt_${order._id.toString()}_${deliveryStatus}`;
    if (this.isRecentlySent({ entityId: order._id.toString(), type: `delivery_attempt_${deliveryStatus}` })) return;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.DELIVERY_ATTEMPT_BTN,
      { order: this.serializeOrder(order), phone, deliveryStatus, note },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  async _executeDeliveryAttempt(data: {
    order: any;
    phone: string;
    deliveryStatus: 'customer_ringing' | 'customer_tomorrow' | 'customer_cancelled';
    note?: string;
  }): Promise<void> {
    const { order, phone, deliveryStatus, note } = data;
    const idempotencyKey = `delivery_attempt_${order._id?.toString()}_${deliveryStatus}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    this.markAsSent(idempotencyKey);

    const nameAttempt = order.shippingAddress?.name || 'there';
    const messageMap: Record<typeof deliveryStatus, string> = {
      customer_ringing:
        `Hi ${nameAttempt}, we tried to reach you for delivery but couldn't get through. ` +
        `Our delivery partner will try again shortly.`,
      customer_tomorrow:
        `Hi ${nameAttempt}, we attempted your delivery today but couldn't complete it. ` +
        `We'll try again tomorrow — please keep your phone reachable.`,
      customer_cancelled:
        `Hi ${nameAttempt}, your delivery was not completed as requested. ` +
        `Please contact support if you'd like to reschedule.`,
    };

    const bodyText = note ? `${messageMap[deliveryStatus]}\n\n_Note: ${note}_` : messageMap[deliveryStatus];

    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: '🚚 Delivery Update',
      bodyText,
      buttons: [
        { id: `order_${order._id?.toString()}`, title: '📦 Track order' },
        { id: 'support', title: '💬 Contact support' },
      ],
      meta: { idempotencyKey },
    });
  }

  /**
   * Sends a "Payment received" interactive confirmation when a Razorpay payment
   * is captured. Enqueues for background processing.
   */
  async sendPaymentReceived(order: Order, phone: string): Promise<void> {
    const idempotencyKey = `payment_received_${order._id.toString()}`;
    if (this.isRecentlySent({ entityId: order._id.toString(), type: 'payment_received' })) return;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.PAYMENT_RECEIVED_BTN,
      { order: this.serializeOrder(order), phone },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  async _executePaymentReceived(data: { order: any; phone: string }): Promise<void> {
    const { order, phone } = data;
    const idempotencyKey = `payment_received_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    this.markAsSent(idempotencyKey);

    const namePayment = order.shippingAddress?.name || 'there';
    const itemLines = (order.items || [])
      .slice(0, 4)
      .map((item: any) => `• ${item.name}  ×${item.quantity}`)
      .join('\n');
    const moreItems = order.items.length > 4 ? `\n_… and ${order.items.length - 4} more_` : '';

    const billingLines: string[] = [];
    if (order.subtotal && order.subtotal !== order.total) {
      billingLines.push(`Subtotal:  ${this.formatMoneyInr(order.subtotal)}`);
    }
    if (order.discount > 0) {
      billingLines.push(`🏷 ${order.couponCode || 'Discount'}:  −${this.formatMoneyInr(order.discount)}`);
    }
    billingLines.push(`*Paid:  ${this.formatMoneyInr(order.total)}*`);

    const body =
      `Hi ${namePayment}! 🎉 _payment confirmed_\n\n` +
      `📦 *Here are the items you ordered (${order.items.length})*\n${itemLines}${moreItems}\n\n` +
      billingLines.join('\n') +
      `\n\nWe're now preparing your order. 🚀`;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: '✅ Payment Received',
      bodyText: body,
      footerText: 'Paid via Razorpay',
      buttons: [
        { id: `order_${order._id?.toString()}`, title: '📦 Track order' },
        { id: 'browse', title: '🛍 Shop more' },
      ],
      meta: { idempotencyKey },
    });
  }

  async sendOrderConfirmation(order: Order, phone: string): Promise<void> {
    const idempotencyKey = `order_confirm_${order._id.toString()}`;
    if (this.isRecentlySent({ entityId: order._id.toString(), type: 'order_confirmation' })) return;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.ORDER_CONFIRMATION_TPL,
      { order: this.serializeOrder(order), phone },
      { ...DEFAULT_JOB_OPTIONS, jobId: `notif_confirm_${idempotencyKey}` },
    );
  }

  async _executeSendOrderConfirmation(data: { order: any; phone: string }): Promise<void> {
    const { order, phone } = data;
    const idempotencyKey = `order_confirm_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    await this.sendNotification({
      phone,
      templateName: 'order_confirmation',
      params: [order.orderNumber, String(order.total), String(order.items?.length ?? 0)],
      orderId: order._id?.toString(),
      idempotencyKey,
    });
  }

  async sendShippingUpdate(order: Order, phone: string, awbNumber: string, courierName: string): Promise<void> {
    const idempotencyKey = `shipping_${order._id.toString()}_${awbNumber}`;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.SHIPPING_UPDATE_TPL,
      { order: this.serializeOrder(order), phone, awbNumber, courierName },
      { ...DEFAULT_JOB_OPTIONS, jobId: `notif_ship_${idempotencyKey}` },
    );
  }

  async _executeSendShippingUpdate(data: { order: any; phone: string; awbNumber: string; courierName: string }): Promise<void> {
    const { order, phone, awbNumber, courierName } = data;
    const idempotencyKey = `shipping_${order._id?.toString()}_${awbNumber}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    await this.sendNotification({
      phone,
      templateName: 'shipping_update',
      params: [order.orderNumber, courierName, awbNumber],
      orderId: order._id?.toString(),
      idempotencyKey,
    });
  }

  async sendOutForDelivery(order: Order, phone: string): Promise<void> {
    const idempotencyKey = `out_delivery_${order._id.toString()}`;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.OUT_FOR_DELIVERY_TPL,
      { order: this.serializeOrder(order), phone },
      { ...DEFAULT_JOB_OPTIONS, jobId: `notif_outd_${idempotencyKey}` },
    );
  }

  async _executeSendOutForDelivery(data: { order: any; phone: string }): Promise<void> {
    const { order, phone } = data;
    const idempotencyKey = `out_delivery_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    await this.sendNotification({
      phone,
      templateName: 'out_for_delivery',
      params: [order.orderNumber],
      orderId: order._id?.toString(),
      idempotencyKey,
    });
  }

  async sendDeliveryConfirmation(order: Order, phone: string): Promise<void> {
    const idempotencyKey = `delivered_${order._id.toString()}`;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.DELIVERY_CONFIRMATION_TPL,
      { order: this.serializeOrder(order), phone },
      { ...DEFAULT_JOB_OPTIONS, jobId: `notif_delconf_${idempotencyKey}` },
    );
  }

  async _executeSendDeliveryConfirmation(data: { order: any; phone: string }): Promise<void> {
    const { order, phone } = data;
    const idempotencyKey = `delivered_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    await this.sendNotification({
      phone,
      templateName: 'delivery_confirmation',
      params: [order.orderNumber],
      orderId: order._id?.toString(),
      idempotencyKey,
    });
  }

  async sendAbandonedCartReminder(phone: string, cartTotal: number, itemCount: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `abandoned_cart_${phone}_${today}`;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.ABANDONED_CART,
      { phone, cartTotal, itemCount, idempotencyKey },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  async _executeSendAbandonedCartReminder(data: { phone: string; cartTotal: number; itemCount: number; idempotencyKey: string }): Promise<void> {
    if (await this.isDuplicate(data.idempotencyKey)) return;
    await this.sendNotification({
      phone: data.phone,
      templateName: 'abandoned_cart',
      params: [data.itemCount.toString(), data.cartTotal.toString()],
      idempotencyKey: data.idempotencyKey,
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
    // Quick in-memory check so cron doesn't double-enqueue
    if (this.isRecentlySent({ entityId: input.cartId, type: 'cart_reminder' })) return true;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.ABANDONED_CART_DETAILED,
      { ...input, idempotencyKey },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
    return true;
  }

  async _executeSendAbandonedCartReminderDetailed(data: {
    cartId: string;
    phone: string;
    itemsSummary: string;
    cartTotal: number;
    itemCount: number;
    idempotencyKey: string;
  }): Promise<boolean> {
    if (await this.isDuplicate(data.idempotencyKey)) return true;
    const message = this.formatAbandonedCartReminderMessage({
      itemsSummary: data.itemsSummary,
      cartTotal: data.cartTotal,
      itemCount: data.itemCount,
    });
    return this.sendNotification({ phone: data.phone, text: message, idempotencyKey: data.idempotencyKey });
  }

  /** Ask the customer to rate a delivered order. */
  async sendFeedbackRequest(order: Order, phone: string): Promise<boolean> {
    const orderId = order._id.toString();
    const idempotencyKey = `feedback_request_${orderId}`;
    if (this.isRecentlySent({ entityId: orderId, type: 'feedback_request' })) return true;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.FEEDBACK_REQUEST,
      { order: this.serializeOrder(order), phone },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
    return true;
  }

  async _executeSendFeedbackRequest(data: { order: any; phone: string }): Promise<boolean> {
    const { order, phone } = data;
    const orderId = order._id?.toString();
    const idempotencyKey = `feedback_request_${orderId}`;
    if (await this.isDuplicate(idempotencyKey)) return true;

    const nameFeedback = order.shippingAddress?.name || 'there';
    const message =
      `Hi ${nameFeedback}! How was your recent purchase? \u2b50\n` +
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
      `Reply with a rating from 1 to 5:\n` +
      `5 \u2605 Loved it\n` +
      `4 \u2605 Good\n` +
      `3 \u2605 Okay\n` +
      `2 \u2605 Poor\n` +
      `1 \u2605 Bad\n\n` +
      `You can also reply with any comments. Your feedback helps us improve.`;

    return this.sendNotification({ phone, text: message, orderId, idempotencyKey });
  }

  async sendOrderCancelled(order: Order, phone: string, reason: string): Promise<void> {
    const idempotencyKey = `cancelled_${order._id.toString()}`;
    if (this.isRecentlySent({ entityId: order._id.toString(), type: 'order_cancelled' })) return;
    await this.notifQueue.add(
      NOTIFICATION_JOBS.ORDER_CANCELLED,
      { order: this.serializeOrder(order), phone, reason },
      { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey },
    );
  }

  async _executeSendOrderCancelled(data: { order: any; phone: string; reason: string }): Promise<void> {
    const { order, phone, reason } = data;
    const idempotencyKey = `cancelled_${order._id?.toString()}`;
    if (await this.isDuplicate(idempotencyKey)) return;
    await this.sendNotification({
      phone,
      templateName: 'order_cancelled',
      params: [order.orderNumber, reason],
      orderId: order._id?.toString(),
      idempotencyKey,
    });
  }

  async sendInvoiceDocument(docNumber: string, phone: string, invoiceUrl: string): Promise<void> {
    // Template messages bypass the WhatsApp 24-hour session window.
    // Create a template named "invoice_ready" on your 360dialog dashboard with body:
    //   "Your invoice for order {{1}} is ready. Tap to view and download: {{2}}"
    const messageId = await this.whatsappService.sendTemplateMessage({
      phone,
      templateName: 'invoice_ready',
      languageCode: 'en',
      bodyParams: [docNumber, invoiceUrl],
    });
    if (!messageId) {
      throw new InternalServerErrorException(
        `WhatsApp delivery failed for ${phone}. Ensure the "invoice_ready" template is approved on 360dialog and the phone number is correct.`,
      );
    }
  }

  // ─── Campaign broadcasts (async via BullMQ) ───────────────────────────────

  private normalizePhones(phones: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of phones) {
      const n = String(p || '').replace(/[^\d]/g, '');
      if (n.length >= 8 && !seen.has(n)) { seen.add(n); result.push(n); }
    }
    return result;
  }

  async enqueueBroadcast(
    phones: string[],
    templateName: string,
    options: {
      languageCode?: string;
      headerParams?: string[];
      bodyParams?: string[];
      buttonParams?: string[];
      headerImageUrl?: string;
    } = {},
  ): Promise<{ campaignId: string }> {
    const normalized = this.normalizePhones(phones);
    const campaign = await this.campaignModel.create({
      label: templateName,
      type: 'template',
      status: 'queued',
      totalPhones: normalized.length,
      phones: normalized,
      templateName,
      languageCode: options.languageCode || 'en',
      headerParams: options.headerParams ?? [],
      bodyParams: options.bodyParams ?? [],
      buttonParams: options.buttonParams ?? [],
      headerImageUrl: options.headerImageUrl,
    });
    await this.notifQueue.add(
      NOTIFICATION_JOBS.BROADCAST_TEMPLATE,
      { campaignId: campaign._id.toString() },
      { ...DEFAULT_JOB_OPTIONS, attempts: 1, jobId: `broadcast_tpl_${campaign._id}` },
    );
    return { campaignId: campaign._id.toString() };
  }

  async enqueueMediaBroadcast(
    phones: string[],
    imageUrl: string,
    caption?: string,
    mediaType: string = 'image',
    mediaFilename?: string,
  ): Promise<{ campaignId: string }> {
    const normalized = this.normalizePhones(phones);
    const typeLabel = mediaType === 'document' ? 'Document' : 'Image';
    const campaign = await this.campaignModel.create({
      label: caption?.trim() ? `${typeLabel}: ${caption.trim().slice(0, 60)}` : `${typeLabel} Campaign ${new Date().toLocaleDateString('en-IN')}`,
      type: 'media',
      status: 'queued',
      totalPhones: normalized.length,
      phones: normalized,
      imageUrl,
      caption,
      mediaType,
      mediaFilename,
    });
    await this.notifQueue.add(
      NOTIFICATION_JOBS.BROADCAST_MEDIA,
      { campaignId: campaign._id.toString() },
      { ...DEFAULT_JOB_OPTIONS, attempts: 1, jobId: `broadcast_media_${campaign._id}` },
    );
    return { campaignId: campaign._id.toString() };
  }

  async listCampaigns(limit = 50): Promise<CampaignDocument[]> {
    return this.campaignModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-phones')
      .exec();
  }

  // ─── Execute methods called by processor ─────────────────────────────────

  async _executeBroadcastTemplate(data: { campaignId: string }): Promise<void> {
    const campaign = await this.campaignModel.findById(data.campaignId).exec();
    if (!campaign) { this.logger.warn(`Campaign ${data.campaignId} not found`); return; }

    await this.campaignModel.updateOne({ _id: campaign._id }, { $set: { status: 'sending' } }).exec();
    let sent = 0;
    let skipped = 0;

    try {
      for (let i = 0; i < campaign.phones.length; i++) {
        const phone = campaign.phones[i];
        const idempotencyKey = `broadcast_${campaign._id}_${phone}`;
        try {
          const ok = await this.sendNotification({
            phone,
            templateName: campaign.templateName,
            languageCode: campaign.languageCode,
            headerParams: campaign.headerParams,
            bodyParams: campaign.bodyParams,
            buttonParams: campaign.buttonParams,
            headerImageUrl: campaign.headerImageUrl,
            idempotencyKey,
          });
          if (ok) sent++; else skipped++;
        } catch { skipped++; }

        if ((i + 1) % 10 === 0) {
          await this.campaignModel.updateOne({ _id: campaign._id }, { $set: { sent, skipped } }).exec();
        }
        if (i < campaign.phones.length - 1) await this.sleep(150);
      }
      await this.campaignModel.updateOne(
        { _id: campaign._id },
        { $set: { status: 'done', sent, skipped, completedAt: new Date() } },
      ).exec();
    } catch (err) {
      this.logger.error(`Broadcast template campaign ${data.campaignId} failed`, err);
      await this.campaignModel.updateOne(
        { _id: campaign._id },
        { $set: { status: 'failed', sent, skipped, completedAt: new Date() } },
      ).exec();
      throw err;
    }
  }

  async _executeBroadcastMedia(data: { campaignId: string }): Promise<void> {
    const campaign = await this.campaignModel.findById(data.campaignId).exec();
    if (!campaign) { this.logger.warn(`Campaign ${data.campaignId} not found`); return; }

    await this.campaignModel.updateOne({ _id: campaign._id }, { $set: { status: 'sending' } }).exec();
    let sent = 0;
    let skipped = 0;

    try {
      for (let i = 0; i < campaign.phones.length; i++) {
        const phone = campaign.phones[i];
        const idempotencyKey = `broadcast_media_${campaign._id}_${phone}`;
        try {
          const messageId = await this.whatsappService.sendMediaMessage({
            phone,
            mediaType: (campaign.mediaType as 'image' | 'document') || 'image',
            mediaUrl: campaign.imageUrl!,
            caption: campaign.caption,
            filename: campaign.mediaFilename,
            meta: { idempotencyKey },
          });
          if (messageId) sent++; else skipped++;
        } catch { skipped++; }

        if ((i + 1) % 10 === 0) {
          await this.campaignModel.updateOne({ _id: campaign._id }, { $set: { sent, skipped } }).exec();
        }
        if (i < campaign.phones.length - 1) await this.sleep(150);
      }
      await this.campaignModel.updateOne(
        { _id: campaign._id },
        { $set: { status: 'done', sent, skipped, completedAt: new Date() } },
      ).exec();
    } catch (err) {
      this.logger.error(`Broadcast media campaign ${data.campaignId} failed`, err);
      await this.campaignModel.updateOne(
        { _id: campaign._id },
        { $set: { status: 'failed', sent, skipped, completedAt: new Date() } },
      ).exec();
      throw err;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        languageCode: payload.languageCode,
        headerParams: payload.headerParams,
        bodyParams: payload.bodyParams ?? payload.params,
        buttonParams: payload.buttonParams,
        headerImageUrl: payload.headerImageUrl,
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
    try {
      const lockKey = `lock:notif:${key}`;
      const acquired = await this.redisService.client.set(
        lockKey,
        '1',
        'EX',
        60, // 60 seconds lock to prevent concurrent races
        'NX',
      );
      if (!acquired) {
        return true;
      }
    } catch (err) {
      this.logger.warn(`Redis deduplication check failed: ${(err as Error).message}`);
    }

    const existing = await this.messageLogRepository.findOneByIdempotencyKey(key);
    return existing?.finalStatus === 'success';
  }

  private markAsSent(key: string): void {
    // No-op: Redis locks are atomically set in isDuplicate
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

  private formatOrderStatusForNotification(order: Order): string {
    if (order.paymentMethod === 'prepaid' && order.paymentStatus === 'pending') {
      return 'Payment Pending';
    }
    return this.formatOrderStatus(order.status);
  }

  private formatOrderCreatedMessage(order: Order): string {
    const name = order.shippingAddress?.name || 'there';
    const items = (order.items || []).map((i: any) => `${i.name} ×${i.quantity}`).join(', ');
    return [
      `Hi ${name}! 👋 Your order has been received.`,
      items ? `Items: ${items}` : '',
      `Total: ${this.formatMoneyInr(order.total)}`,
    ].filter(Boolean).join('\n');
  }

  private formatOrderStatusUpdateMessage(order: Order): string {
    const name = order.shippingAddress?.name || 'there';
    return `Hi ${name}, your order is now ${this.formatOrderStatusForNotification(order)}.`;
  }

  private formatOrderDeliveredMessage(order: Order): string {
    const name = order.shippingAddress?.name || 'there';
    return `Hi ${name}, your order has been delivered. Thank you for shopping with us! 🎉`;
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
