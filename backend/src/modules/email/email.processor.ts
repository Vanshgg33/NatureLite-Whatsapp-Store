import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from './email.service';
import { QUEUE_EMAIL, EMAIL_JOBS } from '../queues/queues.constants';
import { attachRateLimitGuard } from '../queues/rate-limit-guard';

@Processor(QUEUE_EMAIL, { concurrency: 5, drainDelay: 30 })
export class EmailProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.worker) attachRateLimitGuard(this.worker, this.logger);
  }

  async process(job: Job): Promise<void> {
    this.logger.debug(`Processing email job: ${job.name} (id=${job.id})`);

    switch (job.name) {
      case EMAIL_JOBS.ORDER_CONFIRMATION:
        await this.emailService._executeOrderConfirmation(job.data.order, job.data.email);
        break;

      case EMAIL_JOBS.SHIPPING_UPDATE:
        await this.emailService._executeShippingUpdate(job.data.order, job.data.email);
        break;

      case EMAIL_JOBS.DELIVERY_CONFIRMATION:
        await this.emailService._executeDeliveryConfirmation(job.data.order, job.data.email);
        break;

      case EMAIL_JOBS.ORDER_CANCELLED:
        await this.emailService._executeOrderCancelled(job.data.order, job.data.email);
        break;

      case EMAIL_JOBS.ADMIN_REPORT:
        await this.emailService._executeAdminReport(job.data.to, job.data.subject, job.data.html);
        break;

      default:
        this.logger.warn(`Unknown email job: ${job.name}`);
    }
  }
}
