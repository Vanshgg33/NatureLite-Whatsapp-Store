import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Product } from '../products/schemas/product.schema';
import type { MetaCatalogConfig } from '../../config/configuration';

type BatchMethod = 'CREATE' | 'UPDATE' | 'DELETE';

interface BatchRequest {
  method: BatchMethod;
  retailer_id: string;
  data?: Record<string, unknown>;
}

interface ItemsBatchResponse {
  handles?: string[];
  validation_status?: Array<{ retailer_id: string; errors: Array<{ message: string }> }>;
}

/**
 * Wraps the Meta Graph API for the Commerce Catalog. Single responsibility:
 * take a Product (from our Mongo collection) and push it to Meta so it can
 * appear in WhatsApp catalog messages.
 *
 * Design:
 *   - Fire-and-forget from callers (ProductsService lifecycle hooks). Each
 *     send is attempted once; failures are logged and queued for retry by a
 *     periodic reconciler so a transient Meta outage doesn't drop updates.
 *   - Batched: one HTTP call can carry up to 1000 product requests, used by
 *     the backfill script. Single-item updates still use the batch endpoint
 *     with a 1-element array — Meta's only write endpoint for catalogs.
 *   - Disabled by default (`WA_CATALOG_ENABLED=false`) so this code is a
 *     no-op until credentials are verified and Phase 5 flips the flag.
 */
@Injectable()
export class MetaCatalogService implements OnModuleInit {
  private readonly logger = new Logger(MetaCatalogService.name);
  private readonly config: MetaCatalogConfig;
  private readonly http: AxiosInstance;

  /** Retry queue for transient failures. Keyed by retailer_id so newer
   *  updates overwrite older queued ones — we always want the latest state. */
  private readonly retryQueue = new Map<
    string,
    { request: BatchRequest; attempts: number; lastError?: string }
  >();
  private readonly maxRetryAttempts = 5;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<MetaCatalogConfig>('metaCatalog') ?? {
      catalogId: '',
      graphToken: '',
      apiVersion: 'v19.0',
      enabled: false,
    };
    this.http = axios.create({
      baseURL: `https://graph.facebook.com/${this.config.apiVersion}`,
      timeout: 15_000,
    });
  }

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('Meta catalog sync is DISABLED (WA_CATALOG_ENABLED=false)');
      return;
    }
    if (!this.config.catalogId || !this.config.graphToken) {
      this.logger.warn(
        'Meta catalog enabled but META_CATALOG_ID or META_GRAPH_TOKEN missing — sync will be skipped.',
      );
      return;
    }
    this.logger.log(`Meta catalog sync ENABLED (catalog ${this.config.catalogId})`);
  }

  /** True if Phase-5 feature flag is on AND credentials are present. */
  isReady(): boolean {
    return (
      this.config.enabled &&
      Boolean(this.config.catalogId) &&
      Boolean(this.config.graphToken)
    );
  }

  /**
   * Upsert a single product into the Meta catalog. Fire-and-forget: callers
   * don't await a sensible result — errors are logged and queued for retry.
   */
  syncProduct(product: Product): void {
    if (!this.isReady()) return;
    void this.sendBatch([this.buildUpdateRequest(product)]).catch((err) => {
      this.logger.warn(
        `syncProduct failed for ${product._id}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      this.enqueueRetry(this.buildUpdateRequest(product), err);
    });
  }

  /** Remove a product from the Meta catalog. Fire-and-forget. */
  deleteProduct(productId: string): void {
    if (!this.isReady()) return;
    const request: BatchRequest = { method: 'DELETE', retailer_id: productId };
    void this.sendBatch([request]).catch((err) => {
      this.logger.warn(
        `deleteProduct failed for ${productId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      this.enqueueRetry(request, err);
    });
  }

  /**
   * Bulk sync — used by the backfill script. Awaited, so the caller can wait
   * for completion and print a summary. Chunks into batches of 1000.
   */
  async syncManyProducts(products: Product[]): Promise<{ sent: number; failed: number }> {
    if (!this.isReady()) {
      this.logger.warn('syncManyProducts called but service is not ready');
      return { sent: 0, failed: 0 };
    }

    const CHUNK = 1000;
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < products.length; i += CHUNK) {
      const chunk = products.slice(i, i + CHUNK);
      const requests = chunk.map((p) => this.buildUpdateRequest(p));
      try {
        await this.sendBatch(requests);
        sent += chunk.length;
        this.logger.log(`Synced chunk ${i}–${i + chunk.length}/${products.length}`);
      } catch (err) {
        failed += chunk.length;
        this.logger.error(
          `Chunk ${i}–${i + chunk.length} failed: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    return { sent, failed };
  }

  /** Read-only catalog info — useful as a token/health check. */
  async getCatalogInfo(): Promise<{ id: string; name: string; product_count: number } | null> {
    if (!this.isReady()) return null;
    try {
      const { data } = await this.http.get(`/${this.config.catalogId}`, {
        params: {
          fields: 'id,name,product_count',
          access_token: this.config.graphToken,
        },
      });
      return data as { id: string; name: string; product_count: number };
    } catch (err) {
      this.logger.error(
        `getCatalogInfo failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return null;
    }
  }

  /** How many items are still queued for retry. Exposed for admin visibility. */
  getRetryQueueSize(): number {
    return this.retryQueue.size;
  }

  // ─── internals ───────────────────────────────────────────────────────

  private buildUpdateRequest(product: Product): BatchRequest {
    const available = this.resolveAvailability(product);
    const priceMajor = Number.isFinite(product.price) ? product.price : 0;

    return {
      method: 'UPDATE', // UPDATE semantics = upsert in Meta's batch API
      retailer_id: product._id.toString(),
      data: {
        availability: available ? 'in stock' : 'out of stock',
        brand: 'NatureLite',
        category: '', // category id is a mongo id; leaving blank avoids Meta
                      // mis-interpreting it. Phase 6 can hydrate category names.
        condition: 'new',
        description: (product.description || product.shortDescription || product.name).slice(0, 5000),
        image_url: product.images[0] || '',
        name: product.name.slice(0, 150),
        price: `${priceMajor.toFixed(2)} INR`,
        url: '', // optional storefront URL; fine to leave blank
        visibility: product.isActive ? 'published' : 'staging',
      },
    };
  }

  private resolveAvailability(product: Product): boolean {
    if (product.isActive === false) return false;
    if (product.trackStock === false) return true;
    return (product.stock ?? 0) > 0;
  }

  /** Post a batch of mutations. Throws on non-2xx so callers can queue retries. */
  private async sendBatch(requests: BatchRequest[]): Promise<ItemsBatchResponse> {
    const response = await this.http.post<ItemsBatchResponse>(
      `/${this.config.catalogId}/items_batch`,
      { requests },
      {
        params: { access_token: this.config.graphToken },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    return response.data;
  }

  private enqueueRetry(request: BatchRequest, err: unknown): void {
    const key = request.retailer_id;
    const existing = this.retryQueue.get(key);
    const message = err instanceof Error ? err.message : 'unknown';
    this.retryQueue.set(key, {
      request,
      attempts: existing?.attempts ?? 0,
      lastError: message,
    });
  }

  /** Periodic reconciler: every 5 minutes, retries queued items. */
  async flushRetryQueue(): Promise<void> {
    if (!this.isReady() || this.retryQueue.size === 0) return;

    const batch: BatchRequest[] = [];
    const keys: string[] = [];
    for (const [key, entry] of this.retryQueue) {
      if (entry.attempts >= this.maxRetryAttempts) continue;
      batch.push(entry.request);
      keys.push(key);
      if (batch.length >= 500) break;
    }
    if (batch.length === 0) return;

    try {
      await this.sendBatch(batch);
      for (const key of keys) this.retryQueue.delete(key);
      this.logger.log(`Flushed ${keys.length} retries to Meta catalog`);
    } catch (err) {
      for (const key of keys) {
        const entry = this.retryQueue.get(key);
        if (entry) {
          entry.attempts += 1;
          entry.lastError = err instanceof Error ? err.message : 'unknown';
          if (entry.attempts >= this.maxRetryAttempts) {
            this.logger.error(
              `Giving up on ${key} after ${entry.attempts} attempts: ${entry.lastError}`,
            );
            this.retryQueue.delete(key);
          }
        }
      }
    }
  }
}
