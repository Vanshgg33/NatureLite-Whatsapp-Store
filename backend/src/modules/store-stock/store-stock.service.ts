import { Injectable, BadRequestException } from '@nestjs/common';
import { Types, ClientSession } from 'mongoose';
import { StoreStock } from './schemas/store-stock.schema';
import { StoreStockRepository } from './repositories/store-stock.repository';
import { SetStoreStockDto, BulkSetStockDto, StockQueryDto } from './dto/store-stock.dto';
import { PaginatedResult } from '../../common/types/pagination.types';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class StoreStockService {
  constructor(private readonly storeStockRepository: StoreStockRepository) {}

  async getStockByStore(
    storeId: string,
    query: StockQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.storeStockRepository.getStockByStore(storeId, query);
  }

  async getStockForProduct(productId: string): Promise<StoreStock[]> {
    parseObjectId(productId, 'productId');
    return this.storeStockRepository.findForProduct(productId);
  }

  async getStockForStoreProduct(storeId: string, productId: string): Promise<StoreStock | null> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    const productObjId = parseObjectId(productId, 'productId');
    return this.storeStockRepository.findOneByStoreAndProduct(storeObjId, productObjId);
  }

  /** Batch lookup for a list of productIds at one store. Returns a Map keyed by productId string. */
  async getStockMapForStoreProducts(
    storeId: string,
    productIds: string[],
  ): Promise<Map<string, StoreStock>> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    if (!productIds.length) return new Map();
    const productObjIds = productIds.map((id) => parseObjectId(id, 'productId'));
    const docs = await this.storeStockRepository.findByStoreAndProducts(storeObjId, productObjIds);
    const out = new Map<string, StoreStock>();
    for (const doc of docs) {
      out.set(doc.product.toString(), doc);
    }
    return out;
  }

  async setStock(dto: SetStoreStockDto): Promise<StoreStock> {
    const storeObjId = parseObjectId(dto.storeId, 'storeId');
    const productObjId = parseObjectId(dto.productId, 'productId');

    if (dto.variantSku) {
      let storeStock = await this.storeStockRepository.findOneByStoreAndProduct(
        storeObjId,
        productObjId,
      );
      if (!storeStock) {
        storeStock = await this.storeStockRepository.create({
          store: storeObjId,
          product: productObjId,
          stock: 0,
          variantStocks: [{ variantSku: dto.variantSku, stock: dto.stock }],
          lowStockThreshold: dto.lowStockThreshold ?? 5,
        } as Partial<StoreStock>);
      } else {
        const variantIdx = storeStock.variantStocks.findIndex(
          (v) => v.variantSku === dto.variantSku,
        );
        if (variantIdx >= 0) {
          storeStock.variantStocks[variantIdx].stock = dto.stock;
        } else {
          storeStock.variantStocks.push({ variantSku: dto.variantSku, stock: dto.stock });
        }
        if (dto.lowStockThreshold !== undefined) {
          storeStock.lowStockThreshold = dto.lowStockThreshold;
        }
        await storeStock.save();
      }
      return storeStock;
    }

    const update: Record<string, unknown> = { stock: dto.stock };
    if (dto.lowStockThreshold !== undefined) {
      update.lowStockThreshold = dto.lowStockThreshold;
    }
    return this.storeStockRepository.setStockMain(storeObjId, productObjId, update);
  }

  async decrementStock(
    storeId: string,
    productId: string,
    quantity: number,
    variantSku?: string,
    session?: ClientSession,
  ): Promise<void> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    const productObjId = parseObjectId(productId, 'productId');

    if (variantSku) {
      const result = await this.storeStockRepository.decrementVariant(
        storeObjId,
        productObjId,
        variantSku,
        quantity,
        session,
      );
      if (result.modifiedCount === 0) {
        throw new BadRequestException(`Insufficient store stock for variant ${variantSku}`);
      }
    } else {
      const result = await this.storeStockRepository.decrementMain(
        storeObjId,
        productObjId,
        quantity,
        session,
      );
      if (result.modifiedCount === 0) {
        throw new BadRequestException('Insufficient store stock for this product');
      }
    }
  }

  async incrementStock(
    storeId: string,
    productId: string,
    quantity: number,
    variantSku?: string,
  ): Promise<void> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    const productObjId = parseObjectId(productId, 'productId');
    if (variantSku) {
      await this.storeStockRepository.incrementVariant(
        storeObjId,
        productObjId,
        variantSku,
        quantity,
      );
    } else {
      await this.storeStockRepository.incrementMain(storeObjId, productObjId, quantity);
    }
  }

  async bulkSetStock(dto: BulkSetStockDto): Promise<void> {
    const storeObjId = parseObjectId(dto.storeId, 'storeId');
    const items = dto.items.map((item) => ({
      productId: new Types.ObjectId(parseObjectId(item.productId, 'productId')),
      stock: item.stock,
    }));
    await this.storeStockRepository.bulkSetStock(storeObjId, items);
  }

  async aggregateStockByProducts(
    productIds: string[],
  ): Promise<
    Map<string, { stock: number; variantStocks: Map<string, number> }>
  > {
    const objIds = productIds.map((id) => parseObjectId(id, 'productId'));
    return this.storeStockRepository.aggregateStockByProducts(objIds);
  }

  async getLowStockByStore(storeId: string): Promise<StoreStock[]> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    return this.storeStockRepository.findLowStockByStore(storeObjId);
  }

  async initializeStockForProduct(
    productId: string,
    storeIds: string[],
    mainStoreSeed?: {
      storeId: string;
      stock: number;
      variantStocks?: Array<{ variantSku: string; stock: number }>;
    },
  ): Promise<void> {
    const productObjId = parseObjectId(productId, 'productId');
    const storeObjIds = storeIds.map((id) => parseObjectId(id, 'storeId'));
    const seed = mainStoreSeed
      ? {
          storeId: parseObjectId(mainStoreSeed.storeId, 'mainStoreId'),
          stock: mainStoreSeed.stock,
          variantStocks: mainStoreSeed.variantStocks,
        }
      : undefined;
    await this.storeStockRepository.initializeStockForProduct(productObjId, storeObjIds, seed);
  }
}
