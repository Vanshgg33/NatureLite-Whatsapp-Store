import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class Address {
  @Prop({ required: true })
  label: string;

  @Prop()
  fullName?: string;

  @Prop()
  phone?: string;

  @Prop()
  house?: string;

  @Prop()
  building?: string;

  @Prop()
  area?: string;

  @Prop({ required: true })
  street: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  state: string;

  @Prop({ required: true })
  pincode: string;

  @Prop()
  landmark?: string;

  @Prop({ enum: ['home', 'office', 'other'] })
  addressType?: 'home' | 'office' | 'other';

  @Prop({ default: false })
  isDefault: boolean;
}

export const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ timestamps: true })
export class User {
  _id: Types.ObjectId;

  @Prop({ sparse: true })
  phone?: string;

  @Prop()
  name?: string;

  @Prop({ sparse: true })
  email?: string;

  @Prop({ select: false })
  password?: string;

  @Prop({ type: [AddressSchema], default: [] })
  addresses: Address[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isBlocked: boolean;

  @Prop()
  blockedReason?: string;

  @Prop({ default: 0 })
  totalOrders: number;

  @Prop({ default: 0 })
  totalSpent: number;

  @Prop()
  lastOrderAt?: Date;

  @Prop()
  lastInteractionAt?: Date;

  @Prop({ type: Object, default: {} })
  preferences: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  notes?: string;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockoutUntil?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ phone: 1 }, { unique: true, sparse: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ isActive: 1, isBlocked: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ totalOrders: -1 });
