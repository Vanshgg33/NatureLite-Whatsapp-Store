import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { CartService } from './cart.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

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
  ) {}

  // Every 2 hours (safe default; delay threshold is enforced via query)
  @Cron('0 */2 * * *')
  async runAbandonedCartReminders(): Promise<void> {
    try {
      const waSettings = await this.settingsService.getWhatsAppSettings();
      const remindersEnabled = Boolean(waSettings.abandonedCartReminderEnabled);
      const delayMinutes =
        typeof waSettings.abandonedCartReminderDelayMinutes === 'number'
          ? waSettings.abandonedCartReminderDelayMinutes
          : 60;

      if (!remindersEnabled) return;

      if (this.isRunning) return;
      this.isRunning = true;

      const carts = await this.cartService.getAbandonedCarts(delayMinutes, 200);

      for (const cart of carts) {
        try {
          const user = this.extractPopulatedUser(cart.user);
          if (!user) continue;
          if (user.isBlocked) continue;

          const phone = user.phone?.trim();
          if (!phone) continue;

          // Anti-spam: skip if user placed an order after last cart activity.
          const userId = user._id.toString();
          const latestOrders = await this.ordersService.findUserOrders(userId, 1);
          const latestOrder = latestOrders[0];
          if (latestOrder?.createdAt && latestOrder.createdAt > cart.updatedAt) {
            await this.cartService.markAbandonedReminderSent(cart._id.toString());
            continue;
          }

          const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
          const itemsSummary = cart.items
            .slice(0, 3)
            .map((i) => `${i.name} x${i.quantity}`)
            .join(', ')
            .trim();

          const sent = await this.notificationsService.sendAbandonedCartReminderDetailed({
            cartId: cart._id.toString(),
            phone,
            itemsSummary: itemsSummary || 'your items',
            cartTotal: cart.total,
            itemCount,
          });

          if (sent) {
            await this.cartService.markAbandonedReminderSent(cart._id.toString());
            this.logger.log(
              `abandoned_cart_reminder_sent cart=${cart._id.toString()} user=${userId} count=${cart.abandonedReminderCount + 1}`,
            );
          }
        } catch (err) {
          this.logger.warn('abandoned_cart_reminder_failed', err);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private extractPopulatedUser(value: Types.ObjectId | PopulatedCartUser): PopulatedCartUser | null {
    if (value instanceof Types.ObjectId) return null;
    if (!value._id) return null;
    return value;
  }
}

