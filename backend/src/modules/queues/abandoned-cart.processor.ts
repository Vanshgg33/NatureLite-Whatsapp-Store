import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CartService } from '../cart/cart.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class AbandonedCartProcessor {
  private readonly logger = new Logger(AbandonedCartProcessor.name);

  constructor(
    private cartService: CartService,
    private notificationsService: NotificationsService,
    private settingsService: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processAbandonedCarts(): Promise<void> {
    this.logger.log('Processing abandoned carts');

    try {
      const settings = await this.settingsService.getWhatsAppSettings();
      const isEnabled = (settings as Record<string, unknown>).abandonedCartReminderEnabled;
      const delayMinutes = ((settings as Record<string, unknown>).abandonedCartReminderDelayMinutes as number) || 60;

      if (!isEnabled) {
        return;
      }

      const abandonedCarts = await this.cartService.getAbandonedCarts(delayMinutes, 50);

      this.logger.log(`Found ${abandonedCarts.length} abandoned carts`);

      for (const cart of abandonedCarts) {
        try {
          const user = cart.user as { phone?: string };

          if (user?.phone) {
            await this.notificationsService.sendAbandonedCartReminder(
              user.phone,
              cart.total,
              cart.items.length,
            );

            await this.cartService.markAbandonedReminderSent(cart._id.toString());
          }
        } catch (error) {
          this.logger.error(`Failed to send reminder for cart ${cart._id}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to process abandoned carts', error);
    }
  }
}
