import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: false, collection: 'billing_audit_logs' })
export class AuditLog extends Document {
  @Prop({ required: true }) targetCollection: string
  @Prop({ type: Types.ObjectId, required: true, index: true }) docId: Types.ObjectId
  @Prop({ required: true, enum: ['create','update','cancel','delete','restore'] }) action: string
  @Prop({ type: Object }) before: Record<string, unknown>
  @Prop({ type: Object }) after: Record<string, unknown>
  @Prop() userId: string
  @Prop({ required: true, default: () => new Date() }) at: Date
  @Prop() ip: string
}
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog)
AuditLogSchema.index({ targetCollection: 1, docId: 1 })
AuditLogSchema.index({ at: -1 })
