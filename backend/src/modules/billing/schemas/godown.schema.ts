import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ timestamps: true, collection: 'billing_godowns' })
export class Godown extends Document {
  @Prop({ required: true }) name: string
  @Prop({ required: true, unique: true }) code: string
  @Prop() address: string
  @Prop({ default: '22' }) stateCode: string
  @Prop({ default: false }) isDefault: boolean
}
export const GodownSchema = SchemaFactory.createForClass(Godown)
