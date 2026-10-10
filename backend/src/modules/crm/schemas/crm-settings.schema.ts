import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { DEFAULT_THRESHOLDS, DEFAULT_VIP } from '../engine/status-model';

export type CrmSettingsDocument = CrmSettings & Document;

export const DEFAULT_REORDER_CYCLES: Record<string, number> = {
  'Oils (Wood-Pressed)': 32,
  'Oils (Cold-Pressed)': 20,
  'Ghee': 50,
  'Flours': 22,
  'Pulses': 28,
  'Spices': 45,
  'Snacks': 18,
};

@Schema({ timestamps: true })
export class CrmSettings {
  @Prop({ type: Object, default: DEFAULT_REORDER_CYCLES })
  reorderCycles: Record<string, number>;

  @Prop({ default: 30 })
  fallbackCycleDays: number;

  @Prop({
    type: Object,
    default: {
      atRiskAfterDays: DEFAULT_THRESHOLDS.atRiskAfterDays,
      dormantAfterDays: DEFAULT_THRESHOLDS.dormantAfterDays,
      lostAfterDays: DEFAULT_THRESHOLDS.lostAfterDays,
    },
  })
  thresholds: {
    atRiskAfterDays: number;
    dormantAfterDays: number;
    lostAfterDays: number;
  };

  @Prop({
    type: Object,
    default: {
      minOrders: DEFAULT_VIP.minOrders,
      minLifetimeValue: DEFAULT_VIP.minLifetimeValue,
    },
  })
  vip: {
    minOrders: number;
    minLifetimeValue: number;
  };

  @Prop({ default: 50 })
  dailyCallTarget: number;

  @Prop({ type: Object, default: {} })
  scripts: Record<string, string>;

  @Prop({ type: Object, default: {} })
  waTemplates: Record<string, string>;
}

export const CrmSettingsSchema = SchemaFactory.createForClass(CrmSettings);
