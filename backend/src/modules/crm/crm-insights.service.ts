import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmCallLog } from './schemas/crm-call-log.schema';
import { CrmMarketingSpend } from './schemas/crm-marketing-spend.schema';
import { Subscription } from '../subscriptions/schemas/subscription.schema';
import { attributeOrders, buildAcquisition, buildInvestorSnapshot, buildSegments, monthKey, OrderRow } from './crm-insights.logic';

const VALID = { status: { $nin: ['cancelled', 'returned', 'refunded'] } };
const MAX_ROWS = 200_000; // shortcut: whole-history scan in memory; move to $group pipelines past ~200k orders

@Injectable()
export class CrmInsightsService {
  constructor(
    @InjectModel('Order') private readonly orderModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel(CrmCallLog.name) private readonly callModel: Model<any>,
    @InjectModel(CrmMarketingSpend.name) private readonly spendModel: Model<any>,
    @InjectModel(Subscription.name) private readonly subModel: Model<any>,
  ) {}

  private async orderRows(withCategories = false): Promise<OrderRow[]> {
    const pipeline: any[] = [{ $match: VALID }, { $limit: MAX_ROWS }];
    if (withCategories) pipeline.push({ $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } });
    pipeline.push({ $project: { user: 1, total: 1, discount: 1, createdAt: 1, source: 1, ...(withCategories && { cats: '$p.category' }) } });
    const rows = await this.orderModel.aggregate(pipeline);
    return rows.map((r) => ({ ...r, user: String(r.user), discount: r.discount ?? 0, cats: r.cats?.map(String) }));
  }

  async segments() {
    const segs = buildSegments(await this.orderRows(true));
    const ids = [...new Set(segs.flatMap((s) => s.top.map((m) => m.user)))].map((i) => new Types.ObjectId(i));
    const users = await this.userModel.find({ _id: { $in: ids } }).select('name phone').lean();
    const u = new Map(users.map((x: any) => [String(x._id), x]));
    return segs.map((s) => ({ ...s, top: s.top.map((m) => ({ ...m, name: (u.get(m.user) as any)?.name ?? '', phone: (u.get(m.user) as any)?.phone ?? '' })) }));
  }

  async subscriptions() {
    const [items, counts] = await Promise.all([
      this.subModel.find().sort({ nextDeliveryDate: 1 }).limit(200).populate('user', 'name phone').select('user frequency status nextDeliveryDate totalAmount totalDeliveries').lean(),
      this.subModel.aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$totalAmount' } } }]),
    ]);
    return { items, counts: Object.fromEntries(counts.map((c) => [c._id, { count: c.n, amount: c.amount }])) };
  }

  async investor() {
    return { asOf: new Date(), ...buildInvestorSnapshot(await this.orderRows()) };
  }

  async attribution(days = 7) {
    const windowDays = Math.min(30, Math.max(1, days || 7));
    const since = new Date(Date.now() - 90 * 86_400_000);
    const [calls, orders] = await Promise.all([
      this.callModel.find({ type: 'call', outcome: { $ne: null }, createdAt: { $gte: new Date(+since - windowDays * 86_400_000) } }).select('customerId createdAt').limit(50_000).lean(),
      this.orderModel.find({ ...VALID, createdAt: { $gte: since } }).select('user total createdAt').limit(50_000).lean(),
    ]);
    const r = attributeOrders(
      calls.map((c: any) => ({ user: String(c.customerId), at: c.createdAt })),
      orders.map((o: any) => ({ id: String(o._id), user: String(o.user), total: o.total, createdAt: o.createdAt })),
      windowDays,
    );
    const total = orders.reduce((s: number, o: any) => s + o.total, 0);
    return { windowDays, periodDays: 90, attributedOrders: r.orders, attributedRevenue: r.revenue, totalOrders: orders.length, totalRevenue: total, sharePct: total ? Math.round((r.revenue / total) * 1000) / 10 : null };
  }

  async acquisition(month?: string) {
    const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : monthKey(new Date());
    const spend = await this.spendModel.find({ month: m }).lean();
    return { month: m, channels: buildAcquisition(await this.orderRows(), spend as any, m), spend };
  }

  async addSpend(body: { channel?: string; month?: string; amount?: number; note?: string }) {
    const amount = Number(body.amount);
    if (!body.channel?.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month ?? '') || !Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('channel, month (YYYY-MM) and a non-negative amount are required');
    }
    return this.spendModel.create({ channel: body.channel.trim(), month: body.month, amount, note: body.note ?? '' });
  }

  async deleteSpend(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id');
    if (!(await this.spendModel.findByIdAndDelete(id))) throw new NotFoundException();
    return { ok: true };
  }
}
