import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Types } from 'mongoose';
import { SettingsService } from '../settings/settings.service';
import { ProductRepository } from '../products/repositories/product.repository';
import { ProductDocument } from '../products/schemas/product.schema';
import { CategoryRepository } from '../categories/repositories/category.repository';
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

type RemoteCatalogProduct = {
  id?: string;
  retailer_id?: string;
  name?: string;
  description?: string;
  short_description?: string;
  availability?: string;
  condition?: string;
  currency?: string;
  // Meta's Graph API for catalog products returns price/sale_price either as
  // an integer (minor units, e.g. paise) or as a formatted string ("250.00 INR")
  // depending on API version and field selection. Accept both shapes; the
  // parser in catalogAmountToLocal normalises them.
  price?: number | string;
  sale_price?: number | string;
  image_url?: string;
  inventory?: number;
  url?: string;
  product_type?: string;
  category?: string;
  custom_label_0?: string;
  custom_label_1?: string;
  custom_data?: Record<string, unknown>;
};

type RemoteProductsResponse = {
  data?: RemoteCatalogProduct[];
  paging?: {
    cursors?: {
      after?: string;
    };
  };
  summary?: {
    total_count?: number;
  };
};

type SyncDetail = {
  retailerId: string;
  status: 'synced' | 'skipped' | 'failed';
  message?: string;
};

type SyncSummary = {
  mode: 'dry_run' | 'pull' | 'push';
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
    private readonly categoryRepository: CategoryRepository,
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
    return this.pushCatalogToMeta(reason);
  }

  async pushCatalogToMeta(reason = 'manual_sync'): Promise<SyncSummary> {
    const state = await this.getCatalogState();

    if (state.syncMode === 'meta' && !state.selectedCatalogId?.trim()) {
      this.logger.error('Sync attempted in meta mode without catalog selection');
      throw new BadRequestException('Select one catalog in UCM before syncing products.');
    }

    this.logger.log(`Starting UCM push sync (mode: ${state.syncMode}, reason: ${reason})`);
    const products = await this.productRepository.findAllForSync();
    this.logger.log(`Found ${products.length} products for push sync`);

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

    return this.syncProductsToRemote(products, reason, 'push');
  }

  async pullCatalogToDatabase(reason = 'manual_pull'): Promise<SyncSummary> {
    const state = await this.getCatalogState();
    const { remoteCatalogId, remoteCatalogName } = await this.resolveCatalogSelection(state);
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;

    this.logger.log(
      `Starting UCM pull sync for catalog ${remoteCatalogId} (${remoteCatalogName}), businessId=${catalogConfig.businessId}, reason: ${reason}`,
    );

    const remoteProducts = await this.listRemoteCatalogProducts(remoteCatalogId);
    this.logger.log(`Found ${remoteProducts.length} products for pull sync`);

    let syncedProducts = 0;
    let failedProducts = 0;
    const details: SyncDetail[] = [];

    for (const remoteProduct of remoteProducts) {
      const retailerId = this.getRemoteRetailerId(remoteProduct) || remoteProduct.id || 'unknown';

      try {
        await this.upsertLocalProductFromRemote(remoteProduct, remoteCatalogId, remoteCatalogName);
        syncedProducts += 1;
        details.push({ retailerId, status: 'synced' });
      } catch (error) {
        failedProducts += 1;
        const message = error instanceof Error ? error.message : 'Unknown pull sync error';
        if (axios.isAxiosError(error)) {
          const responseBody = error.response?.data;
          this.logger.warn(
            `Catalog pull failed for ${retailerId}: ${message} status=${error.response?.status ?? 'unknown'} body=${JSON.stringify(responseBody)}`,
          );
        } else {
          this.logger.warn(`Catalog pull failed for ${retailerId}: ${message}`);
        }
        details.push({ retailerId, status: 'failed', message });
      }
    }

    const summary: SyncSummary = {
      mode: 'pull',
      totalProducts: remoteProducts.length,
      syncedProducts,
      failedProducts,
      remoteCatalogId,
      remoteCatalogName,
      details,
    };

    await this.writeSyncState(
      failedProducts > 0 ? 'failed' : 'success',
      `${syncedProducts}/${remoteProducts.length} products pulled${failedProducts > 0 ? `, ${failedProducts} failed` : ''}${reason ? ` (${reason})` : ''}`,
      remoteCatalogId,
      remoteCatalogName,
      summary,
    );

    return summary;
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

    await this.syncProductsToRemote([product], reason, 'push');
  }

  async archiveDeletedProduct(product: ProductDocument, reason = 'product_deleted'): Promise<void> {
    const state = await this.getCatalogState();
    if (state.syncMode === 'dry_run') {
      await this.writeSyncState('dry_run', `Dry run archive recorded for ${product._id.toString()} (${reason}).`);
      return;
    }

    await this.upsertRemoteProduct(state, this.buildCatalogItem(product, true));
  }

  private async syncProductsToRemote(products: ProductDocument[], reason: string, mode: 'push'): Promise<SyncSummary> {
    const state = await this.getCatalogState();
    const { remoteCatalogId, remoteCatalogName } = await this.resolveCatalogSelection(state);

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
      mode,
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

  private async resolveCatalogSelection(state: CatalogState): Promise<{ remoteCatalogId: string; remoteCatalogName: string }> {
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

    return { remoteCatalogId, remoteCatalogName };
  }

  private async listRemoteCatalogProducts(catalogId: string): Promise<RemoteCatalogProduct[]> {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    if (!catalogConfig.accessToken) {
      throw new BadRequestException('Catalog access token is not configured');
    }

    const products: RemoteCatalogProduct[] = [];
    let after: string | undefined;
    let pageCount = 0;

    do {
      try {
        const fieldsArray = ['id', 'retailer_id', 'name', 'description', 'short_description', 'price', 'sale_price', 'availability', 'condition', 'currency', 'image_url', 'inventory', 'url', 'product_type', 'category', 'custom_label_0', 'custom_label_1', 'custom_data'];
        const response = await this.graphClient.get<RemoteProductsResponse>(`/${catalogId}/products`, {
          params: {
            access_token: catalogConfig.accessToken,
            fields: JSON.stringify(fieldsArray),
            summary: 'total_count',
            limit: 100,
            ...(after ? { after } : {}),
          },
        });

        const batch = Array.isArray(response.data?.data) ? response.data.data : [];
        products.push(...batch);
        after = response.data?.paging?.cursors?.after;
        pageCount += 1;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const errorData = error.response?.data;
          this.logger.error(
            `Meta catalog products API error: status=${error.response?.status}, message=${error.message}, body=${JSON.stringify(errorData)}`,
          );
          throw new BadRequestException(`Failed to fetch catalog products from Meta: ${error.message}`);
        }
        throw error;
      }
    } while (after && pageCount < 20);

    return products;
  }

  private async upsertLocalProductFromRemote(
    remoteProduct: RemoteCatalogProduct,
    remoteCatalogId: string,
    remoteCatalogName: string,
  ): Promise<ProductDocument> {
    const retailerId = this.getRemoteRetailerId(remoteProduct);
    if (!retailerId) {
      throw new BadRequestException('Remote catalog item is missing retailer_id');
    }

    const categoryLabel = (remoteProduct.product_type || remoteProduct.category || 'Imported Commerce Manager Items').trim();
    const category = await this.resolveCategoryForRemoteItem(categoryLabel);
    const remoteCurrent = this.catalogAmountToLocal(remoteProduct.sale_price ?? remoteProduct.price);
    const remoteOriginal = this.catalogAmountToLocal(remoteProduct.price);
    const existing = await this.productRepository.findOne({
      $or: [
        { sku: retailerId },
        { 'metadata.remoteCatalogRetailerId': retailerId },
      ],
    });

    // Only trust a remote price when it parses to a positive number. If Meta
    // returns no price (or zero), keep the existing local price rather than
    // silently overwriting it with 0 — a 0 price quietly breaks catalog cart
    // checkout because the cart total drops to ₹0 and trips the discount-too-large
    // guard in the chatbot payment step.
    const currentPrice = typeof remoteCurrent === 'number' && remoteCurrent > 0
      ? remoteCurrent
      : (existing?.price ?? 0);
    const originalPrice = typeof remoteOriginal === 'number' && remoteOriginal > 0
      ? remoteOriginal
      : (existing?.compareAtPrice ?? 0);
    if (!(typeof remoteCurrent === 'number' && remoteCurrent > 0)) {
      this.logger.warn(
        `UCM pull: remote item ${retailerId} returned no usable price; keeping local price=${currentPrice}`,
      );
    }

    const baseSlug = this.slugify(remoteProduct.name || retailerId);
    const slug = existing?.slug || await this.resolveUniqueProductSlug(baseSlug, retailerId);
    const metadata: Record<string, unknown> = {
      ...(existing?.metadata ? (existing.metadata as Record<string, unknown>) : {}),
      source: 'catalog_meta',
      remoteCatalogId,
      remoteCatalogName,
      remoteCatalogRetailerId: retailerId,
      remoteCatalogItemId: remoteProduct.id || '',
      remoteCatalogPayload: remoteProduct,
    };

    const payload: Record<string, unknown> = {
      name: remoteProduct.name || retailerId,
      slug,
      description: (remoteProduct.description || remoteProduct.short_description || '').toString().slice(0, 5000),
      shortDescription: (remoteProduct.short_description || remoteProduct.description || '').toString().slice(0, 5000),
      category: category._id,
      images: remoteProduct.image_url ? [remoteProduct.image_url] : [],
      price: currentPrice,
      compareAtPrice: originalPrice > currentPrice ? originalPrice : undefined,
      sku: retailerId,
      stock: remoteProduct.inventory ?? 0,
      trackStock: typeof remoteProduct.inventory === 'number',
      isActive: remoteProduct.availability !== 'discontinued',
      tags: [remoteProduct.product_type, remoteProduct.category].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
      metadata,
    };

    if (existing) {
      const updated = await this.productRepository.findByIdAndUpdateDoc(existing._id.toString(), payload);
      if (!updated) {
        throw new BadRequestException('Failed to update imported product');
      }
      return updated;
    }

    const created = await this.productRepository.create(payload);
    return created as ProductDocument;
  }

  private async resolveCategoryForRemoteItem(label: string): Promise<{ _id: Types.ObjectId }> {
    const normalized = label.trim() || 'Imported Commerce Manager Items';
    const slug = this.slugify(normalized);
    const category = await this.categoryRepository.findOrCreateBySlug(
      normalized,
      slug,
      'Imported from Meta Commerce Manager',
    );

    return { _id: category._id };
  }

  private getRemoteRetailerId(remoteProduct: RemoteCatalogProduct): string {
    return (remoteProduct.retailer_id || '').trim();
  }

  private resolveRemoteRetailerId(product: ProductDocument): string {
    const metadata = product.metadata as Record<string, unknown> | undefined;
    const remoteRetailerId = typeof metadata?.remoteCatalogRetailerId === 'string' ? metadata.remoteCatalogRetailerId.trim() : '';
    if (remoteRetailerId) {
      return remoteRetailerId;
    }

    return product.sku || product._id.toString();
  }

  private catalogAmountToLocal(amount?: number | string): number | undefined {
    if (amount === undefined || amount === null) {
      return undefined;
    }

    let paise: number;
    if (typeof amount === 'number') {
      paise = amount;
    } else {
      // Meta sometimes returns a formatted price string like "250.00 INR" or
      // "₹250.50". Strip currency symbols/codes, parse the remainder. If the
      // value contains a decimal point we treat it as major units (rupees) and
      // multiply by 100 so the divide-by-100 below restores it; integer-only
      // strings (no decimal) are treated as minor units (paise) directly.
      const cleaned = amount.replace(/[^0-9.\-]/g, '').trim();
      if (!cleaned) return undefined;
      const parsed = Number(cleaned);
      if (!Number.isFinite(parsed)) return undefined;
      paise = cleaned.includes('.') ? Math.round(parsed * 100) : parsed;
    }

    if (!Number.isFinite(paise)) return undefined;
    const result = Math.max(0, Number((paise / 100).toFixed(2)));
    return Number.isNaN(result) ? undefined : result;
  }

  private toCatalogAmount(amount?: number): number | undefined {
    if (amount === undefined || amount === null) {
      return undefined;
    }

    return Math.max(0, Math.round(Number(amount) * 100));
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'imported-commerce-manager-items';
  }

  private async resolveUniqueProductSlug(baseSlug: string, retailerId: string): Promise<string> {
    let slug = baseSlug || `catalog-${retailerId.slice(0, 8)}`;
    let suffix = 0;

    while (await this.productRepository.findOne({ slug })) {
      suffix += 1;
      slug = `${baseSlug || 'catalog-item'}-${retailerId.slice(0, 6)}${suffix > 1 ? `-${suffix}` : ''}`;
    }

    return slug;
  }

  private buildCatalogItem(product: ProductDocument, archived: boolean): Record<string, unknown> {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    const frontendUrl = this.configService.get<string>('frontendUrl') || '';
    const baseUrl = frontendUrl.split(',')[0]?.trim().replace(/\/$/, '') || '';
    const unavailable = archived || product.isActive === false || (product.trackStock && (product.stock || 0) <= 0);
    const remoteRetailerId = this.resolveRemoteRetailerId(product);
    const catalogPrice = this.toCatalogAmount(product.price);
    const categoryName = typeof product.category === 'object' && product.category && 'name' in product.category
      ? String((product.category as { name?: string }).name || '')
      : '';
    const categorySlug = typeof product.category === 'object' && product.category && 'slug' in product.category
      ? String((product.category as { slug?: string }).slug || '')
      : '';

    const item: Record<string, unknown> = {
      retailer_id: remoteRetailerId,
      name: product.name,
      description: (product.description || product.shortDescription || '').toString().slice(0, 5000),
      availability: unavailable ? 'out of stock' : 'in stock',
      condition: 'new',
      currency: 'INR',
      custom_label_1: product.sku,
    };

    if (product.compareAtPrice && product.compareAtPrice > product.price) {
      item.price = this.toCatalogAmount(product.compareAtPrice) ?? catalogPrice ?? 0;
      item.sale_price = catalogPrice ?? 0;
    } else {
      item.price = catalogPrice ?? 0;
      // Always emit sale_price so a previously-synced discount value gets
      // overwritten when the discount is removed locally. Setting it equal
      // to price means Meta won't render a "sale" badge (sale_price !<
      // price), and we avoid sending nullable/empty-string values that some
      // Meta API versions reject.
      item.sale_price = catalogPrice ?? 0;
    }

    // Only add optional fields if they have values
    if (product.images?.[0]) {
      item.image_url = product.images[0];
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
    if (categoryName) {
      item.product_type = categoryName;
    } else if (categorySlug) {
      item.product_type = categorySlug;
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

    const batchRequest = [{
      retailer_id: String(item.retailer_id),
      method: 'CREATE',
      data: item,
    }];

    const payload = new URLSearchParams();
    payload.set('allow_upsert', 'true');
    payload.set('requests', JSON.stringify(batchRequest));

    await this.graphClient.post(`/${catalogId}/items_batch`, payload, {
      params: {
        access_token: catalogConfig.accessToken,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
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