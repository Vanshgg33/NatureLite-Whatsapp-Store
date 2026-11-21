import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** One per caller per IST day: check-in, breaks, presence and the live call (Caller Command Center). */
@Schema({ timestamps: true })
export class CrmCallerShift {
  @Prop({ type: Types.ObjectId, ref: 'AdminUser', required: true }) callerId: Types.ObjectId;
  @Prop({ default: 'Caller' }) callerName: string;
  @Prop({ required: true }) date: string; // IST YYYY-MM-DD
  @Prop({ required: true }) startedAt: Date;
  @Prop({ default: null }) endedAt: Date | null;
  @Prop({ type: [{ start: Date, end: Date, reason: String }], default: [] })
  breaks: { start: Date; end?: Date | null; reason: string }[];
  @Prop({ enum: ['active', 'break', 'ended'], default: 'active' }) status: 'active' | 'break' | 'ended';
  /** what the caller is doing inside an active shift */
  @Prop({ enum: ['ready', 'on_call', 'wrap_up'], default: 'ready' }) activity: 'ready' | 'on_call' | 'wrap_up';
  @Prop({ default: null }) lastHeartbeat: Date | null;
  /** last real action (call, disposition, WhatsApp, mode change): drives the idle detector */
  @Prop({ default: null }) lastActionAt: Date | null;
  @Prop({ default: 'power_hour' }) currentMode: string;
  @Prop({ default: null }) forcedMode: string | null;
  @Prop({ default: null }) forcedUntil: Date | null;
  @Prop({ default: null }) modeStartedAt: Date | null;
  @Prop({ type: Object, default: null })
  onCall: { customerId: Types.ObjectId; name: string; startedAt: Date; endedAt?: Date | null; assignmentId?: Types.ObjectId | null } | null;
  @Prop({ type: Object, default: null })
  duel: { rivalId: Types.ObjectId; startedAt: Date; endsAt: Date } | null;
}
export const CrmCallerShiftSchema = SchemaFactory.createForClass(CrmCallerShift);
CrmCallerShiftSchema.index({ callerId: 1, date: 1 }, { unique: true });
CrmCallerShiftSchema.index({ date: 1, status: 1 });

export const ASSIGNMENT_STATES = ['untouched', 'in_progress', 'retry', 'done', 'parked', 'rolled'] as const;
export const ASSIGNMENT_SOURCES = ['callback', 'overdue', 'due', 'new', 'at_risk', 'dormant', 'retry'] as const;

/** One per customer per IST day: who calls them today, why, and where they are in the day. */
@Schema({ timestamps: true })
export class CrmLeadAssignment {
  @Prop({ required: true }) date: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) customerId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'AdminUser', required: true }) callerId: Types.ObjectId;
  @Prop({ default: 0 }) score: number;
  @Prop({ type: [String], default: [] }) reasons: string[];
  @Prop({ enum: ASSIGNMENT_SOURCES, default: 'due' }) source: string;
  @Prop({ enum: ASSIGNMENT_STATES, default: 'untouched' }) state: string;
  @Prop({ default: 0 }) attempts: number; // dials today
  @Prop({ default: null }) lastAttemptAt: Date | null;
  @Prop({ default: null }) lastOutcome: string | null;
  /** callback time / same-day retry time; null = callable now */
  @Prop({ default: null }) dueAt: Date | null;
  @Prop({ default: null }) arrivedAt: Date | null; // new leads: customer created at
  @Prop({ default: '' }) skippedReason: string;
  @Prop({ default: '' }) parkedReason: string;
  @Prop({ default: 0 }) rolloverCount: number;
  @Prop({ enum: ['morning', 'afternoon', 'evening', null], default: null }) bestSlot: string | null;
  @Prop({ default: null }) waSentAt: Date | null; // WhatsApp warm-up
  @Prop({ default: false }) waReplied: boolean;
  @Prop({ default: null }) claimedAt: Date | null;
}
export const CrmLeadAssignmentSchema = SchemaFactory.createForClass(CrmLeadAssignment);
CrmLeadAssignmentSchema.index({ date: 1, customerId: 1 }, { unique: true });
CrmLeadAssignmentSchema.index({ date: 1, callerId: 1, state: 1, score: -1 });

export const REMINDER_TYPES = ['callback', 'followup', 'repurchase', 'retry', 'manual', 'system'] as const;

/** Anything that must happen at a time: callback promises, follow-ups, manual "remind me", system alerts. */
@Schema({ timestamps: true })
export class CrmReminder {
  @Prop({ enum: REMINDER_TYPES, required: true }) type: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) customerId: Types.ObjectId | null;
  /** null = for managers (system alerts) */
  @Prop({ type: Types.ObjectId, ref: 'AdminUser', default: null }) callerId: Types.ObjectId | null;
  @Prop({ required: true }) dueAt: Date;
  @Prop({ enum: ['pending', 'fired', 'done', 'missed'], default: 'pending' }) status: string;
  @Prop({ default: '' }) text: string;
  @Prop({ default: 0 }) snoozeCount: number;
  @Prop({ default: null }) firedAt: Date | null;
  @Prop({ default: null }) escalatedAt: Date | null;
  @Prop({ default: null }) doneAt: Date | null;
  /** callbacks: was the customer called within the grace window */
  @Prop({ default: null }) keptOnTime: boolean | null;
  @Prop({ type: Types.ObjectId, default: null }) createdBy: Types.ObjectId | null;
  /** de-duplicates system alerts (e.g. "idle:<caller>:<hour>") */
  @Prop() key?: string;
}
export const CrmReminderSchema = SchemaFactory.createForClass(CrmReminder);
CrmReminderSchema.index({ status: 1, dueAt: 1 });
CrmReminderSchema.index({ callerId: 1, status: 1, dueAt: 1 });
CrmReminderSchema.index({ customerId: 1, status: 1 });
CrmReminderSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } });
