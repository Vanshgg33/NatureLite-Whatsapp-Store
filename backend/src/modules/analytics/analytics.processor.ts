import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AnalyticsService } from './analytics.service';
import { QUEUE_ANALYTICS, ANALYTICS_JOBS } from '../queues/queues.constants';

@Processor(QUEUE_ANALYTICS, { concurrency: 1 })
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(private readonly analyticsService: AnalyticsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing analytics job: ${job.name} (id=${job.id})`);

    switch (job.name) {
      case ANALYTICS_JOBS.DAILY_SNAPSHOT:
        await this.analyticsService._executeDailySnapshot(job.data);
        break;

      case ANALYTICS_JOBS.WEEKLY_SNAPSHOT:
        await this.analyticsService._executeWeeklySnapshot(job.data);
        break;

      case ANALYTICS_JOBS.MONTHLY_SNAPSHOT:
        await this.analyticsService._executeMonthlySnapshot(job.data);
        break;

      default:
        this.logger.warn(`Unknown analytics job: ${job.name}`);
    }
  }
}
