import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { Segment, CycleSource, PriorityBand } from '../engine/status-model';

export type { Segment, CycleSource, PriorityBand };
export type CrmSegment = Segment; // backward-compat alias
export type CrmCustomerStatsDocument = CrmCustomerStats & Document;

// Keep legacy title-case values in the enum so old documents remain readable.
// The engine writes snake_case going forward; the P1-2 backfill converts old docs.
const SEGMENT_VALUES = [
  'new', 'active', 'due_soon', 'due_today', 'overdue', 'at_risk', 'dormant', 'lost', 'no_orders',
  // legacy (pre-redesign)
  'New', 'Active', 'Due Soon', 'Overdue', 'At Risk', 'Dormant', 'Lost',
];

@Schema({ timestamps: true })
export class CrmCustomerStats {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: SEGMENT_VALUES })
  segment: string;

  @Prop({ default: 0 })
  daysLate: number;

  @Prop({ default: null })
  segmentUpdatedAt: Date | null;

  @Prop({ default: false })
  isVip: boolean;

  @Prop({ default: null })
  predictedReorderDate: Date | null;

  @Prop({ default: 30 })
  personalCycle: number;

  @Prop({ enum: ['personal', 'category', 'fallback'], default: 'fallback' })
  cycleSource: CycleSource;

  @Prop({ default: '' })
  topCategory: string;

  @Prop({ default: '' })
  topProduct: string;

  @Prop({ default: 0 })
  ltv: number;

  @Prop({ default: 0 })
  aov: number;

  @Prop({ default: 0 })
  ltvPct: number;

  @Prop({ default: 0 })
  priorityScore: number;

  @Prop({ enum: ['high', 'medium', 'low'], default: 'low' })
  priorityBand: PriorityBand;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser', default: null })
  assignedAgentId: Types.ObjectId | null;

  @Prop({ default: null })
  lastCallAt: Date | null;

  @Prop({ enum: ['connected', 'no_answer', 'ordered', 'not_interested', 'callback', 'wrong_number', null], default: null })
  lastCallOutcome: string | null;

  @Prop({ default: 0 })
  callAttempts: number;

  @Prop({ default: 0 })
  consecutiveNoAnswer: number;

  @Prop({ default: false })
  preferWhatsApp: boolean;

  @Prop({ default: null })
  callbackAt: Date | null;

  @Prop({ default: null })
  snoozedUntil: Date | null;

  @Prop({ default: false })
  nameMissing: boolean;

  @Prop({ default: false })
  phoneInvalid: boolean;

  @Prop({ default: false })
  isDismissed: boolean;

  @Prop({ default: false })
  isEscalated: boolean;

  @Prop({
    type: [{ _id: { type: Types.ObjectId, auto: true }, agentId: Types.ObjectId, agentName: String, text: String, createdAt: Date }],
    default: [],
  })
  notes: { _id: Types.ObjectId; agentId: Types.ObjectId; agentName: string; text: string; createdAt: Date }[];

  updatedAt: Date;
}

export const CrmCustomerStatsSchema = SchemaFactory.createForClass(CrmCustomerStats);
CrmCustomerStatsSchema.index({ segment: 1, priorityScore: -1 });
CrmCustomerStatsSchema.index({ assignedAgentId: 1, segment: 1, priorityScore: -1 });
CrmCustomerStatsSchema.index({ predictedReorderDate: 1 });
CrmCustomerStatsSchema.index({ callbackAt: 1 });
CrmCustomerStatsSchema.index({ snoozedUntil: 1 });
CrmCustomerStatsSchema.index({ isVip: 1 });
