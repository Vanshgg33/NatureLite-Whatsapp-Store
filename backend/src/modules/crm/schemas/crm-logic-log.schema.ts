import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Who changed which CRM rule, from what to what, and why. */
@Schema({ timestamps: false, collection: 'crm_logic_logs' })
export class CrmLogicLog extends Document {
  @Prop({ required: true }) area: string; // 'formulas' | 'values'
  @Prop({ type: Object }) before: unknown;
  @Prop({ type: Object }) after: unknown;
  @Prop({ required: true }) reason: string;
  @Prop() userId: string;
  @Prop() ip: string;
  @Prop({ required: true }) at: Date;
}
export const CrmLogicLogSchema = SchemaFactory.createForClass(CrmLogicLog);
