import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { Types, ClientSession } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { StoreStock } from './schemas/store-stock.schema';
import { StoreStockRepository } from './repositories/store-stock.repository';
import { StockSnapshotRepository } from './repositories/stock-snapshot.repository';
import { AdminUserRepository } from '../admin/repositories/admin-user.repository';
import { SetStoreStockDto, BulkSetStockDto, StockQueryDto, StockAnalyticsQueryDto, UpdateStockAnalyticsDto } from './dto/store-stock.dto';
import { PaginatedResult } from '../../common/types/pagination.types';
import { parseObjectId } from '../../common/utils/objectid.util';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class StoreStockService {
  constructor(
    private readonly storeStockRepository: StoreStockRepository,
    private readonly stockSnapshotRepository: StockSnapshotRepository,
    private readonly adminUserRepository: AdminUserRepository,
  ) {}

  private async verifyAdminPassword(user: JwtPayload | undefined, password: string | undefined): Promise<void> {
    if (!user) {
      return;
    }
    if (!user?.sub || !password) {
      throw new UnauthorizedException('Admin password is required to edit stock entries');
    }
    const admin = await this.adminUserRepository.findById(parseObjectId(user.sub, 'userId'));
    if (!admin?.password || !(await bcrypt.compare(password, admin.password))) {
      throw new UnauthorizedException('Admin password is incorrect');
    }
  }

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

  async deleteByProductId(productId: string): Promise<void> {
    await this.storeStockRepository.deleteAllByProductId(parseObjectId(productId, 'productId'));
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

  async setStock(dto: SetStoreStockDto, user?: JwtPayload): Promise<StoreStock> {
    const storeObjId = parseObjectId(dto.storeId, 'storeId');
    const productObjId = parseObjectId(dto.productId, 'productId');

    const stockInDelta = dto.stockInDelta ?? 0;
    const returnedDelta = dto.returnedDelta ?? 0;
    const damagedDelta = dto.damagedDelta ?? 0;
    const saleLogDelta = dto.saleLogDelta ?? 0;
    const hasDeltaUpdate = stockInDelta > 0 || returnedDelta > 0 || damagedDelta > 0 || saleLogDelta > 0;

    if (dto.variantSku && !hasDeltaUpdate) {
      let storeStock = await this.storeStockRepository.findOneByStoreAndProduct(
        storeObjId,
        productObjId,
      );
      const variantStock = dto.stock ?? 0;
      if (!storeStock) {
        storeStock = await this.storeStockRepository.create({
          store: storeObjId,
          product: productObjId,
          stock: 0,
          variantStocks: [{ variantSku: dto.variantSku, stock: variantStock }],
          lowStockThreshold: dto.lowStockThreshold ?? 5,
        } as Partial<StoreStock>);
      } else {
        const variantIdx = storeStock.variantStocks.findIndex(
          (v) => v.variantSku === dto.variantSku,
        );
        if (variantIdx >= 0) {
          storeStock.variantStocks[variantIdx].stock = variantStock;
          storeStock.markModified('variantStocks');
        } else {
          storeStock.variantStocks.push({ variantSku: dto.variantSku, stock: variantStock });
        }
        if (dto.lowStockThreshold !== undefined) {
          storeStock.lowStockThreshold = dto.lowStockThreshold;
        }
        await storeStock.save();
      }
      return storeStock;
    }

    let result: StoreStock;

    if (hasDeltaUpdate) {
      const netDelta = stockInDelta + returnedDelta + damagedDelta - saleLogDelta;
      if (dto.variantSku) {
        result = await this.storeStockRepository.applyVariantStockDeltas(
          storeObjId,
          productObjId,
          dto.variantSku,
          {
            stockInDelta,
            returnedDelta,
            damagedDelta,
            saleLogDelta,
            netDelta,
            lowStockThreshold: dto.lowStockThreshold,
          },
        );
      } else {
        result = await this.storeStockRepository.applyStockDeltas(storeObjId, productObjId, {
          stockInDelta,
          returnedDelta,
          damagedDelta,
          saleLogDelta,
          netDelta,
          lowStockThreshold: dto.lowStockThreshold,
        });
      }

      const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
      await this.stockSnapshotRepository.upsertSnapshot(
        storeObjId,
        productObjId,
        todayIST,
        { stockInDelta, returnedDelta, damagedDelta, saleLogDelta },
        dto.variantSku
          ? result.variantStocks.find((v) => v.variantSku === dto.variantSku)?.stock ?? 0
          : result.stock,
        {
          loggedBy: user?.sub ? parseObjectId(user.sub, 'userId') : undefined,
          loggedByName: user?.phone ?? user?.role,
          variantSku: dto.variantSku,
        },
      );
    } else {
      const update: Record<string, unknown> = {};
      if (dto.stock !== undefined) update.stock = dto.stock;
      if (dto.lowStockThreshold !== undefined) update.lowStockThreshold = dto.lowStockThreshold;
      result = await this.storeStockRepository.setStockMain(storeObjId, productObjId, update);
    }

    return result;
  }

  async getStockAnalytics(storeId: string, query: StockAnalyticsQueryDto): Promise<unknown> {
    const storeObjId = parseObjectId(storeId, 'storeId');

    if (query.date) {
      const items = await this.stockSnapshotRepository.getSnapshotsByStoreAndDate(storeObjId, query.date);
      return { date: query.date, items };
    }

    const dates = await this.stockSnapshotRepository.getAvailableDates(storeObjId);
    return { dates };
  }

  async updateStockAnalytics(snapshotId: string, dto: UpdateStockAnalyticsDto, user: JwtPayload): Promise<unknown> {
    await this.verifyAdminPassword(user, dto.adminPassword);
    const snapshotObjId = parseObjectId(snapshotId, 'snapshotId');
    const update: Record<string, number> = {};
    if (dto.stockInDelta !== undefined) update.stockInDelta = dto.stockInDelta;
    if (dto.returnedDelta !== undefined) update.returnedDelta = dto.returnedDelta;
    if (dto.damagedDelta !== undefined) update.damagedDelta = dto.damagedDelta;
    if (dto.saleLogDelta !== undefined) update.saleLogDelta = dto.saleLogDelta;
    if (dto.totalStock !== undefined) update.totalStock = dto.totalStock;

    const updated = await this.stockSnapshotRepository.updateSnapshot(snapshotObjId, update);
    if (!updated) throw new NotFoundException('Stock analytics entry not found');
    return updated;
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

  async getStockSummary(storeId: string): Promise<{ total: number; lowStock: number; outOfStock: number; healthyStock: number }> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    return this.storeStockRepository.getStockSummaryByStore(storeObjId);
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
