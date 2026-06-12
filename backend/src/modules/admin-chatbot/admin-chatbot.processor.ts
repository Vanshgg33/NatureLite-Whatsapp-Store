import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from 'bullmq';
import { AdminChatbotService, HistoryItem } from './admin-chatbot.service';
import { QUEUE_ADMIN, ADMIN_JOBS, QUEUE_CHATBOT, CHATBOT_JOBS } from '../queues/queues.constants';
import { attachRateLimitGuard } from '../queues/rate-limit-guard';

@Processor(QUEUE_ADMIN, { concurrency: 1, drainDelay: 30 })
export class AdminChatbotProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminChatbotProcessor.name);

  constructor(private readonly adminChatbotService: AdminChatbotService) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.worker) attachRateLimitGuard(this.worker, this.logger);
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

@Processor(QUEUE_CHATBOT, { concurrency: 2, drainDelay: 15, limiter: { max: 50, duration: 60_000 } })
export class ChatbotQueueProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChatbotQueueProcessor.name);

  constructor(private readonly adminChatbotService: AdminChatbotService) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.worker) attachRateLimitGuard(this.worker, this.logger);
  }

  async process(job: Job<{ message: string; history: HistoryItem[]; adminId?: string }>): Promise<{ reply: string }> {
    switch (job.name) {
      case CHATBOT_JOBS.CHAT_QUERY:
        return this.adminChatbotService._executeChatQuery(job.data);
      default:
        this.logger.warn(`Unknown chatbot job: "${job.name}"`);
        return { reply: 'Unknown job type.' };
    }
  }
}
