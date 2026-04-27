import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { SettingsService } from '../settings/settings.service';
import { ProductRepository } from '../products/repositories/product.repository';
import { ProductDocument } from '../products/schemas/product.schema';
import { CatalogConfig } from '../../config/configuration';
import { UpdateUcmCatalogConfigDto, UcmSyncMode } from './dto/ucm.dto';

type CatalogState = {
  syncMode?: UcmSyncMode | 'dry_run' | 'meta';
  autoSyncEnabled?: boolean;
  selectedCatalogId?: string;
  selectedCatalogName?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'idle' | 'dry_run' | 'syncing' | 'success' | 'failed';
  lastSyncMessage?: string;
  lastSyncSummary?: unknown;
};

type RemoteCatalog = {
  id: string;
  name: string;
  product_count?: number;
  vertical?: string;
};

type SyncDetail = {
  retailerId: string;
  status: 'synced' | 'skipped' | 'failed';
  message?: string;
};

type SyncSummary = {
  mode: 'dry_run' | 'meta';
  totalProducts: number;
  syncedProducts: number;
  failedProducts: number;
  remoteCatalogId?: string;
  remoteCatalogName?: string;
  details: SyncDetail[];
};

@Injectable()
export class UcmService {
  private readonly logger = new Logger(UcmService.name);
  private readonly graphClient: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly productRepository: ProductRepository,
  ) {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    this.graphClient = axios.create({
      baseURL: catalogConfig.apiUrl.replace(/\/$/, ''),
      timeout: 20_000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getDashboardSnapshot(): Promise<{ config: CatalogState; catalogs: RemoteCatalog[]; productCount: number }> {
    const [config, catalogs, productCount] = await Promise.all([
      this.getCatalogState(),
      this.listRemoteCatalogs().catch(() => []),
      this.productRepository.countDocuments(),
    ]);

    return { config, catalogs, productCount };
  }

  async getCatalogState(): Promise<CatalogState> {
    const raw = (await this.settingsService.get('catalog')) || {};
    const state = raw as Record<string, unknown>;

    return {
      syncMode: (state.syncMode as CatalogState['syncMode']) || 'dry_run',
      autoSyncEnabled: state.autoSyncEnabled !== false,
      selectedCatalogId: typeof state.selectedCatalogId === 'string' ? state.selectedCatalogId : '',
      selectedCatalogName: typeof state.selectedCatalogName === 'string' ? state.selectedCatalogName : '',
      lastSyncAt: typeof state.lastSyncAt === 'string' ? state.lastSyncAt : '',
      lastSyncStatus: (state.lastSyncStatus as CatalogState['lastSyncStatus']) || 'idle',
      lastSyncMessage: typeof state.lastSyncMessage === 'string' ? state.lastSyncMessage : '',
      lastSyncSummary: state.lastSyncSummary,
    };
  }

  async updateCatalogConfig(dto: UpdateUcmCatalogConfigDto, updatedBy?: string): Promise<CatalogState> {
    const current = await this.getCatalogState();
    const next: CatalogState = {
      ...current,
      ...dto,
    };

    await this.settingsService.set('catalog', next as Record<string, unknown>, updatedBy);
    return next;
  }

  async listRemoteCatalogs(): Promise<RemoteCatalog[]> {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    if (!catalogConfig.accessToken || !catalogConfig.businessId) {
      return [];
    }

    const response = await this.graphClient.get(`/${catalogConfig.businessId}/owned_product_catalogs`, {
      params: {
        access_token: catalogConfig.accessToken,
        fields: 'id,name,product_count,vertical',
      },
    });

    return Array.isArray(response.data?.data)
      ? response.data.data.map((catalog: RemoteCatalog) => ({
          id: catalog.id,
          name: catalog.name,
          product_count: catalog.product_count,
          vertical: catalog.vertical,
        }))
      : [];
  }

  async deleteRemoteCatalog(catalogId: string): Promise<void> {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    if (!catalogConfig.accessToken) {
      throw new BadRequestException('Catalog access token is not configured');
    }

    await this.graphClient.delete(`/${catalogId}`, {
      params: {
        access_token: catalogConfig.accessToken,
      },
    });
  }

  async syncAllProducts(reason = 'manual_sync'): Promise<SyncSummary> {
    // Validate catalog configuration before syncing
    const state = await this.getCatalogState();
    
    if (state.syncMode === 'meta' && !state.selectedCatalogId?.trim()) {
      this.logger.error('Sync attempted in meta mode without catalog selection');
      throw new BadRequestException('Select one catalog in UCM before syncing products.');
    }

    this.logger.log(`Starting UCM sync (mode: ${state.syncMode}, reason: ${reason})`);
    const products = await this.productRepository.findAllForSync();
    this.logger.log(`Found ${products.length} products for sync`);

    if (state.syncMode === 'dry_run') {
      const details = products.map((product) => ({
        retailerId: product._id.toString(),
        status: 'skipped' as const,
        message: `Dry run only (${reason})`,
      }));

      await this.writeSyncState('dry_run', 'Dry run completed. No remote catalog was modified.');

      return {
        mode: 'dry_run',
        totalProducts: products.length,
        syncedProducts: 0,
        failedProducts: 0,
        remoteCatalogId: state.selectedCatalogId,
        remoteCatalogName: state.selectedCatalogName,
        details,
      };
    }

    return this.syncProductsToRemote(products, reason);
  }

  async syncProductById(productId: string, reason = 'product_update'): Promise<void> {
    const product = await this.productRepository.findByIdString(productId);
    if (!product) {
      this.logger.warn(`syncProductById skipped: product ${productId} was not found`);
      return;
    }

    const state = await this.getCatalogState();
    if (state.syncMode === 'dry_run') {
      await this.writeSyncState('dry_run', `Dry run recorded for ${productId} (${reason}).`);
      return;
    }

    await this.syncProductsToRemote([product], reason);
  }

  async archiveDeletedProduct(product: ProductDocument, reason = 'product_deleted'): Promise<void> {
    const state = await this.getCatalogState();
    if (state.syncMode === 'dry_run') {
      await this.writeSyncState('dry_run', `Dry run archive recorded for ${product._id.toString()} (${reason}).`);
      return;
    }

    await this.upsertRemoteProduct(state, this.buildCatalogItem(product, true));
  }

  private async syncProductsToRemote(products: ProductDocument[], reason: string): Promise<SyncSummary> {
    const state = await this.getCatalogState();
    let remoteCatalogId = state.selectedCatalogId?.trim() || '';
    let remoteCatalogName = state.selectedCatalogName?.trim() || '';

    if (!remoteCatalogId) {
      const catalogs = await this.listRemoteCatalogs();
      if (catalogs.length === 1) {
        this.logger.log(`Auto-selecting single catalog: ${catalogs[0].id} (${catalogs[0].name})`);
        await this.updateCatalogConfig({
          selectedCatalogId: catalogs[0].id,
          selectedCatalogName: catalogs[0].name,
        });
        const nextState = await this.getCatalogState();
        remoteCatalogId = nextState.selectedCatalogId?.trim() || '';
        remoteCatalogName = nextState.selectedCatalogName?.trim() || '';
      }
    }

    if (!remoteCatalogId) {
      this.logger.error('No catalog ID available for sync');
      throw new BadRequestException('Select one catalog in UCM before syncing products.');
    }

    this.logger.log(`Syncing ${products.length} products to catalog ${remoteCatalogId} (${remoteCatalogName})`);

    let syncedProducts = 0;
    let failedProducts = 0;
    const details: SyncDetail[] = [];

    for (const product of products) {
      try {
        const item = this.buildCatalogItem(product, false);
        await this.upsertRemoteProduct(state, item, remoteCatalogId);
        syncedProducts += 1;
        details.push({ retailerId: item.retailer_id as string, status: 'synced' });
      } catch (error) {
        failedProducts += 1;
        const message = error instanceof Error ? error.message : 'Unknown sync error';
        if (axios.isAxiosError(error)) {
          const responseBody = error.response?.data;
          this.logger.warn(
            `Catalog sync failed for ${product._id.toString()}: ${message} status=${error.response?.status ?? 'unknown'} body=${JSON.stringify(responseBody)}`,
          );
        } else {
          this.logger.warn(`Catalog sync failed for ${product._id.toString()}: ${message}`);
        }
        details.push({ retailerId: product._id.toString(), status: 'failed', message });
      }
    }

    const summary: SyncSummary = {
      mode: 'meta',
      totalProducts: products.length,
      syncedProducts,
      failedProducts,
      remoteCatalogId,
      remoteCatalogName,
      details,
    };

    this.logger.log(`Sync completed: ${syncedProducts}/${products.length} products synced, ${failedProducts} failed`);

    await this.writeSyncState(
      failedProducts > 0 ? 'failed' : 'success',
      `${syncedProducts}/${products.length} products synced${failedProducts > 0 ? `, ${failedProducts} failed` : ''}${reason ? ` (${reason})` : ''}`,
      remoteCatalogId,
      remoteCatalogName,
      summary,
    );

    return summary;
  }

  private buildCatalogItem(product: ProductDocument, archived: boolean): Record<string, unknown> {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    const frontendUrl = this.configService.get<string>('frontendUrl') || '';
    const baseUrl = frontendUrl.split(',')[0]?.trim().replace(/\/$/, '') || '';
    const unavailable = archived || product.isActive === false || (product.trackStock && (product.stock || 0) <= 0);

    const item: Record<string, unknown> = {
      retailer_id: product._id.toString(),
      name: product.name,
      description: (product.description || product.shortDescription || '').toString().slice(0, 5000),
      availability: unavailable ? 'out of stock' : 'in stock',
      condition: 'new',
      currency: 'INR',
      price: Math.max(0, Number((product.price || 0).toFixed(2))),
      custom_label_1: product.sku,
    };

    // Only add optional fields if they have values
    if (product.images?.[0]) {
      item.image_url = product.images[0];
    }
    if (product.compareAtPrice && product.compareAtPrice > product.price) {
      item.sale_price = Math.max(0, Number(product.price.toFixed(2)));
    }
    if (baseUrl) {
      item.url = `${baseUrl}/products/${product.slug}`;
    }
    if (product.trackStock) {
      item.inventory = Math.max(0, product.stock || 0);
    }
    if (catalogConfig.businessId) {
      item.custom_label_0 = catalogConfig.businessId;
    }

    return item;
  }

  private async upsertRemoteProduct(
    state: CatalogState,
    item: Record<string, unknown>,
    overrideCatalogId?: string,
  ): Promise<void> {
    const catalogId = overrideCatalogId || state.selectedCatalogId;
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;

    if (!catalogId) {
      throw new BadRequestException('No catalog selected');
    }
    if (!catalogConfig.accessToken) {
      throw new BadRequestException('Catalog access token is not configured');
    }

    const payload = new URLSearchParams();
    for (const [key, value] of Object.entries(item)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        payload.set(key, JSON.stringify(value));
      } else {
        payload.set(key, String(value));
      }
    }

    const candidatePaths = [
      `/${catalogId}/products`,
      `/${catalogId}/items`,
      `/${catalogId}/product_items`,
    ];

    let lastError: unknown;

    for (const path of candidatePaths) {
      try {
        await this.graphClient.post(path, payload, {
          params: {
            access_token: catalogConfig.accessToken,
            allow_upsert: true,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
        return;
      } catch (error) {
        lastError = error;
        if (!this.isUnknownCatalogPathError(error)) {
          throw error;
        }

        this.logger.warn(`Catalog write route rejected for ${path}; trying next fallback path`);
      }
    }

    throw lastError instanceof Error ? lastError : new BadRequestException('Catalog sync failed');
  }

  private isUnknownCatalogPathError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const response = error.response?.data as { error?: { code?: number; message?: string } } | undefined;
    return response?.error?.code === 2500 && typeof response.error.message === 'string' && response.error.message.includes('Unknown path components');
  }

  private async writeSyncState(
    status: CatalogState['lastSyncStatus'],
    message: string,
    selectedCatalogId?: string,
    selectedCatalogName?: string,
    summary?: SyncSummary,
  ): Promise<void> {
    const current = await this.getCatalogState();
    await this.settingsService.set('catalog', {
      ...current,
      selectedCatalogId: selectedCatalogId ?? current.selectedCatalogId ?? '',
      selectedCatalogName: selectedCatalogName ?? current.selectedCatalogName ?? '',
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: status,
      lastSyncMessage: message,
      lastSyncSummary: summary,
    } as Record<string, unknown>);
  }
}