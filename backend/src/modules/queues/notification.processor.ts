import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service';

interface NotificationPayload {
  phone: string;
  templateName: string;
  params: string[];
  orderId?: string;
  idempotencyKey?: string;
}

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationPayload>): Promise<boolean> {
    this.logger.log(`Processing notification job ${job.id}`);

    try {
      const result = await this.notificationsService.processNotification(job.data);
      return result;
    } catch (error) {
      this.logger.error(`Failed to process notification job ${job.id}`, error);
      throw error;
    }
  }
}
