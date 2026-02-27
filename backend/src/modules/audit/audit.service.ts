import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument, AuditAction } from './schemas/audit-log.schema';

export interface AuditLogInput {
  action: AuditAction;
  performedBy: string;
  performedByName?: string;
  targetId?: string;
  targetModel?: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  description?: string;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async log(data: AuditLogInput): Promise<AuditLog> {
    try {
      const entry = new this.auditLogModel({
        ...data,
        targetId: data.targetId ? new Types.ObjectId(data.targetId) : undefined,
      });
      return await entry.save();
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      return null;
    }
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    action?: string;
    performedBy?: string;
    targetId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, limit = 20, action, performedBy, targetId, startDate, endDate } = query;
    const filter: Record<string, any> = {};

    if (action) filter.action = action;
    if (performedBy) filter.performedBy = performedBy;
    if (targetId) filter.targetId = new Types.ObjectId(targetId);
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [items, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.auditLogModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrevious: page > 1,
    };
  }
}
