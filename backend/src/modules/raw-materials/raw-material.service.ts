import { Injectable, NotFoundException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { RawMaterial } from './schemas/raw-material.schema';
import { RawMaterialRepository } from './repositories/raw-material.repository';
import { RawMaterialDailyEntryRepository } from './repositories/raw-material-snapshot.repository';
import { AdminUserRepository } from '../admin/repositories/admin-user.repository';
import {
  CreateRawMaterialDto,
  UpsertDailyEntryDto,
  RawMaterialQueryDto,
  RawMaterialAnalyticsQueryDto,
  UpdateRawMaterialAnalyticsDto,
} from './dto/raw-material.dto';
import { parseObjectId } from '../../common/utils/objectid.util';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class RawMaterialService {
  constructor(
    private readonly rawMaterialRepository: RawMaterialRepository,
    private readonly dailyEntryRepository: RawMaterialDailyEntryRepository,
    private readonly adminUserRepository: AdminUserRepository,
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

  private async verifyAdminPassword(user: JwtPayload | undefined, password: string | undefined): Promise<void> {
    if (!user?.sub || !password) {
      throw new UnauthorizedException('Admin password is required to edit material entries');
    }
    const admin = await this.adminUserRepository.findById(parseObjectId(user.sub, 'userId'));
    if (!admin?.password || !(await bcrypt.compare(password, admin.password))) {
      throw new UnauthorizedException('Admin password is incorrect');
    }
  }

  async upsertTodayEntry(id: string, dto: UpsertDailyEntryDto, callerStoreId?: string, user?: JwtPayload): Promise<unknown> {
    const objId = parseObjectId(id, 'id');
    const material = await this.rawMaterialRepository.findById(objId);
    if (!material) throw new NotFoundException('Raw material not found');
    this.assertStoreOwnership(material as RawMaterial & { store: Types.ObjectId }, callerStoreId);

    const closing = Math.max(0, dto.openingStock + dto.stockIn - dto.processed);
    const today = this.todayIST;

    const entry = await this.dailyEntryRepository.upsertEntry(material.store, objId, today, {
      openingStock: dto.openingStock,
      stockIn: dto.stockIn,
      processed: dto.processed,
      closing,
      outputLitres: dto.outputLitres ?? 0,
    }, {
      loggedBy: user?.sub ? parseObjectId(user.sub, 'userId') : undefined,
      loggedByName: user?.phone ?? user?.role,
    });

    await this.rawMaterialRepository.setTotalStock(objId, entry.closing);

    return { ...material.toObject(), totalStock: entry.closing, todayEntry: entry.toObject() };
  }

  /** Return today's entry for pre-fill (opening = yesterday's closing if no today entry). */
  async getTodayPrefill(id: string, callerStoreId?: string): Promise<{ openingStock: number; stockIn: number; processed: number; outputLitres: number; closing: number; isExisting: boolean }> {
    const objId = parseObjectId(id, 'id');
    const material = await this.rawMaterialRepository.findById(objId);
    if (!material) throw new NotFoundException('Raw material not found');
    this.assertStoreOwnership(material as RawMaterial & { store: Types.ObjectId }, callerStoreId);

    const today = this.todayIST;

    const todayEntry = await this.dailyEntryRepository.getEntry(objId, today);
    if (todayEntry) {
      return {
        openingStock: todayEntry.closing,
        stockIn: 0,
        processed: 0,
        outputLitres: 0,
        closing: todayEntry.closing,
        isExisting: true,
      };
    }

    // No today entry — carry forward yesterday's closing
    const prev = await this.dailyEntryRepository.getLatestEntryBefore(objId, today);
    const opening = prev ? prev.closing : (material.totalStock ?? 0);

    return { openingStock: opening, stockIn: 0, processed: 0, outputLitres: 0, closing: opening, isExisting: false };
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

  async updateAnalyticsEntry(entryId: string, dto: UpdateRawMaterialAnalyticsDto, user: JwtPayload): Promise<unknown> {
    await this.verifyAdminPassword(user, dto.adminPassword);
    const entryObjId = parseObjectId(entryId, 'entryId');
    const update: Record<string, number> = {};
    if (dto.openingStock !== undefined) update.openingStock = dto.openingStock;
    if (dto.stockIn !== undefined) update.stockIn = dto.stockIn;
    if (dto.processed !== undefined) update.processed = dto.processed;
    if (dto.outputLitres !== undefined) update.outputLitres = dto.outputLitres;
    if (dto.closing !== undefined) update.closing = dto.closing;

    const updated = await this.dailyEntryRepository.updateDailyEntry(entryObjId, update);
    if (!updated) throw new NotFoundException('Raw material analytics entry not found');
    return updated;
  }
}
