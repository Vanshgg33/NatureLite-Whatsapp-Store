import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdminChatSession,
  AdminChatSessionDocument,
  StoredMessage,
} from '../schemas/admin-chat-session.schema';

const MAX_STORED_MESSAGES = 100;

@Injectable()
export class AdminChatSessionRepository {
  constructor(
    @InjectModel(AdminChatSession.name)
    private readonly model: Model<AdminChatSessionDocument>,
  ) {}

  async getByAdminId(adminId: string): Promise<AdminChatSessionDocument | null> {
    return this.model.findOne({ adminId }).exec();
  }

  async appendMessages(adminId: string, newMessages: StoredMessage[]): Promise<void> {
    const session = await this.model.findOne({ adminId }).exec();
    if (!session) {
      await this.model.create({ adminId, messages: newMessages });
      return;
    }
    const combined = [...session.messages, ...newMessages].slice(-MAX_STORED_MESSAGES);
    session.messages = combined;
    await session.save();
  }

  async clearByAdminId(adminId: string): Promise<void> {
    await this.model.updateOne({ adminId }, { $set: { messages: [] } }).exec();
  }
}
