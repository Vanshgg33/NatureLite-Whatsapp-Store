import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CrmEngineRunDocument = CrmEngineRun & Document;
export type EngineRunTrigger = 'cron' | 'manual' | 'settings';

@Schema({ timestamps: false })
export class CrmEngineRun {
  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  finishedAt?: Date;

  @Prop({ required: true, enum: ['cron', 'manual', 'settings'] })
  trigger: EngineRunTrigger;

  @Prop({ default: 0 })
  customersProcessed: number;

  @Prop({ type: Object, default: {} })
  segmentCounts: Record<string, number>;

  @Prop({ type: [String], default: [] })
  errors: string[];
}

export const CrmEngineRunSchema = SchemaFactory.createForClass(CrmEngineRun);
CrmEngineRunSchema.index({ startedAt: -1 });
