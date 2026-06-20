import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { Types } from 'mongoose';
import { Product } from './schemas/product.schema';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  UpdateStockDto,
} from './dto/product.dto';
import { PaginatedResult } from '../../common/types/pagination.types';
import { isValidObjectIdString, parseObjectId } from '../../common/utils/objectid.util';
import { StoreStockService } from '../store-stock/store-stock.service';
import { StoresService } from '../stores/stores.service';
import { ProductRepository } from './repositories/product.repository';
import { UcmService } from '../ucm/ucm.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeStockService: StoreStockService,
    private readonly storesService: StoresService,
    @Inject(forwardRef(() => UcmService))
    private readonly ucmService: UcmService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.backfillStoreStock();
  }

  private async backfillStoreStock(): Promise<void> {
    const stores = await this.storesService.findAll();
    if (stores.length === 0) return;

    const storeIds = stores.map((s) => s._id.toString());
    const mainStore = stores.find((s) => s.isMainStore) ?? stores[0];
    const products = await this.productRepository.findIdsAndStock();

    await Promise.all(
      products.map((product) => {
        const variantStocks = (product.variants ?? [])
          .filter((v) => !!v?.sku)
          .map((v) => ({ variantSku: v.sku, stock: v.stock ?? 0 }));
        return this.storeStockService.initializeStockForProduct(
          product._id.toString(),
          storeIds,
          {
            storeId: mainStore._id.toString(),
            stock: product.stock ?? 0,
            variantStocks,
          },
        );
      }),
    );

    if (products.length > 0) {
      this.logger.log(`Backfilled StoreStock for ${products.length} product(s) across ${stores.length} store(s)`);
    }
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const categoryId = parseObjectId(dto.category, 'category');
    const slug = dto.slug || this.generateSlug(dto.name);

    const [existingSku, existingSlug] = await Promise.all([
      this.productRepository.findOneBySku(dto.sku),
      this.productRepository.findOneBySlug(slug),
    ]);
    if (existingSku) throw new BadRequestException('Product with this SKU already exists');
    if (existingSlug) throw new BadRequestException('Product with this slug already exists');

    const plainVariants = Array.isArray(dto.variants)
      ? dto.variants.map((v) => ({
          name: v.name,
          sku: v.sku,
          price: v.price,
          ...(v.compareAtPrice !== undefined && { compareAtPrice: v.compareAtPrice }),
          ...(v.stock !== undefined && { stock: v.stock }),
          attributes: v.attributes ?? {},
          isActive: v.isActive ?? true,
          images: Array.isArray(v.images) ? v.images : [],
        }))
      : [];

    const saved = await this.productRepository.create({
      ...dto,
      slug,
      category: categoryId,
      variants: plainVariants,
    } as any);

    try {
      const stores = await this.storesService.findAll();
      const storeIds = stores.map((s) => s._id.toString());
      if (storeIds.length > 0) {
        const mainStore = stores.find((s) => s.isMainStore) ?? stores[0];
        const variantStocks = (saved.variants ?? [])
          .filter((v) => !!v?.sku)
          .map((v) => ({ variantSku: v.sku, stock: v.stock ?? 0 }));
        await this.storeStockService.initializeStockForProduct(
          saved._id.toString(),
          storeIds,
          {
            storeId: mainStore._id.toString(),
            stock: saved.stock ?? 0,
            variantStocks,
          },
        );
        this.logger.log(`Initialized StoreStock for product ${saved.name} across ${storeIds.length} store(s) (main: ${mainStore.name})`);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize StoreStock for product ${saved.name}: ${(error as Error).message}`);
    }

    void this.ucmService.syncProductById(saved._id.toString(), 'product_created');
    this.clearChatbotCache();

    return saved as Product;
  }

  /**
   * Overlay each product's `stock` and `variants[].stock` with the sum of the
   * matching StoreStock rows. StoreStock is the source of truth: order
   * decrements happen there, Stock Management writes happen there. Reading
   * Product.stock directly produces a value that drifts as orders ship and
   * was the cause of "Products page shows 100, Stock Management shows 0".
   */
  private async overlayStoreStock<T extends { _id: Types.ObjectId; stock?: number; variants?: Array<{ sku: string; stock?: number }> }>(
    products: T[],
  ): Promise<void> {
    if (products.length === 0) return;
    const productIds = products.map((p) => p._id.toString());
    let agg: Map<string, { stock: number; variantStocks: Map<string, number> }>;
    try {
      agg = await this.storeStockService.aggregateStockByProducts(productIds);
    } catch (error) {
      this.logger.warn(
        `aggregateStockByProducts failed, falling back to Product.stock: ${(error as Error).message}`,
      );
      return;
    }
    for (const p of products) {
      const a = agg.get(p._id.toString());
      if (!a) continue;
      p.stock = a.stock;
      if (Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (!v?.sku) continue;
          v.stock = a.variantStocks.get(v.sku) ?? 0;
        }
      }
    }
  }

  /** Mirror a stock write to the main store's StoreStock so the read overlay
   *  reflects it on the Products page. Falls back gracefully if no main store
   *  is configured — the local Product.stock write is still persisted. */
  private async mirrorStockToMainStore(
    productId: string,
    seed: { stock?: number; variantStocks?: Array<{ variantSku: string; stock: number }> },
  ): Promise<void> {
    if (seed.stock === undefined && (!seed.variantStocks || seed.variantStocks.length === 0)) {
      return;
    }
    try {
      const stores = await this.storesService.findAll();
      if (stores.length === 0) return;
      const mainStore = stores.find((s) => s.isMainStore) ?? stores[0];
      const storeIds = stores.map((s) => s._id.toString());
      // initializeStockForProduct uses $setOnInsert, so it can't *change* an
      // existing main-store row — we need a direct setStock for updates.
      await this.storeStockService.initializeStockForProduct(productId, storeIds);
      const stockUpdates: Promise<unknown>[] = [];
      if (seed.stock !== undefined) {
        stockUpdates.push(this.storeStockService.setStock({ storeId: mainStore._id.toString(), productId, stock: seed.stock }));
      }
      for (const v of seed.variantStocks ?? []) {
        stockUpdates.push(this.storeStockService.setStock({ storeId: mainStore._id.toString(), productId, stock: v.stock, variantSku: v.variantSku }));
      }
      await Promise.all(stockUpdates);
    } catch (error) {
      this.logger.warn(
        `Failed to mirror stock to main store for product ${productId}: ${(error as Error).message}`,
      );
    }
  }

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<Product>> {
    const result = await this.productRepository.findAllPaginated(query) as PaginatedResult<Product>;
    await this.overlayStoreStock(result.items as Array<Product & { _id: Types.ObjectId }>);
    return result;
  }

  async findById(id: string): Promise<Product> {
    const idObj = parseObjectId(id, 'id');
    const product = await this.productRepository.findByIdWithCategory(idObj);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const catId = product.category?.toString?.() ?? (product.category as unknown);
    const populateOps: Promise<unknown>[] = [
      product.populate('relatedProducts', 'name'),
      product.populate('upsellProducts', 'name'),
    ];
    if (isValidObjectIdString(catId)) {
      populateOps.push(product.populate('category', 'name slug'));
    }
    await Promise.all(populateOps);
    await this.overlayStoreStock([product as unknown as { _id: Types.ObjectId; stock?: number; variants?: Array<{ sku: string; stock?: number }> }]);
    return product as Product;
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.productRepository.findOneBySlugWithCategory(slug);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const catId = product.category?.toString?.() ?? (product.category as unknown);
    if (isValidObjectIdString(catId)) {
      await product.populate('category', 'name slug');
    }
    await this.overlayStoreStock([product as unknown as { _id: Types.ObjectId; stock?: number; variants?: Array<{ sku: string; stock?: number }> }]);
    return product as Product;
  }

  async findBySku(sku: string): Promise<Product> {
    const product = await this.productRepository.findOneBySkuWithCategory(sku);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const catId = product.category?.toString?.() ?? (product.category as unknown);
    if (isValidObjectIdString(catId)) {
      await product.populate('category', 'name slug');
    }
    return product as Product;
  }

  async findByCategory(categoryId: string): Promise<Product[]> {
    if (!isValidObjectIdString(categoryId)) {
      return [];
    }
    return this.productRepository.findByCategoryId(parseObjectId(categoryId, 'categoryId')) as Promise<Product[]>;
  }

  /**
   * Resolve a Meta-catalog `retailer_id` back to a local product. UCM push
   * uses sku as retailer_id; UCM pull stamps it on `metadata.remoteCatalogRetailerId`.
   * Falls back to ObjectId for legacy retailer_ids that are Mongo ids.
   */
  async findByRetailerId(retailerId: string): Promise<Product | null> {
    const trimmed = (retailerId || '').trim();
    if (!trimmed) return null;

    if (isValidObjectIdString(trimmed)) {
      const byId = await this.productRepository.findByIdString(trimmed);
      if (byId) return byId as Product;
    }

    const bySku = await this.productRepository.findOneBySku(trimmed);
    if (bySku) return bySku as Product;

    const byMetadata = await this.productRepository.findOneByRemoteRetailerId(trimmed);
    if (byMetadata) return byMetadata as Product;

    return null;
  }

  async findFeatured(limit: number = 10): Promise<Product[]> {
    return this.productRepository.findFeatured(limit) as Promise<Product[]>;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const idObj = parseObjectId(id, 'id');

    if (dto.sku) {
      const existingSku = await this.productRepository.findOneBySkuExcludingId(dto.sku, idObj);
      if (existingSku) {
        throw new BadRequestException('Product with this SKU already exists');
      }
    }

    if (dto.slug) {
      const existingSlug = await this.productRepository.findOneBySlugExcludingId(dto.slug, idObj);
      if (existingSlug) {
        throw new BadRequestException('Product with this slug already exists');
      }
    }

    const updateData: Record<string, unknown> = { ...dto };
    // Treat empty / whitespace-only category as "not provided" — the frontend
    // can send an empty string when the dropdown hasn't been interacted with,
    // and we don't want that to trip parseObjectId's "24-character hex string"
    // guard and block the rest of the update.
    if (dto.category !== undefined) {
      const trimmed = typeof dto.category === 'string' ? dto.category.trim() : '';
      if (trimmed === '') {
        delete updateData.category;
      } else {
        updateData.category = parseObjectId(trimmed, 'category');
      }
    }

    // class-transformer produces class instances, not plain objects. Mongoose's
    // findByIdAndUpdate needs plain objects to correctly cast subdocument arrays.
    this.logger.log(`[DEBUG] dto.variants type=${Array.isArray(dto.variants) ? 'array' : typeof dto.variants} count=${Array.isArray(dto.variants) ? dto.variants.length : 'N/A'}`);
    if (Array.isArray(updateData.variants)) {
      updateData.variants = (updateData.variants as any[]).map((v) => ({
        name: v.name,
        sku: v.sku,
        price: v.price,
        ...(v.compareAtPrice !== undefined && { compareAtPrice: v.compareAtPrice }),
        ...(v.stock !== undefined && { stock: v.stock }),
        attributes: v.attributes ?? {},
        isActive: v.isActive ?? true,
        images: Array.isArray(v.images) ? v.images : [],
      }));
      this.logger.log(`[DEBUG] updateData.variants after conversion: ${JSON.stringify(updateData.variants)}`);
    } else {
      this.logger.log(`[DEBUG] updateData.variants is NOT an array: ${typeof updateData.variants} = ${JSON.stringify(updateData.variants)}`);
    }

    const product = await this.productRepository.findByIdAndUpdateDoc(id, updateData);
    this.logger.log(`[DEBUG] saved product.variants count=${product?.variants?.length ?? 'null/undefined'} values=${JSON.stringify(product?.variants?.map(v => ({ name: v.name, sku: v.sku })))}`);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const variantStocks = Array.isArray(dto.variants)
      ? dto.variants
          .filter((v) => v?.sku && v.stock !== undefined)
          .map((v) => ({ variantSku: v.sku as string, stock: v.stock as number }))
      : [];
    await this.mirrorStockToMainStore(product._id.toString(), {
      stock: dto.stock,
      variantStocks,
    });

    void this.ucmService.syncProductById(product._id.toString(), 'product_updated');
    this.clearChatbotCache();
    await this.overlayStoreStock([product as unknown as { _id: Types.ObjectId; stock?: number; variants?: Array<{ sku: string; stock?: number }> }]);
    return product as Product;
  }

  async updateStock(id: string, dto: UpdateStockDto): Promise<Product> {
    const product = await this.productRepository.findByIdString(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (dto.variantSku) {
      const variantIndex = product.variants.findIndex(
        (v) => v.sku === dto.variantSku,
      );
      if (variantIndex === -1) {
        throw new BadRequestException('Variant not found');
      }
      product.variants[variantIndex].stock = dto.stock;
    } else {
      product.stock = dto.stock;
    }

    const saved = await product.save();
    await this.mirrorStockToMainStore(saved._id.toString(), {
      stock: dto.variantSku ? undefined : dto.stock,
      variantStocks: dto.variantSku ? [{ variantSku: dto.variantSku, stock: dto.stock }] : [],
    });
    void this.ucmService.syncProductById(saved._id.toString(), 'stock_updated');
    this.clearChatbotCache();
    await this.overlayStoreStock([saved as unknown as { _id: Types.ObjectId; stock?: number; variants?: Array<{ sku: string; stock?: number }> }]);
    return saved as Product;
  }

  async decrementStock(
    productId: string,
    quantity: number,
    variantSku?: string,
  ): Promise<void> {
    const productObjId = parseObjectId(productId, 'productId');
    if (variantSku) {
      const modified = await this.productRepository.decrementVariantStock(productObjId, variantSku, quantity);
      if (modified === 0) {
        throw new BadRequestException(
          `Insufficient stock for variant ${variantSku}`,
        );
      }
    } else {
      const modified = await this.productRepository.decrementMainStock(productObjId, quantity);
      if (modified === 0) {
        throw new BadRequestException(
          'Insufficient stock for this product',
        );
      }
    }

    void this.ucmService.syncProductById(productId, 'stock_decremented');
    this.clearChatbotCache();
  }

  async incrementTotalSold(productId: string, quantity: number): Promise<void> {
    await this.productRepository.incrementTotalSold(
      parseObjectId(productId, 'productId'),
      quantity,
    );
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.productRepository.incrementViewCount(parseObjectId(id, 'id'));
  }

  async getLowStockProducts(limit = 20): Promise<Product[]> {
    return this.productRepository.findLowStock(limit) as Promise<Product[]>;
  }

  async searchProducts(searchTerm: string, limit: number = 20): Promise<Product[]> {
    const products = await this.productRepository.searchByText(searchTerm, limit) as Product[];
    await this.overlayStoreStock(products as unknown as Array<{ _id: Types.ObjectId; stock?: number; variants?: Array<{ sku: string; stock?: number }> }>);
    return products;
  }

  async delete(id: string): Promise<void> {
    const product = await this.productRepository.findByIdString(id);
    const deleted = await this.productRepository.deleteById(parseObjectId(id, 'id'));
    if (deleted === 0) {
      throw new NotFoundException('Product not found');
    }

    if (product) {
      await this.ucmService.archiveDeletedProduct(product, 'product_deleted');
    }
    this.clearChatbotCache();
  }

  async deleteMany(ids: string[]): Promise<{ deletedCount: number }> {
    const results = await Promise.allSettled(ids.map((id) => this.delete(id)));
    const deletedCount = results.filter((r) => r.status === 'fulfilled').length;
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.error(`Failed to delete product ${ids[i]}: ${(r.reason as Error).message}`);
      }
    });
    return { deletedCount };
  }

  async bulkUpdateCategory(productIds: string[], categoryId: string): Promise<{ modifiedCount: number }> {
    const catId = parseObjectId(categoryId, 'categoryId');
    const ids = productIds.map((id) => parseObjectId(id, 'productId'));
    const result = await this.productRepository.getModel().updateMany(
      { _id: { $in: ids } },
      { $set: { category: catId } },
    ).exec();
    this.clearChatbotCache();
    return { modifiedCount: result.modifiedCount };
  }

  async exportToCsv(categoryId?: string): Promise<string> {
    const query: ProductQueryDto = { limit: 5000, page: 1 };
    if (categoryId) query.category = categoryId;
    const result = await this.productRepository.findAllPaginated(query);
    const products = result.items as (Product & { _id: Types.ObjectId })[];

    const headers = [
      'name', 'sku', 'price', 'compareAtPrice', 'specialOfferPrice', 'specialOfferLabel',
      'stock', 'category', 'shortDescription', 'tags', 'isActive', 'isFeatured',
      'hsnCode', 'videoUrl', 'seoTitle', 'seoDescription', 'seoKeywords', 'canonicalUrl',
    ];

    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = products.map((p) => [
      p.name, p.sku, p.price, p.compareAtPrice ?? '', p.specialOfferPrice ?? '',
      p.specialOfferLabel ?? '', p.stock,
      typeof p.category === 'object' ? (p.category as unknown as { name?: string }).name ?? '' : '',
      p.shortDescription ?? '', (p.tags ?? []).join('|'), p.isActive, p.isFeatured,
      p.hsnCode ?? '', p.videoUrl ?? '',
      p.seo?.title ?? '', p.seo?.description ?? '', p.seo?.keywords ?? '', p.seo?.canonicalUrl ?? '',
    ].map(escape).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  async importFromCsvRows(
    rows: Record<string, string>[],
    defaultCategoryId: string,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    const categoryId = parseObjectId(defaultCategoryId, 'defaultCategoryId');

    for (const row of rows) {
      try {
        const sku = row.sku?.trim();
        if (!sku) { errors.push(`Row missing SKU: ${JSON.stringify(row)}`); skipped++; continue; }

        const existing = await this.productRepository.findOneBySku(sku);
        if (existing) { skipped++; continue; }

        const name = row.name?.trim();
        if (!name) { errors.push(`Row missing name for SKU ${sku}`); skipped++; continue; }

        const price = parseFloat(row.price);
        if (isNaN(price)) { errors.push(`Invalid price for SKU ${sku}`); skipped++; continue; }

        const baseSlug = this.generateSlug(name);
        let slug = baseSlug;
        const slugExists = await this.productRepository.findOneBySlug(slug);
        if (slugExists) {
          slug = `${baseSlug}-${this.generateSlug(sku)}`;
        }

        await this.productRepository.create({
          name,
          sku,
          slug,
          price,
          compareAtPrice: (() => { const v = parseFloat(row.compareAtPrice); return isNaN(v) ? undefined : v; })(),
          stock: (() => { const v = parseInt(row.stock, 10); return isNaN(v) ? 0 : v; })(),
          shortDescription: row.shortDescription || undefined,
          tags: row.tags ? row.tags.split('|').map((t) => t.trim()).filter(Boolean) : [],
          isActive: row.isActive !== 'false',
          isFeatured: row.isFeatured === 'true',
          hsnCode: row.hsnCode || undefined,
          videoUrl: row.videoUrl || undefined,
          category: categoryId,
          variants: [],
          images: [],
          imageAlts: [],
          trackStock: false,
          lowStockThreshold: 0,
          relatedProducts: [],
          upsellProducts: [],
          specialOfferActive: false,
          metadata: {},
        } as any);
        created++;
      } catch (err) {
        errors.push(`Error on SKU ${row.sku}: ${(err as Error).message}`);
        skipped++;
      }
    }

    if (created > 0) {
      this.clearChatbotCache();
    }

    return { created, skipped, errors };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private clearChatbotCache(): void {
    this.redisService.delPattern('chatbot:tool:*').catch((err) => {
      this.logger.warn(`Failed to clear chatbot cache: ${err.message}`);
    });
  }
}
