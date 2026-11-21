// backend/src/modules/crm/schemas/crm-call-log.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallOutcome = 'connected' | 'interested' | 'ordered' | 'callback' | 'not_interested' | 'complaint'
  | 'no_answer' | 'busy' | 'switched_off' | 'call_dropped' | 'wrong_number' | 'unlogged';
export type CrmCallLogDocument = CrmCallLog & Document;

@Schema({ timestamps: true })
export class CrmCallLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser', required: true, index: true })
  agentId: Types.ObjectId;

  @Prop({ enum: ['call', 'whatsapp'], default: 'call' })
  type: 'call' | 'whatsapp';

  @Prop({ enum: ['connected', 'interested', 'ordered', 'callback', 'not_interested', 'complaint', 'no_answer', 'busy', 'switched_off', 'call_dropped', 'wrong_number', 'unlogged', null], default: null })
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

  // ─── Caller Command Center: measured by the cockpit timer, not typed ───
  @Prop({ default: null }) startedAt?: Date | null;
  @Prop({ default: 0 }) durationSec?: number; // dial → hang up
  @Prop({ default: 0 }) wrapSec?: number;     // hang up → disposition
  @Prop({ default: '' }) mode?: string;
  @Prop({ default: 0 }) attemptNo?: number;
  @Prop({ default: 0 }) score?: number;       // lead score when called (hot-lead bonus)
  @Prop({ default: false }) flagged?: boolean; // connected but under the short-call threshold
  @Prop({ default: '' }) reason?: string;      // not-interested / skip reason

  createdAt: Date;
}

export const CrmCallLogSchema = SchemaFactory.createForClass(CrmCallLog);
CrmCallLogSchema.index({ customerId: 1, createdAt: -1 });
CrmCallLogSchema.index({ agentId: 1, createdAt: -1 });
