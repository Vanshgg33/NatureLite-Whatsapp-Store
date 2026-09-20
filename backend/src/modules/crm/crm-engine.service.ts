// backend/src/modules/crm/crm-engine.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { CrmCustomerStats, CrmCustomerStatsDocument, CrmSegment } from './schemas/crm-customer-stats.schema';
import { CrmSettings, CrmSettingsDocument, DEFAULT_REORDER_CYCLES } from './schemas/crm-settings.schema';

@Injectable()
export class CrmEngineService {
  private readonly logger = new Logger(CrmEngineService.name);

  constructor(
    @InjectModel(CrmCustomerStats.name) private statsModel: Model<CrmCustomerStatsDocument>,
    @InjectModel(CrmSettings.name) private settingsModel: Model<CrmSettingsDocument>,
    @InjectModel('Order') private orderModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
  ) {}

  private async getCycles(): Promise<Record<string, number>> {
    const s = await this.settingsModel.findOne().lean();
    return s?.reorderCycles ?? DEFAULT_REORDER_CYCLES;
  }

  // median of a sorted array — resistant to outliers vs mean
  private median(nums: number[]): number {
    if (!nums.length) return 30;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  }

  async refreshUser(userId: string | Types.ObjectId): Promise<void> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const cycles = await this.getCycles();

    // One aggregation: orders → items → product → category
    const rows = await this.orderModel.aggregate([
      { $match: { user: uid, status: { $in: ['delivered', 'completed'] } } },
      { $sort: { createdAt: -1 } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: '_product',
        },
      },
      { $unwind: { path: '$_product', preserveNullAndEmpty: true } },
      {
        $lookup: {
          from: 'categories',
          localField: '_product.category',
          foreignField: '_id',
          as: '_category',
        },
      },
      { $unwind: { path: '$_category', preserveNullAndEmpty: true } },
      {
        $group: {
          _id: '$_id',
          createdAt: { $first: '$createdAt' },
          total: { $first: '$total' },
          items: {
            $push: {
              productId: '$items.product',
              productName: '$items.name',
              qty: '$items.quantity',
              categoryName: { $ifNull: ['$_category.name', 'Other'] },
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    if (!rows.length) {
      // User has no completed orders — write a Lost stat so they appear in the system
      await this.statsModel.findOneAndUpdate(
        { userId: uid },
        {
          $set: {
            userId: uid,
            segment: 'Lost' as CrmSegment,
            isVip: false,
            predictedReorderDate: null,
            personalCycle: 30,
            topCategory: '',
            topProduct: '',
            ltv: 0,
            aov: 0,
            priorityScore: -999,
          },
        },
        { upsert: true, new: true },
      );
      return;
    }

    // Aggregate stats across all orders
    const totalOrders = rows.length;
    const ltv = rows.reduce((s: number, r: any) => s + (r.total ?? 0), 0);
    const aov = Math.round(ltv / totalOrders);
    const lastOrderDate: Date = rows[0].createdAt;

    // Top category and top product by cumulative qty
    const catQty: Record<string, number> = {};
    const prodQty: Record<string, number> = {};
    for (const row of rows) {
      for (const item of row.items ?? []) {
        catQty[item.categoryName] = (catQty[item.categoryName] ?? 0) + item.qty;
        prodQty[item.productName] = (prodQty[item.productName] ?? 0) + item.qty;
      }
    }
    const topCategory = Object.entries(catQty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const topProduct = Object.entries(prodQty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    // Personal cycle: median of inter-order gaps if >= 3 orders, else default
    let personalCycle: number;
    if (totalOrders >= 3) {
      const dates = rows.map((r: any) => new Date(r.createdAt).getTime()).sort((a, b) => b - a);
      const gaps: number[] = [];
      for (let i = 0; i < dates.length - 1; i++) {
        gaps.push(Math.round((dates[i] - dates[i + 1]) / 86400000));
      }
      personalCycle = this.median(gaps.filter(g => g > 0));
    } else {
      personalCycle = cycles[topCategory] ?? 30;
    }

    const now = new Date();
    const predictedReorderDate = new Date(lastOrderDate.getTime() + personalCycle * 86400000);
    const daysOverdue = Math.round((now.getTime() - predictedReorderDate.getTime()) / 86400000);

    // Segment
    let segment: CrmSegment;
    if (totalOrders === 1 && daysOverdue < 0) segment = 'New';
    else if (totalOrders >= 2 && daysOverdue < -3) segment = 'Active';
    else if (daysOverdue >= -3 && daysOverdue < 0) segment = 'Due Soon';
    else if (daysOverdue >= 0 && daysOverdue < 30) segment = 'Overdue';
    else if (daysOverdue >= 30 && daysOverdue < 90) segment = 'At Risk';
    else if (daysOverdue >= 90 && daysOverdue < 180) segment = 'Dormant';
    else segment = 'Lost';

    // Priority score (isVip flag set by refreshAll only — too expensive per-user)
    const existing = await this.statsModel.findOne({ userId: uid }).lean();
    const isVip = existing?.isVip ?? false;
    const priorityScore = daysOverdue + ltv / 1000 + (isVip ? 50 : 0) - (segment === 'Lost' ? 999 : 0);

    await this.statsModel.findOneAndUpdate(
      { userId: uid },
      {
        $set: {
          userId: uid,
          segment,
          predictedReorderDate,
          personalCycle,
          topCategory,
          topProduct,
          ltv,
          aov,
          priorityScore,
        },
      },
      { upsert: true, new: true },
    );
  }

  @Cron('0 2 * * *', { timeZone: 'Asia/Kolkata' })
  async refreshAll(): Promise<void> {
    this.logger.log('CRM engine: starting full refresh');
    const users = await this.userModel.find({ isActive: true }).select('_id').lean();

    // Refresh all users
    await Promise.all(users.map((u: any) => this.refreshUser(u._id).catch(err =>
      this.logger.warn(`CRM refresh failed for user ${u._id}: ${err.message}`)
    )));

    // Recompute VIP: top 10% by LTV
    const allStats = await this.statsModel.find().select('userId ltv').sort({ ltv: -1 }).lean();
    const vipCutoff = Math.max(1, Math.floor(allStats.length * 0.1));
    const vipIds = allStats.slice(0, vipCutoff).map((s: any) => s._id);
    await this.statsModel.updateMany({ _id: { $in: vipIds } }, { $set: { isVip: true } });
    await this.statsModel.updateMany({ _id: { $nin: vipIds } }, { $set: { isVip: false } });

    // Recompute priorityScore now that isVip is accurate
    const allWithVip = await this.statsModel.find().lean();
    await Promise.all(allWithVip.map((s: any) => {
      const score = (s.predictedReorderDate
        ? Math.round((Date.now() - new Date(s.predictedReorderDate).getTime()) / 86400000)
        : 0)
        + s.ltv / 1000
        + (s.isVip ? 50 : 0)
        - (s.segment === 'Lost' ? 999 : 0);
      return this.statsModel.updateOne({ _id: s._id }, { $set: { priorityScore: score } });
    }));

    this.logger.log(`CRM engine: refreshed ${users.length} users`);
  }
}
