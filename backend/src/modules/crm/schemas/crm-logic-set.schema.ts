import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** One published version of the CRM formulas. The newest version is the one in force (applies to every customer at once). */
@Schema({ timestamps: true, collection: 'crm_logic_sets' })
export class CrmLogicSet extends Document {
  @Prop({ required: true, unique: true }) version: number;
  @Prop({ type: Object, required: true }) formulas: Record<string, string>;
  @Prop({ required: true }) reason: string;
  @Prop() createdBy: string;
}
export const CrmLogicSetSchema = SchemaFactory.createForClass(CrmLogicSet);
