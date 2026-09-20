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

  @Prop({ required: true, enum: ['connected', 'no_answer', 'ordered', 'not_interested', 'callback'] })
  outcome: CallOutcome;

  @Prop({ default: '' })
  notes: string;

  @Prop({ default: null })
  callbackAt: Date | null;

  createdAt: Date;
}

export const CrmCallLogSchema = SchemaFactory.createForClass(CrmCallLog);
CrmCallLogSchema.index({ customerId: 1, createdAt: -1 });
CrmCallLogSchema.index({ agentId: 1, createdAt: -1 });
