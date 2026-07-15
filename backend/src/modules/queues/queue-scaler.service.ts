import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Worker } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from './queues.constants';

const MIN_CONCURRENCY = 5;
const POLL_MS         = 10_000; // check every 10 seconds

// Scale UP immediately when pressure is detected.
// Scale DOWN only after COOLDOWN_TICKS consecutive checks below threshold
// — prevents flapping when queue briefly drains mid-burst.
const COOLDOWN_TICKS = 3;

const SCALE_STEPS = [
  { minWaiting: 50, concurrency: 20 },
  { minWaiting: 20, concurrency: 15 },
  { minWaiting: 5,  concurrency: 10 },
  { minWaiting: 0,  concurrency: MIN_CONCURRENCY },
];

@Injectable()
export class QueueScalerService implements OnApplicationShutdown {
  private readonly logger = new Logger(QueueScalerService.name);
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cooldownTicks = 0;
  private cooldownTarget: number | null = null; // track which target the cooldown is counting toward

  constructor(
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  attach(worker: Worker): void {
    if (this.timer) clearInterval(this.timer);
    this.worker = worker;
    this.worker.concurrency = MIN_CONCURRENCY;
    this.timer = setInterval(() => { this.tick().catch(err => this.logger.warn(`Scaler tick failed: ${err?.message}`)); }, POLL_MS);
    this.logger.log(`Queue scaler attached — baseline concurrency ${MIN_CONCURRENCY}`);
  }

  private async tick(): Promise<void> {
    if (!this.worker) return;

    // Priority jobs sit in 'prioritized' state, not 'waiting' — must count both
    const [waitingCount, prioritizedCount] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getPrioritizedCount(),
    ]);
    const waiting = waitingCount + prioritizedCount;
    const current = this.worker.concurrency;
    const target  = SCALE_STEPS.find(s => waiting >= s.minWaiting)!.concurrency;

    if (target > current) {
      // Scale UP immediately
      this.cooldownTicks = 0;
      this.cooldownTarget = null;
      this.worker.concurrency = target;
      this.logger.log(`Scale UP: waiting=${waiting} → concurrency ${current}→${target}`);
    } else if (target < current) {
      // Reset cooldown if the target changed — prevents accumulating ticks toward wrong target
      if (this.cooldownTarget !== target) {
        this.cooldownTicks = 0;
        this.cooldownTarget = target;
      }
      this.cooldownTicks++;
      if (this.cooldownTicks >= COOLDOWN_TICKS) {
        this.cooldownTicks = 0;
        this.cooldownTarget = null;
        this.worker.concurrency = target;
        this.logger.log(`Scale DOWN: waiting=${waiting} → concurrency ${current}→${target}`);
      }
    } else {
      this.cooldownTicks = 0;
      this.cooldownTarget = null;
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
