// backend/src/modules/crm/schemas/crm-customer-stats.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CrmSegment = 'New' | 'Active' | 'Due Soon' | 'Overdue' | 'At Risk' | 'Dormant' | 'Lost';
export type CrmCustomerStatsDocument = CrmCustomerStats & Document;

@Schema({ timestamps: true })
export class CrmCustomerStats {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['New', 'Active', 'Due Soon', 'Overdue', 'At Risk', 'Dormant', 'Lost'] })
  segment: CrmSegment;

  @Prop({ default: false })
  isVip: boolean;

  @Prop()
  predictedReorderDate?: Date;

  @Prop({ default: 30 })
  personalCycle: number;

  @Prop({ default: '' })
  topCategory: string;

  @Prop({ default: '' })
  topProduct: string;

  @Prop({ default: 0 })
  ltv: number;

  @Prop({ default: 0 })
  aov: number;

  @Prop({ default: 0 })
  priorityScore: number;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser', default: null })
  assignedAgentId: Types.ObjectId | null;

  @Prop({ default: null })
  lastCallAt: Date | null;

  @Prop({ enum: ['connected', 'no_answer', 'ordered', 'not_interested', 'callback', null], default: null })
  lastCallOutcome: string | null;

  updatedAt: Date;
}

export const CrmCustomerStatsSchema = SchemaFactory.createForClass(CrmCustomerStats);
CrmCustomerStatsSchema.index({ segment: 1, priorityScore: -1 });
CrmCustomerStatsSchema.index({ assignedAgentId: 1, segment: 1, priorityScore: -1 });
CrmCustomerStatsSchema.index({ predictedReorderDate: 1 });
