import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('redis.host');
    const port = this.configService.get<number>('redis.port');
    const password = this.configService.get<string>('redis.password');
    const username = this.configService.get<string>('redis.username');
    const tls = this.configService.get<boolean>('redis.tls');

    this.client = new Redis({
      host,
      port,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(tls ? { tls: { rejectUnauthorized: false } } : {}),
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`);
    });

    this.client.connect().catch((err) => {
      this.logger.warn(`Redis initial connect failed (will retry): ${err.message}`);
    });
  }

  onModuleDestroy(): void {
    this.client.quit().catch(() => {});
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis set failed for key ${key}: ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {}
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const stream = this.client.scanStream({
        match: pattern,
        count: 100,
      });

      for await (const keys of stream) {
        if (keys && keys.length > 0) {
          await this.client.del(...keys);
        }
      }
    } catch (err) {
      this.logger.warn(`Redis delPattern failed for ${pattern}: ${(err as Error).message}`);
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  /**
   * Get from cache if exists; otherwise compute, store, and return.
   * Falls back to computing the value if Redis is unavailable.
   */
  async cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) return cached;

    const value = await compute();
    await this.setJson(key, value, ttlSeconds);
    return value;
  }
}
