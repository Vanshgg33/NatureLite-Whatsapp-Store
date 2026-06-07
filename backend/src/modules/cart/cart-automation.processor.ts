import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from 'bullmq';
import { CartAutomationService } from './cart-automation.service';
import { QUEUE_CART_AUTOMATION, CART_JOBS } from '../queues/queues.constants';
import { attachRateLimitGuard } from '../queues/rate-limit-guard';

@Processor(QUEUE_CART_AUTOMATION, { concurrency: 10, drainDelay: 30 })
export class CartAutomationProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(CartAutomationProcessor.name);

  constructor(private readonly cartAutomationService: CartAutomationService) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.worker) attachRateLimitGuard(this.worker, this.logger);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case CART_JOBS.SEND_REMINDER:
        await this.cartAutomationService._processCartReminder(job.data);
        break;

      default:
        this.logger.warn(`Unknown cart automation job: ${job.name}`);
    }
  }
}
