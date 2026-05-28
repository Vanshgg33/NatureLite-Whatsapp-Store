import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdminChatSessionDocument = AdminChatSession & Document;

export interface StoredMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

@Schema({ timestamps: true })
export class AdminChatSession {
  _id: Types.ObjectId;

  // JWT sub of the admin — one session per admin
  @Prop({ required: true, unique: true, index: true })
  adminId: string;

  @Prop({ type: [Object], default: [] })
  messages: StoredMessage[];

  updatedAt: Date;
  createdAt: Date;
}

export const AdminChatSessionSchema = SchemaFactory.createForClass(AdminChatSession);
