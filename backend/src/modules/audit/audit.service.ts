import { Injectable, Logger } from '@nestjs/common';
import { AuditLog } from './schemas/audit-log.schema';
import { AuditLogRepository, type AuditFindAllQuery } from './repositories/audit-log.repository';

export interface AuditLogInput {
  action: string;
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

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async log(data: AuditLogInput): Promise<AuditLog | null> {
    try {
      return await this.auditLogRepository.createOne(data);
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${(error as Error).message}`, (error as Error).stack);
      return null;
    }
  }

  async findAll(query: AuditFindAllQuery) {
    return this.auditLogRepository.findAllPaginated(query);
  }
}
