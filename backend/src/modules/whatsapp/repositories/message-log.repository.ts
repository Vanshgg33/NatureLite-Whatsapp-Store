import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MessageLog, MessageLogDocument } from '../schemas/message-log.schema';
import { BaseRepository } from '../../../common/repository/base.repository';

@Injectable()
export class MessageLogRepository extends BaseRepository<MessageLogDocument> {
  constructor(
    @InjectModel(MessageLog.name) model: Model<MessageLogDocument>,
  ) {
    super(model);
  }

  async findOneByWhatsAppMessageId(whatsappMessageId: string): Promise<MessageLogDocument | null> {
    return this.model.findOne({ whatsappMessageId }).exec();
  }

  async findOneByIdempotencyKey(key: string): Promise<MessageLogDocument | null> {
    return this.model.findOne({ 'metadata.idempotencyKey': key }).exec();
  }

  async updateOneByWhatsAppMessageId(
    whatsappMessageId: string,
    update: Record<string, unknown>,
  ): Promise<void> {
    await this.model.updateOne({ whatsappMessageId }, { $set: update }).exec();
  }

  async findByPhone(phone: string, limit: number = 50): Promise<MessageLogDocument[]> {
    return this.model.find({ phone }).sort({ createdAt: -1 }).limit(limit).exec();
  }
}
