/**
 * Lists PurchaseRequest docs that look like test/junk data.
 * Does NOT change anything. Om reviews the output and confirms which _ids to flag.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/list-test-candidates.ts
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const REQUEST_SCHEMA = new mongoose.Schema(
  {
    reqNo: String, status: String, isTest: Boolean,
    items: [{ materialName: String, qtyKg: Number }],
    createdAt: Date, updatedAt: Date,
  },
  { timestamps: true, strict: false },
);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const Request = mongoose.model('PurchaseRequest', REQUEST_SCHEMA);

  // Suspect: any item with qty >= 5000, or created+cancelled within 10 min
  const all = await Request.find({ parentId: { $exists: false }, isTest: { $ne: true } }).lean();

  const suspects: { reqNo: string; reason: string; items: string }[] = [];

  for (const r of all) {
    const reasons: string[] = [];

    // Huge quantities
    for (const item of (r.items || [])) {
      if ((item.qtyKg || 0) >= 5000) {
        reasons.push(`${item.materialName} ${item.qtyKg} kg (≥5000)`);
      }
    }

    // Created and cancelled within 10 minutes
    if (r.status === 'CANCELLED' && r.createdAt && r.updatedAt) {
      const diffMin = (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 60_000;
      if (diffMin < 10) reasons.push(`created+cancelled in ${diffMin.toFixed(1)} min`);
    }

    if (reasons.length > 0) {
      suspects.push({
        reqNo: r.reqNo || '?',
        reason: reasons.join('; '),
        items: (r.items || []).map((i: any) => `${i.materialName} ${i.qtyKg}kg`).join(', '),
      });
    }
  }

  if (suspects.length === 0) {
    console.log('No test candidates found.');
  } else {
    console.log(`\n${suspects.length} suspect docs (review before flagging isTest=true):\n`);
    console.log(`${'PR No'.padEnd(18)} ${'Items'.padEnd(50)} Reason`);
    console.log('─'.repeat(100));
    for (const s of suspects) {
      console.log(`${s.reqNo.padEnd(18)} ${s.items.slice(0, 48).padEnd(50)} ${s.reason}`);
    }
    console.log('\nTo flag confirmed test docs, run:');
    console.log('  db.purchaserequests.updateMany({ reqNo: { $in: [...] } }, { $set: { isTest: true } })');
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
