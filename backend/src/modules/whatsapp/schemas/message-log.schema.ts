import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageLogDocument = MessageLog & Document;

export type MessageDirection = 'inbound' | 'outbound';
export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contact' | 'interactive' | 'template' | 'button' | 'list_reply' | 'order';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type MessageFinalStatus = 'success' | 'failure';

export interface MessageLogMetadata {
  idempotencyKey?: string;
  provider?: 'meta_cloud' | '360dialog' | '360dialog_sandbox';
  errorCode?: string;
  errorTitle?: string;
  errorDetails?: string;
  isBlocked?: boolean;
  isInvalidPhone?: boolean;
}

@Schema({ timestamps: true })
export class MessageLog {
  _id: Types.ObjectId;

  @Prop({ required: true, index: true })
  phone: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  user?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ChatSession' })
  session?: Types.ObjectId;

  @Prop({ required: true })
  direction: MessageDirection;

  @Prop({ required: true })
  messageType: MessageType;

  @Prop()
  whatsappMessageId?: string;

  @Prop({ type: Object })
  content: {
    text?: string;
    mediaUrl?: string;
    mediaId?: string;
    caption?: string;
    templateName?: string;
    templateParams?: string[];
    buttonId?: string;
    buttonText?: string;
    listId?: string;
    listTitle?: string;
    location?: {
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    };
    /** Outbound single-product catalog message — the retailer_id shown. */
    catalogProductId?: string;
    /** Outbound product-list catalog message — flat list of retailer_ids. */
    catalogProductIds?: string[];
    /** Inbound "order" (native WhatsApp cart submission). */
    order?: {
      catalogId: string;
      text?: string;
      items: Array<{
        productRetailerId: string;
        quantity: number;
        itemPrice: number;
        currency: string;
      }>;
    };
  };

  @Prop({ default: 'sent' })
  status: MessageStatus;

  /**
   * Final outcome for outbound messages (best-effort).
   * Inbound messages don't use this field.
   */
  @Prop()
  finalStatus?: MessageFinalStatus;

  @Prop()
  failureReason?: string;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop()
  lastAttemptAt?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  readAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata: MessageLogMetadata;

  createdAt: Date;
  updatedAt: Date;
}

export const MessageLogSchema = SchemaFactory.createForClass(MessageLog);

MessageLogSchema.index({ phone: 1, createdAt: -1 });
MessageLogSchema.index({ session: 1, createdAt: -1 });
MessageLogSchema.index({ whatsappMessageId: 1 }, { unique: true, sparse: true });
MessageLogSchema.index({ direction: 1, createdAt: -1 });
MessageLogSchema.index({ status: 1 });
MessageLogSchema.index({ 'metadata.idempotencyKey': 1 }, { sparse: true });
// Retention: auto-expire logs after 60 days to prevent unbounded growth.
MessageLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });
