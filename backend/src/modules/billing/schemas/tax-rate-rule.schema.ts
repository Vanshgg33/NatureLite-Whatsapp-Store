import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true, collection: 'billing_tax_rate_rules' })
export class TaxRateRule extends Document {
  @Prop({ required: true, enum: ['hsn', 'category', 'item'] }) scope: string
  @Prop() hsnPrefix: string
  @Prop({ type: Types.ObjectId }) categoryId: Types.ObjectId
  @Prop({ type: Types.ObjectId }) itemId: Types.ObjectId
  @Prop({ required: true }) gstRate: number
  @Prop({ default: 0 }) cessRate: number
  @Prop({ required: true, enum: ['taxable','nil','exempt','non_gst'] }) taxability: string
  @Prop({ required: true }) effectiveFrom: Date
  @Prop({ default: null }) effectiveTo: Date | null
  @Prop({ required: true, minlength: 10 }) reason: string
  @Prop({ enum: ['scheduled','active','expired','cancelled'], default: 'active' }) status: string
  @Prop() createdBy: string
}
export const TaxRateRuleSchema = SchemaFactory.createForClass(TaxRateRule)
TaxRateRuleSchema.index({ scope: 1, hsnPrefix: 1, categoryId: 1, itemId: 1, effectiveFrom: -1 })
