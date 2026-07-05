import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeedbackDocument = Feedback & Document;

export type FeedbackType = 'product_review' | 'order_feedback' | 'general' | 'complaint' | 'suggestion';
export type FeedbackStatus = 'pending' | 'acknowledged' | 'resolved' | 'closed';

@Schema({ timestamps: true })
export class Feedback {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  user?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  order?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product' })
  product?: Types.ObjectId;

  @Prop({ required: true })
  type: FeedbackType;

  @Prop({ min: 1, max: 5 })
  rating?: number;

  @Prop({ required: true })
  message: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: [String], default: [] })
  videos: string[];

  @Prop()
  reviewerName?: string;

  @Prop({ default: false })
  isAdminCurated: boolean;

  @Prop({ default: 'pending' })
  status: FeedbackStatus;

  @Prop()
  adminResponse?: string;

  @Prop()
  respondedAt?: Date;

  @Prop()
  respondedBy?: string;

  @Prop({ default: false })
  isPublic: boolean;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);

FeedbackSchema.index({ user: 1, createdAt: -1 });
FeedbackSchema.index({ type: 1, status: 1 });
FeedbackSchema.index({ product: 1, isPublic: 1 });
FeedbackSchema.index({ order: 1 });
