import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AccessRoleDocument = AccessRole & Document;

@Schema({ timestamps: true, collection: 'access_roles' })
export class AccessRole {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  createdAt: Date;
  updatedAt: Date;
}

export const AccessRoleSchema = SchemaFactory.createForClass(AccessRole);
