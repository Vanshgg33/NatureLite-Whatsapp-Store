import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatSession, ChatSessionDocument } from '../schemas/chat-session.schema';
import { BaseRepository } from '../../../common/repository/base.repository';

@Injectable()
export class ChatSessionRepository extends BaseRepository<ChatSessionDocument> {
  constructor(
    @InjectModel(ChatSession.name) model: Model<ChatSessionDocument>,
  ) {
    super(model);
  }

  async findOneByPhone(phone: string): Promise<ChatSessionDocument | null> {
    return this.model.findOne({ phone }).exec();
  }

  async updateActivity(sessionId: Types.ObjectId): Promise<void> {
    await this.model.updateOne(
      { _id: sessionId },
      {
        $set: { lastMessageAt: new Date() },
        $inc: { messageCount: 1 },
      },
    ).exec();
  }

  async updateOneByPhone(
    phone: string,
    update: Record<string, unknown>,
  ): Promise<void> {
    await this.model.updateOne({ phone }, { $set: update }).exec();
  }

  async updateManyExpired(
    cutoffDate: Date,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateMany(
      {
        isExpired: { $ne: true },
        lastMessageAt: { $lt: cutoffDate },
      },
      { $set: { isExpired: true } },
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }
}
