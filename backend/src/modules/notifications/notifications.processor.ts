import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { QUEUE_NOTIFICATIONS, NOTIFICATION_JOBS } from '../queues/queues.constants';
import { attachRateLimitGuard } from '../queues/rate-limit-guard';

@Processor(QUEUE_NOTIFICATIONS, { concurrency: 5, drainDelay: 30 })
export class NotificationsProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  onApplicationBootstrap(): void {
    attachRateLimitGuard(this.worker, this.logger);
  }

  async process(job: Job): Promise<void> {
    this.logger.debug(`Processing notification job: ${job.name} (id=${job.id})`);

    switch (job.name) {
      // Text-based notifications
      case NOTIFICATION_JOBS.ORDER_CREATED:
        await this.notificationsService._executeOrderCreated(job.data);
        break;

      case NOTIFICATION_JOBS.ORDER_STATUS_CHANGED:
        await this.notificationsService._executeOrderStatusChanged(job.data);
        break;

      case NOTIFICATION_JOBS.ORDER_DELIVERED:
        await this.notificationsService._executeOrderDelivered(job.data);
        break;

      // Interactive button notifications
      case NOTIFICATION_JOBS.ORDER_CONFIRMED_BTN:
        await this.notificationsService._executeOrderConfirmed(job.data);
        break;

      case NOTIFICATION_JOBS.ORDER_PACKED_BTN:
        await this.notificationsService._executeOrderPacked(job.data);
        break;

      case NOTIFICATION_JOBS.OUT_FOR_DELIVERY_BTN:
        await this.notificationsService._executeOutForDelivery(job.data);
        break;

      case NOTIFICATION_JOBS.DELIVERY_ATTEMPT_BTN:
        await this.notificationsService._executeDeliveryAttempt(job.data);
        break;

      case NOTIFICATION_JOBS.PAYMENT_RECEIVED_BTN:
        await this.notificationsService._executePaymentReceived(job.data);
        break;

      // Template-based notifications
      case NOTIFICATION_JOBS.ORDER_CONFIRMATION_TPL:
        await this.notificationsService._executeSendOrderConfirmation(job.data);
        break;

      case NOTIFICATION_JOBS.SHIPPING_UPDATE_TPL:
        await this.notificationsService._executeSendShippingUpdate(job.data);
        break;

      case NOTIFICATION_JOBS.OUT_FOR_DELIVERY_TPL:
        await this.notificationsService._executeSendOutForDelivery(job.data);
        break;

      case NOTIFICATION_JOBS.DELIVERY_CONFIRMATION_TPL:
        await this.notificationsService._executeSendDeliveryConfirmation(job.data);
        break;

      // Other
      case NOTIFICATION_JOBS.FEEDBACK_REQUEST:
        await this.notificationsService._executeSendFeedbackRequest(job.data);
        break;

      case NOTIFICATION_JOBS.ORDER_CANCELLED:
        await this.notificationsService._executeSendOrderCancelled(job.data);
        break;

      case NOTIFICATION_JOBS.ABANDONED_CART:
        await this.notificationsService._executeSendAbandonedCartReminder(job.data);
        break;

      case NOTIFICATION_JOBS.ABANDONED_CART_DETAILED:
        await this.notificationsService._executeSendAbandonedCartReminderDetailed(job.data);
        break;

      default:
        this.logger.warn(`Unknown notification job: ${job.name}`);
    }
  }
}
