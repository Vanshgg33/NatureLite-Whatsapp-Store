import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignDocument = HydratedDocument<Campaign>;

export type CampaignType = 'template' | 'media';
export type CampaignStatus = 'queued' | 'sending' | 'done' | 'failed';

@Schema({ timestamps: true })
export class Campaign {
  @Prop({ required: true }) label: string;
  @Prop({ required: true, enum: ['template', 'media'] }) type: CampaignType;
  @Prop({ required: true, enum: ['queued', 'sending', 'done', 'failed'], default: 'queued' }) status: CampaignStatus;

  @Prop({ default: 0 }) totalPhones: number;
  @Prop({ default: 0 }) sent: number;
  @Prop({ default: 0 }) skipped: number;
  @Prop() completedAt?: Date;

  // Template-specific
  @Prop() templateName?: string;
  @Prop() languageCode?: string;
  @Prop({ type: [String], default: [] }) headerParams: string[];
  @Prop({ type: [String], default: [] }) bodyParams: string[];
  @Prop({ type: [String], default: [] }) buttonParams: string[];

  // Media-specific
  @Prop() imageUrl?: string;
  @Prop() caption?: string;

  // Full phone list (used by processor, excluded from list responses)
  @Prop({ type: [String], default: [] }) phones: string[];

  createdAt: Date;
  updatedAt: Date;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
CampaignSchema.index({ createdAt: -1 });
