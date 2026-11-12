import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmCallLog } from './schemas/crm-call-log.schema';
import { CrmCustomerStats } from './schemas/crm-customer-stats.schema';
import { CrmGoal, CrmLead, CrmSavedView, CrmWalkin, GOAL_METRICS, LEAD_STAGES } from './schemas/crm-ops.schemas';
import { sanitizeView } from './crm-filters';
import { Feedback } from '../feedback/schemas/feedback.schema';
import { AuditLog } from '../audit/schemas/audit-log.schema';
import { MessageLog } from '../whatsapp/schemas/message-log.schema';
import { goalStatus, medianMinutes, monthRange, needsReply } from './crm-ops.logic';
import { monthKey } from './crm-insights.logic';
import { normalisePhone } from './crm-foundation.service';

const VALID = { status: { $nin: ['cancelled', 'returned', 'refunded'] } };
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const oid = (id: string) => { if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id'); return new Types.ObjectId(id); };

const maybeOid = (id: string) => (Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null);

@Injectable()
export class CrmOpsService {
  constructor(
    @InjectModel('Order') private readonly orderModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('BillingBill') private readonly billModel: Model<any>,
    @InjectModel(CrmCallLog.name) private readonly callModel: Model<any>,
    @InjectModel(CrmCustomerStats.name) private readonly statsModel: Model<any>,
    @InjectModel(CrmGoal.name) private readonly goalModel: Model<any>,
    @InjectModel(CrmLead.name) private readonly leadModel: Model<any>,
    @InjectModel(CrmWalkin.name) private readonly walkinModel: Model<any>,
    @InjectModel(CrmSavedView.name) private readonly viewModel: Model<any>,
    @InjectModel(Feedback.name) private readonly feedbackModel: Model<any>,
    @InjectModel(AuditLog.name) private readonly auditModel: Model<any>,
    @InjectModel(MessageLog.name) private readonly msgModel: Model<any>,
  ) {}

  // ─── Saved customer views (M04) ──────────────────────────────────────────
  async listViews(userId: string) {
    const me = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
    return this.viewModel.find({ $or: [{ shared: true }, ...(me ? [{ ownerId: me }] : [])] }).sort({ name: 1 }).limit(100).lean();
  }

  async saveView(userId: string, body: { name?: string; filters?: Record<string, unknown>; shared?: boolean }, canShare: boolean) {
    const name = body.name?.trim();
    if (!name || name.length > 60) throw new BadRequestException('A view name of 1-60 characters is required');
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Unknown user');
    return this.viewModel.create({ name, filters: sanitizeView(body.filters), ownerId: new Types.ObjectId(userId), shared: !!body.shared && canShare });
  }

  async deleteView(id: string, userId: string, isManager: boolean) {
    const view: any = await this.viewModel.findById(oid(id));
    if (!view) throw new NotFoundException();
    if (!isManager && String(view.ownerId) !== userId) throw new BadRequestException('Only the owner can delete this view');
    await view.deleteOne();
    return { ok: true };
  }

  // ─── Bulk actions (M13): add one tag to many customers ──────────────────
  async bulkAddTag(ids: unknown, tag: unknown) {
    const t = typeof tag === 'string' ? tag.trim().toLowerCase() : '';
    if (!t || t.length > 30) throw new BadRequestException('A tag of 1-30 characters is required');
    if (!Array.isArray(ids) || !ids.length || ids.length > 5000 || !ids.every((i) => typeof i === 'string' && Types.ObjectId.isValid(i))) {
      throw new BadRequestException('ids must be 1-5000 valid customer ids');
    }
    const r = await this.statsModel.updateMany({ userId: { $in: ids.map((i) => new Types.ObjectId(i)) } }, { $addToSet: { tags: t } });
    return { matched: r.matchedCount, updated: r.modifiedCount };
  }

  // ─── Goals (M03) ───────────────────────────────────────────────────────
  private async actual(metric: string, month: string): Promise<number> {
    const { from, to } = monthRange(month);
    const range = { $gte: from, $lt: to };
    if (metric === 'revenue') return (await this.orderModel.aggregate([{ $match: { ...VALID, createdAt: range } }, { $group: { _id: null, v: { $sum: '$total' } } }]))[0]?.v ?? 0;
    if (metric === 'orders') return this.orderModel.countDocuments({ ...VALID, createdAt: range });
    if (metric === 'calls') return this.callModel.countDocuments({ type: 'call', createdAt: range });
    return this.userModel.countDocuments({ createdAt: range }); // newCustomers
  }

  async goals(month?: string) {
    const m = month && MONTH_RE.test(month) ? month : monthKey(new Date());
    const saved = await this.goalModel.find({ month: m }).lean();
    const goals = await Promise.all(GOAL_METRICS.map(async (metric) => {
      const target = (saved.find((g: any) => g.metric === metric) as any)?.target ?? 0;
      const actual = await this.actual(metric, m);
      return { metric, target, actual, ...goalStatus(actual, target, m) };
    }));
    return { month: m, goals };
  }

  async setGoal(body: { month?: string; metric?: string; target?: number }) {
    const target = Number(body.target);
    if (!MONTH_RE.test(body.month ?? '') || !(GOAL_METRICS as readonly string[]).includes(body.metric ?? '') || !Number.isFinite(target) || target < 0) {
      throw new BadRequestException('month (YYYY-MM), metric and a non-negative target are required');
    }
    await this.goalModel.updateOne({ month: body.month, metric: body.metric }, { $set: { target } }, { upsert: true });
    return this.goals(body.month);
  }

  // ─── Callbacks (M12): derived from the call engine's callbackAt ───────────
  async callbacks(agentId?: string) {
    const filter: any = { callbackAt: { $ne: null }, isDismissed: { $ne: true } };
    if (agentId) filter.assignedAgentId = oid(agentId);
    const rows = await this.statsModel.find(filter).sort({ callbackAt: 1 }).limit(300).populate('userId', 'name phone').select('userId callbackAt lastCallAt assignedAgentId').lean();
    const now = Date.now();
    return rows.map((r: any) => ({ id: String(r._id), customerId: String(r.userId?._id ?? ''), name: r.userId?.name ?? '', phone: r.userId?.phone ?? '', callbackAt: r.callbackAt, overdue: +r.callbackAt < now }));
  }

  // ─── Leads (M19) ─────────────────────────────────────────────────────────
  async leads(stage?: string) {
    const filter = stage && (LEAD_STAGES as readonly string[]).includes(stage) ? { stage } : {};
    const [items, recent] = await Promise.all([
      this.leadModel.find(filter).sort({ createdAt: -1 }).limit(200).lean(),
      this.leadModel.find({ createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) } }).select('createdAt firstContactAt').lean(),
    ]);
    return { items, medianFirstContactMinutes: medianMinutes(recent as any) };
  }

  async addLead(body: { name?: string; phone?: string; source?: string }, staffId: string) {
    const phone = normalisePhone(body.phone);
    if (!body.name?.trim() || !phone) throw new BadRequestException('name and a valid 10-digit phone are required');
    if (await this.leadModel.exists({ phone, stage: { $nin: ['ordered', 'lost'] } })) throw new BadRequestException('An open lead with this phone already exists');
    const existing = await this.userModel.findOne({ phone: { $regex: `${phone}$` } }).select('_id').lean();
    const lead = await this.leadModel.create({ name: body.name.trim(), phone, source: body.source?.trim() || 'manual', stage: existing ? 'ordered' : 'new', assignedTo: maybeOid(staffId) });
    return { lead, existingCustomer: !!existing };
  }

  async setLeadStage(id: string, stage: string, lostReason?: string) {
    if (!(LEAD_STAGES as readonly string[]).includes(stage)) throw new BadRequestException('Invalid stage');
    const lead: any = await this.leadModel.findById(oid(id));
    if (!lead) throw new NotFoundException();
    lead.stage = stage;
    if (stage === 'lost') lead.lostReason = (lostReason ?? '').slice(0, 200);
    if (stage !== 'new' && !lead.firstContactAt) lead.firstContactAt = new Date();
    return lead.save();
  }

  // ─── Walk-ins (M21) ──────────────────────────────────────────────────────
  async addWalkin(body: { phone?: string; name?: string; interest?: string }, staffId: string) {
    const phone = normalisePhone(body.phone);
    if (!phone) throw new BadRequestException('A valid 10-digit phone is required');
    const user: any = await this.userModel.findOne({ phone: { $regex: `${phone}$` } }).select('_id').lean();
    return this.walkinModel.create({ phone, name: body.name?.trim() ?? '', interest: body.interest?.trim() ?? '', customerId: user?._id ?? null, staffId: maybeOid(staffId) });
  }

  async walkinStats() {
    const startToday = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T00:00:00+05:30`);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [today, month, matched, recent] = await Promise.all([
      this.walkinModel.countDocuments({ createdAt: { $gte: startToday } }),
      this.walkinModel.countDocuments({ createdAt: { $gte: since } }),
      this.walkinModel.countDocuments({ createdAt: { $gte: since }, customerId: { $ne: null } }),
      this.walkinModel.find().sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    return { today, last30Days: month, existingCustomersPct: month ? Math.round((matched / month) * 1000) / 10 : null, recent };
  }

  // ─── Feedback (M23): reuses the store's reviews/feedback ──────────────────
  async feedbackSummary() {
    const [byRating, recent] = await Promise.all([
      this.feedbackModel.aggregate([{ $match: { rating: { $gte: 1 } } }, { $group: { _id: '$rating', n: { $sum: 1 } } }]),
      this.feedbackModel.find().sort({ createdAt: -1 }).limit(50).populate('user', 'name').select('user rating type message status createdAt').lean(),
    ]);
    const count = byRating.reduce((s, r) => s + r.n, 0);
    const avg = count ? Math.round((byRating.reduce((s, r) => s + r._id * r.n, 0) / count) * 10) / 10 : null;
    return { count, avgRating: avg, byRating: Object.fromEntries(byRating.map((r) => [r._id, r.n])), lowRated: byRating.filter((r) => r._id <= 2).reduce((s, r) => s + r.n, 0), recent };
  }

  // ─── Audit log (M31): read-only view of the existing audit trail ──────────
  async audit(action?: string) {
    const filter: any = action ? { action: new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } : {};
    return this.auditModel.find(filter).sort({ createdAt: -1 }).limit(100).select('action performedByName performedBy targetModel description createdAt').lean();
  }

  // ─── WhatsApp inbox (M14): read-only view of the message log ──────────────
  async inbox() {
    const rows = await this.msgModel.aggregate([
      { $sort: { createdAt: -1 } }, { $limit: 5000 },
      { $group: { _id: '$phone', lastAt: { $first: '$createdAt' }, lastDirection: { $first: '$direction' }, lastText: { $first: '$content.text' }, lastType: { $first: '$messageType' }, user: { $first: '$user' } } },
      { $sort: { lastAt: -1 } }, { $limit: 100 },
    ]);
    const users = await this.userModel.find({ _id: { $in: rows.map((r) => r.user).filter(Boolean) } }).select('name').lean();
    const name = new Map(users.map((u: any) => [String(u._id), u.name]));
    return rows.map((r) => ({ phone: r._id, name: name.get(String(r.user)) ?? '', lastAt: r.lastAt, lastText: r.lastText || `[${r.lastType}]`, lastDirection: r.lastDirection, needsReply: needsReply(r.lastDirection) }));
  }

  async thread(phone: string) {
    const p = (phone ?? '').replace(/\D/g, '');
    if (p.length < 10) throw new BadRequestException('Invalid phone');
    return (await this.msgModel.find({ phone: new RegExp(`${p.slice(-10)}$`) }).sort({ createdAt: -1 }).limit(100).select('direction messageType content.text status createdAt').lean()).reverse();
  }

  // ─── Intelligence (M34): rule-based churn risk from the existing engine ───
  async intelligence() {
    const rows = await this.statsModel.find({ segment: { $in: ['at_risk', 'dormant', 'overdue'] }, isDismissed: { $ne: true } })
      .sort({ ltv: -1 }).limit(200).populate('userId', 'name phone').select('userId segment daysLate personalCycle ltv topCategory').lean();
    return rows.map((r: any) => {
      const ratio = r.personalCycle > 0 ? r.daysLate / r.personalCycle : 0;
      return { customerId: String(r.userId?._id ?? ''), name: r.userId?.name ?? '', phone: r.userId?.phone ?? '', segment: r.segment, daysLate: r.daysLate, ltv: r.ltv, topCategory: r.topCategory, churnRisk: ratio >= 2 ? 'high' : ratio >= 1 ? 'medium' : 'low' };
    }).sort((a, b) => b.ltv * b.daysLate - a.ltv * a.daysLate).slice(0, 50);
  }

  // ─── Integrations (M33): when each feed last produced data ────────────────
  async integrations() {
    const latest = (m: Model<any>, f: any = {}) => m.findOne(f).sort({ createdAt: -1 }).select('createdAt').lean().then((x: any) => x?.createdAt ?? null);
    const [order, bill, wa, waIn] = await Promise.all([latest(this.orderModel), latest(this.billModel), latest(this.msgModel, { direction: 'outbound' }), latest(this.msgModel, { direction: 'inbound' })]);
    return [
      { name: 'Online orders', lastAt: order }, { name: 'Billing (POS)', lastAt: bill },
      { name: 'WhatsApp outbound', lastAt: wa }, { name: 'WhatsApp inbound', lastAt: waIn },
    ];
  }
}
