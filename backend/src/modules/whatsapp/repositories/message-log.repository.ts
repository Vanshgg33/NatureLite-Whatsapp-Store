import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MessageLog, MessageLogDocument, MessageLogMetadata, MessageStatus, MessageFinalStatus } from '../schemas/message-log.schema';
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

  async tryCreateInboundByWhatsAppMessageId(input: {
    phone: string;
    whatsappMessageId: string;
    messageType: MessageLogDocument['messageType'];
    content: MessageLogDocument['content'];
  }): Promise<boolean> {
    try {
      await this.create({
        phone: input.phone,
        direction: 'inbound',
        messageType: input.messageType,
        whatsappMessageId: input.whatsappMessageId,
        content: input.content,
      } as Partial<MessageLogDocument>);
      return true;
    } catch (err) {
      const isDupKey = err instanceof Error && (err as { code?: number }).code === 11000;
      if (isDupKey) return false;
      throw err;
    }
  }

  async findOneByIdempotencyKey(key: string): Promise<MessageLogDocument | null> {
    return this.model.findOne({ 'metadata.idempotencyKey': key }).exec();
  }

  async upsertOutboundByIdempotencyKey(input: {
    phone: string;
    messageType: MessageLogDocument['messageType'];
    content: MessageLogDocument['content'];
    status: MessageStatus;
    finalStatus?: MessageFinalStatus;
    failureReason?: string;
    retryCount: number;
    lastAttemptAt: Date;
    whatsappMessageId?: string;
    metadata: MessageLogMetadata;
  }): Promise<void> {
    const key = input.metadata.idempotencyKey;
    if (!key) {
      // No idempotency key: create a new row (best-effort).
      await this.create({
        phone: input.phone,
        direction: 'outbound',
        messageType: input.messageType,
        whatsappMessageId: input.whatsappMessageId,
        content: input.content,
        status: input.status,
        finalStatus: input.finalStatus,
        failureReason: input.failureReason,
        retryCount: input.retryCount,
        lastAttemptAt: input.lastAttemptAt,
        metadata: input.metadata,
      } as Partial<MessageLogDocument>);
      return;
    }

    await this.model
      .updateOne(
        { 'metadata.idempotencyKey': key },
        {
          $setOnInsert: {
            phone: input.phone,
            direction: 'outbound',
            messageType: input.messageType,
            content: input.content,
            metadata: input.metadata,
          },
          $set: {
            whatsappMessageId: input.whatsappMessageId,
            status: input.status,
            finalStatus: input.finalStatus,
            failureReason: input.failureReason,
            retryCount: input.retryCount,
            lastAttemptAt: input.lastAttemptAt,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async updateOneByWhatsAppMessageId(
    whatsappMessageId: string,
    update: Partial<Pick<MessageLogDocument, 'status' | 'deliveredAt' | 'readAt' | 'failureReason' | 'finalStatus'>>,
  ): Promise<void> {
    await this.model.updateOne({ whatsappMessageId }, { $set: update }).exec();
  }

  async updateStatusMonotonicByWhatsAppMessageId(input: {
    whatsappMessageId: string;
    status: MessageStatus;
    eventAt?: Date;
  }): Promise<void> {
    const existing = await this.findOneByWhatsAppMessageId(input.whatsappMessageId);
    if (!existing) return;

    const rank = (s: MessageStatus): number => {
      switch (s) {
        case 'sent':
          return 1;
        case 'delivered':
          return 2;
        case 'read':
          return 3;
        case 'failed':
          return 4;
      }
    };

    // Do not regress status on out-of-order webhooks.
    if (rank(input.status) < rank(existing.status)) {
      return;
    }

    const update: Partial<Pick<MessageLogDocument, 'status' | 'deliveredAt' | 'readAt' | 'finalStatus'>> = {
      status: input.status,
    };

    if (input.status === 'delivered' && input.eventAt) {
      if (!existing.deliveredAt || existing.deliveredAt < input.eventAt) {
        update.deliveredAt = input.eventAt;
      }
    }
    if (input.status === 'read' && input.eventAt) {
      if (!existing.readAt || existing.readAt < input.eventAt) {
        update.readAt = input.eventAt;
      }
    }
    if (input.status === 'failed') {
      update.finalStatus = 'failure';
    }

    await this.updateOneByWhatsAppMessageId(input.whatsappMessageId, update);
  }

  async findByPhone(phone: string, limit: number = 50): Promise<MessageLogDocument[]> {
    return this.model.find({ phone }).sort({ createdAt: -1 }).limit(limit).exec();
  }

  /**
   * Aggregate delivery status counts from MessageLog for a batch of campaigns.
   * idempotencyKey format: 'broadcast_{campaignId}_{phone}' (template)
   *                    or: 'broadcast_media_{campaignId}_{phone}' (media)
   */
  async batchDeliveryStatsByCampaigns(
    campaignIds: string[],
  ): Promise<Record<string, { sent: number; delivered: number; read: number; failed: number }>> {
    if (!campaignIds.length) return {};

    const rows = await this.model.aggregate([
      {
        $match: {
          direction: 'outbound',
          'metadata.idempotencyKey': { $regex: '^broadcast_' },
        },
      },
      {
        $addFields: {
          _cid: {
            $cond: [
              { $eq: [{ $substr: ['$metadata.idempotencyKey', 10, 6] }, 'media_'] },
              { $substr: ['$metadata.idempotencyKey', 16, 24] },
              { $substr: ['$metadata.idempotencyKey', 10, 24] },
            ],
          },
        },
      },
      { $match: { _cid: { $in: campaignIds } } },
      { $group: { _id: { cid: '$_cid', status: '$status' }, count: { $sum: 1 } } },
    ]).exec();

    const out: Record<string, { sent: number; delivered: number; read: number; failed: number }> = {};
    for (const row of rows) {
      const { cid, status } = row._id as { cid: string; status: string };
      if (!out[cid]) out[cid] = { sent: 0, delivered: 0, read: 0, failed: 0 };
      if (status === 'sent' || status === 'delivered' || status === 'read' || status === 'failed') {
        out[cid][status as 'sent' | 'delivered' | 'read' | 'failed'] = row.count as number;
      }
    }
    return out;
  }

  /**
   * Conversation list for the admin chat inbox: one row per phone with the most
   * recent message attached. Uses an aggregation instead of N+1 per-phone lookups.
   */
  async listConversations(limit: number = 50): Promise<
    Array<{
      phone: string;
      lastMessageAt: Date;
      lastMessage: {
        direction: 'inbound' | 'outbound';
        messageType: string;
        content?: { text?: string; caption?: string; templateName?: string };
        status?: string;
        createdAt: Date;
      };
    }>
  > {
    const rows = await this.model
      .aggregate([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$phone',
            lastMessageAt: { $first: '$createdAt' },
            lastMessage: { $first: '$$ROOT' },
          },
        },
        { $sort: { lastMessageAt: -1 } },
        { $limit: limit },
      ])
      .exec();

    return rows.map((r) => ({
      phone: r._id as string,
      lastMessageAt: r.lastMessageAt as Date,
      lastMessage: {
        direction: r.lastMessage.direction,
        messageType: r.lastMessage.messageType,
        content: r.lastMessage.content,
        status: r.lastMessage.status,
        createdAt: r.lastMessage.createdAt,
      },
    }));
  }
}
