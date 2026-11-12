import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const GOAL_METRICS = ['revenue', 'orders', 'calls', 'newCustomers'] as const;
export const LEAD_STAGES = ['new', 'contacted', 'interested', 'ordered', 'lost'] as const;

/** Monthly target (blueprint M03). One goal per (month, metric). */
@Schema({ timestamps: true })
export class CrmGoal {
  @Prop({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ }) month: string;
  @Prop({ required: true, enum: GOAL_METRICS }) metric: string;
  @Prop({ required: true, min: 0 }) target: number;
}
export const CrmGoalSchema = SchemaFactory.createForClass(CrmGoal);
CrmGoalSchema.index({ month: 1, metric: 1 }, { unique: true });

/** Lead before they become a customer (M19). phone is the 10-digit normalised number. */
@Schema({ timestamps: true })
export class CrmLead {
  @Prop({ required: true, trim: true, maxlength: 100 }) name: string;
  @Prop({ required: true, index: true }) phone: string;
  @Prop({ default: 'manual', trim: true, lowercase: true, maxlength: 50 }) source: string;
  @Prop({ enum: LEAD_STAGES, default: 'new', index: true }) stage: string;
  @Prop({ default: '', maxlength: 200 }) lostReason: string;
  @Prop({ type: Types.ObjectId, ref: 'AdminUser', default: null }) assignedTo: Types.ObjectId | null;
  @Prop({ default: null }) firstContactAt: Date | null;
  createdAt: Date;
}
export const CrmLeadSchema = SchemaFactory.createForClass(CrmLead);

/** Experience Centre visitor (M21). customerId is set when the phone matches an existing customer. */
@Schema({ timestamps: true })
export class CrmWalkin {
  @Prop({ required: true }) phone: string;
  @Prop({ default: '', maxlength: 100 }) name: string;
  @Prop({ default: '', maxlength: 200 }) interest: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) customerId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, ref: 'AdminUser', default: null }) staffId: Types.ObjectId | null;
  createdAt: Date;
}
export const CrmWalkinSchema = SchemaFactory.createForClass(CrmWalkin);
CrmWalkinSchema.index({ createdAt: -1 });
