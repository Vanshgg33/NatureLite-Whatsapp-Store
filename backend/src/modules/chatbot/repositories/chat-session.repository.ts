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

  /**
   * Atomically claim the checkout lock for a session. Returns true only if
   * this call won the race — losing callers see false and should reject the
   * checkout. Lock auto-expires `ttlMs` after the lock timestamp so a crashed
   * checkout can never strand the session.
   */
  async tryAcquireCheckoutLock(
    sessionId: Types.ObjectId,
    ttlMs: number,
  ): Promise<boolean> {
    const now = Date.now();
    const cutoff = now - ttlMs;
    const result = await this.model
      .findOneAndUpdate(
        {
          _id: sessionId,
          $or: [
            { 'context.checkoutLockedAt': { $exists: false } },
            { 'context.checkoutLockedAt': null },
            { 'context.checkoutLockedAt': { $lt: cutoff } },
          ],
        },
        { $set: { 'context.checkoutLockedAt': now } },
        { new: true },
      )
      .exec();
    return result !== null;
  }

  async releaseCheckoutLock(sessionId: Types.ObjectId): Promise<void> {
    await this.model
      .updateOne({ _id: sessionId }, { $unset: { 'context.checkoutLockedAt': '' } })
      .exec();
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

  /**
   * Auto-clear handoff for sessions where support was handed off before `cutoffDate`
   * and the user hasn't typed "menu" to come back. Avoids users being stuck in a
   * muted state indefinitely if the team forgets to reset them.
   */
  async autoClearStaleHandoffs(
    cutoffDate: Date,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateMany(
      {
        isHandedOffToSupport: true,
        supportHandoffAt: { $lt: cutoffDate },
      },
      { $set: { isHandedOffToSupport: false } },
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }
}
