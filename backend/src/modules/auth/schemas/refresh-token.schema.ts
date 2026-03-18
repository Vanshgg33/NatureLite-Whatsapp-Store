import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RefreshTokenDocument = RefreshToken & Document;

@Schema({ timestamps: true })
export class RefreshToken {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  role: string;

  @Prop({ type: Types.ObjectId, ref: 'Store', required: false })
  storeId?: Types.ObjectId;

  @Prop({ required: true, index: true })
  expiresAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

RefreshTokenSchema.index({ token: 1 }, { unique: true });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

