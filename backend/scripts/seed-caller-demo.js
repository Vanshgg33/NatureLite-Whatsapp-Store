// Caller Command Center demo data: N fake customers with mixed segments so 2–3 callers can rehearse a full day.
//   MONGODB_URI=... SEED_CALLER_DEMO=yes node scripts/seed-caller-demo.js [count=500]
//   MONGODB_URI=... SEED_CALLER_DEMO=yes node scripts/seed-caller-demo.js --clean
// Everything it creates is tagged "caller-demo" (phones 90000xxxxx) and --clean removes exactly that.
const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('Set MONGODB_URI (no default on purpose).'); process.exit(1); }
if (process.env.SEED_CALLER_DEMO !== 'yes') { console.error('Refusing to run without SEED_CALLER_DEMO=yes (it writes demo customers).'); process.exit(1); }

const TAG = 'caller-demo';
const SEGMENTS = ['overdue', 'due_today', 'at_risk', 'dormant', 'overdue', 'due_today'];

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const stats = db.collection('crmcustomerstats');
  const demo = await users.find({ tags: TAG }).project({ _id: 1 }).toArray();
  const ids = demo.map((u) => u._id);

  if (process.argv.includes('--clean')) {
    const r = await Promise.all([
      stats.deleteMany({ userId: { $in: ids } }),
      db.collection('crmleadassignments').deleteMany({ customerId: { $in: ids } }),
      db.collection('crmcalllogs').deleteMany({ customerId: { $in: ids } }),
      db.collection('crmreminders').deleteMany({ customerId: { $in: ids } }),
      users.deleteMany({ _id: { $in: ids } }),
    ]);
    console.log(`Removed ${r[4].deletedCount} demo customers and their CRM rows.`);
    return;
  }

  const count = Math.min(2000, Math.max(1, Number(process.argv[2]) || 500));
  if (ids.length) { console.error(`${ids.length} demo customers already exist. Run with --clean first.`); process.exit(1); }
  const now = Date.now();
  const docs = Array.from({ length: count }, (_, i) => ({
    name: `Demo Lead ${i + 1}`, phone: `90000${String(i).padStart(5, '0')}`, tags: [TAG], isActive: true,
    createdAt: new Date(now - (i % 10 === 0 ? 3_600_000 : 90 * 86_400_000)), updatedAt: new Date(),
  }));
  const ins = await users.insertMany(docs);
  const userIds = Object.values(ins.insertedIds);
  await stats.insertMany(userIds.map((userId, i) => {
    const segment = SEGMENTS[i % SEGMENTS.length];
    return {
      userId, segment, isVip: i % 25 === 0, ltv: 500 + ((i * 137) % 9000), ltvPct: (i % 100) / 100, aov: 800, validOrders: 1 + (i % 6),
      predictedReorderDate: new Date(now - (i % 20) * 86_400_000), daysLate: i % 20, priorityScore: i % 100, priorityBand: 'medium',
      callbackAt: i % 40 === 0 ? new Date(now + 2 * 3_600_000) : null, consecutiveNoAnswer: i % 7 === 0 ? 1 : 0, callAttempts: 0,
      isDismissed: false, phoneInvalid: false, doNotCall: false, snoozedUntil: null, tags: [TAG], notes: [],
      topProduct: ['Wood-pressed Groundnut Oil 1L', 'A2 Desi Ghee 500ml', 'Multigrain Atta 5kg'][i % 3],
      createdAt: new Date(), updatedAt: new Date(),
    };
  }));
  console.log(`Created ${count} demo customers. Start 2–3 caller shifts (or press "Distribute today" on /crm/live).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
