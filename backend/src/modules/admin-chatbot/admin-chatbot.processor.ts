import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from 'bullmq';
import { AdminChatbotService } from './admin-chatbot.service';
import { QUEUE_ADMIN, ADMIN_JOBS } from '../queues/queues.constants';
import { attachRateLimitGuard } from '../queues/rate-limit-guard';

@Processor(QUEUE_ADMIN, { concurrency: 1, drainDelay: 30 })
export class AdminChatbotProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminChatbotProcessor.name);

  constructor(private readonly adminChatbotService: AdminChatbotService) {
    super();
  }

  onApplicationBootstrap(): void {
    attachRateLimitGuard(this.worker, this.logger);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case ADMIN_JOBS.DAILY_BRIEFING:
        await this.adminChatbotService._executeDailyBriefing(job.data);
        break;
      default:
        this.logger.warn(`Unknown admin job: "${job.name}"`);
    }
  }
}
