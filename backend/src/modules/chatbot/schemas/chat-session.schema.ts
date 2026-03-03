import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatSessionDocument = ChatSession & Document;

export type SessionState =
  | 'main_menu'
  | 'browsing'
  | 'product_detail'
  | 'cart'
  | 'checkout'
  | 'address_input'
  | 'payment_selection'
  | 'order_tracking'
  | 'reorder'
  | 'faq'
  | 'support'
  | 'awaiting_input';

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
  context: Record<string, unknown>;

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

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

ChatSessionSchema.index({ user: 1 });
ChatSessionSchema.index({ isHandedOffToSupport: 1 });
ChatSessionSchema.index({ lastMessageAt: -1 });
ChatSessionSchema.index({ createdAt: -1 });
