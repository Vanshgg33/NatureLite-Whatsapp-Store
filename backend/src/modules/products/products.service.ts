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

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeStockService: StoreStockService,
    private readonly storesService: StoresService,
    @Inject(forwardRef(() => UcmService))
    private readonly ucmService: UcmService,
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

    for (const product of products) {
      const variantStocks = (product.variants ?? [])
        .filter((v) => !!v?.sku)
        .map((v) => ({ variantSku: v.sku, stock: v.stock ?? 0 }));
      await this.storeStockService.initializeStockForProduct(
        product._id.toString(),
        storeIds,
        {
          storeId: mainStore._id.toString(),
          stock: product.stock ?? 0,
          variantStocks,
        },
      );
    }

    if (products.length > 0) {
      this.logger.log(`Backfilled StoreStock for ${products.length} product(s) across ${stores.length} store(s)`);
    }
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const categoryId = parseObjectId(dto.category, 'category');
    const slug = dto.slug || this.generateSlug(dto.name);

    const existingSku = await this.productRepository.findOneBySku(dto.sku);
    if (existingSku) {
      throw new BadRequestException('Product with this SKU already exists');
    }

    const existingSlug = await this.productRepository.findOneBySlug(slug);
    if (existingSlug) {
      throw new BadRequestException('Product with this slug already exists');
    }

    const saved = await this.productRepository.create({
      ...dto,
      slug,
      category: categoryId,
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

    await this.ucmService.syncProductById(saved._id.toString(), 'product_created');

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
      if (seed.stock !== undefined) {
        await this.storeStockService.setStock({
          storeId: mainStore._id.toString(),
          productId,
          stock: seed.stock,
        });
      }
      for (const v of seed.variantStocks ?? []) {
        await this.storeStockService.setStock({
          storeId: mainStore._id.toString(),
          productId,
          stock: v.stock,
          variantSku: v.variantSku,
        });
      }
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
    if (isValidObjectIdString(catId)) {
      await product.populate('category', 'name slug');
    }
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

    const product = await this.productRepository.findByIdAndUpdateDoc(id, updateData);
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

    await this.ucmService.syncProductById(product._id.toString(), 'product_updated');
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
    await this.ucmService.syncProductById(saved._id.toString(), 'stock_updated');
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

    await this.ucmService.syncProductById(productId, 'stock_decremented');
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

  async getLowStockProducts(): Promise<Product[]> {
    return this.productRepository.findLowStock() as Promise<Product[]>;
  }

  async searchProducts(searchTerm: string, limit: number = 20): Promise<Product[]> {
    return this.productRepository.searchByText(searchTerm, limit) as Promise<Product[]>;
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
  }

  async bulkUpdateCategory(productIds: string[], categoryId: string): Promise<{ modifiedCount: number }> {
    const catId = parseObjectId(categoryId, 'categoryId');
    const ids = productIds.map((id) => parseObjectId(id, 'productId'));
    const result = await this.productRepository.getModel().updateMany(
      { _id: { $in: ids } },
      { $set: { category: catId } },
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
