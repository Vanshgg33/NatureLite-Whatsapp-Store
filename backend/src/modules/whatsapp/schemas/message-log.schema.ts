import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageLogDocument = MessageLog & Document;

export type MessageDirection = 'inbound' | 'outbound';
export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contact' | 'interactive' | 'template' | 'button' | 'list_reply';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

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
  };

  @Prop({ default: 'sent' })
  status: MessageStatus;

  @Prop()
  failureReason?: string;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  readAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const MessageLogSchema = SchemaFactory.createForClass(MessageLog);

MessageLogSchema.index({ phone: 1, createdAt: -1 });
MessageLogSchema.index({ session: 1, createdAt: -1 });
MessageLogSchema.index({ whatsappMessageId: 1 });
MessageLogSchema.index({ direction: 1, createdAt: -1 });
MessageLogSchema.index({ status: 1 });
