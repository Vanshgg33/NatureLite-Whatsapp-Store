import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdminUserDocument = AdminUser & Document;

export type AdminRole = 'admin' | 'superadmin';

@Schema({ timestamps: true })
export class AdminUser {
  _id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ unique: true, sparse: true })
  phone?: string;

  @Prop({ type: Types.ObjectId, ref: 'Store' })
  store?: Types.ObjectId;

  @Prop({ default: 'admin' })
  role: AdminRole;

  @Prop({ enum: ['packing', 'billing', 'delivery', 'crm_head', 'crm_senior'], required: false })
  departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior';

  @Prop({ enum: ['requester', 'po_creator', 'approver', 'receiver'], required: false })
  purchaseRole?: 'requester' | 'po_creator' | 'approver' | 'receiver';

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  lastLoginIp?: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop()
  avatar?: string;

  @Prop({ type: Object, default: {} })
  preferences: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockoutUntil?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);

AdminUserSchema.index({ role: 1, isActive: 1 });
AdminUserSchema.index({ store: 1 });
