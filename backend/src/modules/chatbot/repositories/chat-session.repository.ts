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

  async upsertNewByPhone(input: {
    phone: string;
    userId: Types.ObjectId;
  }): Promise<ChatSessionDocument> {
    return this.model
      .findOneAndUpdate(
        { phone: input.phone },
        {
          $setOnInsert: {
            phone: input.phone,
            user: input.userId,
            currentState: 'main_menu',
            context: {},
            isHandedOffToSupport: false,
            isExpired: false,
          },
        },
        { new: true, upsert: true },
      )
      .exec();
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
    update: Partial<ChatSession>,
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
      { $set: { isExpired: true, expiredAt: new Date() } },
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }
}
