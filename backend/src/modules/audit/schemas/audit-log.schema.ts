import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

export type AuditAction =
  | 'order.status_change'
  | 'order.cancel'
  | 'order.payment_update'
  | 'order.create'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'user.block'
  | 'user.unblock'
  | 'user.delete'
  | 'coupon.create'
  | 'coupon.update'
  | 'coupon.delete'
  | 'settings.update'
  | 'admin.login'
  | 'admin.password_change'
  | 'category.create'
  | 'category.update'
  | 'category.delete';

@Schema({ timestamps: true })
export class AuditLog {
  _id: Types.ObjectId;

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ required: true, index: true })
  performedBy: string;

  @Prop()
  performedByName?: string;

  @Prop({ type: Types.ObjectId })
  targetId?: Types.ObjectId;

  @Prop()
  targetModel?: string;

  @Prop({ type: Object })
  previousValues?: Record<string, unknown>;

  @Prop({ type: Object })
  newValues?: Record<string, unknown>;

  @Prop()
  description?: string;

  @Prop()
  ipAddress?: string;

  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ performedBy: 1, createdAt: -1 });
AuditLogSchema.index({ targetId: 1 });
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
