// backend/src/modules/crm/schemas/crm-settings.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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
}

export const CrmSettingsSchema = SchemaFactory.createForClass(CrmSettings);
