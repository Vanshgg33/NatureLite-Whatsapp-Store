// backend/src/modules/crm/schemas/crm-call-log.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallOutcome = 'connected' | 'no_answer' | 'ordered' | 'not_interested' | 'callback';
export type CrmCallLogDocument = CrmCallLog & Document;

@Schema({ timestamps: true })
export class CrmCallLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser', required: true, index: true })
  agentId: Types.ObjectId;

  @Prop({ enum: ['call', 'whatsapp'], default: 'call' })
  type: 'call' | 'whatsapp';

  @Prop({ enum: ['connected', 'no_answer', 'ordered', 'not_interested', 'callback', null], default: null })
  outcome: CallOutcome | null;

  @Prop({ default: '' })
  notes: string;

  @Prop({ default: null })
  callbackAt: Date | null;

  @Prop({ default: '' })
  templateName: string;

  @Prop({ default: '' })
  messageText: string;

  // IST date key "YYYY-MM-DD" written at log time for fast day-wise queries
  @Prop({ index: true })
  istDate?: string;

  @Prop()
  recordingUrl?: string;

  @Prop()
  recordingPublicId?: string;

  @Prop({ default: 0 })
  recordingDuration?: number;

  @Prop({ default: false })
  isWinback: boolean;

  createdAt: Date;
}

export const CrmCallLogSchema = SchemaFactory.createForClass(CrmCallLog);
CrmCallLogSchema.index({ customerId: 1, createdAt: -1 });
CrmCallLogSchema.index({ agentId: 1, createdAt: -1 });
