import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ComplaintDocument = Complaint & Document;

export const COMPLAINT_CATEGORIES = [
  'damaged', 'wrong_item', 'missing_item', 'quality', 'late_delivery', 'delivery_behaviour', 'payment', 'other',
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_STATUSES = ['new', 'investigating', 'awaiting_customer', 'resolved', 'reopened', 'closed'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number];

export const COMPLAINT_SOURCES = ['whatsapp', 'call', 'handoff', 'website', 'delivery', 'store'] as const;
export type ComplaintSource = (typeof COMPLAINT_SOURCES)[number];

export const RESOLUTION_TYPES = ['replacement', 'wallet_credit', 'refund', 'apology', 'rejected'] as const;
export type ResolutionType = (typeof RESOLUTION_TYPES)[number];

@Schema({ _id: true })
export class ComplaintEvent {
  _id: Types.ObjectId;

  /** reply = sent to customer, note = internal only, status/assign/resolution = system trail, customer = inbound from customer. */
  @Prop({ required: true, enum: ['reply', 'note', 'status', 'assign', 'resolution', 'customer'] })
  kind: string;

  @Prop({ default: '' })
  text: string;

  @Prop({ default: '' })
  byName: string;

  @Prop({ default: Date.now })
  at: Date;
}
export const ComplaintEventSchema = SchemaFactory.createForClass(ComplaintEvent);

@Schema({ timestamps: true })
export class Complaint {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  ticketNo: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', default: null, index: true })
  orderId: Types.ObjectId | null;

  @Prop({ default: '' })
  orderNumber: string;

  @Prop({ required: true, enum: COMPLAINT_CATEGORIES, default: 'other' })
  category: ComplaintCategory;

  @Prop({ required: true, enum: COMPLAINT_SEVERITIES, default: 'medium' })
  severity: ComplaintSeverity;

  @Prop({ required: true, enum: COMPLAINT_STATUSES, default: 'new', index: true })
  status: ComplaintStatus;

  @Prop({ required: true, enum: COMPLAINT_SOURCES, default: 'whatsapp' })
  source: ComplaintSource;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  media: string[];

  @Prop({ type: Types.ObjectId, ref: 'AdminUser', default: null, index: true })
  assignedTo: Types.ObjectId | null;

  @Prop({ default: '' })
  assignedToName: string;

  /** First reply deadline; breached tickets are flagged overdue in the UI. */
  @Prop({ required: true })
  firstResponseDueAt: Date;

  @Prop({ required: true })
  resolutionDueAt: Date;

  @Prop({ default: null })
  firstRespondedAt: Date | null;

  /** Set once when an unanswered ticket is moved to the other agent after a first-response breach. */
  @Prop({ default: false })
  reassignedOnBreach: boolean;

  @Prop({ default: null })
  resolvedAt: Date | null;

  @Prop({ type: Object, default: null })
  resolution: {
    type: ResolutionType;
    amount?: number;
    reason: string;
    replacementOrderId?: string;
    replacementOrderNumber?: string;
    byName: string;
    at: Date;
  } | null;

  @Prop({ default: '' })
  rootCause: string;

  /** Set by scripts/import-feedback-complaints.ts so a re-run never imports the same feedback twice. */
  @Prop({ type: Types.ObjectId, default: null, index: true, sparse: true })
  legacyFeedbackId: Types.ObjectId | null;

  /** 1-5 customer rating after resolution. */
  @Prop({ default: null })
  csat: number | null;

  @Prop({ type: [ComplaintEventSchema], default: [] })
  events: ComplaintEvent[];

  createdAt: Date;
  updatedAt: Date;
}

export const ComplaintSchema = SchemaFactory.createForClass(Complaint);
ComplaintSchema.index({ status: 1, resolutionDueAt: 1 });
ComplaintSchema.index({ assignedTo: 1, status: 1 });
ComplaintSchema.index({ customerId: 1, status: 1 });
