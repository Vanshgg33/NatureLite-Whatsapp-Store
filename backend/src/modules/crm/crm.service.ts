// backend/src/modules/crm/crm.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmCustomerStats, CrmCustomerStatsDocument, CrmSegment } from './schemas/crm-customer-stats.schema';
import { CrmCallLog, CrmCallLogDocument, CallOutcome } from './schemas/crm-call-log.schema';
import { CrmCampaign, CrmCampaignDocument } from './schemas/crm-campaign.schema';
import { CrmSettings, CrmSettingsDocument, DEFAULT_REORDER_CYCLES } from './schemas/crm-settings.schema';
import { CrmEngineService } from './crm-engine.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class CrmService {
  constructor(
    @InjectModel(CrmCustomerStats.name) private statsModel: Model<CrmCustomerStatsDocument>,
    @InjectModel(CrmCallLog.name) private callLogModel: Model<CrmCallLogDocument>,
    @InjectModel(CrmCampaign.name) private campaignModel: Model<CrmCampaignDocument>,
    @InjectModel(CrmSettings.name) private settingsModel: Model<CrmSettingsDocument>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('AdminUser') private adminUserModel: Model<any>,
    private readonly engine: CrmEngineService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ─── Customers ──────────────────────────────────────────────────────────

  async getCustomers(opts: {
    segment?: string;
    search?: string;
    page?: number;
    limit?: number;
    agentId?: string; // set for crm_senior to restrict to assigned
  }) {
    const { segment, search, agentId } = opts;
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 100);

    const statsFilter: any = {};
    if (segment) statsFilter.segment = segment;
    if (agentId) statsFilter.assignedAgentId = new Types.ObjectId(agentId);

    let stats = await this.statsModel.find(statsFilter).sort({ priorityScore: -1 }).lean();

    // Apply search by joining user data
    const userIds = stats.map((s: any) => s.userId);
    const userFilter: any = { _id: { $in: userIds } };
    if (search?.trim()) {
      const digits = search.replace(/\D/g, '');
      userFilter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        ...(digits ? [{ phone: { $regex: digits } }] : []),
      ];
    }
    const users = await this.userModel.find(userFilter).select('_id name phone tags').lean();
    const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

    stats = stats.filter((s: any) => userMap.has(s.userId.toString()));
    const total = stats.length;
    const slice = stats.slice((page - 1) * limit, page * limit);

    return {
      data: slice.map((s: any) => ({ ...s, user: userMap.get(s.userId.toString()) })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async getCustomer360(userId: string) {
    const uid = new Types.ObjectId(userId);
    const [user, stats, calls, orders] = await Promise.all([
      this.userModel.findById(uid).lean(),
      this.statsModel.findOne({ userId: uid }).lean(),
      this.callLogModel.find({ customerId: uid }).sort({ createdAt: -1 }).limit(50).lean(),
      (this.statsModel as any).db.collection('orders').find(
        { user: uid, status: { $in: ['delivered', 'completed'] } },
        { projection: { orderNumber: 1, total: 1, createdAt: 1, items: 1 } }
      ).sort({ createdAt: -1 }).limit(20).toArray(),
    ]);
    if (!user) throw new NotFoundException('Customer not found');
    return { user, stats, calls, orders };
  }

  // ─── Queue ───────────────────────────────────────────────────────────────

  async getQueue(opts: { agentId?: string; tab: 'today' | 'overdue' | 'at_risk' | 'upcoming' | 'all' }) {
    const { agentId, tab } = opts;
    const filter: any = {};
    if (agentId) filter.assignedAgentId = new Types.ObjectId(agentId);

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    if (tab === 'today') {
      filter.segment = 'Overdue';
      filter.predictedReorderDate = { $gte: todayStart, $lte: todayEnd };
    } else if (tab === 'overdue') {
      filter.segment = 'Overdue';
      filter.predictedReorderDate = { $lt: todayStart };
    } else if (tab === 'at_risk') {
      filter.segment = 'At Risk';
    } else if (tab === 'upcoming') {
      filter.segment = 'Due Soon';
    } else {
      filter.segment = { $in: ['Due Soon', 'Overdue', 'At Risk'] };
    }

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
    // Update lastCallAt and lastCallOutcome on stats
    await this.statsModel.findOneAndUpdate(
      { userId: customerId },
      { $set: { lastCallAt: new Date(), lastCallOutcome: dto.outcome } },
    );
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

    const stats = await this.statsModel
      .find({ segment: { $in: campaign.segmentFilter } })
      .select('userId')
      .lean();
    const userIds = stats.map((s: any) => s.userId);
    const users = await this.userModel.find({ _id: { $in: userIds }, isBlocked: { $ne: true } }).select('phone').lean();

    let sent = 0;
    for (const user of users) {
      if (!user.phone) continue;
      try {
        await this.whatsapp.sendTextMessage({ phone: user.phone, message: campaign.waMessage });
        sent++;
      } catch {
        // ponytail: fire-and-forget per user, don't fail the whole campaign on one bad number
      }
    }

    campaign.status = 'sent';
    campaign.sentAt = new Date();
    campaign.recipientCount = sent;
    await campaign.save();
    return { sent };
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
      { $match: { agentId: { $in: agentIds }, createdAt: { $gte: since } } },
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
    const [segmentCounts, totalCustomers, revenueAtRisk, callsLast30] = await Promise.all([
      this.statsModel.aggregate([{ $group: { _id: '$segment', count: { $sum: 1 } } }]),
      this.statsModel.countDocuments(),
      this.statsModel.aggregate([
        { $match: { segment: { $in: ['At Risk', 'Dormant'] } } },
        { $group: { _id: null, total: { $sum: '$ltv' } } },
      ]),
      this.callLogModel.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }),
    ]);

    const segMap = Object.fromEntries(segmentCounts.map((s: any) => [s._id, s.count]));
    const repeatCustomers = (segMap['Active'] ?? 0) + (segMap['Overdue'] ?? 0) + (segMap['At Risk'] ?? 0);
    const repeatRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

    return {
      segmentCounts: segMap,
      totalCustomers,
      repeatRate,
      revenueAtRisk: revenueAtRisk[0]?.total ?? 0,
      callsLast30,
    };
  }

  // ─── Settings ────────────────────────────────────────────────────────────

  async getSettings() {
    const s = await this.settingsModel.findOne().lean();
    return { reorderCycles: s?.reorderCycles ?? DEFAULT_REORDER_CYCLES };
  }

  async updateSettings(reorderCycles: Record<string, number>) {
    return this.settingsModel.findOneAndUpdate(
      {},
      { $set: { reorderCycles } },
      { upsert: true, new: true },
    );
  }

  // ─── Manual engine trigger ───────────────────────────────────────────────

  async triggerRefresh() {
    this.engine.refreshAll(); // fire-and-forget
    return { ok: true, message: 'Refresh started' };
  }
}
