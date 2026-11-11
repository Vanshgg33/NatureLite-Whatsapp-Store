import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

const OID = (ref: string, extra: Record<string, unknown> = {}) => ({ type: Types.ObjectId, ref, ...extra });

export type MoveType =
  | 'RECEIPT' | 'ISSUE' | 'RETURN' | 'ADJUST' | 'WASTE' | 'REVERSAL'
  | 'PROD_OUTPUT' | 'PACK_ISSUE' | 'PACK_RECEIPT';

/** A raw material or a finished product. Ledger quantities are always in baseUnit. */
@Schema({ timestamps: true })
export class ProdItem {
  @Prop(OID('Store', { required: true, index: true })) store: Types.ObjectId;
  @Prop({ required: true, enum: ['material', 'product'] }) kind: 'material' | 'product';
  @Prop({ required: true, trim: true, uppercase: true }) code: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, enum: ['kg', 'L', 'pcs'], default: 'kg' }) baseUnit: 'kg' | 'L' | 'pcs';
  /** kg per litre. Only set when configured; never defaulted. Used for kg<->L entry. */
  @Prop() kgPerL?: number;
  @Prop({ type: [{ kgPerL: Number, effectiveFrom: Date, by: String }], default: [] })
  conversionHistory: { kgPerL: number; effectiveFrom: Date; by: string }[];
  @Prop({ default: 0 }) lowStockThreshold: number;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ enum: ['bulk', 'packed'], default: 'bulk' }) form: 'bulk' | 'packed';
  @Prop({ default: true }) active: boolean;
}
export type ProdItemDocument = ProdItem & Document;
export const ProdItemSchema = SchemaFactory.createForClass(ProdItem);
ProdItemSchema.index({ store: 1, code: 1 }, { unique: true });

@Schema({ timestamps: true })
export class ProdLocation {
  @Prop(OID('Store', { required: true, index: true })) store: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: true }) active: boolean;
}
export type ProdLocationDocument = ProdLocation & Document;
export const ProdLocationSchema = SchemaFactory.createForClass(ProdLocation);
ProdLocationSchema.index({ store: 1, name: 1 }, { unique: true });

@Schema({ timestamps: true })
export class ProdMachine {
  @Prop(OID('Store', { required: true, index: true })) store: Types.ObjectId;
  @Prop({ required: true, trim: true, uppercase: true }) code: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop() type?: string;
  @Prop() location?: string;
  @Prop() capacity?: number;
  @Prop() capacityUnit?: string;
  @Prop({ default: true }) active: boolean;
}
export type ProdMachineDocument = ProdMachine & Document;
export const ProdMachineSchema = SchemaFactory.createForClass(ProdMachine);
ProdMachineSchema.index({ store: 1, code: 1 }, { unique: true });

/** Immutable stock ledger. Corrections are REVERSAL rows; originals are only flagged `reversed`. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ProdMovement {
  @Prop(OID('Store', { required: true })) store: Types.ObjectId;
  @Prop({ required: true }) type: MoveType;
  @Prop({ required: true, unique: true }) ref: string;
  @Prop(OID('ProdItem', { required: true })) item: Types.ObjectId;
  @Prop(OID('ProdLocation', { required: true })) location: Types.ObjectId;
  /** Signed quantity in the item's base unit. */
  @Prop({ required: true }) qty: number;
  @Prop({ required: true }) enteredQty: number;
  @Prop({ required: true }) enteredUnit: string;
  /** true when the entered unit differs from base and the base qty is an estimate from `factor`. */
  @Prop({ default: false }) converted: boolean;
  @Prop() factor?: number;
  @Prop({ required: true }) runningAfter: number;
  @Prop() supplier?: string;
  @Prop() lot?: string;
  @Prop() destination?: string;
  @Prop() reason?: string;
  @Prop() note?: string;
  @Prop() machine?: string;
  /** RETURN -> issue ref; ISSUE -> production entry ref; PACK_* -> batch/order ref. */
  @Prop() sourceRef?: string;
  /** ISSUE only: base qty already returned. Guarded atomically so returns can't exceed the issue. */
  @Prop({ default: 0 }) returnedQty: number;
  @Prop() performedBy?: string;
  @Prop(OID('AdminUser')) enteredBy?: Types.ObjectId;
  @Prop() enteredByName?: string;
  @Prop({ type: Date, required: true }) eventAt: Date;
  @Prop({ type: [String], default: [] }) evidence: string[];
  @Prop(OID('ProdMovement')) reverses?: Types.ObjectId;
  @Prop({ default: false }) reversed: boolean;
  @Prop({ unique: true, sparse: true }) idemKey?: string;
  createdAt: Date;
}
export type ProdMovementDocument = ProdMovement & Document;
export const ProdMovementSchema = SchemaFactory.createForClass(ProdMovement);
ProdMovementSchema.index({ store: 1, item: 1, location: 1, createdAt: 1 });
ProdMovementSchema.index({ store: 1, eventAt: -1 });
ProdMovementSchema.index({ sourceRef: 1 });

/** Derived balance, maintained only by conditional $inc inside the same transaction as the movement. */
@Schema({ timestamps: true })
export class ProdBalance {
  @Prop(OID('Store', { required: true })) store: Types.ObjectId;
  @Prop(OID('ProdItem', { required: true })) item: Types.ObjectId;
  @Prop(OID('ProdLocation', { required: true })) location: Types.ObjectId;
  @Prop({ default: 0 }) qty: number;
}
export type ProdBalanceDocument = ProdBalance & Document;
export const ProdBalanceSchema = SchemaFactory.createForClass(ProdBalance);
ProdBalanceSchema.index({ store: 1, item: 1, location: 1 }, { unique: true });

@Schema({ _id: false })
class MachineRow {
  @Prop({ required: true }) machine: string;
  @Prop({ required: true }) qty: number;
  @Prop({ required: true }) unit: string;
  @Prop({ required: true }) baseQty: number;
  @Prop() operator?: string;
  @Prop() startAt?: Date;
  @Prop() endAt?: Date;
  @Prop() notes?: string;
}

@Schema({ timestamps: true })
export class ProdEntry {
  @Prop(OID('Store', { required: true, index: true })) store: Types.ObjectId;
  @Prop({ required: true, unique: true }) ref: string;
  @Prop({ required: true, enum: ['draft', 'posted', 'reversed'], default: 'draft' }) status: string;
  @Prop(OID('ProdItem', { required: true })) product: Types.ObjectId;
  @Prop(OID('ProdLocation', { required: true })) location: Types.ObjectId;
  @Prop({ type: Date, required: true }) producedAt: Date;
  @Prop() operator?: string;
  @Prop() notes?: string;
  @Prop({ type: [SchemaFactory.createForClass(MachineRow)], default: [] }) rows: MachineRow[];
  @Prop({ default: 0 }) total: number;
  /** RMS issue refs consumed by this run. */
  @Prop({ type: [String], default: [] }) issueRefs: string[];
  @Prop({ type: [String], default: [] }) evidence: string[];
  @Prop() postedByName?: string;
  @Prop(OID('ProdMovement')) movement?: Types.ObjectId;
  @Prop() enteredByName?: string;
}
export type ProdEntryDocument = ProdEntry & Document;
export const ProdEntrySchema = SchemaFactory.createForClass(ProdEntry);
ProdEntrySchema.index({ store: 1, producedAt: -1 });

@Schema()
export class ProdCounter {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ default: 0 }) seq: number;
}
export type ProdCounterDocument = ProdCounter & Document;
export const ProdCounterSchema = SchemaFactory.createForClass(ProdCounter);

/** Durable notification outbox; written in the same transaction as the movement. */
@Schema({ timestamps: true })
export class ProdOutbox {
  @Prop(OID('Store', { required: true })) store: Types.ObjectId;
  @Prop({ required: true }) event: string;
  @Prop({ required: true }) ref: string;
  @Prop({ required: true }) to: string;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) html: string;
  @Prop({ required: true, enum: ['queued', 'sent', 'failed'], default: 'queued', index: true }) status: string;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ type: Date, default: Date.now }) nextAttemptAt: Date;
  @Prop() sentAt?: Date;
  @Prop() error?: string;
  @Prop({ required: true, unique: true }) idemKey: string;
}
export type ProdOutboxDocument = ProdOutbox & Document;
export const ProdOutboxSchema = SchemaFactory.createForClass(ProdOutbox);

@Schema({ timestamps: true })
export class ProdSettings {
  @Prop(OID('Store', { required: true, unique: true })) store: Types.ObjectId;
  /** event -> recipient emails. Events: receipt, issue, return, production, packing, eod */
  @Prop({ type: Object, default: {} }) recipients: Record<string, string[]>;
  /** Admin-managed tag vocabulary. When non-empty, item tags must come from it. */
  @Prop({ type: [String], default: [] }) tagVocab: string[];
  @Prop({ default: false }) requireReceiptPhoto: boolean;
  /** Factory timezone as a fixed UTC offset in minutes (India = 330, no DST). */
  @Prop({ default: 330 }) utcOffsetMinutes: number;
  /** Local HH:mm to email the EOD summary; empty = off. */
  @Prop({ default: "" }) eodTime: string;
  @Prop({ default: "" }) lastEodDate: string;
}
export type ProdSettingsDocument = ProdSettings & Document;
export const ProdSettingsSchema = SchemaFactory.createForClass(ProdSettings);

/** Metadata for a privately stored scale/evidence photo. Movements and entries reference `key`. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ProdEvidence {
  @Prop(OID("Store", { required: true, index: true })) store: Types.ObjectId;
  @Prop({ required: true, unique: true }) key: string;
  @Prop() format?: string;
  @Prop({ required: true }) mime: string;
  @Prop({ required: true }) size: number;
  @Prop({ required: true }) checksum: string;
  @Prop(OID("AdminUser")) uploader?: Types.ObjectId;
  @Prop() uploaderName?: string;
  @Prop({ type: Date, default: Date.now }) capturedAt: Date;
}
export type ProdEvidenceDocument = ProdEvidence & Document;
export const ProdEvidenceSchema = SchemaFactory.createForClass(ProdEvidence);
