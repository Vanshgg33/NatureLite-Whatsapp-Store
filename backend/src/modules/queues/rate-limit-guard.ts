import { Logger } from '@nestjs/common';
import { Worker } from 'bullmq';

/**
 * Attaches a one-time error listener that pauses the worker for `pauseMs`
 * whenever a Redis rate-limit error is detected (e.g. Upstash free-tier).
 * Without this, BullMQ retries bzpopmin immediately on each error, creating
 * a request storm that burns through rate-limit quotas in seconds.
 */
export function attachRateLimitGuard(worker: Worker, logger: Logger, pauseMs = 60_000): void {
  worker.on('error', (err: Error) => {
    if (!err.message?.includes('max requests limit exceeded')) return;

    logger.warn(`Redis rate limit hit — pausing worker for ${pauseMs / 1000}s`);
    void worker.pause();
    setTimeout(() => {
      void worker.resume();
      logger.log('Worker resumed after rate-limit pause');
    }, pauseMs);
  });
}
