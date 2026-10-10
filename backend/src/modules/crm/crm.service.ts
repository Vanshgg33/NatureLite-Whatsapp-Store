// backend/src/modules/crm/crm.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmCustomerStats, CrmCustomerStatsDocument, CrmSegment } from './schemas/crm-customer-stats.schema';
import { CrmCallLog, CrmCallLogDocument, CallOutcome } from './schemas/crm-call-log.schema';
import { CrmCampaign, CrmCampaignDocument } from './schemas/crm-campaign.schema';
import { CrmSettings, CrmSettingsDocument, DEFAULT_REORDER_CYCLES } from './schemas/crm-settings.schema';
import { CrmEngineService } from './crm-engine.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { getISTDate } from './engine/status-model';

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
    private readonly engine: CrmEngineService,
    private readonly whatsapp: WhatsAppService,
  ) {}

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
      this.orderModel.find({ user: uid, status: 'delivered' }).select('orderNumber total createdAt items').sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    if (!user) throw new NotFoundException('Customer not found');
    return { user, stats, calls, orders };
  }

  // ─── Queue ───────────────────────────────────────────────────────────────

  async getQueue(opts: { agentId?: string; tab: 'today' | 'overdue' | 'at_risk' | 'upcoming' | 'dormant' | 'all' }) {
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
    });
    // Update lastCallAt and lastCallOutcome on stats, then recompute segment
    await this.statsModel.findOneAndUpdate(
      { userId: customerId },
      { $set: { lastCallAt: new Date(), lastCallOutcome: dto.outcome } },
    );
    this.engine.refreshUser(customerId).catch(() => {});
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

  private async _doSendCampaign(id: string, segmentFilter: string[], waMessage: string) {
    const stats = await this.statsModel.find({ segment: { $in: segmentFilter } }).select('userId').lean();
    const userIds = stats.map((s: any) => s.userId);
    const users = await this.userModel.find({ _id: { $in: userIds }, isBlocked: { $ne: true } }).select('phone').lean();

    let sent = 0;
    for (const user of users) {
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
      .find({ departmentType: { $in: ['crm_head', 'crm_senior'] }, isActive: true })
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
        },
      },
    ]);

    const statsMap = new Map(callStats.map((s: any) => [s._id.toString(), s]));
    return agents
      .map((a: any) => {
        const s = statsMap.get(a._id.toString()) ?? { totalCalls: 0, conversions: 0 };
        const convRate = s.totalCalls > 0 ? Math.round((s.conversions / s.totalCalls) * 100) : 0;
        const points = s.totalCalls * 1 + s.conversions * 10;
        return { agent: a, totalCalls: s.totalCalls, conversions: s.conversions, convRate, points };
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
      lastEngineRun: lastRun ?? null,
    };
  }

  async updateSettings(dto: {
    reorderCycles?: Record<string, number>;
    fallbackCycleDays?: number;
    thresholds?: { atRiskAfterDays: number; dormantAfterDays: number; lostAfterDays: number };
    vip?: { minOrders: number; minLifetimeValue: number };
    dailyCallTarget?: number;
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

  async addNote(customerId: string, agentId: string, text: string) {
    const agent = await this.adminUserModel.findById(agentId).select('name').lean();
    const updated = await this.statsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(customerId) },
      { $push: { notes: { agentId: new Types.ObjectId(agentId), agentName: (agent as any)?.name ?? 'Agent', text, createdAt: new Date() } } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Customer stats not found — trigger a CRM refresh first');
    return updated;
  }

  async deleteNote(customerId: string, noteId: string) {
    return this.statsModel.findOneAndUpdate(
      { userId: new Types.ObjectId(customerId) },
      { $pull: { notes: { _id: new Types.ObjectId(noteId) } } },
      { new: true },
    );
  }

  // ─── WhatsApp Nudge ──────────────────────────────────────────────────────

  async logNudge(dto: {
    customerId: string;
    agentId: string;
    templateName: string;
    message: string;
  }) {
    const uid = new Types.ObjectId(dto.customerId);
    const user = await this.userModel.findById(uid).select('phone').lean<{ phone?: string }>();
    if (!user?.phone) throw new BadRequestException('Customer has no phone number');

    await this.whatsapp.sendTextMessage({ phone: user.phone, message: dto.message });

    return this.callLogModel.create({
      customerId: uid,
      agentId: new Types.ObjectId(dto.agentId),
      type: 'whatsapp',
      outcome: null,
      templateName: dto.templateName,
      messageText: dto.message,
    });
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
}
