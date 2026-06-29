import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReminderDocument = Reminder & Document;

@Schema({ timestamps: true })
export class Reminder {
  @Prop({ type: Types.ObjectId, ref: 'StoreSale' })
  sale?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', index: true })
  order?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Store' })
  store?: Types.ObjectId;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true })
  dueAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'AdminUser', required: true })
  createdBy: Types.ObjectId;

  @Prop({ default: false })
  isDismissed: boolean;
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder);

ReminderSchema.index({ store: 1, dueAt: 1 });
ReminderSchema.index({ dueAt: 1, isDismissed: 1 });
