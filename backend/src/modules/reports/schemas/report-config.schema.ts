import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReportConfigDocument = ReportConfig & Document;

@Schema()
class ReportRecipient {
  @Prop({ required: true }) name: string;
  @Prop() email?: string;
  @Prop() phone?: string; // E.164 without +, e.g. "919876543210"
}

@Schema({ timestamps: true })
export class ReportConfig {
  @Prop({ type: [Object], default: [] })
  recipients: { name: string; email?: string; phone?: string }[];

  @Prop({ default: true })
  enabled: boolean;
}

export const ReportConfigSchema = SchemaFactory.createForClass(ReportConfig);
