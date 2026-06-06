import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AdminChatbotService } from './admin-chatbot.service';
import { QUEUE_ADMIN, ADMIN_JOBS } from '../queues/queues.constants';

@Processor(QUEUE_ADMIN, { concurrency: 1 })
export class AdminChatbotProcessor extends WorkerHost {
  private readonly logger = new Logger(AdminChatbotProcessor.name);

  constructor(private readonly adminChatbotService: AdminChatbotService) {
    super();
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
