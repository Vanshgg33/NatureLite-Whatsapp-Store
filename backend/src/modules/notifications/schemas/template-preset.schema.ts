import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TemplatePresetDocument = HydratedDocument<TemplatePreset>;

@Schema({ timestamps: true })
export class TemplatePreset {
  @Prop({ required: true, unique: true }) templateName: string;
  @Prop({ default: 'en' }) languageCode: string;
  @Prop({ default: '' }) headerParams: string;
  @Prop({ default: '' }) buttonParams: string;
  @Prop({ type: [Object], default: [] }) bodyParamRows: { value: string; field: string }[];
  @Prop({ default: 'none' }) tplImageMethod: string;
  @Prop({ default: '' }) tplImageUrl: string;

  updatedAt: Date;
}

export const TemplatePresetSchema = SchemaFactory.createForClass(TemplatePreset);
