import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ collection: 'billing_allowed_rates' })
export class AllowedRate extends Document {
  @Prop({ required: true, unique: true }) rate: number
  @Prop({ default: true }) active: boolean
}
export const AllowedRateSchema = SchemaFactory.createForClass(AllowedRate)
