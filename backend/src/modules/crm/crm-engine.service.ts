import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { CrmCustomerStats, CrmCustomerStatsDocument } from './schemas/crm-customer-stats.schema';
import { CrmSettings, CrmSettingsDocument, DEFAULT_REORDER_CYCLES } from './schemas/crm-settings.schema';
import { CrmEngineRun, CrmEngineRunDocument, EngineRunTrigger } from './schemas/crm-engine-run.schema';
import {
  getISTDate,
  computeDaysLate,
  resolveCycle,
  computeSegment,
  computeVip,
  computePriority,
  computeLtvPct,
  DEFAULT_THRESHOLDS,
  DEFAULT_VIP,
  type Segment,
  type OrderForCycle,
} from './engine/status-model';

interface SettingsSnapshot {
  reorderCycles: Record<string, number>;
  fallbackCycleDays: number;
  thresholds: typeof DEFAULT_THRESHOLDS;
  vip: typeof DEFAULT_VIP;
}

@Injectable()
export class CrmEngineService implements OnModuleInit {
  private readonly logger = new Logger(CrmEngineService.name);

  constructor(
    @InjectModel(CrmCustomerStats.name) private statsModel: Model<CrmCustomerStatsDocument>,
    @InjectModel(CrmSettings.name) private settingsModel: Model<CrmSettingsDocument>,
    @InjectModel(CrmEngineRun.name) private runModel: Model<CrmEngineRunDocument>,
    @InjectModel('Order') private orderModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
  ) {}

  async onModuleInit() {
    const count = await this.statsModel.countDocuments();
    if (count === 0) {
      this.logger.log('CRM engine: no stats found, seeding initial data...');
      this.refreshAll('cron').catch(err => this.logger.error(`Initial seed failed: ${err.message}`));
    }
  }

  private async getSettings(): Promise<SettingsSnapshot> {
    const s = await this.settingsModel.findOne().lean();
    return {
      reorderCycles: s?.reorderCycles ?? DEFAULT_REORDER_CYCLES,
      fallbackCycleDays: s?.fallbackCycleDays ?? 30,
      thresholds: s?.thresholds ?? DEFAULT_THRESHOLDS,
      vip: s?.vip ?? DEFAULT_VIP,
    };
  }

  private isNameMissing(name: string | undefined | null, phone: string | undefined | null): boolean {
    if (!name || name.trim().length < 2) return true;
    if (!/\p{L}/u.test(name)) return true;
    const digits = phone?.replace(/\D/g, '') ?? '';
    if (digits.length >= 4 && name.replace(/\D/g, '').includes(digits.slice(-4))) return true;
    if (/\S+@\S+\.\S+/.test(name)) return true;
    return false;
  }

  async refreshUser(userId: string | Types.ObjectId): Promise<void> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const settings = await this.getSettings();
    const today = getISTDate();

    const [user, rows] = await Promise.all([
      this.userModel.findById(uid).select('name phone').lean<{ name?: string; phone?: string }>(),
      this.orderModel.aggregate([
        { $match: { user: uid, status: 'delivered' } },
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
        { $unwind: { path: '$_product', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'categories',
            localField: '_product.category',
            foreignField: '_id',
            as: '_category',
          },
        },
        { $unwind: { path: '$_category', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$_id',
            createdAt: { $first: '$createdAt' },
            total: { $first: '$total' },
            items: {
              $push: {
                productName: '$items.name',
                qty: '$items.quantity',
                categoryName: { $ifNull: ['$_category.name', ''] },
              },
            },
          },
        },
        { $sort: { createdAt: -1 } },
      ]),
    ]);

    const nameMissing = this.isNameMissing(user?.name, user?.phone);

    if (!rows.length) {
      await this.statsModel.findOneAndUpdate(
        { userId: uid },
        {
          $set: {
            userId: uid,
            segment: 'no_orders' as Segment,
            daysLate: 0,
            segmentUpdatedAt: today,
            isVip: false,
            predictedReorderDate: null,
            personalCycle: settings.fallbackCycleDays,
            cycleSource: 'fallback',
            topCategory: '',
            topProduct: '',
            ltv: 0,
            aov: 0,
            priorityScore: 0,
            priorityBand: 'low',
            nameMissing,
          },
        },
        { upsert: true, new: true },
      );
      return;
    }

    const totalOrders = rows.length;
    const ltv = rows.reduce((s: number, r: any) => s + (r.total ?? 0), 0);
    const aov = Math.round(ltv / totalOrders);
    const lastOrderDate: Date = new Date(rows[0].createdAt);

    const catQty: Record<string, number> = {};
    const prodQty: Record<string, number> = {};
    for (const row of rows) {
      for (const item of row.items ?? []) {
        if (item.categoryName) catQty[item.categoryName] = (catQty[item.categoryName] ?? 0) + item.qty;
        if (item.productName) prodQty[item.productName] = (prodQty[item.productName] ?? 0) + item.qty;
      }
    }
    const topCategory = Object.entries(catQty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const topProduct = Object.entries(prodQty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    const lastOrderCategories = [...new Set(
      (rows[0].items ?? []).map((i: any) => i.categoryName).filter(Boolean)
    )] as string[];
    const ordersForCycle: OrderForCycle[] = rows.map((r: any, idx: number) => ({
      date: new Date(r.createdAt),
      categories: idx === 0 ? lastOrderCategories : [],
    }));

    const { days: cycleDays, source: cycleSource } = resolveCycle(
      ordersForCycle,
      settings.reorderCycles,
      settings.fallbackCycleDays,
    );

    const nextDueDate = new Date(lastOrderDate.getTime() + cycleDays * 86_400_000);
    const istNextDue = getISTDate(nextDueDate);
    const daysLate = computeDaysLate(istNextDue, today);

    const segment = computeSegment(daysLate, totalOrders, settings.thresholds);
    const isVip = computeVip(totalOrders, ltv, settings.vip);

    const existing = await this.statsModel.findOne({ userId: uid }).select('ltvPct').lean();
    const ltvPct = (existing as any)?.ltvPct ?? 0;
    const { score: priorityScore, band: priorityBand } = computePriority(ltvPct, daysLate, totalOrders);

    await this.statsModel.findOneAndUpdate(
      { userId: uid },
      {
        $set: {
          userId: uid,
          segment,
          daysLate,
          segmentUpdatedAt: today,
          isVip,
          predictedReorderDate: istNextDue,
          personalCycle: cycleDays,
          cycleSource,
          topCategory,
          topProduct,
          ltv,
          aov,
          priorityScore,
          priorityBand,
          nameMissing,
        },
      },
      { upsert: true, new: true },
    );
  }

  @Cron('0 2 * * *', { timeZone: 'Asia/Kolkata' })
  async refreshAll(trigger: EngineRunTrigger = 'cron'): Promise<void> {
    this.logger.log(`CRM engine: starting full refresh (trigger=${trigger})`);

    const run = await this.runModel.create({
      startedAt: new Date(),
      trigger,
      customersProcessed: 0,
      segmentCounts: {},
      errors: [],
    });

    const errors: string[] = [];
    const users = await this.userModel.find().select('_id').lean();

    await Promise.all(
      users.map((u: any) =>
        this.refreshUser(u._id).catch(err => {
          const msg = `user ${u._id}: ${err.message}`;
          errors.push(msg);
          this.logger.warn(`CRM refresh failed for ${msg}`);
        }),
      ),
    );

    // Recompute LTV percentiles and priority for all customers with orders
    const allStats = await this.statsModel
      .find({ ltv: { $gt: 0 } })
      .select('_id ltv daysLate segment')
      .lean();

    const sorted = [...allStats].sort((a: any, b: any) => a.ltv - b.ltv).map((s: any) => s.ltv);

    await Promise.all(
      allStats.map((s: any) => {
        const ltvPct = computeLtvPct(s.ltv, sorted);
        const { score: priorityScore, band: priorityBand } = computePriority(
          ltvPct,
          s.daysLate ?? 0,
          s.segment === 'new' || s.segment === 'no_orders' ? 1 : 2,
        );
        return this.statsModel.updateOne(
          { _id: s._id },
          { $set: { ltvPct, priorityScore, priorityBand } },
        );
      }),
    );

    // Record segment counts for the run log
    const segRows = await this.statsModel.aggregate([
      { $group: { _id: '$segment', count: { $sum: 1 } } },
    ]);
    const segmentCounts = Object.fromEntries(segRows.map((r: any) => [r._id, r.count]));

    await this.runModel.updateOne(
      { _id: run._id },
      {
        $set: {
          finishedAt: new Date(),
          customersProcessed: users.length,
          segmentCounts,
          errors,
        },
      },
    );

    this.logger.log(`CRM engine: refreshed ${users.length} users (${errors.length} errors)`);
  }

  async getLastRun() {
    return this.runModel.findOne().sort({ startedAt: -1 }).lean();
  }
}
