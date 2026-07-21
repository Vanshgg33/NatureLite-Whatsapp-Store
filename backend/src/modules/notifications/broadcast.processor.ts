import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { QUEUE_BROADCAST, NOTIFICATION_JOBS } from '../queues/queues.constants';
import { attachRateLimitGuard } from '../queues/rate-limit-guard';

@Processor(QUEUE_BROADCAST, {
  concurrency: 1,
  drainDelay: 30_000, // poll every 30s when idle — saves Redis quota
})
export class BroadcastProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(BroadcastProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.worker) attachRateLimitGuard(this.worker, this.logger);
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing broadcast job: ${job.name} (id=${job.id})`);
    switch (job.name) {
      case NOTIFICATION_JOBS.BROADCAST_TEMPLATE:
        await this.notificationsService._executeBroadcastTemplate(job.data);
        break;
      case NOTIFICATION_JOBS.BROADCAST_MEDIA:
        await this.notificationsService._executeBroadcastMedia(job.data);
        break;
      default:
        this.logger.warn(`Unknown broadcast job: ${job.name}`);
    }
  }
}
