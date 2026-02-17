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

  @Prop({ required: true })
  password: string;

  @Prop({ unique: true })
  phone?: string;

  @Prop({ default: 'admin' })
  role: AdminRole;

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

  createdAt: Date;
  updatedAt: Date;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);

AdminUserSchema.index({ email: 1 });
AdminUserSchema.index({ role: 1, isActive: 1 });
