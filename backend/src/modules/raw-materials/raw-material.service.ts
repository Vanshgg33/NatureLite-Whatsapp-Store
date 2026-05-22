import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RawMaterial } from './schemas/raw-material.schema';
import { RawMaterialRepository } from './repositories/raw-material.repository';
import { RawMaterialDailyEntryRepository } from './repositories/raw-material-snapshot.repository';
import {
  CreateRawMaterialDto,
  UpsertDailyEntryDto,
  RawMaterialQueryDto,
  RawMaterialAnalyticsQueryDto,
} from './dto/raw-material.dto';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class RawMaterialService {
  constructor(
    private readonly rawMaterialRepository: RawMaterialRepository,
    private readonly dailyEntryRepository: RawMaterialDailyEntryRepository,
  ) {}

  private get todayIST(): string {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  async getByStore(storeId: string, query: RawMaterialQueryDto): Promise<unknown[]> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    const materials = await this.rawMaterialRepository.findByStore(storeObjId, query.search);
    const today = this.todayIST;

    const todayEntries = await this.dailyEntryRepository.getEntriesForMaterials(
      materials.map((m) => m._id),
      today,
    );
    const entryMap = new Map(todayEntries.map((e) => [e.rawMaterial.toString(), e]));

    return materials.map((m) => {
      const entry = entryMap.get(m._id.toString());
      return { ...m.toObject(), todayEntry: entry ? entry.toObject() : null };
    });
  }

  async create(dto: CreateRawMaterialDto): Promise<RawMaterial> {
    const storeObjId = parseObjectId(dto.storeId, 'storeId');
    const existing = await this.rawMaterialRepository.findOne({
      store: storeObjId,
      name: { $regex: `^${dto.name.trim()}$`, $options: 'i' },
      isActive: true,
    });
    if (existing) {
      throw new ConflictException(`Raw material "${dto.name}" already exists for this store`);
    }
    return this.rawMaterialRepository.create({
      store: storeObjId,
      name: dto.name.trim(),
      unit: dto.unit ?? 'kg',
      totalStock: 0,
      isActive: true,
    });
  }

  private assertStoreOwnership(material: RawMaterial & { store: Types.ObjectId }, callerStoreId?: string): void {
    if (callerStoreId && material.store.toString() !== callerStoreId) {
      throw new ForbiddenException('You can only access your own store resources');
    }
  }

  async upsertTodayEntry(id: string, dto: UpsertDailyEntryDto, callerStoreId?: string): Promise<unknown> {
    const objId = parseObjectId(id, 'id');
    const material = await this.rawMaterialRepository.findById(objId);
    if (!material) throw new NotFoundException('Raw material not found');
    this.assertStoreOwnership(material as RawMaterial & { store: Types.ObjectId }, callerStoreId);

    const closing = Math.max(0, dto.openingStock + dto.stockIn - dto.processed);
    const today = this.todayIST;

    await this.dailyEntryRepository.upsertEntry(material.store, objId, today, {
      openingStock: dto.openingStock,
      stockIn: dto.stockIn,
      processed: dto.processed,
      closing,
    });

    await this.rawMaterialRepository.setTotalStock(objId, closing);

    const updated = await this.rawMaterialRepository.findById(objId);
    const entry = await this.dailyEntryRepository.getEntry(objId, today);
    return { ...updated!.toObject(), todayEntry: entry?.toObject() ?? null };
  }

  /** Return today's entry for pre-fill (opening = yesterday's closing if no today entry). */
  async getTodayPrefill(id: string, callerStoreId?: string): Promise<{ openingStock: number; stockIn: number; processed: number; closing: number; isExisting: boolean }> {
    const objId = parseObjectId(id, 'id');
    const material = await this.rawMaterialRepository.findById(objId);
    if (!material) throw new NotFoundException('Raw material not found');
    this.assertStoreOwnership(material as RawMaterial & { store: Types.ObjectId }, callerStoreId);

    const today = this.todayIST;

    const todayEntry = await this.dailyEntryRepository.getEntry(objId, today);
    if (todayEntry) {
      return {
        openingStock: todayEntry.openingStock,
        stockIn: todayEntry.stockIn,
        processed: todayEntry.processed,
        closing: todayEntry.closing,
        isExisting: true,
      };
    }

    // No today entry — carry forward yesterday's closing
    const prev = await this.dailyEntryRepository.getLatestEntryBefore(objId, today);
    const opening = prev ? prev.closing : (material.totalStock ?? 0);

    return { openingStock: opening, stockIn: 0, processed: 0, closing: opening, isExisting: false };
  }

  async softDelete(id: string, callerStoreId?: string): Promise<void> {
    const objId = parseObjectId(id, 'id');
    const material = await this.rawMaterialRepository.findById(objId);
    if (!material) throw new NotFoundException('Raw material not found');
    this.assertStoreOwnership(material as RawMaterial & { store: Types.ObjectId }, callerStoreId);
    await this.rawMaterialRepository.updateOne({ _id: objId }, { $set: { isActive: false } });
  }

  async getAnalytics(storeId: string, query: RawMaterialAnalyticsQueryDto): Promise<unknown> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    if (query.date) {
      const items = await this.dailyEntryRepository.getByStoreAndDate(storeObjId, query.date);
      return { date: query.date, items };
    }
    const dates = await this.dailyEntryRepository.getAvailableDates(storeObjId);
    return { dates };
  }
}
