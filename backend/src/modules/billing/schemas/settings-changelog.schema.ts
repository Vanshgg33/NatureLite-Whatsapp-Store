import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: false, collection: 'billing_settings_changelog' })
export class SettingsChangeLog extends Document {
  @Prop({ required: true, enum: ['TaxRateRule','ComplianceParam','AllowedRate','CashDenomination'] }) entity: string
  @Prop({ type: Types.ObjectId, required: true }) entityId: Types.ObjectId
  @Prop({ required: true, enum: ['create','cancel','retire'] }) action: string
  @Prop({ type: Object }) before: Record<string, unknown>
  @Prop({ type: Object }) after: Record<string, unknown>
  @Prop({ required: true }) reason: string
  @Prop() userId: string
  @Prop() userName: string
  @Prop({ required: true, default: () => new Date() }) at: Date
  @Prop() ip: string
}
export const SettingsChangeLogSchema = SchemaFactory.createForClass(SettingsChangeLog)
