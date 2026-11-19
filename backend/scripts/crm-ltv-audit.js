// READ-ONLY audit: compares each customer's stored CRM LTV with their real purchase records.
// It only reads (find / aggregate); it never writes. Run from backend/:  node scripts/crm-ltv-audit.js
// Same definition as src/modules/crm/crm-purchases.ts + crm-engine.service.ts:
//   delivered non-replacement online orders (refunded-after-delivery ones net of the refund)
//   + active store sale bills − active credit notes, floored at 0.
// After a deploy, stored values differ until the CRM engine re-runs (nightly 2 AM, or CRM "Refresh").
// If Node cannot resolve the Atlas SRV record on Windows, set DNS_SERVER to your system DNS server.
require('dotenv').config();
if (process.env.DNS_SERVER) require('dns').setServers([process.env.DNS_SERVER]);
const { MongoClient } = require('mongodb');

(async () => {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();
  const orders = await db.collection('orders').find(
    { orderType: { $ne: 'replacement' }, $or: [{ status: 'delivered' }, { status: 'refunded', $or: [{ deliveredAt: { $ne: null } }, { 'timeline.status': 'delivered' }] }] },
    { projection: { user: 1, status: 1, total: 1 } },
  ).toArray();
  const refundedIds = orders.filter(o => o.status === 'refunded').map(o => o._id);
  const pays = await db.collection('payments').find({ order: { $in: refundedIds }, status: 'refunded' }, { projection: { order: 1, amount: 1, refundAmount: 1 } }).toArray();
  const payBy = new Map();
  for (const p of pays) payBy.set(String(p.order), [...(payBy.get(String(p.order)) || []), p]);
  const bills = await db.collection('billingbills').find({ status: 'active', docType: { $in: ['SALE', 'CREDIT_NOTE', null] } }, { projection: { customerId: 1, docType: 1, grandTotal: 1 } }).toArray();

  const expected = new Map();
  const add = (u, v) => expected.set(String(u), (expected.get(String(u)) || 0) + v);
  for (const o of orders) {
    let net = o.total || 0;
    if (o.status === 'refunded') {
      const ps = payBy.get(String(o._id)) || [];
      const full = !ps.length || ps.some(p => p.refundAmount == null || p.refundAmount >= (p.amount || 0));
      net = full ? 0 : Math.max(0, net - ps.reduce((s, p) => s + (p.refundAmount || 0), 0));
    }
    add(o.user, net);
  }
  for (const b of bills) add(b.customerId, (b.docType === 'CREDIT_NOTE' ? -1 : 1) * (b.grandTotal || 0));

  const users = new Set((await db.collection('users').find({}, { projection: { _id: 1 } }).toArray()).map(u => String(u._id)));
  const stats = new Map((await db.collection('crmcustomerstats').find({}, { projection: { userId: 1, ltv: 1 } }).toArray()).map(s => [String(s.userId), s.ltv || 0]));
  let match = 0; const diffs = []; let orphans = 0;
  for (const [u, raw] of expected) {
    if (!users.has(u)) { orphans++; continue; }
    const want = Math.max(0, Math.round(raw * 100) / 100), have = stats.get(u);
    if (have != null && Math.abs(have - want) < 0.01) match++; else diffs.push({ customerId: u, storedLtv: have ?? null, correctLtv: want });
  }
  diffs.sort((a, b) => Math.abs(b.correctLtv - (b.storedLtv || 0)) - Math.abs(a.correctLtv - (a.storedLtv || 0)));
  console.log(`customers with purchases: ${match + diffs.length} | LTV correct: ${match} | LTV differs or missing: ${diffs.length} | purchases linked to a missing customer: ${orphans}`);
  console.log('largest differences:', JSON.stringify(diffs.slice(0, 15), null, 1));
  await client.close();
})().catch(e => { console.error('Audit failed:', e.message); process.exit(1); });
