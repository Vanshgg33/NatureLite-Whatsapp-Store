import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ timestamps: true, collection: 'billing_business_profiles' })
export class BusinessProfile extends Document {
  @Prop({ required: true }) name: string
  @Prop() legalName: string
  @Prop() gstin: string
  @Prop({ default: '22' }) stateCode: string
  @Prop() pan: string
  @Prop({ type: Object }) address: {
    line1: string; line2?: string; city: string; pincode: string; stateCode: string
  }
  @Prop() phone: string
  @Prop() email: string
  @Prop() logoUrl: string
  @Prop() signatureUrl: string
  @Prop({ type: Object }) bankDetails: {
    name: string; acNo: string; ifsc: string; branch: string; upiId?: string
  }
  @Prop({ default: 4 }) fyStartMonth: number
  @Prop({ default: 'monthly', enum: ['monthly', 'quarterly'] }) gstFilingFrequency: string
  @Prop({ default: 10_000_000 }) b2clThreshold: number
  @Prop({ default: 5_000_000 }) ewayThreshold: number
  @Prop({ default: true }) roundOffEnabled: boolean
  @Prop({ default: 'without_tax', enum: ['with_tax', 'without_tax'] }) defaultPriceMode: string
  @Prop() printTheme: string
  @Prop({ default: 80, enum: [58, 80] }) thermalWidth: number
  @Prop({ type: Object, default: {} }) termsByDocType: Record<string, string>
}
export const BusinessProfileSchema = SchemaFactory.createForClass(BusinessProfile)
