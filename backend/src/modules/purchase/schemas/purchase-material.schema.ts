import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PurchaseMaterialDocument = PurchaseMaterial & Document;

@Schema({ timestamps: true })
export class PurchaseMaterial {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({
    enum: [
      'GRAINS_MILLETS', 'OILS', 'PULSES', 'GHEE', 'JAGGERY_SALT',
      'SNACKS_MASALA', 'DRY_FRUITS_SEEDS', 'WHOLE_SPICES', 'PACKAGING', 'OTHER',
      // Legacy free-text values kept here so old docs load without error
      'General', 'Oilseed', 'Grain', 'Pulse', 'Spice',
    ],
    default: 'OTHER',
  })
  category: string;

  @Prop({
    enum: ['kg', 'g', 'L', 'ml', 'pcs'],
    default: 'kg',
  })
  uom: string;

  @Prop({ default: true })
  isActive: boolean;

  /** ₹ per uom — updated when a PO is approved */
  @Prop()
  lastRate: number;

  @Prop({ type: Types.ObjectId, ref: 'PurchaseVendor' })
  lastVendorId: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const PurchaseMaterialSchema = SchemaFactory.createForClass(PurchaseMaterial);
