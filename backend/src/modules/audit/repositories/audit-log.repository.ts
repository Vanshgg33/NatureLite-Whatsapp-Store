import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';
import { BaseRepository } from '@/common/repository/base.repository';
import { paginate } from '@/common/types/pagination.types';
import { buildCreatedAtFilter } from '@/common/utils/query.util';
import { parseObjectIdOptional, isValidObjectIdString, parseObjectId } from '@/common/utils/objectid.util';

export interface AuditFindAllQuery {
  page?: number;
  limit?: number;
  action?: string;
  performedBy?: string;
  targetId?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class AuditLogRepository extends BaseRepository<AuditLogDocument> {
  constructor(
    @InjectModel(AuditLog.name) model: Model<AuditLogDocument>,
  ) {
    super(model);
  }

  async createOne(data: {
    action: string;
    performedBy: string;
    performedByName?: string;
    targetId?: string;
    targetModel?: string;
    previousValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    description?: string;
    ipAddress?: string;
  }): Promise<AuditLogDocument> {
    const entry = {
      ...data,
      targetId: parseObjectIdOptional(data.targetId, 'targetId'),
    };
    return this.create(entry as Partial<AuditLogDocument>);
  }

  async findAllPaginated(query: AuditFindAllQuery) {
    const { page = 1, limit = 20, action, performedBy, targetId, startDate, endDate } = query;
    const filter: Record<string, unknown> = {};
    if (action) filter.action = action;
    if (performedBy) filter.performedBy = performedBy;
    if (isValidObjectIdString(targetId)) filter.targetId = parseObjectId(targetId, 'targetId');
    const createdAtFilter = buildCreatedAtFilter(startDate, endDate);
    if (createdAtFilter) filter.createdAt = createdAtFilter;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments(filter),
    ]);

    return paginate(items, total, { page, limit });
  }
}
