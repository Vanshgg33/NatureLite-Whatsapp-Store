// Caller Command Center: shifts and presence, daily lead distribution, the atomic call queue, dispositions
// through the attempt ladder, reminders with escalation, live board numbers and the day-close report.
// Decisions live in engine/caller-logic.ts (pure, unit-tested); this file only reads and writes.
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { CrmService } from './crm.service';
import { CrmCustomerStats } from './schemas/crm-customer-stats.schema';
import { CrmCallLog } from './schemas/crm-call-log.schema';
import { CrmSettings } from './schemas/crm-settings.schema';
import { CrmCallerShift, CrmLeadAssignment, CrmReminder } from './schemas/crm-caller.schemas';
import { Complaint } from '../complaints/schemas/complaint.schema';
import { AuditLog } from '../audit/schemas/audit-log.schema';
import { CrmActivityEvent } from './schemas/crm-activity-event.schema';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import {
  CALL_OUTCOMES, CALLER_MODES, LadderError, computePoints, dealLeads, istAt, istHour, istKey, istMinutes,
  isConnected, isNoAnswer, leadScore, mergeCallerConfig, modeByKey, modeOpen, planNextAction, slotOf,
  withinCallingHours, type CallerConfig,
} from './engine/caller-logic';

const oid = (v: unknown) => {
  if (!Types.ObjectId.isValid(String(v))) throw new BadRequestException('Invalid id');
  return new Types.ObjectId(String(v));
};
const OPEN = ['untouched', 'in_progress', 'retry'];
const OPEN_COMPLAINT = ['new', 'investigating', 'awaiting_customer', 'reopened'];
const DEFAULT_WA = {
  missed_you: 'Hi {name}, we tried calling you from NatureLite Foods. Reply here or call us back whenever it suits you.',
  catalogue: 'Hi {name}, thanks for speaking with NatureLite Foods! Reply "MENU" to see our wood-pressed oils, ghee and flours.',
  thank_you: 'Thank you for your order, {name}! We will keep you posted on delivery. – NatureLite Foods',
  refill: 'Hi {name}, your NatureLite refill may be due. Reply "REORDER" and we will send the same items again.',
  warmup: 'Hi {name}, it has been a while! Fresh wood-pressed oils and A2 ghee are in stock at NatureLite Foods. Reply to know today\'s offer.',
};
// the Mongo filter builder stays on the server
const publicMode = ({ filter: _f, ...m }: (typeof CALLER_MODES)[number]) => m;
export const isManager = (u: JwtPayload) => u.role === 'superadmin' || !['crm_senior', 'crm_viewer'].includes(u.departmentType ?? '');

@Injectable()
export class CrmCallerService {
  private readonly logger = new Logger(CrmCallerService.name);
  private ticking = false;

  constructor(
    @InjectModel(CrmCallerShift.name) private shiftModel: Model<any>,
    @InjectModel(CrmLeadAssignment.name) private asgModel: Model<any>,
    @InjectModel(CrmReminder.name) private remModel: Model<any>,
    @InjectModel(CrmCustomerStats.name) private statsModel: Model<any>,
    @InjectModel(CrmCallLog.name) private callModel: Model<any>,
    @InjectModel(CrmSettings.name) private settingsModel: Model<any>,
    @InjectModel(Complaint.name) private complaintModel: Model<any>,
    @InjectModel(AuditLog.name) private auditModel: Model<any>,
    @InjectModel(CrmActivityEvent.name) private activityModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('AdminUser') private adminModel: Model<any>,
    @InjectModel('Cart') private cartModel: Model<any>,
    @InjectModel('MessageLog') private msgModel: Model<any>,
    private readonly crm: CrmService,
  ) {}

  // ─── shared helpers ────────────────────────────────────────────────────────

  async config(): Promise<CallerConfig & { waTemplates: Record<string, string> }> {
    const s = await this.settingsModel.findOne().select('caller waTemplates').lean<any>();
    return { ...mergeCallerConfig(s?.caller), waTemplates: { ...DEFAULT_WA, ...(s?.waTemplates ?? {}) } };
  }

  async saveConfig(body: unknown, user: JwtPayload) {
    const caller = mergeCallerConfig(body); // sanitised: unknown keys dropped, ranges clamped
    await this.settingsModel.updateOne({}, { $set: { caller } }, { upsert: true });
    this.audit(user, 'crm.caller.settings', 'Caller settings updated', { caller });
    return caller;
  }

  private audit(user: JwtPayload, action: string, description: string, newValues?: Record<string, unknown>, targetId?: Types.ObjectId) {
    this.auditModel.create({ action, performedBy: String(user.sub), performedByName: user.name ?? '', description, newValues, targetId, targetModel: 'CrmCaller' })
      .catch((e: Error) => this.logger.warn(`audit failed: ${e.message}`));
  }

  private shiftOf(callerId: string | Types.ObjectId, date = istKey()) {
    return this.shiftModel.findOne({ callerId: oid(callerId), date });
  }

  private presence(shift: any, cfg: CallerConfig, now = new Date()): string {
    if (!shift || shift.status === 'ended') return 'offline';
    if (!shift.lastHeartbeat || +now - +shift.lastHeartbeat > 60_000) return 'offline';
    if (shift.status === 'break') return 'break';
    if (shift.activity === 'on_call') return 'on_call';
    if (shift.activity === 'wrap_up') return 'wrap_up';
    if (shift.lastActionAt && +now - +shift.lastActionAt > cfg.idleAlertMin * 60_000) return 'idle';
    return 'ready';
  }

  private activeMode(shift: any, now = new Date()): string {
    if (shift?.forcedMode && (!shift.forcedUntil || +shift.forcedUntil > +now)) return shift.forcedMode;
    return shift?.currentMode ?? 'power_hour';
  }

  // ─── Shifts & presence ─────────────────────────────────────────────────────

  async myShift(user: JwtPayload) {
    const [shift, cfg] = await Promise.all([this.shiftOf(user.sub).lean<any>(), this.config()]);
    return {
      shift,
      presence: this.presence(shift, cfg),
      mode: this.activeMode(shift),
      forced: !!(shift?.forcedMode && (!shift.forcedUntil || +shift.forcedUntil > Date.now())),
      modes: CALLER_MODES.map((m) => ({ ...publicMode(m), open: modeOpen(m, new Date()) })),
      config: { ...cfg },
    };
  }

  async shiftAction(user: JwtPayload, action: string, reason = '') {
    const now = new Date();
    const date = istKey(now);
    const callerId = oid(user.sub);
    const shift = await this.shiftModel.findOne({ callerId, date });
    if (action === 'start') {
      if (shift && shift.status !== 'ended') return this.myShift(user);
      await this.shiftModel.updateOne(
        { callerId, date },
        { $set: { status: 'active', endedAt: null, activity: 'ready', lastHeartbeat: now, lastActionAt: now, callerName: user.name ?? 'Caller', modeStartedAt: now },
          $setOnInsert: { startedAt: now } },
        { upsert: true },
      );
      this.crm.logActivity(user.sub, user.name ?? 'Caller', 'shift_start');
      // first caller in builds today's list; later callers get an even share of what nobody has touched yet
      const already = await this.asgModel.countDocuments({ date, state: { $ne: 'rolled' } });
      await this.distribute(already ? 'rebalance' : 'fresh', user, false).catch((e) => this.logger.warn(`auto-distribute: ${e.message}`));
      return this.myShift(user);
    }
    if (!shift || shift.status === 'ended') throw new BadRequestException('Start your shift first');
    if (shift.onCall && action !== 'resume') throw new ConflictException('Finish the current call first');
    if (action === 'break') {
      if (shift.status === 'break') return this.myShift(user);
      shift.status = 'break';
      shift.breaks.push({ start: now, end: null, reason: String(reason || 'Break').slice(0, 40) });
      await shift.save();
      await this.releaseClaimed(user.sub);
      this.crm.logActivity(user.sub, user.name ?? 'Caller', 'shift_break');
    } else if (action === 'resume') {
      if (shift.status !== 'break') return this.myShift(user);
      const open = shift.breaks.find((b: any) => !b.end);
      if (open) open.end = now;
      shift.markModified('breaks');
      shift.status = 'active';
      shift.lastActionAt = now;
      await shift.save();
      this.crm.logActivity(user.sub, user.name ?? 'Caller', 'shift_resume');
    } else if (action === 'end') {
      const open = shift.breaks.find((b: any) => !b.end);
      if (open) { open.end = now; shift.markModified('breaks'); }
      shift.status = 'ended';
      shift.endedAt = now;
      await shift.save();
      await this.releaseClaimed(user.sub);
      this.crm.logActivity(user.sub, user.name ?? 'Caller', 'shift_end');
      return { ...(await this.myShift(user)), summary: (await this.report(user, date, user.sub)).callers[0] ?? null };
    } else throw new BadRequestException('Unknown shift action');
    return this.myShift(user);
  }

  /** every 20 s from the cockpit; `interacted` = the caller touched the page since the last beat */
  async heartbeat(user: JwtPayload, interacted: boolean) {
    const now = new Date();
    const $set: any = { lastHeartbeat: now };
    if (interacted) $set.lastActionAt = now;
    const s = await this.shiftModel.findOneAndUpdate({ callerId: oid(user.sub), date: istKey(now), status: { $ne: 'ended' } }, { $set }, { new: true }).lean<any>();
    const cfg = await this.config();
    return { presence: this.presence(s, cfg, now), mode: this.activeMode(s, now) };
  }

  async setMode(user: JwtPayload, mode: string) {
    if (!CALLER_MODES.some((m) => m.key === mode)) throw new BadRequestException('Unknown mode');
    const s = await this.shiftOf(user.sub);
    if (!s || s.status === 'ended') throw new BadRequestException('Start your shift first');
    if (s.forcedMode && (!s.forcedUntil || +s.forcedUntil > Date.now())) throw new ForbiddenException('Your manager has set your mode');
    s.currentMode = mode;
    s.modeStartedAt = new Date();
    s.lastActionAt = new Date();
    await s.save();
    await this.releaseClaimed(user.sub);
    return this.myShift(user);
  }

  private releaseClaimed(callerId: string) {
    return this.asgModel.updateMany({ date: istKey(), callerId: oid(callerId), state: 'in_progress' }, { $set: { state: 'untouched', claimedAt: null } });
  }

  // ─── Distribution ──────────────────────────────────────────────────────────

  private async workingCallers(date: string) {
    const shifts = await this.shiftModel.find({ date, status: { $in: ['active', 'break'] } }).select('callerId').lean<any[]>();
    return shifts.map((s) => String(s.callerId));
  }

  /** today's workable customers, scored, with stickiness and best contact slot */
  private async buildPool(cfg: CallerConfig, now: Date, exclude: Set<string>, limit: number, rollover: Map<string, number>) {
    const endOfDay = istAt(now, 0, '23:59');
    const since24h = new Date(+now - 86_400_000);
    const complaints = await this.complaintModel.distinct('customerId', { status: { $in: OPEN_COMPLAINT } });
    const newUserIds = (await this.userModel.find({ createdAt: { $gte: since24h } }).select('_id').limit(500).lean<any[]>()).map((u) => u._id);
    const stats = await this.statsModel.find({
      isDismissed: { $ne: true }, phoneInvalid: { $ne: true }, doNotCall: { $ne: true },
      snoozedUntil: { $not: { $gt: now } },
      userId: { $nin: complaints },
      $or: [
        { segment: { $in: ['overdue', 'due_today', 'at_risk', 'dormant', 'Overdue', 'At Risk', 'Dormant'] } },
        { callbackAt: { $ne: null, $lte: endOfDay } },
        { userId: { $in: newUserIds } },
        { userId: { $in: [...rollover.keys()].map((id) => new Types.ObjectId(id)) } },
      ],
    }).select('userId segment ltvPct callbackAt consecutiveNoAnswer lastCallOutcome lastCallAt').limit(5000).lean<any[]>();
    const rows = stats.filter((s) => !exclude.has(String(s.userId)));
    if (!rows.length) return [];
    const ids = rows.map((s) => s.userId);

    const [users, carts, recentCalls] = await Promise.all([
      this.userModel.find({ _id: { $in: ids } }).select('phone createdAt').lean<any[]>(),
      this.cartModel.find({ user: { $in: ids }, 'items.0': { $exists: true }, updatedAt: { $gte: new Date(+now - 7 * 86_400_000) } }).select('user').lean<any[]>(),
      this.callModel.aggregate([
        { $match: { customerId: { $in: ids }, type: { $ne: 'whatsapp' }, createdAt: { $gte: new Date(+now - 90 * 86_400_000) } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$customerId', calls: { $push: { a: '$agentId', o: '$outcome', t: '$createdAt' } } } },
      ]),
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const phones = users.map((u) => u.phone).filter(Boolean);
    const engaged = new Set<string>(phones.length ? await this.msgModel.distinct('phone', { phone: { $in: phones }, direction: 'inbound', createdAt: { $gte: new Date(+now - 3 * 86_400_000) } }) : []);
    const cartSet = new Set(carts.map((c) => String(c.user)));
    const callMap = new Map(recentCalls.map((c: any) => [String(c._id), c.calls as { a: Types.ObjectId; o: string; t: Date }[]]));

    const out: { id: string; score: number; reasons: string[]; source: string; sticky: string | null; bestSlot: string | null; arrivedAt: Date | null; dueAt: Date | null; rolloverCount: number }[] = [];
    for (const s of rows) {
      const id = String(s.userId);
      const u = userMap.get(id);
      if (!u?.phone) continue;
      const seg = String(s.segment ?? '').toLowerCase().replace(' ', '_');
      const isNew = !!u.createdAt && +u.createdAt >= +since24h;
      const callbackDue = !!s.callbackAt && +s.callbackAt <= +endOfDay;
      const roll = rollover.get(id) ?? 0;
      const sc = leadScore({
        callbackDue, repurchaseOverdue: seg === 'overdue' || seg === 'due_today', abandonedOrEnquiry: cartSet.has(id), isNew,
        waEngaged: engaged.has(u.phone), highValue: (s.ltvPct ?? 0) >= 0.8, atRisk: seg === 'at_risk',
        failedInRow: s.consecutiveNoAnswer ?? 0,
        notInterestedRecently: s.lastCallOutcome === 'not_interested' && !!s.lastCallAt && +now - +s.lastCallAt < 60 * 86_400_000,
        rolloverCount: roll,
      }, cfg.weights);
      if (!sc) continue;
      const calls = callMap.get(id) ?? [];
      const spoke = calls.find((c) => isConnected(c.o) && +now - +c.t <= 30 * 86_400_000);
      const slots: Record<string, number> = {};
      calls.filter((c) => isConnected(c.o)).forEach((c) => { const k = slotOf(new Date(c.t)); slots[k] = (slots[k] ?? 0) + 1; });
      const bestSlot = Object.entries(slots).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      // callbacks stay with whoever promised them
      const promisedBy = callbackDue ? calls.find((c) => c.o === 'callback')?.a : null;
      const source = callbackDue ? 'callback' : seg === 'overdue' ? 'overdue' : seg === 'due_today' ? 'due' : isNew ? 'new' : seg === 'at_risk' ? 'at_risk' : seg === 'dormant' ? 'dormant' : 'retry';
      out.push({
        id, score: sc.score, reasons: sc.reasons, source,
        sticky: promisedBy ? String(promisedBy) : spoke ? String(spoke.a) : null,
        bestSlot, arrivedAt: isNew ? u.createdAt : null,
        dueAt: callbackDue && +s.callbackAt > +now ? s.callbackAt : null,
        rolloverCount: roll,
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** fresh: roll yesterday over and build today's lists; rebalance: re-deal untouched leads across everyone checked in */
  async distribute(mode: 'fresh' | 'rebalance', user: JwtPayload, dryRun: boolean) {
    const now = new Date();
    const date = istKey(now);
    const cfg = await this.config();
    const callers = await this.workingCallers(date);
    if (!callers.length) throw new BadRequestException('No caller has started a shift today');

    // roll over anything unworked from earlier days (+score)
    const rollover = new Map<string, number>();
    const stale = await this.asgModel.find({ date: { $lt: date }, state: { $in: OPEN } }).select('customerId rolloverCount').lean<any[]>();
    stale.forEach((a) => rollover.set(String(a.customerId), Math.max(rollover.get(String(a.customerId)) ?? 0, (a.rolloverCount ?? 0) + 1)));

    const todays = await this.asgModel.find({ date }).select('customerId callerId state source score').lean<any[]>();
    const taken = new Set(todays.map((a) => String(a.customerId)));
    const room = Math.max(0, cfg.leadsPerCaller * callers.length - todays.filter((a) => a.state !== 'rolled').length);
    const pool = await this.buildPool(cfg, now, taken, room, rollover);

    // rebalance moves only untouched, non-callback leads; attempted leads stay with their caller
    const movable = mode === 'rebalance' ? todays.filter((a) => a.state === 'untouched' && a.source !== 'callback') : [];
    const deal = dealLeads(
      [...movable.map((a) => ({ id: `a:${a._id}`, score: a.score ?? 0 })), ...pool.map((p) => ({ id: `p:${p.id}`, score: p.score, stickyCallerId: p.sticky && callers.includes(p.sticky) ? p.sticky : null }))],
      callers.map((id) => ({ id })),
    );
    const perCaller: Record<string, number> = Object.fromEntries(callers.map((c) => [c, 0]));
    deal.forEach((c) => { perCaller[c] = (perCaller[c] ?? 0) + 1; });
    const preview = { mode, callers: callers.length, poolSize: pool.length, moved: movable.length, perCaller, alreadyAssigned: todays.length };
    if (dryRun) return { ...preview, dryRun: true };

    if (stale.length) await this.asgModel.updateMany({ date: { $lt: date }, state: { $in: OPEN } }, { $set: { state: 'rolled' } });
    const moves = movable.filter((a) => deal.get(`a:${a._id}`) && deal.get(`a:${a._id}`) !== String(a.callerId));
    if (moves.length) {
      await this.asgModel.bulkWrite(moves.map((a) => ({
        updateOne: { filter: { _id: a._id, state: 'untouched' }, update: { $set: { callerId: new Types.ObjectId(deal.get(`a:${a._id}`)!) } } },
      })));
    }
    const docs = pool.filter((p) => deal.has(`p:${p.id}`)).map((p) => ({
      date, customerId: new Types.ObjectId(p.id), callerId: new Types.ObjectId(deal.get(`p:${p.id}`)!),
      score: p.score, reasons: p.reasons, source: p.source, state: p.dueAt ? 'retry' : 'untouched', dueAt: p.dueAt,
      arrivedAt: p.arrivedAt, bestSlot: p.bestSlot, rolloverCount: p.rolloverCount,
    }));
    let inserted = 0;
    if (docs.length) {
      // unique (date, customerId): a concurrent distribute can never give one customer to two callers
      const res = await this.asgModel.insertMany(docs, { ordered: false }).catch((e: any) => e?.insertedDocs ?? e?.result?.insertedIds ?? []);
      inserted = Array.isArray(res) ? res.length : Object.keys(res ?? {}).length;
    }
    this.audit(user, `crm.caller.distribute.${mode}`, `Distributed ${inserted} new and moved ${moves.length} leads across ${callers.length} callers`, preview);
    return { ...preview, inserted, movedApplied: moves.length };
  }

  /** caller finished most of their list: take N untouched leads from the tail of the busiest colleague */
  async pullMore(user: JwtPayload, forCallerId?: string, n = 25) {
    const date = istKey();
    const me = oid(forCallerId ?? user.sub);
    const busiest = await this.asgModel.aggregate([
      { $match: { date, state: 'untouched', callerId: { $ne: me }, source: { $ne: 'callback' } } },
      { $group: { _id: '$callerId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 },
    ]);
    if (!busiest.length) {
      const r = await this.distribute('rebalance', user, false).catch(() => null);
      return { moved: 0, topUp: r?.inserted ?? 0 };
    }
    const tail = await this.asgModel.find({ date, state: 'untouched', callerId: busiest[0]._id, source: { $ne: 'callback' } })
      .sort({ score: 1 }).limit(Math.min(100, Math.max(1, n))).select('_id').lean<any[]>();
    const r = await this.asgModel.updateMany({ _id: { $in: tail.map((t) => t._id) }, state: 'untouched' }, { $set: { callerId: me } });
    this.audit(user, 'crm.caller.pull_more', `Pulled ${r.modifiedCount} leads`, { from: String(busiest[0]._id), to: String(me) });
    return { moved: r.modifiedCount, from: String(busiest[0]._id) };
  }

  /** manager: a caller left early / went offline: spread their open leads (callbacks too) over the others */
  async reassign(user: JwtPayload, fromCallerId: string) {
    const date = istKey();
    const from = oid(fromCallerId);
    const others = (await this.workingCallers(date)).filter((c) => c !== String(from));
    if (!others.length) throw new BadRequestException('No other caller is on shift');
    const open = await this.asgModel.find({ date, callerId: from, state: { $in: ['untouched', 'retry'] } }).select('_id score').lean<any[]>();
    const deal = dealLeads(open.map((a) => ({ id: String(a._id), score: a.score ?? 0 })), others.map((id) => ({ id })));
    if (deal.size) {
      await this.asgModel.bulkWrite([...deal].map(([aid, cid]) => ({
        updateOne: { filter: { _id: new Types.ObjectId(aid), callerId: from }, update: { $set: { callerId: new Types.ObjectId(cid) } } },
      })));
    }
    // move the reminders with the customer
    for (const [aid, cid] of deal) {
      const a = open.find((x) => String(x._id) === aid);
      if (!a) continue;
      const asg = await this.asgModel.findById(aid).select('customerId').lean<any>();
      await this.remModel.updateMany({ callerId: from, customerId: asg?.customerId, status: { $in: ['pending', 'fired'] } }, { $set: { callerId: new Types.ObjectId(cid) } });
    }
    this.audit(user, 'crm.caller.reassign', `Reassigned ${deal.size} leads`, { from: String(from), to: others }, from);
    return { moved: deal.size };
  }

  // ─── Queue ─────────────────────────────────────────────────────────────────

  private async hydrate(a: any) {
    const [u, stats, calls, reminders] = await Promise.all([
      this.userModel.findById(a.customerId).select('name phone tags createdAt').lean<any>(),
      this.statsModel.findOne({ userId: a.customerId }).lean<any>(),
      this.callModel.find({ customerId: a.customerId }).sort({ createdAt: -1 }).limit(8).populate('agentId', 'name').lean<any[]>(),
      this.remModel.find({ customerId: a.customerId, status: { $in: ['pending', 'fired'] } }).sort({ dueAt: 1 }).lean<any[]>(),
    ]);
    return {
      ...(stats ?? {}),
      assignment: a,
      userId: String(a.customerId),
      user: u,
      _id: stats?._id ?? a._id,
      orderCount: stats?.validOrders ?? 0,
      history: calls,
      reminders,
    };
  }

  private async counts(callerId: Types.ObjectId | Types.ObjectId[], date: string) {
    const match: any = { date, state: { $ne: 'rolled' }, callerId: Array.isArray(callerId) ? { $in: callerId } : callerId };
    const rows = await this.asgModel.aggregate([{ $match: match }, { $group: { _id: '$state', n: { $sum: 1 } } }]);
    const c = Object.fromEntries(rows.map((r: any) => [r._id, r.n]));
    const assigned = rows.reduce((s: number, r: any) => s + r.n, 0);
    const remaining = (c.untouched ?? 0) + (c.in_progress ?? 0) + (c.retry ?? 0);
    return { assigned, remaining, done: assigned - remaining, untouched: c.untouched ?? 0, parked: c.parked ?? 0 };
  }

  /** the next lead for this caller in this mode, claimed atomically so two callers never get the same customer */
  async next(user: JwtPayload, requestedMode?: string) {
    const now = new Date();
    const date = istKey(now);
    const cfg = await this.config();
    const shift = await this.shiftOf(user.sub).lean<any>();
    if (!shift || shift.status === 'ended') return { lead: null, reason: 'no_shift', counts: await this.counts(oid(user.sub), date) };
    if (shift.status === 'break') return { lead: null, reason: 'on_break', counts: await this.counts(oid(user.sub), date) };
    const modeKey = shift.forcedMode && (!shift.forcedUntil || +shift.forcedUntil > +now) ? shift.forcedMode : (requestedMode ?? shift.currentMode);
    const mode = modeByKey(modeKey);
    const me = oid(user.sub);
    const pool = mode.shared && shift.duel?.rivalId ? [me, shift.duel.rivalId] : [me];
    const counts = await this.counts(pool.length > 1 ? pool : me, date);

    // a lead already claimed (page reload, back from a break) comes back first
    const mine = await this.asgModel.findOne({ date, callerId: me, state: 'in_progress' }).lean<any>();
    if (mine) return { lead: await this.hydrate(mine), mode: mode.key, counts };
    if (!modeOpen(mode, now)) return { lead: null, reason: 'mode_closed', mode: mode.key, counts };

    if (mode.key === 'wa_warmup') await this.refreshWarmupReplies(me, date);
    const base = { date, callerId: pool.length > 1 ? { $in: pool } : me, $or: [{ state: 'untouched' }, { state: 'retry', $or: [{ dueAt: null }, { dueAt: { $lte: now } }] }] };
    // the mode's own order first (cleanup = lowest score first), then best score, then stable
    const sort: Record<string, 1 | -1> = { ...mode.sort };
    if (!('score' in sort)) sort.score = -1;
    sort._id = 1;
    const claimed = await this.asgModel.findOneAndUpdate(
      { $and: [base, mode.filter({ now, cfg })] },
      { $set: { state: 'in_progress', claimedAt: now, callerId: me } },
      { sort, new: true },
    ).lean<any>();
    if (!claimed) {
      const later = await this.asgModel.findOne({ date, callerId: me, state: 'retry', dueAt: { $gt: now } }).sort({ dueAt: 1 }).select('dueAt').lean<any>();
      return { lead: null, reason: counts.remaining ? 'mode_empty' : 'list_done', nextDueAt: later?.dueAt ?? null, mode: mode.key, counts };
    }
    return { lead: await this.hydrate(claimed), mode: mode.key, counts };
  }

  async skip(user: JwtPayload, assignmentId: string, reason: string) {
    const r = String(reason ?? '').trim().slice(0, 80);
    if (!r) throw new BadRequestException('Pick a reason to skip');
    const a = await this.asgModel.findOneAndUpdate(
      { _id: oid(assignmentId), callerId: oid(user.sub), state: 'in_progress' },
      { $set: { state: 'retry', dueAt: new Date(Date.now() + 60 * 60_000), skippedReason: r, claimedAt: null } },
      { new: true },
    ).lean<any>();
    if (!a) throw new NotFoundException('Lead not found in your list');
    this.crm.logActivity(user.sub, user.name ?? 'Caller', 'skip', String(a.customerId));
    await this.shiftModel.updateOne({ callerId: oid(user.sub), date: istKey() }, { $set: { lastActionAt: new Date() } });
    return { ok: true };
  }

  private async refreshWarmupReplies(me: Types.ObjectId, date: string) {
    const sent = await this.asgModel.find({ date, callerId: me, waSentAt: { $ne: null }, waReplied: false, state: { $in: OPEN } }).select('customerId waSentAt').lean<any[]>();
    if (!sent.length) return;
    const users = await this.userModel.find({ _id: { $in: sent.map((s) => s.customerId) } }).select('phone').lean<any[]>();
    const phoneOf = new Map(users.map((u) => [String(u._id), u.phone]));
    const earliest = new Date(Math.min(...sent.map((s) => +s.waSentAt)));
    const replies = await this.msgModel.find({ phone: { $in: users.map((u) => u.phone) }, direction: 'inbound', createdAt: { $gte: earliest } }).select('phone createdAt').lean<any[]>();
    const replied = sent.filter((s) => replies.some((m) => m.phone === phoneOf.get(String(s.customerId)) && +m.createdAt >= +s.waSentAt));
    if (replied.length) await this.asgModel.updateMany({ _id: { $in: replied.map((r) => r._id) } }, { $set: { waReplied: true }, $inc: { score: 20 } });
  }

  /** WhatsApp Warm-up step 1: message up to 20 of my cold leads, then call whoever replies first */
  async warmup(user: JwtPayload) {
    const date = istKey();
    const cfg = await this.config();
    const batch = await this.asgModel.find({ date, callerId: oid(user.sub), state: 'untouched', waSentAt: null, ...modeByKey('wa_warmup').filter({ now: new Date(), cfg }) })
      .sort({ score: -1 }).limit(20).lean<any[]>();
    let sent = 0;
    const failed: string[] = [];
    for (const a of batch) {
      const u = await this.userModel.findById(a.customerId).select('name').lean<any>();
      const message = this.fill(cfg.waTemplates.warmup, u?.name);
      try {
        await this.crm.logNudge({ customerId: String(a.customerId), agentId: user.sub, agentName: user.name, templateName: 'warmup', message });
        await this.asgModel.updateOne({ _id: a._id }, { $set: { waSentAt: new Date() } });
        sent++;
      } catch (e: any) { failed.push(u?.name || String(a.customerId)); }
    }
    return { sent, failed, batch: batch.length };
  }

  private fill(tpl: string, name?: string) {
    return String(tpl).replace(/\{name\}/g, (name || '').split(' ')[0] || 'there');
  }

  // ─── Calls ─────────────────────────────────────────────────────────────────

  async startCall(user: JwtPayload, body: { customerId?: string }) {
    const now = new Date();
    const cfg = await this.config();
    const customerId = oid(body.customerId);
    const shift = await this.shiftOf(user.sub);
    if (!shift || shift.status === 'ended') throw new BadRequestException('Start your shift first');
    if (shift.status === 'break') throw new BadRequestException('You are on a break. Resume to call');
    if (shift.onCall && String(shift.onCall.customerId) !== String(customerId)) throw new ConflictException('Finish the current call first');
    if (shift.onCall) return { startedAt: shift.onCall.startedAt, resumed: true };
    if (!withinCallingHours(now, cfg)) throw new BadRequestException(`Calls are allowed ${cfg.callingHours.from}:00–${cfg.callingHours.to}:00 IST`);
    const [stats, user0, dialsToday] = await Promise.all([
      this.statsModel.findOne({ userId: customerId }).select('doNotCall phoneInvalid').lean<any>(),
      this.userModel.findById(customerId).select('name phone').lean<any>(),
      this.callModel.countDocuments({ customerId, istDate: istKey(now), type: { $ne: 'whatsapp' }, outcome: { $ne: 'unlogged' } }),
    ]);
    if (!user0) throw new NotFoundException('Customer not found');
    if (stats?.doNotCall) throw new BadRequestException('This customer asked not to be called');
    if (stats?.phoneInvalid || !user0.phone) throw new BadRequestException('This number is marked wrong / missing');
    if (dialsToday >= cfg.maxDialsPerDay) throw new BadRequestException(`Already called ${dialsToday} times today (limit ${cfg.maxDialsPerDay})`);
    const asg = await this.asgModel.findOne({ date: istKey(now), customerId }).select('_id').lean<any>();
    shift.onCall = { customerId, name: user0.name || user0.phone, startedAt: now, endedAt: null, assignmentId: asg?._id ?? null };
    shift.activity = 'on_call';
    shift.lastActionAt = now;
    shift.markModified('onCall');
    await shift.save();
    this.crm.logActivity(user.sub, user.name ?? 'Caller', 'call_start', String(customerId));
    return { startedAt: now, dialsToday };
  }

  async hangup(user: JwtPayload) {
    const shift = await this.shiftOf(user.sub);
    if (!shift?.onCall) throw new BadRequestException('No call in progress');
    if (!shift.onCall.endedAt) {
      shift.onCall = { ...shift.onCall, endedAt: new Date() };
      shift.activity = 'wrap_up';
      shift.markModified('onCall');
      await shift.save();
    }
    return { endedAt: shift.onCall.endedAt };
  }

  /** Every call ends here, from the cockpit (timed) or from the queue / profile panel (untimed). */
  async logDisposition(user: JwtPayload, body: { customerId?: string; outcome?: string; notes?: string; callbackAt?: string; reason?: string }) {
    const now = new Date();
    const outcome = String(body.outcome ?? '');
    if (!(CALL_OUTCOMES as readonly string[]).includes(outcome)) throw new BadRequestException('Pick an outcome');
    const customerId = oid(body.customerId);
    const cfg = await this.config();
    const [stats, recent, shift, cust] = await Promise.all([
      this.statsModel.findOne({ userId: customerId }).select('consecutiveNoAnswer callAttempts').lean<any>(),
      this.callModel.find({ customerId, type: { $ne: 'whatsapp' } }).sort({ createdAt: -1 }).limit(5).select('outcome').lean<any[]>(),
      this.shiftOf(user.sub),
      this.userModel.findById(customerId).select('name phone').lean<any>(),
    ]);
    if (!cust) throw new NotFoundException('Customer not found');
    const noAnswerInRow = isNoAnswer(outcome) ? (stats?.consecutiveNoAnswer ?? 0) + 1 : 0;
    let interestedInRow = 1;
    for (const r of recent) { if (r.outcome === 'interested') interestedInRow++; else break; }
    const callbackAt = body.callbackAt ? new Date(body.callbackAt) : null;
    let plan;
    try { plan = planNextAction(outcome, { now, noAnswerInRow, interestedInRow, callbackAt }, cfg); }
    catch (e) { if (e instanceof LadderError) throw new BadRequestException(e.message); throw e; }

    const session = shift?.onCall && String(shift.onCall.customerId) === String(customerId) ? shift.onCall : null;
    const durationSec = session ? Math.max(0, Math.round((+(session.endedAt ?? now) - +session.startedAt) / 1000)) : 0;
    const wrapSec = session?.endedAt ? Math.round((+now - +session.endedAt) / 1000) : 0;
    const asg = await this.asgModel.findOne({ date: istKey(now), customerId }).lean<any>();
    const flagged = !!session && isConnected(outcome) && durationSec < cfg.shortCallSec;

    const log = await this.crm.logCall({
      customerId: String(customerId), agentId: user.sub, agentName: user.name, outcome: outcome as any,
      notes: body.notes?.slice(0, 2000), callbackAt: outcome === 'callback' && callbackAt ? callbackAt.toISOString() : undefined,
      extra: {
        startedAt: session?.startedAt ?? null, durationSec, wrapSec, mode: session ? this.activeMode(shift, now) : '',
        attemptNo: (stats?.callAttempts ?? 0) + 1, score: asg?.score ?? 0, flagged, reason: String(body.reason ?? '').slice(0, 80),
      },
    });

    await this.statsModel.updateOne({ userId: customerId }, { $set: { ...plan.stats, consecutiveNoAnswer: noAnswerInRow }, $inc: { callAttempts: 1 } });
    if (asg) {
      await this.asgModel.updateOne({ _id: asg._id }, {
        $set: {
          state: plan.assignment.state, dueAt: plan.assignment.dueAt ?? null, lastOutcome: outcome, lastAttemptAt: now, claimedAt: null,
          ...(plan.assignment.source ? { source: plan.assignment.source } : {}),
          ...(plan.assignment.parkedReason ? { parkedReason: plan.assignment.parkedReason } : {}),
        },
        $inc: { attempts: 1 },
      });
    }

    // this call answers any open callback / follow-up / retry for the customer
    const open = await this.remModel.find({ customerId, status: { $in: ['pending', 'fired'] }, type: { $in: ['callback', 'followup', 'retry', 'repurchase'] } }).lean<any[]>();
    for (const r of open) {
      await this.remModel.updateOne({ _id: r._id }, { $set: {
        status: 'done', doneAt: now,
        ...(r.type === 'callback' ? { keptOnTime: +now <= +r.dueAt + cfg.callbackGraceMin * 60_000 } : {}),
      } });
    }
    if (plan.reminder) {
      await this.remModel.create({ type: plan.reminder.type, customerId, callerId: oid(user.sub), dueAt: plan.reminder.dueAt, text: plan.reminder.text, createdBy: oid(user.sub) });
    }
    if (plan.alertManagers) await this.systemAlert(`${plan.alertManagers}: ${cust.name || cust.phone} (by ${user.name ?? 'caller'})`, customerId);
    if (flagged) this.crm.logActivity(user.sub, user.name ?? 'Caller', 'short_call_flagged', String(customerId));

    let waSent = false;
    if (plan.sendMissedWa && cust.phone) {
      try {
        await this.crm.logNudge({ customerId: String(customerId), agentId: user.sub, agentName: user.name, templateName: 'missed_you', message: this.fill(cfg.waTemplates.missed_you, cust.name) });
        waSent = true;
      } catch (e: any) { this.logger.warn(`missed-you WhatsApp failed: ${e.message}`); }
    }

    if (shift && session) {
      shift.onCall = null;
      shift.activity = 'ready';
      shift.lastActionAt = now;
      shift.markModified('onCall');
      await shift.save();
    } else if (shift) {
      // logged from a profile / queue panel: never touch a different live call
      await this.shiftModel.updateOne({ _id: shift._id }, { $set: { lastActionAt: now } });
    }
    this.crm.logActivity(user.sub, user.name ?? 'Caller', 'call_end', String(customerId));
    return {
      log, durationSec, wrapSec, flagged, waSent,
      next: { state: plan.assignment.state, at: plan.nextActionAt, suggestWa: plan.suggestWa ?? null },
    };
  }

  // ─── Reminders ─────────────────────────────────────────────────────────────

  private async systemAlert(text: string, customerId?: Types.ObjectId | null, key?: string) {
    const doc = { type: 'system', callerId: null, customerId: customerId ?? null, dueAt: new Date(), status: 'fired', firedAt: new Date(), text };
    if (!key) return this.remModel.create(doc);
    // one alert per key (idle per hour, no-shift per day …)
    return this.remModel.updateOne({ key }, { $setOnInsert: { ...doc, key } }, { upsert: true }).catch(() => null);
  }

  async listReminders(user: JwtPayload, scope: string, customerId?: string) {
    if (customerId) {
      // one customer's reminders (profile / cockpit panel): open ones plus the last 30 days of history
      const items = await this.remModel.find({ customerId: oid(customerId), $or: [{ status: { $in: ['pending', 'fired'] } }, { updatedAt: { $gte: new Date(Date.now() - 30 * 86_400_000) } }] })
        .sort({ dueAt: -1 }).limit(50).populate('callerId', 'name').lean<any[]>();
      return { items, adherence: null, promised30d: 0 };
    }
    const all = scope === 'all' && isManager(user);
    const since = istAt(new Date(), 0, '00:00');
    const who = all ? {} : isManager(user) ? { callerId: { $in: [oid(user.sub), null] } } : { callerId: oid(user.sub) };
    const filter: any = { ...who, $or: [{ status: { $in: ['pending', 'fired'] } }, { status: 'done', doneAt: { $gte: since } }] };
    const rows = await this.remModel.find(filter).sort({ dueAt: 1 }).limit(500).populate('customerId', 'name phone').populate('callerId', 'name').lean<any[]>();
    const cb = await this.remModel.find({ type: 'callback', ...(all ? {} : { callerId: oid(user.sub) }), dueAt: { $gte: new Date(Date.now() - 30 * 86_400_000), $lte: new Date() } }).select('keptOnTime').lean<any[]>();
    const adherence = cb.length ? Math.round((cb.filter((r) => r.keptOnTime === true).length / cb.length) * 100) : null;
    return { items: rows, adherence, promised30d: cb.length };
  }

  async createReminder(user: JwtPayload, body: { customerId?: string; callerId?: string; dueAt?: string; text?: string }) {
    const dueAt = body.dueAt ? new Date(body.dueAt) : new Date();
    if (Number.isNaN(+dueAt)) throw new BadRequestException('Invalid time');
    if (+dueAt > Date.now() + 365 * 86_400_000) throw new BadRequestException('Too far ahead');
    const target = body.callerId && body.callerId !== user.sub ? body.callerId : user.sub;
    if (target !== user.sub && !isManager(user)) throw new ForbiddenException('Only managers can remind other callers');
    const text = String(body.text ?? '').trim().slice(0, 300);
    if (!text) throw new BadRequestException('Write what to be reminded about');
    return this.remModel.create({
      type: 'manual', customerId: body.customerId ? oid(body.customerId) : null, callerId: oid(target),
      dueAt, text, createdBy: oid(user.sub), status: +dueAt <= Date.now() ? 'fired' : 'pending', firedAt: +dueAt <= Date.now() ? new Date() : null,
    });
  }

  async updateReminder(user: JwtPayload, id: string, body: { action?: string; minutes?: number; dueAt?: string }) {
    const r = await this.remModel.findById(oid(id));
    if (!r) throw new NotFoundException('Reminder not found');
    const own = r.callerId && String(r.callerId) === user.sub;
    if (!own && !isManager(user)) throw new ForbiddenException('Not your reminder');
    const now = new Date();
    if (body.action === 'done') {
      r.status = 'done'; r.doneAt = now;
    } else if (body.action === 'snooze') {
      const m = Number(body.minutes);
      if (![10, 30, 60].includes(m)) throw new BadRequestException('Snooze 10, 30 or 60 minutes');
      r.dueAt = new Date(+now + m * 60_000); r.status = 'pending'; r.firedAt = null; r.snoozeCount = (r.snoozeCount ?? 0) + 1;
    } else if (body.action === 'reschedule') {
      const at = new Date(String(body.dueAt));
      if (Number.isNaN(+at) || +at <= +now) throw new BadRequestException('Pick a future time');
      r.dueAt = at; r.status = 'pending'; r.firedAt = null; r.escalatedAt = null;
      if (r.type === 'callback' && r.customerId) {
        await this.statsModel.updateOne({ userId: r.customerId }, { $set: { callbackAt: at, snoozedUntil: at } });
        const today = istKey(now);
        if (istKey(at) === today) await this.asgModel.updateOne({ date: today, customerId: r.customerId, state: { $in: OPEN } }, { $set: { dueAt: at, state: 'retry', source: 'callback' } });
      }
    } else throw new BadRequestException('Unknown action');
    await r.save();
    return r;
  }

  // ─── Minute tick: fire, escalate, alert, auto-close ────────────────────────

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'Asia/Kolkata' })
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try { await this.runTick(new Date()); }
    catch (e: any) { this.logger.error(`caller tick failed: ${e.message}`); }
    finally { this.ticking = false; }
  }

  async runTick(now: Date) {
    const cfg = await this.config();
    const date = istKey(now);
    await this.remModel.updateMany({ status: 'pending', dueAt: { $lte: now } }, { $set: { status: 'fired', firedAt: now } });

    // callbacks not handled within the escalation window → managers, once
    const late = await this.remModel.find({ type: 'callback', status: { $in: ['pending', 'fired'] }, escalatedAt: null, dueAt: { $lt: new Date(+now - cfg.callbackEscalateMin * 60_000) } })
      .populate('customerId', 'name phone').populate('callerId', 'name').limit(200).lean<any[]>();
    for (const r of late) {
      await this.remModel.updateOne({ _id: r._id }, { $set: { escalatedAt: now } });
      await this.systemAlert(`Callback overdue ${cfg.callbackEscalateMin}+ min: ${r.customerId?.name || r.customerId?.phone || 'customer'} (${r.callerId?.name ?? 'unassigned'}). Reassign?`, r.customerId?._id, `cbesc:${r._id}`);
    }

    // a browser closed mid-call: close it after 30 min as Unlogged (counts against quality)
    const stuck = await this.shiftModel.find({ date, 'onCall.startedAt': { $lt: new Date(+now - 30 * 60_000) } });
    for (const s of stuck) {
      const call = s.onCall;
      await this.callModel.create({
        customerId: call.customerId, agentId: s.callerId, outcome: 'unlogged', istDate: date, startedAt: call.startedAt,
        durationSec: Math.round((+(call.endedAt ?? now) - +call.startedAt) / 1000), flagged: true, notes: 'Auto-closed: no disposition within 30 min',
      });
      await this.asgModel.updateOne({ date, customerId: call.customerId, state: 'in_progress' }, { $set: { state: 'retry', dueAt: now, claimedAt: null } });
      s.onCall = null; s.activity = 'ready'; s.markModified('onCall');
      await s.save();
      await this.systemAlert(`Unlogged call auto-closed for ${s.callerName}`, call.customerId);
    }

    // forced modes and duels expire
    await this.shiftModel.updateMany({ date, forcedUntil: { $ne: null, $lt: now } }, { $set: { forcedMode: null, forcedUntil: null } });
    const duels = await this.shiftModel.find({ date, 'duel.endsAt': { $lt: now } }).lean<any[]>();
    for (const d of duels) await this.finishDuel(d, now);

    // system alerts only matter inside calling hours
    if (!withinCallingHours(now, cfg)) return;
    const mins = istMinutes(now);
    const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
    const shifts = await this.shiftModel.find({ date }).lean<any[]>();
    const byCaller = new Map(shifts.map((s) => [String(s.callerId), s]));
    if (mins >= toMin(cfg.shiftStartBy)) {
      const callers = await this.adminModel.find({ departmentType: 'crm_senior', isActive: true }).select('name').lean<any[]>();
      for (const c of callers) if (!byCaller.has(String(c._id))) await this.systemAlert(`${c.name} has not started their shift`, null, `noshift:${c._id}:${date}`);
    }
    for (const s of shifts) {
      if (s.status !== 'active' || this.presence(s, cfg, now) !== 'idle') continue;
      await this.systemAlert(`${s.callerName} idle for ${cfg.idleAlertMin}+ min`, null, `idle:${s.callerId}:${date}:${istHour(now)}`);
    }
    if (istHour(now) >= 12) {
      const hoursLeft = Math.max(0.5, cfg.callingHours.to - mins / 60);
      for (const s of shifts.filter((x) => x.status === 'active')) {
        const { remaining } = await this.counts(s.callerId, date);
        if (!remaining) continue;
        const calls = await this.callModel.countDocuments({ agentId: s.callerId, istDate: date, type: { $ne: 'whatsapp' } });
        const worked = Math.max(0.5, (+now - +s.startedAt) / 3_600_000);
        if (remaining / hoursLeft > (calls / worked) * 1.25) {
          await this.systemAlert(`${s.callerName} behind pace: ${remaining} leads left, needs ${Math.ceil(remaining / hoursLeft)}/h, doing ${Math.round(calls / worked)}/h`, null, `pace:${s.callerId}:${date}:${istHour(now) - (istHour(now) % 2)}`);
        }
      }
    }
    if (mins >= toMin(cfg.dayEndAlertAt)) {
      const left = await this.asgModel.countDocuments({ date, state: 'untouched' });
      if (left) await this.systemAlert(`${left} leads still untouched at ${cfg.dayEndAlertAt}`, null, `unworked:${date}`);
    }
  }

  // ─── Manager controls ──────────────────────────────────────────────────────

  async forceMode(user: JwtPayload, callerId: string, mode: string | null, minutes?: number) {
    if (mode && !CALLER_MODES.some((m) => m.key === mode)) throw new BadRequestException('Unknown mode');
    const until = mode && minutes ? new Date(Date.now() + Math.min(600, Math.max(5, Number(minutes))) * 60_000) : null;
    const r = await this.shiftModel.updateOne({ callerId: oid(callerId), date: istKey(), status: { $ne: 'ended' } }, { $set: { forcedMode: mode || null, forcedUntil: until, modeStartedAt: new Date() } });
    if (!r.matchedCount) throw new BadRequestException('That caller is not on shift');
    await this.releaseClaimed(callerId);
    this.audit(user, 'crm.caller.force_mode', mode ? `Forced ${mode}${until ? ` until ${until.toISOString()}` : ''}` : 'Cleared forced mode', { mode, until }, oid(callerId));
    return { ok: true };
  }

  async pauseCaller(user: JwtPayload, callerId: string) {
    const s = await this.shiftOf(callerId);
    if (!s || s.status !== 'active') throw new BadRequestException('That caller is not active');
    if (s.onCall) throw new ConflictException('They are on a call right now');
    s.status = 'break';
    s.breaks.push({ start: new Date(), end: null, reason: `Paused by ${user.name ?? 'manager'}` });
    await s.save();
    await this.releaseClaimed(callerId);
    this.audit(user, 'crm.caller.pause', 'Paused caller', {}, oid(callerId));
    return { ok: true };
  }

  async startDuel(user: JwtPayload, a: string, b: string, minutes = 60) {
    if (!a || !b || a === b) throw new BadRequestException('Pick two different callers');
    const date = istKey();
    const now = new Date();
    const endsAt = new Date(+now + Math.min(180, Math.max(10, Number(minutes) || 60)) * 60_000);
    const [sa, sb] = await Promise.all([this.shiftOf(a), this.shiftOf(b)]);
    if (!sa || !sb || sa.status === 'ended' || sb.status === 'ended') throw new BadRequestException('Both callers must be on shift');
    await this.shiftModel.updateOne({ _id: sa._id }, { $set: { duel: { rivalId: oid(b), startedAt: now, endsAt }, forcedMode: 'duel', forcedUntil: endsAt } });
    await this.shiftModel.updateOne({ _id: sb._id }, { $set: { duel: { rivalId: oid(a), startedAt: now, endsAt }, forcedMode: 'duel', forcedUntil: endsAt } });
    this.audit(user, 'crm.caller.duel', 'Duel started', { a, b, endsAt });
    return { ok: true, endsAt };
  }

  private async duelScore(callerId: Types.ObjectId, from: Date, to: Date) {
    return this.callModel.countDocuments({ agentId: callerId, createdAt: { $gte: from, $lte: to }, outcome: { $in: ['connected', 'interested', 'ordered', 'callback', 'not_interested', 'complaint'] } });
  }

  private async finishDuel(s: any, now: Date) {
    const { rivalId, startedAt, endsAt } = s.duel;
    // the pair is finished once, by whichever shift is seen first
    const cleared = await this.shiftModel.updateMany({ date: s.date, callerId: { $in: [s.callerId, rivalId] }, duel: { $ne: null } }, { $set: { duel: null } });
    if (!cleared.modifiedCount) return;
    const [mine, theirs] = await Promise.all([this.duelScore(s.callerId, startedAt, endsAt), this.duelScore(rivalId, startedAt, endsAt)]);
    const rival = await this.shiftModel.findOne({ date: s.date, callerId: rivalId }).select('callerName').lean<any>();
    const winner = mine === theirs ? null : mine > theirs ? { id: s.callerId, name: s.callerName } : { id: rivalId, name: rival?.callerName };
    this.crm.logActivity(String(winner?.id ?? s.callerId), winner?.name ?? s.callerName, 'duel_result');
    await this.systemAlert(`Duel over: ${s.callerName} ${mine} – ${theirs} ${rival?.callerName ?? ''}. ${winner ? `${winner.name} wins!` : 'Draw.'}`, null, `duel:${s.callerId}:${+startedAt}`);
    void now;
  }

  // ─── Numbers: My Day, Live Board, day-close report ─────────────────────────

  private async callerDay(callerId: Types.ObjectId, date: string, cfg: CallerConfig) {
    const [counts, logs, callbacks, skips] = await Promise.all([
      this.counts(callerId, date),
      this.callModel.find({ agentId: callerId, istDate: date }).select('type outcome durationSec startedAt createdAt score flagged customerId').lean<any[]>(),
      this.remModel.find({ callerId, type: 'callback', $or: [{ status: { $in: ['pending', 'fired'] } }, { dueAt: { $gte: new Date(`${date}T00:00:00+05:30`), $lte: new Date(`${date}T23:59:59+05:30`) } }] }).select('type status keptOnTime dueAt doneAt').lean<any[]>(),
      this.activityModel.countDocuments({ employeeId: callerId, istDate: date, type: 'skip' }),
    ]);
    const calls = logs.filter((l) => l.type !== 'whatsapp' && l.outcome !== 'unlogged');
    const connected = calls.filter((l) => isConnected(l.outcome)).length;
    const pts = computePoints(logs.map((l) => ({ ...l, customerId: String(l.customerId) })), callbacks, { hotScore: cfg.hotScore, assigned: counts.assigned, remaining: counts.remaining });
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, calls: 0, connected: 0 }));
    calls.forEach((l) => { const h = istHour(l.createdAt); hourly[h].calls++; if (isConnected(l.outcome)) hourly[h].connected++; });
    const now = Date.now();
    return {
      ...counts,
      calls: calls.length,
      connected,
      connectPct: calls.length ? Math.round((connected / calls.length) * 100) : 0,
      wa: logs.filter((l) => l.type === 'whatsapp').length,
      orders: calls.filter((l) => l.outcome === 'ordered').length,
      callbacksDue: callbacks.filter((r) => r.status !== 'done').length,
      callbacksOverdue: callbacks.filter((r) => r.status !== 'done' && +r.dueAt < now).length,
      flagged: calls.filter((l) => l.flagged).length,
      talkSec: calls.reduce((s, l) => s + (l.durationSec ?? 0), 0),
      skips,
      skipRate: calls.length + skips ? Math.round((skips / (calls.length + skips)) * 100) : 0,
      hourly: hourly.filter((h) => h.hour >= cfg.callingHours.from && h.hour < cfg.callingHours.to),
      ...pts,
    };
  }

  async me(user: JwtPayload) {
    const cfg = await this.config();
    const date = istKey();
    const [day, shift] = await Promise.all([this.callerDay(oid(user.sub), date, cfg), this.shiftOf(user.sub).lean<any>()]);
    const hoursLeft = Math.max(0, cfg.callingHours.to - istMinutes() / 60);
    return {
      date, day, target: cfg.targetCalls, shift, presence: this.presence(shift, cfg),
      pace: { requiredPerHour: hoursLeft ? Math.ceil(day.remaining / hoursLeft) : day.remaining, actualPerHour: shift ? Math.round(day.calls / Math.max(0.25, (Date.now() - +shift.startedAt) / 3_600_000)) : 0 },
    };
  }

  /** rows behind a My Day tile or a Live Board segment */
  async list(user: JwtPayload, q: { view?: string; callerId?: string; hour?: string; bucket?: string }) {
    const date = istKey();
    const callerId = q.callerId && q.callerId !== user.sub ? (isManager(user) ? oid(q.callerId) : (() => { throw new ForbiddenException(); })()) : oid(user.sub);
    const view = q.view ?? 'assigned';
    const hour = q.hour !== undefined && q.hour !== '' ? Number(q.hour) : null;
    const asgViews: Record<string, any> = {
      assigned: { state: { $ne: 'rolled' } }, done: { state: { $in: ['done', 'parked'] } }, remaining: { state: { $in: OPEN } },
      untouched: { state: 'untouched' }, parked: { state: 'parked' },
      in_progress: { $or: [{ state: 'in_progress' }, { state: 'retry', lastOutcome: { $nin: ['no_answer', 'busy', 'switched_off', 'call_dropped'] } }] },
      not_reached: { lastOutcome: { $in: ['no_answer', 'busy', 'switched_off', 'call_dropped'] }, state: { $in: ['done', 'retry'] } },
      connected: { state: 'done', lastOutcome: { $in: ['connected', 'interested', 'ordered', 'callback', 'not_interested', 'complaint'] } },
    };
    const allCallers = q.callerId === 'all' && isManager(user);
    if (q.bucket && asgViews[q.bucket]) {
      const rows = await this.asgModel.find({ date, ...(allCallers ? {} : { callerId }), ...asgViews[q.bucket] }).sort({ score: -1 }).limit(500)
        .populate('customerId', 'name phone').populate('callerId', 'name').lean<any[]>();
      return { kind: 'leads', rows };
    }
    if (['assigned', 'done', 'remaining'].includes(view)) {
      const rows = await this.asgModel.find({ date, callerId, ...asgViews[view] }).sort({ score: -1 }).limit(500).populate('customerId', 'name phone').lean<any[]>();
      return { kind: 'leads', rows };
    }
    if (view === 'callbacks') {
      const rows = await this.remModel.find({ callerId, type: 'callback', status: { $in: ['pending', 'fired'] } }).sort({ dueAt: 1 }).populate('customerId', 'name phone').lean<any[]>();
      return { kind: 'reminders', rows };
    }
    const f: any = { agentId: callerId, istDate: date };
    if (view === 'wa') f.type = 'whatsapp'; else f.type = { $ne: 'whatsapp' };
    if (view === 'connected') f.outcome = { $in: ['connected', 'interested', 'ordered', 'callback', 'not_interested', 'complaint'] };
    if (view === 'orders') f.outcome = 'ordered';
    let rows = await this.callModel.find(f).sort({ createdAt: -1 }).limit(500).populate('customerId', 'name phone').lean<any[]>();
    if (hour !== null && Number.isInteger(hour)) rows = rows.filter((r) => istHour(r.createdAt) === hour);
    return { kind: 'calls', rows };
  }

  async live(user: JwtPayload) {
    if (!isManager(user)) throw new ForbiddenException('Managers only');
    const cfg = await this.config();
    const now = new Date();
    const date = istKey(now);
    const [shifts, callersDb, buckets, alerts] = await Promise.all([
      this.shiftModel.find({ date }).lean<any[]>(),
      this.adminModel.find({ departmentType: 'crm_senior', isActive: true }).select('name').lean<any[]>(),
      this.asgModel.aggregate([
        { $match: { date, state: { $ne: 'rolled' } } },
        { $project: { callerId: 1, b: { $switch: { branches: [
          { case: { $eq: ['$state', 'parked'] }, then: 'parked' },
          { case: { $eq: ['$state', 'untouched'] }, then: 'untouched' },
          { case: { $in: ['$lastOutcome', ['no_answer', 'busy', 'switched_off', 'call_dropped']] }, then: 'not_reached' },
          { case: { $eq: ['$state', 'done'] }, then: 'connected' },
        ], default: 'in_progress' } } } },
        { $group: { _id: { c: '$callerId', b: '$b' }, n: { $sum: 1 } } },
      ]),
      this.remModel.find({ callerId: null, type: 'system', $or: [{ status: { $in: ['pending', 'fired'] } }, { createdAt: { $gte: istAt(now, 0, '00:00') } }] })
        .sort({ createdAt: -1 }).limit(50).populate('customerId', 'name phone').lean<any[]>(),
    ]);
    const ids = new Map<string, string>();
    shifts.forEach((s) => ids.set(String(s.callerId), s.callerName));
    callersDb.forEach((c) => { if (!ids.has(String(c._id))) ids.set(String(c._id), c.name); });
    const cards = await Promise.all([...ids].map(async ([id, name]) => {
      const shift = shifts.find((s) => String(s.callerId) === id) ?? null;
      const day = await this.callerDay(new Types.ObjectId(id), date, cfg);
      const worked = shift ? Math.max(0.25, (+(shift.endedAt ?? now) - +shift.startedAt) / 3_600_000) : 0;
      const hoursLeft = Math.max(0, cfg.callingHours.to - istMinutes(now) / 60);
      return {
        callerId: id, name, shift, presence: this.presence(shift, cfg, now), mode: shift ? this.activeMode(shift, now) : null,
        forced: !!shift?.forcedMode, onCall: shift?.onCall ?? null, duel: shift?.duel ?? null, day,
        pace: { required: hoursLeft ? Math.ceil(day.remaining / hoursLeft) : day.remaining, actual: worked ? Math.round(day.calls / worked) : 0 },
        breakMin: shift ? Math.round(shift.breaks.reduce((s: number, b: any) => s + (+(b.end ?? now) - +b.start), 0) / 60_000) : 0,
      };
    }));
    const sum = (k: string) => cards.reduce((s, c: any) => s + (c.day[k] ?? 0), 0);
    const dist: Record<string, Record<string, number>> = {};
    buckets.forEach((b: any) => { const c = String(b._id.c); dist[c] = dist[c] ?? {}; dist[c][b._id.b] = b.n; });
    const totals = cards.reduce((t: any, c) => { const d = dist[c.callerId] ?? {}; Object.entries(d).forEach(([k, v]) => { t[k] = (t[k] ?? 0) + v; }); return t; }, {});
    const hoursLeft = Math.max(0, cfg.callingHours.to - istMinutes(now) / 60);
    const calls = sum('calls');
    const elapsed = Math.max(0.25, istMinutes(now) / 60 - cfg.callingHours.from);
    return {
      date, now, config: { targetCalls: cfg.targetCalls, callingHours: cfg.callingHours, leadsPerCaller: cfg.leadsPerCaller },
      kpis: {
        totalLeads: sum('assigned'), assigned: sum('assigned'), done: sum('done'), remaining: sum('remaining'), calls,
        connected: sum('connected'), connectPct: calls ? Math.round((sum('connected') / calls) * 100) : 0, wa: sum('wa'),
        callbacksPending: sum('callbacksDue'), orders: sum('orders'),
        pace: { required: hoursLeft ? Math.ceil(sum('remaining') / hoursLeft) : sum('remaining'), actual: Math.round(calls / elapsed) },
      },
      callers: cards.sort((a, b) => b.day.points - a.day.points),
      distribution: { totals, perCaller: dist },
      alerts,
      modes: CALLER_MODES.map(publicMode),
    };
  }

  async report(user: JwtPayload, date = istKey(), onlyCaller?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Invalid date');
    const forCaller = onlyCaller ?? (isManager(user) ? undefined : user.sub);
    const cfg = await this.config();
    const shiftFilter: any = { date };
    if (forCaller) shiftFilter.callerId = oid(forCaller);
    const shifts = await this.shiftModel.find(shiftFilter).lean<any[]>();
    const callers = await Promise.all(shifts.map(async (s) => {
      const day = await this.callerDay(s.callerId, date, cfg);
      const [untouched, parked, logs, cbSet] = await Promise.all([
        this.asgModel.find({ date, callerId: s.callerId, state: 'untouched' }).populate('customerId', 'name phone').select('customerId score').limit(200).lean<any[]>(),
        this.asgModel.find({ date, callerId: s.callerId, state: 'parked' }).populate('customerId', 'name phone').select('customerId parkedReason').limit(200).lean<any[]>(),
        this.callModel.find({ agentId: s.callerId, istDate: date, type: { $ne: 'whatsapp' } }).sort({ createdAt: 1 }).select('createdAt startedAt').lean<any[]>(),
        this.remModel.countDocuments({ createdBy: s.callerId, type: 'callback', createdAt: { $gte: new Date(`${date}T00:00:00+05:30`), $lte: new Date(`${date}T23:59:59+05:30`) } }),
      ]);
      let idle = 0;
      for (let i = 1; i < logs.length; i++) idle = Math.max(idle, +(logs[i].startedAt ?? logs[i].createdAt) - +logs[i - 1].createdAt);
      const active = day.hourly.filter((h) => h.calls > 0);
      const best = [...day.hourly].sort((a, b) => b.calls - a.calls)[0];
      const worst = active.length ? [...active].sort((a, b) => a.calls - b.calls)[0] : null;
      const kept = (await this.remModel.countDocuments({ callerId: s.callerId, type: 'callback', keptOnTime: true, doneAt: { $gte: new Date(`${date}T00:00:00+05:30`) } }));
      return {
        callerId: String(s.callerId), name: s.callerName, startedAt: s.startedAt, endedAt: s.endedAt,
        breakMin: Math.round(s.breaks.reduce((t: number, b: any) => t + (+(b.end ?? s.endedAt ?? new Date()) - +b.start), 0) / 60_000),
        assigned: day.assigned, worked: day.assigned - day.untouched, calls: day.calls, connectPct: day.connectPct, wa: day.wa,
        callbacksSet: cbSet, callbacksKept: kept, orders: day.orders, points: day.points, badges: day.badges,
        bestHour: best?.calls ? best.hour : null, worstHour: worst?.hour ?? null, longestIdleMin: Math.round(idle / 60_000),
        untouched: untouched.map((u) => ({ name: u.customerId?.name || u.customerId?.phone || '-', phone: u.customerId?.phone })),
        parked: parked.map((p) => ({ name: p.customerId?.name || p.customerId?.phone || '-', reason: p.parkedReason })),
      };
    }));
    return { date, callers };
  }
}
