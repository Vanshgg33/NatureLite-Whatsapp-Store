import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Types } from 'mongoose';
import { SettingsService } from '../settings/settings.service';
import { MediaService } from '../media/media.service';
import { ProductRepository } from '../products/repositories/product.repository';
import { ProductDocument } from '../products/schemas/product.schema';
import { CategoryRepository } from '../categories/repositories/category.repository';
import { CatalogConfig } from '../../config/configuration';
import { UpdateUcmCatalogConfigDto, UcmSyncMode } from './dto/ucm.dto';
import { StoresService } from '../stores/stores.service';
import { StoreStockService } from '../store-stock/store-stock.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';

const AUDIT_RECIPIENT = 'jaiswalvansh96@gmail.com';

export interface PushActorContext {
  userId: string;
  userPhone: string;
  ipAddress: string;
}

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
  title?: string;
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
  image_link?: string;
  inventory?: number;
  url?: string;
  link?: string;
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

  private mainStoreIdCached: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly mediaService: MediaService,
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly storesService: StoresService,
    private readonly storeStockService: StoreStockService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
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
      this.listRemoteCatalogs().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        const body = axios.isAxiosError(err) ? JSON.stringify(err.response?.data) : '';
        this.logger.warn(`listRemoteCatalogs failed: ${msg}${body ? ` | body=${body}` : ''}`);
        return [];
      }),
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

  async pushCatalogToMeta(reason = 'manual_sync', actor?: PushActorContext): Promise<SyncSummary> {
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

    return this.syncProductsToRemote(products, reason, 'push', actor);
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

  async syncProductById(productId: string, reason = 'product_update', actor?: PushActorContext): Promise<void> {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    if (!catalogConfig.accessToken) {
      return;
    }

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

    await this.syncProductsToRemote([product], reason, 'push', actor);
  }

  async archiveDeletedProduct(product: ProductDocument, reason = 'product_deleted'): Promise<void> {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    if (!catalogConfig.accessToken) {
      return;
    }

    const state = await this.getCatalogState();
    if (state.syncMode === 'dry_run') {
      await this.writeSyncState('dry_run', `Dry run archive recorded for ${product._id.toString()} (${reason}).`);
      return;
    }

    await this.upsertRemoteProduct(state, this.buildCatalogItem(product, true, 0));
  }

  private async syncProductsToRemote(products: ProductDocument[], reason: string, mode: 'push', actor?: PushActorContext): Promise<SyncSummary> {
    const state = await this.getCatalogState();
    const { remoteCatalogId, remoteCatalogName } = await this.resolveCatalogSelection(state);

    this.logger.log(`Syncing ${products.length} products to catalog ${remoteCatalogId} (${remoteCatalogName})`);

    // Health-check: verify catalog is readable with current token before pushing
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    try {
      const catalogCheck = await this.graphClient.get(`/${remoteCatalogId}`, {
        params: { access_token: catalogConfig.accessToken, fields: 'id,name,vertical,catalog_type' },
      });
      this.logger.log(`Catalog health-check OK: ${JSON.stringify(catalogCheck.data)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Catalog health-check FAILED — token may lack catalog_management permission: ${msg}`);
    }

    let stockMap: Map<string, number | null>;
    try {
      stockMap = await this.resolveMainStoreStockMap(products);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Main-store stock lookup failed; defaulting tracked products to 0 stock: ${msg}`);
      stockMap = new Map();
      for (const p of products) {
        stockMap.set(p._id.toString(), p.trackStock === false ? null : 0);
      }
    }

    let syncedProducts = 0;
    let failedProducts = 0;
    const details: SyncDetail[] = [];

    // Meta rate limits catalog batch uploads (#80014). Avoid per-product
    // `items_batch` calls; instead upsert in chunks with retry/backoff.
    const seenRetailerIds = new Set<string>();
    const items: Array<{ product: ProductDocument; item: Record<string, unknown> }> = [];
    for (const product of products) {
      const stockForItem = stockMap.has(product._id.toString())
        ? stockMap.get(product._id.toString())!
        : product.trackStock === false ? null : 0;

      const activeVariants = (product.variants || []).filter((v) => v.isActive !== false);

      if (activeVariants.length > 0) {
        // Sync each active variant as a separate catalog item grouped under the parent
        const parentRetailerId = this.resolveRemoteRetailerId(product);
        for (const variant of activeVariants) {
          const variantItem = this.buildVariantCatalogItem(product, variant, parentRetailerId, false);
          const rid = String(variantItem.retailer_id);
          if (seenRetailerIds.has(rid)) {
            this.logger.warn(`Skipping variant ${rid} — duplicate retailer_id in sync batch`);
            details.push({ retailerId: rid, status: 'skipped', message: 'duplicate retailer_id' });
            continue;
          }
          seenRetailerIds.add(rid);
          items.push({ product, item: variantItem });
        }
      } else {
        const item = this.buildCatalogItem(product, false, stockForItem);
        const rid = String(item.retailer_id);
        if (seenRetailerIds.has(rid)) {
          this.logger.warn(`Skipping product ${product._id} — duplicate retailer_id "${rid}" in sync batch`);
          details.push({ retailerId: rid, status: 'skipped', message: 'duplicate retailer_id' });
          continue;
        }
        seenRetailerIds.add(rid);
        items.push({ product, item });
      }
    }

    const chunkSize = 25;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      if (i === 0) {
        this.logger.log(`First batch retailer_ids: ${JSON.stringify(chunk.map(c => String(c.item.retailer_id)))}`);
        this.logger.log(`First item data fields: ${JSON.stringify(Object.keys(chunk[0].item))}`);
      }
      try {
        await this.upsertRemoteProductsBatch(state, chunk.map((c) => c.item), remoteCatalogId);
        syncedProducts += chunk.length;
        for (const { item } of chunk) {
          details.push({ retailerId: String(item.retailer_id), status: 'synced' });
        }
      } catch (error) {
        failedProducts += chunk.length;
        const message = error instanceof Error ? error.message : 'Unknown sync error';
        if (axios.isAxiosError(error)) {
          const responseBody = error.response?.data;
          this.logger.warn(
            `Catalog batch sync failed for ${chunk.length} items: ${message} status=${error.response?.status ?? 'unknown'} body=${JSON.stringify(responseBody)}`,
          );
        } else {
          this.logger.warn(`Catalog batch sync failed for ${chunk.length} items: ${message}`);
        }
        for (const { product } of chunk) {
          details.push({ retailerId: product._id.toString(), status: 'failed', message });
        }
      }
    }

    const summary: SyncSummary = {
      mode,
      totalProducts: items.length,
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

    if (actor?.userId) {
      const pushedProducts = items.map((i) => ({
        name: i.product.name,
        retailerId: String(i.item.retailer_id ?? i.product._id.toString()),
        stock: i.item.inventory !== undefined ? Number(i.item.inventory) : null,
        availability: String(i.item.availability ?? ''),
      }));
      this.logProductPushAudit(summary, actor, pushedProducts, reason).catch((err: unknown) => {
        this.logger.error(`UCM audit log failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

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
        // Meta's Graph API expects `fields` as a comma-separated string. A
        // JSON-encoded array (e.g. `["id","price",...]`) is silently
        // accepted as an *unrecognised single field name*, and Meta then
        // returns only the default fields (id, name) — every imported
        // product ends up with price=0 because the price field never
        // arrived in the response. Keep this as a plain CSV.
        const fieldsArray = ['id', 'retailer_id', 'title', 'name', 'description', 'short_description', 'price', 'sale_price', 'availability', 'condition', 'currency', 'image_link', 'image_url', 'inventory', 'link', 'url', 'product_type', 'category', 'custom_label_0', 'custom_label_1', 'custom_data'];
        const response = await this.graphClient.get<RemoteProductsResponse>(`/${catalogId}/products`, {
          params: {
            access_token: catalogConfig.accessToken,
            fields: fieldsArray.join(','),
            summary: 'total_count',
            limit: 100,
            ...(after ? { after } : {}),
          },
        });

        const batch = Array.isArray(response.data?.data) ? response.data.data : [];
        if (batch.length > 0) {
          const sample = batch[0];
          this.logger.log(
            `Meta catalog page ${pageCount + 1}: ${batch.length} products, sample retailer_id=${sample?.retailer_id}, price=${JSON.stringify(sample?.price)}, sale_price=${JSON.stringify(sample?.sale_price)}, currency=${sample?.currency}`,
          );
        }
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
    const remotePriceUsable = typeof remoteCurrent === 'number' && remoteCurrent > 0;
    if (!remotePriceUsable) {
      this.logger.warn(
        `UCM pull: remote item ${retailerId} returned no usable price (raw price=${JSON.stringify(remoteProduct.price)}, sale_price=${JSON.stringify(remoteProduct.sale_price)}); resolved price=${currentPrice}`,
      );
    }

    const baseSlug = this.slugify(remoteProduct.title || remoteProduct.name || retailerId);
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

    const resolvedImages = await this.resolveProductImages(
      remoteProduct.image_link || remoteProduct.image_url,
      existing?.images ?? [],
    );

    const payload: Record<string, unknown> = {
      name: remoteProduct.title || remoteProduct.name || retailerId,
      slug,
      description: (remoteProduct.description || remoteProduct.short_description || '').toString().slice(0, 5000),
      shortDescription: (remoteProduct.short_description || remoteProduct.description || '').toString().slice(0, 5000),
      category: category._id,
      images: resolvedImages,
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

  private async resolveProductImages(remoteImageUrl: string | undefined, existingImages: string[]): Promise<string[]> {
    if (!remoteImageUrl) {
      return existingImages;
    }

    // If the product already has a Cloudinary-hosted image, keep it — don't
    // replace it with the (potentially expired) Facebook CDN URL on every sync.
    const cloudinaryHost = `res.cloudinary.com/${this.configService.get('cloudinary.cloudName')}`;
    const alreadyOnCloudinary = existingImages.some((u) => u.includes(cloudinaryHost));
    if (alreadyOnCloudinary) {
      return existingImages;
    }

    try {
      // Fetch the image as a buffer from our server, then push to Cloudinary.
      // This bypasses Facebook CDN restrictions that block Cloudinary's remote-fetch.
      const result = await this.mediaService.uploadFromUrlViaBuffer(remoteImageUrl, 'products');
      return [result.secureUrl];
    } catch (err) {
      this.logger.warn(`UCM pull: failed to re-upload image to Cloudinary. error=${err instanceof Error ? err.message : String(err)}`);
      // Keep whatever images existed rather than storing an expired/broken URL.
      return existingImages.length > 0 ? existingImages : [];
    }
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
    const stored = typeof metadata?.remoteCatalogRetailerId === 'string' ? metadata.remoteCatalogRetailerId.trim() : '';
    // Reject trivially invalid values (".", " ", single chars) that a bad pull
    // may have written from a corrupt catalog item — these cause the
    // "Duplicate retailer_id in batch api call - ." error when multiple
    // products share the same invalid stored ID.
    if (stored && stored.length > 1) {
      return stored;
    }

    return product._id.toString();
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

  private async getMainStoreId(): Promise<string> {
    if (this.mainStoreIdCached) return this.mainStoreIdCached;
    const store = await this.storesService.findMainStore();
    const id = (store as { _id: Types.ObjectId | string })._id.toString();
    this.mainStoreIdCached = id;
    return id;
  }

  /** Per-product main-store stock for the products being synced. Returns null
   * for products with `trackStock=false` (always available). */
  private async resolveMainStoreStockMap(
    products: ProductDocument[],
  ): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    const tracked = products.filter((p) => p.trackStock !== false);
    for (const p of products) {
      if (p.trackStock === false) out.set(p._id.toString(), null);
    }
    if (tracked.length === 0) return out;
    const mainStoreId = await this.getMainStoreId();
    const ids = tracked.map((p) => p._id.toString());
    const stockMap = await this.storeStockService.getStockMapForStoreProducts(mainStoreId, ids);
    for (const p of tracked) {
      const entry = stockMap.get(p._id.toString());
      out.set(p._id.toString(), entry?.stock ?? 0);
    }
    return out;
  }

  private buildCatalogItem(
    product: ProductDocument,
    archived: boolean,
    mainStoreStock: number | null,
  ): Record<string, unknown> {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    const frontendUrl = this.configService.get<string>('frontendUrl') || '';
    const baseUrl = frontendUrl.split(',')[0]?.trim().replace(/\/$/, '') || '';
    const stockTracked = product.trackStock !== false;
    const effectiveStock = stockTracked ? Math.max(0, mainStoreStock ?? 0) : null;
    const unavailable =
      archived ||
      product.isActive === false ||
      (stockTracked && (effectiveStock ?? 0) <= 0);
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
      title: product.name,
      description: (product.description || product.shortDescription || '').toString().slice(0, 5000),
      availability: unavailable ? 'out of stock' : 'in stock',
      visibility: unavailable ? 'hidden' : 'published',
      condition: 'new',
      custom_label_1: product.sku,
    };

    // Meta Commerce catalog requires price as "200.00 INR" (string with currency code).
    // A separate `currency` field is not recognised for PRODUCT_ITEM type.
    const priceRupees = product.price ?? 0;
    const compareRupees = product.compareAtPrice ?? 0;
    if (compareRupees > priceRupees) {
      item.price = `${compareRupees.toFixed(2)} INR`;
      item.sale_price = `${priceRupees.toFixed(2)} INR`;
    } else {
      item.price = `${priceRupees.toFixed(2)} INR`;
      item.sale_price = `${priceRupees.toFixed(2)} INR`;
    }

    // Only add optional fields if they have values
    // Meta Commerce catalog uses Google Shopping field names: image_link / link
    if (product.images?.[0]) {
      item.image_link = product.images[0];
    }
    if (baseUrl) {
      item.link = `${baseUrl}/products/${product.slug}`;
    }
    if (stockTracked) {
      item.inventory = effectiveStock ?? 0;
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

  private buildVariantCatalogItem(
    product: ProductDocument,
    variant: ProductDocument['variants'][number],
    parentRetailerId: string,
    archived: boolean,
  ): Record<string, unknown> {
    const catalogConfig = this.configService.get<CatalogConfig>('catalog')!;
    const frontendUrl = this.configService.get<string>('frontendUrl') || '';
    const baseUrl = frontendUrl.split(',')[0]?.trim().replace(/\/$/, '') || '';

    const outOfStock = archived || product.isActive === false || (product.trackStock !== false && (variant.stock ?? 0) <= 0);
    const variantRetailerId = `${parentRetailerId}-${variant.sku}`;

    const variantPrice = variant.price ?? product.price;
    const variantCompare = variant.compareAtPrice ?? product.compareAtPrice ?? 0;

    const item: Record<string, unknown> = {
      retailer_id: variantRetailerId,
      item_group_id: parentRetailerId,
      title: `${product.name} - ${variant.name}`,
      description: (product.description || product.shortDescription || '').toString().slice(0, 5000),
      availability: outOfStock ? 'out of stock' : 'in stock',
      visibility: outOfStock ? 'hidden' : 'published',
      condition: 'new',
      custom_label_1: variant.sku,
    };

    if (variantCompare > variantPrice) {
      item.price = `${variantCompare.toFixed(2)} INR`;
      item.sale_price = `${variantPrice.toFixed(2)} INR`;
    } else {
      item.price = `${variantPrice.toFixed(2)} INR`;
      item.sale_price = `${variantPrice.toFixed(2)} INR`;
    }

    const image = variant.images?.[0] || product.images?.[0];
    if (image) item.image_link = image;

    if (baseUrl) item.link = `${baseUrl}/products/${product.slug}`;

    if (product.trackStock !== false) item.inventory = Math.max(0, variant.stock ?? 0);

    if (catalogConfig.businessId) item.custom_label_0 = catalogConfig.businessId;

    const categoryName = typeof product.category === 'object' && product.category && 'name' in product.category
      ? String((product.category as { name?: string }).name || '')
      : '';
    if (categoryName) item.product_type = categoryName;

    // Sync variant attributes (size, weight, color, etc.) as Meta variant fields
    if (variant.attributes && typeof variant.attributes === 'object') {
      for (const [key, value] of Object.entries(variant.attributes)) {
        const metaKey = key.toLowerCase();
        if (['size', 'color', 'gender', 'age_group', 'material', 'pattern'].includes(metaKey)) {
          item[metaKey] = value;
        }
      }
    }

    return item;
  }

  private async upsertRemoteProduct(
    state: CatalogState,
    item: Record<string, unknown>,
    overrideCatalogId?: string,
  ): Promise<void> {
    await this.upsertRemoteProductsBatch(state, [item], overrideCatalogId || state.selectedCatalogId);
  }

  private async upsertRemoteProductsBatch(
    state: CatalogState,
    items: Record<string, unknown>[],
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

    // Meta items_batch API: retailer_id at the REQUEST level identifies the item.
    // item_type MUST be in the JSON body (not query params) — without it Meta
    // applies wrong validation and returns misleading "Duplicate retailer_id" errors.
    const requests = items.map((item) => {
      const { retailer_id, ...rest } = item as Record<string, unknown>;
      const retailerId = String(retailer_id ?? '');
      return {
        method: 'CREATE',
        retailer_id: retailerId,
        data: { id: retailerId, ...rest },
      };
    });

    if (requests.length > 0) {
      const r = requests[0];
      this.logger.log(`First Meta request: method=${r.method}, retailer_id=${r.retailer_id}, data_keys=${JSON.stringify(Object.keys(r.data as object))}, link=${(r.data as Record<string, unknown>).link}, price=${(r.data as Record<string, unknown>).price}`);
    }

    await this.withMetaCatalogBatchRetry(async () => {
      // item_type MUST be in the JSON body — passing it as a query param causes
      // Meta to apply wrong schema validation, producing misleading errors.
      // allow_upsert also stays in the body so CREATE acts as an upsert.
      const response = await this.graphClient.post(`/${catalogId}/items_batch`, {
        item_type: 'PRODUCT_ITEM',
        allow_upsert: true,
        requests,
      }, {
        params: {
          access_token: catalogConfig.accessToken,
        },
      });

      // Meta returns HTTP 200 even when individual items are rejected.
      // Log the full response so real errors are visible.
      const body = response.data as Record<string, unknown>;
      const handles = Array.isArray(body?.handles) ? body.handles : [];
      this.logger.log(`Meta items_batch response: handles=${JSON.stringify(handles)}, raw=${JSON.stringify(body)}`);

      // validation_status contains per-item errors on some API versions
      const validationStatus = Array.isArray(body?.validation_status) ? body.validation_status as Array<Record<string, unknown>> : [];
      const itemErrors = validationStatus.filter((v) => Array.isArray(v.errors) && (v.errors as unknown[]).length > 0);
      if (itemErrors.length > 0) {
        this.logger.warn(`Meta items_batch per-item errors (${itemErrors.length} items): ${JSON.stringify(itemErrors)}`);
      }

      // Top-level error field means the whole batch was rejected
      if (body?.error) {
        throw new BadRequestException(`Meta catalog batch rejected: ${JSON.stringify(body.error)}`);
      }
    }, requests.length);
  }

  private async withMetaCatalogBatchRetry<T>(fn: () => Promise<T>, itemCount: number): Promise<T> {
    const maxAttempts = 6;
    const baseDelayMs = 1_000;
    const maxDelayMs = 30_000;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        // Small pacing even on success to avoid bursty calls.
        if (attempt === 1) {
          await this.sleep(250);
        }
        return await fn();
      } catch (error) {
        lastError = error;
        const shouldRetry = this.isMetaCatalogBatchRateLimitError(error);
        if (!shouldRetry || attempt === maxAttempts) {
          throw error;
        }

        const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * 500);
        const delay = exp + jitter;
        this.logger.warn(
          `Meta catalog batch rate-limited (#80014). Retrying attempt ${attempt}/${maxAttempts} after ${delay}ms (items=${itemCount})`,
        );
        await this.sleep(delay);
      }
    }

    // Should be unreachable but keeps TS happy.
    throw lastError instanceof Error ? lastError : new Error('Meta catalog batch retry failed');
  }

  private isMetaCatalogBatchRateLimitError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const code = (error.response?.data as any)?.error?.code;
    const message = String((error.response?.data as any)?.error?.message || error.message || '');
    return code === 80014 || message.includes('#80014') || message.toLowerCase().includes('too many calls for the batch uploads');
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async logProductPushAudit(
    summary: SyncSummary,
    actor: PushActorContext,
    products: Array<{ name: string; retailerId: string; stock: number | null; availability: string }>,
    reason: string,
  ): Promise<void> {
    await this.auditService.log({
      action: 'ucm.push',
      performedBy: actor.userId,
      performedByName: actor.userPhone,
      targetModel: 'Product',
      newValues: {
        syncedProducts: summary.syncedProducts,
        failedProducts: summary.failedProducts,
        totalProducts: summary.totalProducts,
        catalogId: summary.remoteCatalogId,
        catalogName: summary.remoteCatalogName,
        reason,
      },
      description: `UCM push: ${summary.syncedProducts}/${summary.totalProducts} products synced to Meta catalog (${summary.remoteCatalogName || summary.remoteCatalogId})`,
      ipAddress: actor.ipAddress,
    });

    const now = new Date();
    const timestamp = now.toLocaleString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
    });

    const productRows = products.map((p) => {
      const statusColor = p.availability === 'in stock' ? '#16a34a' : '#dc2626';
      const stockDisplay = p.stock !== null ? p.stock.toString() : '∞';
      return `<tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 12px;color:#111827;font-size:13px;">${this.escapeHtml(p.name)}</td>
        <td style="padding:10px 12px;color:#6b7280;font-size:12px;font-family:monospace;">${this.escapeHtml(p.retailerId)}</td>
        <td style="padding:10px 12px;text-align:center;color:#374151;font-size:13px;">${stockDisplay}</td>
        <td style="padding:10px 12px;text-align:center;">
          <span style="background:${p.availability === 'in stock' ? '#dcfce7' : '#fee2e2'};color:${statusColor};font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;text-transform:uppercase;">${this.escapeHtml(p.availability || 'unknown')}</span>
        </td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

  <!-- Top accent -->
  <tr><td style="background:linear-gradient(90deg,#C8900A,#E8A838,#D4A017);height:4px;border-radius:12px 12px 0 0;font-size:0;">&nbsp;</td></tr>

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(160deg,#060F09,#0D2116,#1C3D26);padding:32px 40px 28px;border-radius:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <span style="background:rgba(212,160,23,0.15);border:1px solid rgba(212,160,23,0.4);border-radius:6px;padding:4px 12px;color:#D4A017;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Nature Lite · UCM</span>
            <h1 style="margin:14px 0 6px;color:#ffffff;font-size:24px;font-weight:900;letter-spacing:-0.3px;">Product Push Audit</h1>
            <p style="margin:0;color:rgba(255,255,255,0.5);font-size:13px;">A catalog push was performed from the UCM panel</p>
          </td>
          <td align="right" valign="top">
            <span style="background:${summary.failedProducts > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'};border:1px solid ${summary.failedProducts > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'};border-radius:20px;padding:6px 14px;color:${summary.failedProducts > 0 ? '#f87171' : '#4ade80'};font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">${summary.failedProducts > 0 ? 'PARTIAL FAIL' : 'SUCCESS'}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Who / When / IP cards -->
  <tr>
    <td style="background:#ffffff;padding:28px 40px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <!-- Login ID -->
          <td width="33%" style="padding-right:8px;vertical-align:top;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <tr><td style="background:linear-gradient(90deg,#0D2116,#1C3D26);height:3px;font-size:0;">&nbsp;</td></tr>
              <tr><td style="padding:14px 16px;">
                <p style="margin:0 0 4px;color:#6b7280;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Login ID</p>
                <p style="margin:0;color:#111827;font-size:13px;font-weight:700;">${this.escapeHtml(actor.userPhone || 'N/A')}</p>
                <p style="margin:3px 0 0;color:#9ca3af;font-size:11px;word-break:break-all;">${this.escapeHtml(actor.userId)}</p>
              </td></tr>
            </table>
          </td>
          <!-- Timestamp -->
          <td width="34%" style="padding:0 4px;vertical-align:top;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <tr><td style="background:linear-gradient(90deg,#D4A017,#E8A838);height:3px;font-size:0;">&nbsp;</td></tr>
              <tr><td style="padding:14px 16px;">
                <p style="margin:0 0 4px;color:#6b7280;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Timestamp (IST)</p>
                <p style="margin:0;color:#111827;font-size:12px;font-weight:700;line-height:1.4;">${timestamp}</p>
              </td></tr>
            </table>
          </td>
          <!-- IP Address -->
          <td width="33%" style="padding-left:8px;vertical-align:top;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <tr><td style="background:linear-gradient(90deg,#7c3aed,#a855f7);height:3px;font-size:0;">&nbsp;</td></tr>
              <tr><td style="padding:14px 16px;">
                <p style="margin:0 0 4px;color:#6b7280;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">IP Address</p>
                <p style="margin:0;color:#111827;font-size:13px;font-weight:700;font-family:monospace;">${this.escapeHtml(actor.ipAddress || 'unknown')}</p>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Sync stats bar -->
  <tr>
    <td style="background:#ffffff;padding:20px 40px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0D2116,#1C3D26);border-radius:10px;">
        <tr><td style="padding:18px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:rgba(255,255,255,0.5);font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Catalog</td>
              <td style="color:rgba(255,255,255,0.5);font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;text-align:center;">Total</td>
              <td style="color:rgba(255,255,255,0.5);font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;text-align:center;">Synced</td>
              <td style="color:rgba(255,255,255,0.5);font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;text-align:center;">Failed</td>
              <td style="color:rgba(255,255,255,0.5);font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;text-align:right;">Reason</td>
            </tr>
            <tr>
              <td style="color:#D4A017;font-size:13px;font-weight:700;padding-top:6px;">${this.escapeHtml(summary.remoteCatalogName || summary.remoteCatalogId || 'N/A')}</td>
              <td style="color:#ffffff;font-size:20px;font-weight:900;text-align:center;padding-top:6px;">${summary.totalProducts}</td>
              <td style="color:#4ade80;font-size:20px;font-weight:900;text-align:center;padding-top:6px;">${summary.syncedProducts}</td>
              <td style="color:${summary.failedProducts > 0 ? '#f87171' : '#4ade80'};font-size:20px;font-weight:900;text-align:center;padding-top:6px;">${summary.failedProducts}</td>
              <td style="color:rgba(255,255,255,0.6);font-size:12px;text-align:right;padding-top:6px;">${this.escapeHtml(reason)}</td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- Products table -->
  <tr>
    <td style="background:#ffffff;padding:24px 40px 36px;">
      <p style="margin:0 0 14px;color:#111827;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Products Pushed (${products.length})</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Product Name</th>
            <th style="padding:10px 12px;text-align:left;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Retailer ID / SKU</th>
            <th style="padding:10px 12px;text-align:center;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Stock</th>
            <th style="padding:10px 12px;text-align:center;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Availability</th>
          </tr>
        </thead>
        <tbody>
          ${productRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No products in this push</td></tr>'}
        </tbody>
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#0D2116;padding:24px 40px;border-radius:0 0 12px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td><span style="color:#D4A017;font-size:11px;font-weight:800;letter-spacing:2px;">NATURE LITE</span><br/><span style="color:rgba(255,255,255,0.3);font-size:10px;">Automated UCM Audit System</span></td>
          <td align="right"><span style="color:rgba(255,255,255,0.2);font-size:10px;">This is an automated audit email.<br/>Do not reply to this message.</span></td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    await this.emailService.sendAdminReport(
      AUDIT_RECIPIENT,
      `[UCM Audit] Product Push by ${actor.userPhone || actor.userId} — ${timestamp}`,
      html,
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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