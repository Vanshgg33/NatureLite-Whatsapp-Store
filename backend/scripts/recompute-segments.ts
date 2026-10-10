/**
 * Recompute CRM segments for all customers using the new status model.
 *
 * Dry-run by default — shows before/after counts without writing.
 * Run:   npx ts-node -r tsconfig-paths/register scripts/recompute-segments.ts
 * Apply: npx ts-node -r tsconfig-paths/register scripts/recompute-segments.ts --apply
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import {
  getISTDate,
  computeDaysLate,
  resolveCycle,
  computeSegment,
  computeVip,
  computeLtvPct,
  computePriority,
  DEFAULT_THRESHOLDS,
  DEFAULT_VIP,
  type Segment,
  type OrderForCycle,
} from '../src/modules/crm/engine/status-model';

dotenv.config({ path: '.env' });

// ── Minimal schemas (strict:false so old fields pass through untouched) ──────

const StatsSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const SettingsSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

// ── Helpers ──────────────────────────────────────────────────────────────────

function isNameMissing(name: string | undefined | null, phone: string | undefined | null): boolean {
  if (!name || name.trim().length < 2) return true;
  if (!/\p{L}/u.test(name)) return true;
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (digits.length >= 4 && name.replace(/\D/g, '').includes(digits.slice(-4))) return true;
  if (/\S+@\S+\.\S+/.test(name)) return true;
  return false;
}

function printCounts(label: string, counts: Record<string, number>) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  console.log(`\n${label} (total: ${total})`);
  for (const [seg, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    if (n > 0) console.log(`  ${seg.padEnd(12)} ${n}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const apply = process.argv.includes('--apply');
  console.log(`\nrecompute-segments — ${apply ? '⚡ APPLY mode' : '🔍 DRY-RUN mode (pass --apply to write)'}`);

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB.');

  const Stats = mongoose.model('CrmCustomerStats', StatsSchema);
  const Settings = mongoose.model('CrmSettings', SettingsSchema);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));

  // ── Settings ──────────────────────────────────────────────────────────────
  const settings: any = await Settings.findOne().lean();
  const reorderCycles: Record<string, number> = settings?.reorderCycles ?? {
    'Oils (Wood-Pressed)': 32, 'Oils (Cold-Pressed)': 20,
    'Ghee': 50, 'Flours': 22, 'Pulses': 28, 'Spices': 45, 'Snacks': 18,
  };
  const fallbackCycleDays: number = settings?.fallbackCycleDays ?? 30;
  const thresholds = settings?.thresholds ?? DEFAULT_THRESHOLDS;
  const vipConfig = settings?.vip ?? DEFAULT_VIP;

  // ── Earliest order date ───────────────────────────────────────────────────
  const earliest: any = await Order.findOne({ status: 'delivered' }).sort({ createdAt: 1 }).select('createdAt').lean();
  if (earliest?.createdAt) {
    console.log(`\nEarliest delivered order: ${new Date(earliest.createdAt).toISOString().slice(0, 10)}`);
  }

  // ── Before counts ─────────────────────────────────────────────────────────
  const beforeRows: any[] = await Stats.aggregate([
    { $group: { _id: '$segment', count: { $sum: 1 } } },
  ]);
  const beforeCounts: Record<string, number> = Object.fromEntries(
    beforeRows.map(r => [r._id ?? 'null', r.count])
  );
  printCounts('BEFORE segments', beforeCounts);

  // ── Compute new stats for every user ─────────────────────────────────────
  const today = getISTDate();
  const users: any[] = await User.find().select('_id name phone').lean();
  console.log(`\nProcessing ${users.length} users...`);

  const updates: Array<{ userId: string; patch: Record<string, any> }> = [];

  for (const user of users) {
    const uid = user._id;

    const rows: any[] = await Order.aggregate([
      { $match: { user: uid, status: 'delivered' } },
      { $sort: { createdAt: -1 } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products', localField: 'items.product',
          foreignField: '_id', as: '_product',
        },
      },
      { $unwind: { path: '$_product', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'categories', localField: '_product.category',
          foreignField: '_id', as: '_category',
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
    ]);

    const nameMissing = isNameMissing(user.name, user.phone);

    if (!rows.length) {
      updates.push({
        userId: uid.toString(),
        patch: {
          segment: 'no_orders' as Segment,
          daysLate: 0,
          segmentUpdatedAt: today,
          isVip: false,
          predictedReorderDate: null,
          personalCycle: fallbackCycleDays,
          cycleSource: 'fallback',
          ltv: 0,
          aov: 0,
          priorityScore: 0,
          priorityBand: 'low',
          nameMissing,
        },
      });
      continue;
    }

    const totalOrders = rows.length;
    const ltv = rows.reduce((s: number, r: any) => s + (r.total ?? 0), 0);
    const aov = Math.round(ltv / totalOrders);
    const lastOrderDate = new Date(rows[0].createdAt);

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

    const lastCats = [...new Set((rows[0].items ?? []).map((i: any) => i.categoryName).filter(Boolean))] as string[];
    const ordersForCycle: OrderForCycle[] = rows.map((r: any, i: number) => ({
      date: new Date(r.createdAt),
      categories: i === 0 ? lastCats : [],
    }));

    const { days: cycleDays, source: cycleSource } = resolveCycle(ordersForCycle, reorderCycles, fallbackCycleDays);
    const nextDueDate = getISTDate(new Date(lastOrderDate.getTime() + cycleDays * 86_400_000));
    const daysLate = computeDaysLate(nextDueDate, today);
    const segment = computeSegment(daysLate, totalOrders, thresholds);
    const isVip = computeVip(totalOrders, ltv, vipConfig);

    updates.push({
      userId: uid.toString(),
      patch: {
        segment,
        daysLate,
        segmentUpdatedAt: today,
        isVip,
        predictedReorderDate: nextDueDate,
        personalCycle: cycleDays,
        cycleSource,
        topCategory,
        topProduct,
        ltv,
        aov,
        priorityScore: 0, // recalculated after percentile pass below
        priorityBand: 'low',
        nameMissing,
      },
    });
  }

  // ── LTV percentile pass ───────────────────────────────────────────────────
  const ltvsSorted = updates
    .map(u => u.patch.ltv as number)
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  for (const u of updates) {
    if (u.patch.ltv > 0) {
      const ltvPct = computeLtvPct(u.patch.ltv, ltvsSorted);
      const { score, band } = computePriority(ltvPct, u.patch.daysLate, u.patch.segment === 'new' || u.patch.segment === 'no_orders' ? 1 : 2);
      u.patch.priorityScore = score;
      u.patch.priorityBand = band;
      u.patch.ltvPct = ltvPct;
    }
  }

  // ── After counts (computed, not yet written) ──────────────────────────────
  const afterCounts: Record<string, number> = {};
  for (const u of updates) {
    const seg = u.patch.segment as string;
    afterCounts[seg] = (afterCounts[seg] ?? 0) + 1;
  }
  printCounts('AFTER segments (projected)', afterCounts);

  // ── Summary of changes ────────────────────────────────────────────────────
  const existingStats: any[] = await Stats.find().select('userId segment').lean();
  const existingMap = new Map(existingStats.map(s => [s.userId?.toString(), s.segment]));
  let changed = 0;
  let created = 0;
  for (const u of updates) {
    const old = existingMap.get(u.userId);
    if (!old) created++;
    else if (old !== u.patch.segment) changed++;
  }
  console.log(`\nChanges: ${created} new stats docs · ${changed} segment changes · ${updates.length - created - changed} unchanged`);

  if (!apply) {
    console.log('\nDry-run complete. Pass --apply to write changes.\n');
    await mongoose.disconnect();
    return;
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  console.log('\nWriting...');
  let done = 0;
  for (const u of updates) {
    await Stats.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(u.userId) },
      { $set: { userId: new mongoose.Types.ObjectId(u.userId), ...u.patch } },
      { upsert: true },
    );
    done++;
    if (done % 100 === 0) process.stdout.write(`  ${done}/${updates.length}\r`);
  }

  console.log(`\nDone. ${done} customer stats written.\n`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
