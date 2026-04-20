import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { ChatSessionContext } from '../chat-session-context';

export type ChatSessionDocument = ChatSession & Document;

export type SessionState =
  | 'main_menu'
  | 'browsing'
  | 'product_detail'
  | 'cart'
  | 'coupon_prompt'
  | 'coupon_input'
  | 'checkout'
  | 'address_input'
  | 'payment_selection'
  | 'order_tracking'
  | 'reorder'
  | 'faq'
  | 'support'
  | 'account'
  | 'account_edit'
  | 'account_addresses'
  | 'account_address_edit'
  | 'wallet';

export type ChatSessionMetadata = {
  contactName?: string;
};

@Schema({ timestamps: true })
export class ChatSession {
  _id: Types.ObjectId;

  @Prop({ required: true, index: true })
  phone: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  user?: Types.ObjectId;

  @Prop({ default: 'main_menu' })
  currentState: SessionState;

  @Prop()
  previousState?: SessionState;

  @Prop({ type: Object, default: {} })
  context: ChatSessionContext;

  @Prop()
  currentCategoryId?: string;

  @Prop()
  currentProductId?: string;

  @Prop()
  pendingOrderId?: string;

  @Prop()
  awaitingInputFor?: string;

  @Prop({ default: 0 })
  menuPage: number;

  @Prop({ default: false })
  isHandedOffToSupport: boolean;

  @Prop()
  supportHandoffAt?: Date;

  /** When the support handoff auto-releases back to the bot. */
  @Prop()
  supportHandoffExpiresAt?: Date;

  @Prop()
  supportAgentId?: string;

  @Prop()
  lastMessageAt?: Date;

  @Prop()
  lastBotResponseAt?: Date;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop({ default: false })
  isExpired: boolean;

  /** Set when isExpired flips to true. MongoDB TTL index auto-deletes 90 days after this date. */
  @Prop()
  expiredAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata: ChatSessionMetadata;

  createdAt: Date;
  updatedAt: Date;
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

ChatSessionSchema.index({ phone: 1 }, { unique: true });
ChatSessionSchema.index({ user: 1 });
ChatSessionSchema.index({ isHandedOffToSupport: 1 });
ChatSessionSchema.index({ lastMessageAt: -1 });
ChatSessionSchema.index({ createdAt: -1 });
/** Auto-delete expired sessions 90 days after they were marked expired. */
ChatSessionSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
