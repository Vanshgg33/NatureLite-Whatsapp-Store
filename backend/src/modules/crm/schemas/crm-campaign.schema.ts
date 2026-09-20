// backend/src/modules/crm/schemas/crm-campaign.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CrmCampaignDocument = CrmCampaign & Document;

@Schema({ timestamps: true })
export class CrmCampaign {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [String], default: [] })
  segmentFilter: string[];

  @Prop({ required: true })
  waMessage: string;

  @Prop({ default: 'draft', enum: ['draft', 'approved', 'sent'] })
  status: 'draft' | 'approved' | 'sent';

  @Prop({ type: Types.ObjectId, ref: 'AdminUser', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser', default: null })
  approvedBy: Types.ObjectId | null;

  @Prop({ default: 0 })
  recipientCount: number;

  @Prop({ default: null })
  sentAt: Date | null;

  createdAt: Date;
}

export const CrmCampaignSchema = SchemaFactory.createForClass(CrmCampaign);
CrmCampaignSchema.index({ status: 1, createdAt: -1 });
