// backend/src/modules/crm/crm.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { CrmCustomerStats, CrmCustomerStatsDocument, CrmSegment } from './schemas/crm-customer-stats.schema';
import { CrmCallLog, CrmCallLogDocument, CallOutcome } from './schemas/crm-call-log.schema';
import { CrmCampaign, CrmCampaignDocument } from './schemas/crm-campaign.schema';
import { CrmSettings, CrmSettingsDocument, DEFAULT_REORDER_CYCLES } from './schemas/crm-settings.schema';
import { CrmEngineService } from './crm-engine.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { getISTDate } from './engine/status-model';
import { istDateKey } from '../../common/utils/ist-time';
import { CrmActivityEvent, CrmActivityEventDocument } from './schemas/crm-activity-event.schema';
import { MediaService } from '../media/media.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';

@Injectable()
export class CrmService {
  constructor(
    @InjectModel(CrmCustomerStats.name) private statsModel: Model<CrmCustomerStatsDocument>,
    @InjectModel(CrmCallLog.name) private callLogModel: Model<CrmCallLogDocument>,
    @InjectModel(CrmCampaign.name) private campaignModel: Model<CrmCampaignDocument>,
    @InjectModel(CrmSettings.name) private settingsModel: Model<CrmSettingsDocument>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('AdminUser') private adminUserModel: Model<any>,
    @InjectModel('Order') private orderModel: Model<any>,
    @InjectModel(CrmActivityEvent.name) private activityModel: Model<CrmActivityEventDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel('ChatSession') private chatSessionModel: Model<any>,
    @InjectModel('Cart') private cartModel: Model<any>,
    @InjectModel('MessageLog') private messageLogModel: Model<any>,
    private readonly engine: CrmEngineService,
    private readonly whatsapp: WhatsAppService,
    private readonly media: MediaService,
  ) {}

  logActivity(employeeId: string, employeeName: string, type: string, customerId?: string): void {
    const now = new Date();
    this.activityModel.create({
      employeeId: new Types.ObjectId(employeeId),
      employeeName,
      at: now,
      istDate: istDateKey(now),
      hourIST: now.getHours(), // TZ=Asia/Kolkata set in main.ts
      type,
      ...(customerId ? { customerId: new Types.ObjectId(customerId) } : {}),
    }).catch(() => {});
  }

  // ─── Customers ──────────────────────────────────────────────────────────

  async getCustomers(opts: {
    segment?: string;
    search?: string;
    page?: number;
    limit?: number;
    agentId?: string;
    isEscalated?: boolean;
  }) {
    const { segment, search, agentId, isEscalated } = opts;
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 100);

    // When filtering by agent, stats must exist — use stats-first path
    if (agentId) {
      const statsFilter: any = { assignedAgentId: new Types.ObjectId(agentId) };
      if (segment) statsFilter.segment = segment;
      if (isEscalated) statsFilter.isEscalated = true;
      let stats = await this.statsModel.find(statsFilter).sort({ priorityScore: -1 }).lean();
      const userFilter: any = { _id: { $in: stats.map((s: any) => s.userId) } };
      if (search?.trim()) {
        const d = search.replace(/\D/g, '');
        userFilter.$or = [
          { name: { $regex: search.trim(), $options: 'i' } },
          ...(d ? [{ phone: { $regex: d } }] : []),
        ];
      }
      const users = await this.userModel.find(userFilter).select('_id name phone tags').lean();
      const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));
      stats = stats.filter((s: any) => userMap.has(s.userId.toString()));
      const total = stats.length;
      return {
        data: stats.slice((page - 1) * limit, page * limit).map((s: any) => ({ ...s, user: userMap.get(s.userId.toString()) })),
        total, page, pages: Math.ceil(total / limit),
      };
    }

    // Default: users are the source of truth — left-join stats
    const userFilter: any = {};
    if (search?.trim()) {
      const d = search.replace(/\D/g, '');
      userFilter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        ...(d ? [{ phone: { $regex: d } }] : []),
      ];
    }
    const users = await this.userModel.find(userFilter).select('_id name phone tags').lean();

    const statsFilter: any = { userId: { $in: users.map((u: any) => u._id) } };
    if (segment) statsFilter.segment = segment;
    if (isEscalated) statsFilter.isEscalated = true;
    const allStats = await this.statsModel.find(statsFilter).lean();
    const statsMap = new Map(allStats.map((s: any) => [s.userId.toString(), s]));

    // If segment filter active, keep only users that have a matching stats doc
    let filtered = segment ? users.filter((u: any) => statsMap.has(u._id.toString())) : users;

    // Sort: stats users by priorityScore desc, unseen users at end
    filtered.sort((a: any, b: any) => {
      const sa = statsMap.get(a._id.toString());
      const sb = statsMap.get(b._id.toString());
      if (sa && sb) return (sb.priorityScore ?? 0) - (sa.priorityScore ?? 0);
      if (sa) return -1;
      if (sb) return 1;
      return 0;
    });

    const total = filtered.length;
    return {
      data: filtered.slice((page - 1) * limit, page * limit).map((u: any) => ({
        ...(statsMap.get(u._id.toString()) ?? { userId: u._id }),
        user: u,
      })),
      total, page, pages: Math.ceil(total / limit),
    };
  }

  async getCustomer360(userId: string) {
    const uid = new Types.ObjectId(userId);
    const [user, stats, calls, orders] = await Promise.all([
      this.userModel.findById(uid).lean(),
      this.statsModel.findOne({ userId: uid }).lean(),
      this.callLogModel.find({ customerId: uid }).sort({ createdAt: -1 }).limit(50).populate('agentId', 'name').lean(),
      this.orderModel.find({ user: uid, status: 'delivered' }).select('orderNumber total createdAt items').sort({ createdAt: -1 }).limit(20).populate('items.product', 'name images sku').lean(),
    ]);
    if (!user) throw new NotFoundException('Customer not found');
    return { user, stats, calls, orders };
  }

  // ─── Queue ───────────────────────────────────────────────────────────────

  async getQueue(opts: { agentId?: string; tab: 'today' | 'overdue' | 'at_risk' | 'upcoming' | 'dormant' | 'all' | 'callbacks' }) {
    const { agentId, tab } = opts;
    const filter: any = {};
    if (agentId) filter.assignedAgentId = new Types.ObjectId(agentId);

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    if (tab === 'today') {
      filter.segment = { $in: ['Overdue', 'Due Soon', 'overdue', 'due_today'] };
      filter.predictedReorderDate = { $lte: todayEnd };
    } else if (tab === 'overdue') {
      filter.segment = { $in: ['Overdue', 'overdue'] };
      filter.predictedReorderDate = { $lt: todayStart };
    } else if (tab === 'at_risk') {
      filter.segment = { $in: ['At Risk', 'at_risk'] };
    } else if (tab === 'upcoming') {
      filter.segment = { $in: ['Due Soon', 'due_soon'] };
    } else if (tab === 'dormant') {
      filter.segment = { $in: ['Dormant', 'dormant'] };
    } else if (tab === 'callbacks') {
      filter.callbackAt = { $gte: todayStart, $lte: todayEnd };
    } else {
      filter.segment = { $in: ['Due Soon', 'Overdue', 'At Risk', 'due_soon', 'overdue', 'at_risk'] };
    }

    // Exclude dismissed and currently snoozed customers
    filter.isDismissed = { $ne: true };
    filter.snoozedUntil = { $not: { $gt: now } };

    const stats = await this.statsModel.find(filter).sort({ priorityScore: -1 }).limit(200).lean();
    const userIds = stats.map((s: any) => s.userId);
    const users = await this.userModel.find({ _id: { $in: userIds } }).select('name phone tags').lean();
    const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));
    return stats.map((s: any) => ({ ...s, user: userMap.get(s.userId.toString()) }));
  }

  /**
   * Shoppers who left before paying, idle 30+ min, within `days`. Two sources:
   * (a) an unpaid online order (pay link sent, never paid) - order creation
   *     clears the cart and resets the bot to the menu, so only the order shows it;
   * (b) a chat session stuck on a cart/checkout step with items still in the cart.
   * Anyone with a later settled order (paid or COD) is excluded.
   */
  async getAbandoned(opts: { days?: number; agentId?: string } = {}) {
    const days = Math.min(Math.max(opts.days || 7, 1), 30);
    const now = Date.now();
    const since = new Date(now - days * 86_400_000);
    const idleBefore = new Date(now - 30 * 60_000);

    const [sessions, unpaidOrders, settledOrders] = await Promise.all([
      this.chatSessionModel
        .find({
          user: { $exists: true },
          currentState: { $in: ['cart', 'coupon_prompt', 'coupon_input', 'checkout', 'address_input', 'payment_selection'] },
          lastMessageAt: { $lt: idleBefore, $gte: since },
        })
        .sort({ lastMessageAt: -1 })
        .limit(200)
        .select('user phone currentState lastMessageAt')
        .lean(),
      this.orderModel
        .find({
          source: 'whatsapp', status: { $ne: 'cancelled' }, paymentStatus: 'pending', paymentMethod: { $ne: 'cod' },
          createdAt: { $gte: since, $lt: idleBefore },
        })
        .sort({ createdAt: -1 })
        .limit(200)
        .select('user createdAt total items')
        .lean(),
      // Any other live order (paid or COD) after the user left means they did buy.
      this.orderModel
        .find({
          status: { $ne: 'cancelled' }, createdAt: { $gte: since },
          $nor: [{ paymentStatus: 'pending', paymentMethod: { $ne: 'cod' } }],
        })
        .select('user createdAt')
        .lean(),
    ]);

    const lastSettled = new Map<string, Date>();
    for (const o of settledOrders as any[]) {
      const k = o.user.toString();
      if (!lastSettled.has(k) || o.createdAt > lastSettled.get(k)!) lastSettled.set(k, o.createdAt);
    }
    const boughtSince = (uid: string, at: Date) => (lastSettled.get(uid) ?? 0) >= at;

    type Row = { userId: string; step: string; leftAt: Date; total: number; items: { name: string; quantity: number }[]; phone?: string };
    const rows = new Map<string, Row>();
    for (const o of unpaidOrders as any[]) {
      const uid = o.user.toString();
      if (rows.has(uid) || boughtSince(uid, o.createdAt)) continue;
      rows.set(uid, {
        userId: uid, step: 'payment_pending', leftAt: o.createdAt, total: o.total,
        items: o.items.map((i: any) => ({ name: i.name, quantity: i.quantity })),
      });
    }

    const candidates = (sessions as any[]).filter((s) => !rows.has(s.user.toString()) && !boughtSince(s.user.toString(), s.lastMessageAt));
    const carts = candidates.length
      ? await this.cartModel.find({ user: { $in: candidates.map((s) => s.user) }, 'items.0': { $exists: true } }).select('user items total').lean()
      : [];
    const cartMap = new Map((carts as any[]).map((c) => [c.user.toString(), c]));
    for (const s of candidates) {
      const cart = cartMap.get(s.user.toString());
      if (!cart) continue;
      rows.set(s.user.toString(), {
        userId: s.user.toString(), step: s.currentState, leftAt: s.lastMessageAt, total: cart.total, phone: s.phone,
        items: cart.items.map((i: any) => ({ name: i.name, quantity: i.quantity })),
      });
    }
    // Agents only see their own customers, same as the call queue.
    if (opts.agentId) {
      const mine = await this.statsModel
        .find({ userId: { $in: [...rows.keys()].map((id) => new Types.ObjectId(id)) }, assignedAgentId: new Types.ObjectId(opts.agentId) })
        .select('userId')
        .lean();
      const ok = new Set(mine.map((m: any) => m.userId.toString()));
      for (const k of [...rows.keys()]) if (!ok.has(k)) rows.delete(k);
    }
    if (!rows.size) return [];

    const users = await this.userModel
      .find({ _id: { $in: [...rows.keys()].map((id) => new Types.ObjectId(id)) } })
      .select('name phone tags')
      .lean();
    const userMap = new Map((users as any[]).map((u) => [u._id.toString(), u]));
    return [...rows.values()]
      .map(({ phone, ...r }) => ({ ...r, user: userMap.get(r.userId) ?? { phone } }))
      .sort((a, b) => b.leftAt.getTime() - a.leftAt.getTime());
  }

  /** Last 100 WhatsApp messages with a customer, oldest first, so the agent sees where the chat stopped. */
  async getChat(userId: string, agentId?: string) {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid customer id');
    const uid = new Types.ObjectId(userId);
    if (agentId && !(await this.statsModel.exists({ userId: uid, assignedAgentId: new Types.ObjectId(agentId) }))) {
      throw new NotFoundException('Customer not found');
    }
    const [user, session] = await Promise.all([
      this.userModel.findById(uid).select('phone').lean(),
      this.chatSessionModel.findOne({ user: uid }).select('phone currentState lastMessageAt').lean(),
    ]);
    const phones = [(user as any)?.phone, (session as any)?.phone].filter(Boolean);
    const logs = await this.messageLogModel
      .find({ $or: [{ user: uid }, { phone: { $in: phones } }] })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('direction messageType content createdAt')
      .lean();
    const messages = (logs as any[]).reverse().map((m) => {
      const c = m.content ?? {};
      return {
        id: m._id,
        direction: m.direction,
        at: m.createdAt,
        text: c.text ?? c.buttonText ?? c.listTitle ?? c.caption ?? `[${c.templateName ?? m.messageType}]`,
      };
    });
    return { step: (session as any)?.currentState ?? null, lastMessageAt: (session as any)?.lastMessageAt ?? null, messages };
  }

  async assignCustomer(userId: string, agentId: string) {
    const uid = new Types.ObjectId(userId);
    const aid = new Types.ObjectId(agentId);
    const agent = await this.adminUserModel.findById(aid).lean();
    if (!agent) throw new NotFoundException('Agent not found');
    await this.statsModel.findOneAndUpdate({ userId: uid }, { $set: { assignedAgentId: aid } }, { upsert: false });
    return { ok: true };
  }

  // ─── Queue Actions ───────────────────────────────────────────────────────

  async snoozeCustomer(userId: string, until: string) {
    const date = new Date(until);
    if (isNaN(date.getTime())) throw new BadRequestException('Invalid snooze date');
    return this.statsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: { snoozedUntil: date } },
      { new: true },
    );
  }

  async dismissCustomer(userId: string) {
    return this.statsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: { isDismissed: true } },
      { new: true },
    );
  }

  async escalateCustomer(userId: string) {
    return this.statsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: { isEscalated: true } },
      { new: true },
    );
  }

  // ─── Call Logs ───────────────────────────────────────────────────────────

  async logCall(dto: {
    customerId: string;
    agentId: string;
    agentName?: string;
    outcome: CallOutcome;
    notes?: string;
    callbackAt?: string;
  }) {
    const customerId = new Types.ObjectId(dto.customerId);
    const agentId = new Types.ObjectId(dto.agentId);
    const log = await this.callLogModel.create({
      customerId,
      agentId,
      outcome: dto.outcome,
      notes: dto.notes ?? '',
      callbackAt: dto.callbackAt ? new Date(dto.callbackAt) : null,
      istDate: istDateKey(),
    });

    // Win-back: customer ordered after being dormant or lost
    if (dto.outcome === 'ordered') {
      const stats = await this.statsModel.findOne({ userId: customerId }).select('segment').lean<{ segment: string }>();
      const seg = (stats?.segment ?? '').toLowerCase();
      if (seg === 'dormant' || seg === 'lost') {
        await this.callLogModel.updateOne({ _id: log._id }, { $set: { isWinback: true } });
      }
    }

    await this.statsModel.findOneAndUpdate(
      { userId: customerId },
      { $set: { lastCallAt: new Date(), lastCallOutcome: dto.outcome } },
    );
    this.engine.refreshUser(customerId).catch(() => {});
    this.logActivity(dto.agentId, dto.agentName ?? 'Agent', 'call_logged', dto.customerId);
    return log;
  }

  async getCallLogs(customerId: string) {
    return this.callLogModel
      .find({ customerId: new Types.ObjectId(customerId) })
      .sort({ createdAt: -1 })
      .populate('agentId', 'name')
      .lean();
  }

  // ─── Campaigns ───────────────────────────────────────────────────────────

  async getCampaigns() {
    return this.campaignModel.find().sort({ createdAt: -1 }).populate('createdBy', 'name').lean();
  }

  async createCampaign(dto: {
    name: string;
    segmentFilter: string[];
    waMessage: string;
    createdById: string;
  }) {
    // Count recipients
    const recipientCount = await this.statsModel.countDocuments({
      segment: { $in: dto.segmentFilter },
    });
    return this.campaignModel.create({
      name: dto.name,
      segmentFilter: dto.segmentFilter,
      waMessage: dto.waMessage,
      createdBy: new Types.ObjectId(dto.createdById),
      recipientCount,
      status: 'draft',
    });
  }

  async approveCampaign(id: string, approvedById: string) {
    const campaign = await this.campaignModel.findById(id);
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== 'draft') throw new BadRequestException('Only draft campaigns can be approved');
    campaign.status = 'approved';
    campaign.approvedBy = new Types.ObjectId(approvedById) as any;
    return campaign.save();
  }

  async sendCampaign(id: string) {
    const campaign = await this.campaignModel.findById(id);
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== 'approved') throw new BadRequestException('Campaign must be approved before sending');

    // Mark sent immediately so duplicate triggers are rejected before the loop starts
    campaign.status = 'sent';
    campaign.sentAt = new Date();
    await campaign.save();

    // Fire sends in background — don't block the HTTP response
    this._doSendCampaign(campaign._id.toString(), campaign.segmentFilter, campaign.waMessage).catch(() => {});

    return { accepted: true, recipientCount: campaign.recipientCount };
  }

  async cancelCampaign(id: string) {
    const campaign = await this.campaignModel.findById(id);
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!['draft', 'approved', 'sent'].includes(campaign.status)) throw new BadRequestException('Campaign cannot be cancelled');
    campaign.status = 'cancelled';
    return campaign.save();
  }

  private async _doSendCampaign(id: string, segmentFilter: string[], waMessage: string) {
    const stats = await this.statsModel.find({ segment: { $in: segmentFilter } }).select('userId').lean();
    const userIds = stats.map((s: any) => s.userId);
    const users = await this.userModel.find({ _id: { $in: userIds }, isBlocked: { $ne: true } }).select('phone').lean();

    let sent = 0;
    for (let i = 0; i < users.length; i++) {
      // Check for cancellation every 10 messages
      if (i % 10 === 0) {
        const current = await this.campaignModel.findById(id).select('status').lean();
        if (current?.status === 'cancelled') break;
      }
      const user = users[i];
      if (!user.phone) continue;
      try {
        await this.whatsapp.sendTextMessage({ phone: user.phone, message: waMessage });
        sent++;
      } catch {
        // ponytail: per-user failure, continue campaign
      }
    }

    await this.campaignModel.updateOne({ _id: id }, { $set: { sentCount: sent } });
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────

  async getLeaderboard() {
    const agents = await this.adminUserModel
      .find({ departmentType: { $in: ['crm_head', 'crm_manager', 'crm_senior'] }, isActive: true })
      .select('name departmentType')
      .lean();

    const agentIds = agents.map((a: any) => a._id);
    const since = new Date(); since.setDate(since.getDate() - 30);

    const callStats = await this.callLogModel.aggregate([
      { $match: { agentId: { $in: agentIds }, createdAt: { $gte: since }, type: { $ne: 'whatsapp' } } },
      {
        $group: {
          _id: '$agentId',
          totalCalls: { $sum: 1 },
          conversions: { $sum: { $cond: [{ $eq: ['$outcome', 'ordered'] }, 1, 0] } },
          winbacks: { $sum: { $cond: ['$isWinback', 1, 0] } },
        },
      },
    ]);

    const statsMap = new Map(callStats.map((s: any) => [s._id.toString(), s]));
    return agents
      .map((a: any) => {
        const s = statsMap.get(a._id.toString()) ?? { totalCalls: 0, conversions: 0, winbacks: 0 };
        const convRate = s.totalCalls > 0 ? Math.round((s.conversions / s.totalCalls) * 100) : 0;
        const points = s.totalCalls * 1 + s.conversions * 10 + (s.winbacks ?? 0) * 5;
        return { agent: a, totalCalls: s.totalCalls, conversions: s.conversions, winbacks: s.winbacks ?? 0, convRate, points };
      })
      .sort((a: any, b: any) => b.points - a.points);
  }

  // ─── Analytics ───────────────────────────────────────────────────────────

  async getAnalytics() {
    const m = await this.getMetrics();
    const segmentBreakdown = [
      { segment: 'new', count: m.new },
      { segment: 'active', count: m.active },
      { segment: 'due_soon', count: m.dueSoon },
      { segment: 'due_today', count: m.dueToday },
      { segment: 'overdue', count: m.overdue },
      { segment: 'at_risk', count: m.atRisk },
      { segment: 'dormant', count: m.dormant },
      { segment: 'lost', count: m.lost },
    ].filter(s => s.count > 0);

    return {
      segmentCounts: m.segments,       // backward compat
      segmentBreakdown,                 // fixes D3: analytics page reads this key
      totalCustomers: m.total,
      repeatRate: m.repeatRate,
      revenueAtRisk: m.revenueAtRisk,
      callsLast30: m.callsLast30,
      callsThisMonth: m.callsLast30,   // alias for mismatched frontend key
      funnelStats: m.funnelStats,
    };
  }

  // ─── Settings ────────────────────────────────────────────────────────────

  async getSettings() {
    const [s, lastRun] = await Promise.all([
      this.settingsModel.findOne().lean(),
      this.engine.getLastRun(),
    ]);
    return {
      reorderCycles: s?.reorderCycles ?? DEFAULT_REORDER_CYCLES,
      fallbackCycleDays: s?.fallbackCycleDays ?? 30,
      thresholds: s?.thresholds ?? { atRiskAfterDays: 15, dormantAfterDays: 60, lostAfterDays: 180 },
      vip: s?.vip ?? { minOrders: 2, minLifetimeValue: 4000 },
      dailyCallTarget: s?.dailyCallTarget ?? 50,
      scripts: (s as any)?.scripts ?? {},
      lastEngineRun: lastRun ?? null,
    };
  }

  async updateSettings(dto: {
    reorderCycles?: Record<string, number>;
    fallbackCycleDays?: number;
    thresholds?: { atRiskAfterDays: number; dormantAfterDays: number; lostAfterDays: number };
    vip?: { minOrders: number; minLifetimeValue: number };
    dailyCallTarget?: number;
    scripts?: Record<string, string>;
  }) {
    const updated = await this.settingsModel.findOneAndUpdate(
      {},
      { $set: dto },
      { upsert: true, new: true },
    );
    // Async full recompute so segment thresholds / cycles take effect
    this.engine.refreshAll('settings').catch(() => {});
    return updated;
  }

  // ─── Notes ───────────────────────────────────────────────────────────────

  async addNote(customerId: string, agentId: string, text: string, agentName = 'Agent') {
    const updated = await this.statsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(customerId) },
      { $push: { notes: { agentId: new Types.ObjectId(agentId), agentName, text, createdAt: new Date() } } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Customer stats not found — trigger a CRM refresh first');
    this.logActivity(agentId, agentName, 'note_added', customerId);
    return updated;
  }

  async deleteNote(customerId: string, noteId: string) {
    return this.statsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(customerId) },
      { $pull: { notes: { _id: new Types.ObjectId(noteId) } } },
      { new: true },
    );
  }

  async setTags(customerId: string, tags: string[]) {
    const clean = [...new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean))];
    return this.statsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(customerId) },
      { $set: { tags: clean } },
      { new: true },
    );
  }

  // ─── WhatsApp Nudge ──────────────────────────────────────────────────────

  async logNudge(dto: {
    customerId: string;
    agentId: string;
    agentName?: string;
    templateName: string;
    message: string;
  }) {
    const uid = new Types.ObjectId(dto.customerId);
    const user = await this.userModel.findById(uid).select('phone').lean<{ phone?: string }>();
    if (!user?.phone) throw new BadRequestException('Customer has no phone number');

    await this.whatsapp.sendTextMessage({ phone: user.phone, message: dto.message });

    const log = await this.callLogModel.create({
      customerId: uid,
      agentId: new Types.ObjectId(dto.agentId),
      type: 'whatsapp',
      outcome: null,
      templateName: dto.templateName,
      messageText: dto.message,
      istDate: istDateKey(),
    });
    this.logActivity(dto.agentId, dto.agentName ?? 'Agent', 'nudge_sent', dto.customerId);
    return log;
  }

  // ─── Metrics (single aggregation source — fixes D3 & D4) ────────────────

  async getMetrics() {
    const now = new Date();
    const todayStart = getISTDate(now);
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);
    const last30 = new Date(now.getTime() - 30 * 86_400_000);

    const [segRows, revenueRows, callsTodayC, convTodayC, callsLast30C, funnelRows, settings] = await Promise.all([
      this.statsModel.aggregate([{ $group: { _id: '$segment', count: { $sum: 1 } } }]),
      this.statsModel.aggregate([
        { $match: { segment: { $in: ['at_risk', 'dormant', 'At Risk', 'Dormant'] } } },
        { $group: { _id: null, total: { $sum: '$ltv' } } },
      ]),
      this.callLogModel.countDocuments({ createdAt: { $gte: todayStart, $lt: todayEnd }, type: { $ne: 'whatsapp' } }),
      this.callLogModel.countDocuments({ createdAt: { $gte: todayStart, $lt: todayEnd }, type: { $ne: 'whatsapp' }, outcome: 'ordered' }),
      this.callLogModel.countDocuments({ createdAt: { $gte: last30 }, type: { $ne: 'whatsapp' } }),
      this.callLogModel.aggregate([
        { $match: { createdAt: { $gte: last30 }, type: { $ne: 'whatsapp' }, outcome: { $ne: null } } },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
      ]),
      this.settingsModel.findOne().select('dailyCallTarget').lean(),
    ]);

    const seg: Record<string, number> = Object.fromEntries(segRows.map((r: any) => [r._id ?? 'unknown', r.count]));
    const merge = (k1: string, k2: string) => (seg[k1] ?? 0) + (seg[k2] ?? 0);

    const newC = merge('new', 'New');
    const activeC = merge('active', 'Active');
    const dueSoonC = merge('due_soon', 'Due Soon');
    const dueTodayC = seg['due_today'] ?? 0;
    const overdueC = merge('overdue', 'Overdue');
    const atRiskC = merge('at_risk', 'At Risk');
    const dormantC = merge('dormant', 'Dormant');
    const lostC = merge('lost', 'Lost');
    const noOrdersC = seg['no_orders'] ?? 0;

    const total = newC + activeC + dueSoonC + dueTodayC + overdueC + atRiskC + dormantC + lostC + noOrdersC;
    const repeatCustomers = activeC + dueSoonC + dueTodayC + overdueC + atRiskC + dormantC + lostC;

    return {
      segments: seg,
      total,
      new: newC,
      active: activeC,
      dueSoon: dueSoonC,
      dueToday: dueTodayC,
      overdue: overdueC,
      atRisk: atRiskC,
      dormant: dormantC,
      lost: lostC,
      noOrders: noOrdersC,
      revenueAtRisk: revenueRows[0]?.total ?? 0,
      repeatRate: total > 0 ? Math.round((repeatCustomers / total) * 100) : 0,
      repeatCustomers,
      callsToday: callsTodayC,
      conversionsToday: convTodayC,
      callsLast30: callsLast30C,
      funnelStats: Object.fromEntries(funnelRows.map((r: any) => [r._id, r.count])) as Record<string, number>,
      target: (settings as any)?.dailyCallTarget ?? 50,
    };
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────

  async getDashboard() {
    const m = await this.getMetrics();
    return {
      dueTodayCount: m.dueToday,
      overdueCount: m.overdue,
      upcomingCount: m.dueSoon,
      revenueAtRisk: m.revenueAtRisk,
      totalCustomers: m.total,
      repeatRate: m.repeatRate,
      callsToday: m.callsToday,
      conversionsToday: m.conversionsToday,
      target: m.target,
    };
  }

  // ─── Reorder Calendar ────────────────────────────────────────────────────

  async getCalendar() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 86400000);

    const rows = await this.statsModel.aggregate([
      { $match: { predictedReorderDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$predictedReorderDate', timezone: 'Asia/Kolkata' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return rows.map((r: any) => ({ date: r._id, count: r.count }));
  }

  // ─── Manual engine trigger ───────────────────────────────────────────────

  async triggerRefresh() {
    this.engine.refreshAll('manual').catch(() => {});
    return { ok: true, message: 'Refresh started' };
  }

  // ─── Call Recordings ────────────────────────────────────────────────────

  async attachRecording(callId: string, file: Express.Multer.File) {
    const log = await this.callLogModel.findById(callId);
    if (!log) throw new NotFoundException('Call log not found');
    const result = await this.media.uploadAudio(file, 'crm-recordings');
    return this.callLogModel.findByIdAndUpdate(
      callId,
      { $set: { recordingUrl: result.secureUrl, recordingPublicId: result.publicId, recordingDuration: result.duration ?? 0 } },
      { new: true },
    );
  }

  // ─── CRM Admin — Employee Management ─────────────────────────────────────

  async listCrmEmployees() {
    return this.adminUserModel
      .find({ departmentType: { $in: ['crm_head', 'crm_manager', 'crm_senior', 'crm_viewer'] } })
      .select('-password -plainPassword -__v')
      .sort({ createdAt: -1 })
      .lean();
  }

  async createCrmEmployee(dto: {
    name: string;
    email: string;
    loginId?: string;
    departmentType: 'crm_manager' | 'crm_senior' | 'crm_viewer';
  }) {
    const tempPassword = randomBytes(5).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    const employee = await this.adminUserModel.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      loginId: dto.loginId?.toLowerCase().trim() || undefined,
      password: hashed,
      role: 'admin',
      departmentType: dto.departmentType,
      mustChangePassword: true,
      isActive: true,
    });
    const { password: _p, ...safe } = (employee as any).toObject();
    return { employee: safe, tempPassword };
  }

  async updateCrmEmployee(id: string, dto: { departmentType?: string; isActive?: boolean }) {
    const update: Record<string, unknown> = {};
    if (dto.departmentType) update.departmentType = dto.departmentType;
    if (dto.isActive !== undefined) update.isActive = dto.isActive;
    return this.adminUserModel
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .select('-password -plainPassword -__v');
  }

  async resetCrmEmployeePassword(id: string) {
    const tempPassword = randomBytes(5).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    await this.adminUserModel.findByIdAndUpdate(id, {
      $set: { password: hashed, mustChangePassword: true, failedLoginAttempts: 0 },
      $unset: { lockoutUntil: 1 },
    });
    return { tempPassword };
  }

  async forceCrmEmployeeLogout(id: string) {
    await this.adminUserModel.findByIdAndUpdate(id, { $set: { forcedLogoutAt: new Date() } });
    return { ok: true };
  }

  // ─── Product Catalog (read-only view for CRM) ────────────────────────────

  async getCrmProducts(search?: string) {
    const filter: any = { isActive: true };
    if (search?.trim()) filter.$text = { $search: search.trim() };
    return this.productModel
      .find(filter)
      .select('name sku images price compareAtPrice stock tags')
      .sort({ totalSold: -1, name: 1 })
      .limit(200)
      .lean();
  }

  // ─── Heartbeat (Phase 5) ─────────────────────────────────────────────────

  heartbeat(employeeId: string, employeeName: string): void {
    this.logActivity(employeeId, employeeName, 'heartbeat');
  }

  // ─── Per-employee Analytics (Phase 5) ────────────────────────────────────

  async getEmployeeStats(employeeId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const eid = new Types.ObjectId(employeeId);

    const [employee, callStats, activityByDay, activityTypes] = await Promise.all([
      this.adminUserModel.findById(eid).select('name departmentType createdAt lastLoginAt').lean(),
      this.callLogModel.aggregate([
        { $match: { agentId: eid, createdAt: { $gte: since }, type: { $ne: 'whatsapp' } } },
        { $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          conversions: { $sum: { $cond: [{ $eq: ['$outcome', 'ordered'] }, 1, 0] } },
          callbacks: { $sum: { $cond: [{ $eq: ['$outcome', 'callback'] }, 1, 0] } },
          noAnswers: { $sum: { $cond: [{ $eq: ['$outcome', 'no_answer'] }, 1, 0] } },
        }},
      ]),
      this.activityModel.aggregate([
        { $match: { employeeId: eid, at: { $gte: since }, type: 'heartbeat' } },
        { $group: { _id: '$istDate', hours: { $addToSet: '$hourIST' } } },
        { $sort: { _id: -1 } },
      ]),
      this.activityModel.aggregate([
        { $match: { employeeId: eid, at: { $gte: since } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);

    if (!employee) throw new NotFoundException('Employee not found');
    const cs = callStats[0] ?? { totalCalls: 0, conversions: 0, callbacks: 0, noAnswers: 0 };
    const convRate = cs.totalCalls > 0 ? Math.round((cs.conversions / cs.totalCalls) * 100) : 0;
    const activeHours = activityByDay.reduce((sum: number, d: any) => sum + (d.hours?.length ?? 0), 0);

    return {
      employee,
      period: days,
      totalCalls: cs.totalCalls,
      conversions: cs.conversions,
      callbacks: cs.callbacks,
      noAnswers: cs.noAnswers,
      convRate,
      activeHours,
      activeDays: activityByDay.length,
      activityByDay: activityByDay.map((d: any) => ({ date: d._id, hours: d.hours?.length ?? 0 })),
      activityTypes: Object.fromEntries(activityTypes.map((t: any) => [t._id as string, t.count])),
    };
  }

  // ─── Manager Live View ───────────────────────────────────────────────────

  async getLiveView() {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);

    const [recentActivity, todayCalls] = await Promise.all([
      this.activityModel.aggregate([
        { $match: { at: { $gte: fiveMinAgo } } },
        { $sort: { at: -1 } },
        { $group: { _id: '$employeeId', employeeName: { $first: '$employeeName' }, lastAt: { $first: '$at' }, lastType: { $first: '$type' } } },
      ]),
      this.callLogModel.aggregate([
        { $match: { istDate: istDateKey(), type: { $ne: 'whatsapp' } } },
        { $group: { _id: '$agentId', calls: { $sum: 1 }, conversions: { $sum: { $cond: [{ $eq: ['$outcome', 'ordered'] }, 1, 0] } } } },
      ]),
    ]);

    const callMap = new Map(todayCalls.map((c: any) => [c._id.toString(), c]));
    return recentActivity.map((a: any) => ({
      agentId: a._id,
      name: a.employeeName,
      lastSeenAt: a.lastAt,
      lastAction: a.lastType,
      todayCalls: callMap.get(a._id.toString())?.calls ?? 0,
      todayConversions: callMap.get(a._id.toString())?.conversions ?? 0,
    }));
  }
}
