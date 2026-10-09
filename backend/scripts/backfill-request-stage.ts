/**
 * Backfill stage + stageEnteredAt on all PurchaseRequest parent docs.
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/backfill-request-stage.ts
 * Apply: ... --apply
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { deriveRequestStage, parentStatusToPos, statusToBucket } from '../src/modules/purchase/lib/stage';

dotenv.config({ path: '.env' });

const REQUEST_SCHEMA = new mongoose.Schema(
  {
    reqNo: String, parentId: String, status: String,
    stage: String, stageEnteredAt: Date,
    timeline: [{ action: String, status: String, byName: String, at: Date }],
    updatedAt: Date, createdAt: Date,
  },
  { timestamps: true, strict: false },
);

async function run() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI!);

  const Request = mongoose.model('PurchaseRequest', REQUEST_SCHEMA);
  const parents = await Request.find({ parentId: { $exists: false } }).lean();

  const splitIds = parents.filter(r => r.status === 'SPLIT').map(r => r._id.toString());
  const childMap = new Map<string, any[]>();
  if (splitIds.length > 0) {
    const children = await Request.find({ parentId: { $in: splitIds } }).lean();
    for (const c of children) {
      if (!childMap.has(c.parentId)) childMap.set(c.parentId, []);
      childMap.get(c.parentId)!.push(c);
    }
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} — ${parents.length} parent requests`);
  console.log('─'.repeat(70));
  console.log(`${'PR No'.padEnd(20)} ${'Old status'.padEnd(22)} ${'Old stage'.padEnd(22)} → New stage`);
  console.log('─'.repeat(70));

  let changed = 0;
  for (const req of parents) {
    const children = childMap.get(req._id.toString()) || [];
    const pos = children.length > 0
      ? children.map((c: any) => ({ bucket: statusToBucket(c.status) }))
      : parentStatusToPos(req.status);
    const newStage = deriveRequestStage(req as any, pos);

    // Best-guess stageEnteredAt from timeline
    const relevantActions: Record<string, string[]> = {
      NEEDS_PO:          ['Purchase request created'],
      AWAITING_APPROVAL: ['PO', 'Split'],
      AWAITING_DELIVERY: ['Approved', 'APPROVED'],
      PARTLY_RECEIVED:   ['Vendor bill', 'VENDOR_BILL'],
      READY_TO_CLOSE:    ['Goods received', 'COMPLETED'],
      CLOSED:            ['Goods received', 'closed', 'COMPLETED'],
      CANCELLED:         ['Cancelled', 'CANCELLED'],
    };
    const keywords = relevantActions[newStage] || [];
    const timeline: any[] = req.timeline || [];
    const match = [...timeline].reverse().find(t =>
      keywords.some(k => t.action?.toLowerCase().includes(k.toLowerCase()) || t.status?.includes(k)),
    );
    const stageEnteredAt: Date = match?.at ? new Date(match.at) : (req.updatedAt || req.createdAt || new Date());

    const oldStage = req.stage || '(none)';
    console.log(`${(req.reqNo || '?').padEnd(20)} ${req.status.padEnd(22)} ${oldStage.toString().padEnd(22)} → ${newStage}`);

    if (oldStage !== newStage) changed++;

    if (apply) {
      await Request.updateOne(
        { _id: req._id },
        { $set: { stage: newStage, stageEnteredAt } },
      );
    }
  }

  console.log('─'.repeat(70));
  console.log(`${changed} requests would change stage.`);
  if (!apply) console.log('\nRe-run with --apply to write changes.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
