import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CrmActivityEventDocument = CrmActivityEvent & Document;

@Schema({ timestamps: false })
export class CrmActivityEvent {
  @Prop({ type: Types.ObjectId, ref: 'AdminUser', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ required: true })
  employeeName: string;

  @Prop({ required: true, index: true })
  at: Date;

  @Prop({ required: true, index: true })
  istDate: string;

  @Prop({ required: true })
  hourIST: number;

  @Prop({ required: true, index: true })
  type: string;

  @Prop({ type: Types.ObjectId })
  customerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  refId?: Types.ObjectId;

  @Prop({ type: Object })
  meta?: Record<string, unknown>;
}

export const CrmActivityEventSchema = SchemaFactory.createForClass(CrmActivityEvent);
CrmActivityEventSchema.index({ employeeId: 1, istDate: 1 });
