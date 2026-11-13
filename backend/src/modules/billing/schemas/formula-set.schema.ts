import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

/** One published version of the bill formulas. A bill uses the latest version whose effectiveFrom is on or before its invoice date. */
@Schema({ timestamps: true, collection: 'billing_formula_sets' })
export class FormulaSet extends Document {
  @Prop({ required: true, unique: true }) version: number
  @Prop({ type: Object, required: true }) slots: Record<string, string>
  @Prop({ required: true }) effectiveFrom: Date
  @Prop({ required: true }) reason: string
  @Prop() createdBy: string
}
export const FormulaSetSchema = SchemaFactory.createForClass(FormulaSet)
FormulaSetSchema.index({ effectiveFrom: -1 })
