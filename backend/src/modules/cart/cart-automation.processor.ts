import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CartAutomationService } from './cart-automation.service';
import { QUEUE_CART_AUTOMATION, CART_JOBS } from '../queues/queues.constants';

@Processor(QUEUE_CART_AUTOMATION, { concurrency: 10 })
export class CartAutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(CartAutomationProcessor.name);

  constructor(private readonly cartAutomationService: CartAutomationService) {
    super();
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
