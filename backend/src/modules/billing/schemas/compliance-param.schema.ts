import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ timestamps: true, collection: 'billing_compliance_params' })
export class ComplianceParam extends Document {
  @Prop({ required: true }) key: string
  @Prop({ type: Object, required: true }) value: number | string | boolean
  @Prop({ required: true, enum: ['paise','percent','days','count','date','text','bool'] }) unit: string
  @Prop({ required: true }) effectiveFrom: Date
  @Prop({ default: null }) effectiveTo: Date | null
  @Prop({ required: true }) reason: string
  @Prop() createdBy: string
}
export const ComplianceParamSchema = SchemaFactory.createForClass(ComplianceParam)
ComplianceParamSchema.index({ key: 1, effectiveFrom: -1 })
