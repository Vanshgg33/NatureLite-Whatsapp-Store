import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { CartService } from './cart.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { QUEUE_CART_AUTOMATION, CART_JOBS, DEFAULT_JOB_OPTIONS } from '../queues/queues.constants';

type PopulatedCartUser = {
  _id: Types.ObjectId;
  phone?: string;
  name?: string;
  isBlocked?: boolean;
};

@Injectable()
export class CartAutomationService {
  private readonly logger = new Logger(CartAutomationService.name);
  private isRunning = false;

  constructor(
    private readonly cartService: CartService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: SettingsService,
    @InjectQueue(QUEUE_CART_AUTOMATION) private readonly cartQueue: Queue,
  ) {}

  // Every 2 hours: fetch abandoned carts, enqueue one job per cart
  @Cron('0 */2 * * *')
  async runAbandonedCartReminders(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const waSettings = await this.settingsService.getWhatsAppSettings();
      const remindersEnabled = Boolean(waSettings.abandonedCartReminderEnabled);
      const delayMinutes =
        typeof waSettings.abandonedCartReminderDelayMinutes === 'number'
          ? waSettings.abandonedCartReminderDelayMinutes
          : 60;

      if (!remindersEnabled) return;

      const carts = await this.cartService.getAbandonedCarts(delayMinutes, 200);
      let enqueued = 0;

      for (const cart of carts) {
        const user = this.extractPopulatedUser(cart.user);
        if (!user || user.isBlocked) continue;
        const phone = user.phone?.trim();
        if (!phone) continue;

        const cartId = cart._id.toString();
        const userId = user._id.toString();
        const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        const itemsSummary = cart.items
          .slice(0, 3)
          .map((i) => `${i.name} x${i.quantity}`)
          .join(', ')
          .trim();

        await this.cartQueue.add(
          CART_JOBS.SEND_REMINDER,
          {
            cartId,
            userId,
            phone,
            itemsSummary: itemsSummary || 'your items',
            cartTotal: cart.total,
            itemCount,
            cartUpdatedAt: cart.updatedAt?.toISOString(),
          },
          {
            ...DEFAULT_JOB_OPTIONS,
            jobId: `cart-reminder-${cartId}`,
          },
        );
        enqueued++;
      }

      if (enqueued > 0) {
        this.logger.log(`Enqueued ${enqueued} cart reminder jobs`);
      }
    } catch (err) {
      this.logger.error('abandoned_cart_batch_failed', err);
    } finally {
      this.isRunning = false;
    }
  }

  /** Called by CartAutomationProcessor to process a single cart reminder. */
  async _processCartReminder(data: {
    cartId: string;
    userId: string;
    phone: string;
    itemsSummary: string;
    cartTotal: number;
    itemCount: number;
    cartUpdatedAt?: string;
  }): Promise<void> {
    try {
      // Anti-spam: skip if user placed an order after last cart activity
      const latestOrders = await this.ordersService.findUserOrders(data.userId, 1);
      const latestOrder = latestOrders[0];
      if (latestOrder?.createdAt && data.cartUpdatedAt) {
        const orderTime = new Date(latestOrder.createdAt).getTime();
        const cartTime = new Date(data.cartUpdatedAt).getTime();
        if (orderTime > cartTime) {
          await this.cartService.markAbandonedReminderSent(data.cartId);
          return;
        }
      }

      const sent = await this.notificationsService.sendAbandonedCartReminderDetailed({
        cartId: data.cartId,
        phone: data.phone,
        itemsSummary: data.itemsSummary,
        cartTotal: data.cartTotal,
        itemCount: data.itemCount,
      });

      if (sent) {
        await this.cartService.markAbandonedReminderSent(data.cartId);
        this.logger.log(`abandoned_cart_reminder_sent cart=${data.cartId} user=${data.userId}`);
      }
    } catch (err) {
      this.logger.warn(`abandoned_cart_reminder_failed cart=${data.cartId}`, err);
      throw err; // re-throw so BullMQ can retry
    }
  }

  private extractPopulatedUser(value: Types.ObjectId | PopulatedCartUser | null): PopulatedCartUser | null {
    if (!value) return null;
    if (value instanceof Types.ObjectId) return null;
    if (!value._id) return null;
    return value;
  }
}

