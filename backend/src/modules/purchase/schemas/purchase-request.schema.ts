import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PurchaseRequestDocument = PurchaseRequest & Document;

@Schema({ timestamps: true })
export class PurchaseRequest {
  @Prop({ unique: true })
  reqNo: string;

  @Prop({
    type: [{ materialId: String, materialName: String, qtyKg: Number }],
    required: true,
  })
  items: Array<{ materialId: string; materialName: string; qtyKg: number }>;

  @Prop()
  note: string;

  @Prop({ default: 'REQUESTED' })
  status: string;

  @Prop({ required: true })
  requestedById: string;

  @Prop({ required: true })
  requestedByName: string;

  @Prop({ default: '' })
  requestedByEmail: string;

  @Prop({ type: Object })
  po: {
    poNo: string;
    vendorName: string;
    vendorPhone: string;
    vendorAddress: string;
    items: Array<{ materialId: string; materialName: string; qtyKg: number; ratePerKg: number; amount: number }>;
    totalAmount: number;
    expectedDelivery: string;
    terms: string;
    createdByName: string;
    createdAt: Date;
  };

  @Prop({ type: Object })
  decision: {
    action: string;
    reason: string;
    byName: string;
    at: Date;
  };

  @Prop({ type: Object })
  vendorBill: {
    url: string;
    name: string;
    mime: string;
    publicId: string;
  };

  @Prop({ type: Object })
  receipt: {
    gateBill: { url: string; name: string; mime: string; publicId: string };
    receivedItems: Array<{ materialName: string; orderedKg: number; receivedKg: number; varianceKg: number }>;
    remarks: string;
    byName: string;
    at: Date;
  };

  @Prop({
    type: [{ action: String, status: String, byName: String, at: Date }],
    default: [],
  })
  timeline: Array<{ action: string; status: string; byName: string; at: Date }>;

  createdAt: Date;
  updatedAt: Date;
}

export const PurchaseRequestSchema = SchemaFactory.createForClass(PurchaseRequest);

PurchaseRequestSchema.index({ status: 1, createdAt: -1 });
PurchaseRequestSchema.index({ requestedById: 1, createdAt: -1 });
