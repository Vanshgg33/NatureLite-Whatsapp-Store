import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetaCatalogService } from './meta-catalog.service';

/**
 * Periodic reconciler — drains the in-memory retry queue every 5 minutes so
 * transient Meta Graph errors (rate limits, brief outages) don't silently
 * drop product-sync updates.
 */
@Injectable()
export class MetaCatalogScheduler {
  private readonly logger = new Logger(MetaCatalogScheduler.name);

  constructor(private readonly metaCatalog: MetaCatalogService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async flushRetries(): Promise<void> {
    try {
      await this.metaCatalog.flushRetryQueue();
    } catch (err) {
      this.logger.error(
        `flushRetryQueue cron failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }
}
