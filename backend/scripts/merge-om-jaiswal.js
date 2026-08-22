/**
 * Merge "Om Jaiswal" (+91 9561883384, 2 orders) into "om" (919561883384, 7 orders).
 * Reassigns orders, updates stats on the canonical account, deletes the dupe.
 */
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const DUPE_ID   = new ObjectId('6a38c51d7b6abc2fe915fc01'); // Om Jaiswal +91 9561883384
const KEEP_ID   = new ObjectId('6a2a425627f7c54e16f2ae74'); // om 919561883384

async function run() {
  const client = await MongoClient.connect(URI);
  const db = client.db();

  const dupe = await db.collection('users').findOne({ _id: DUPE_ID });
  const keep = await db.collection('users').findOne({ _id: KEEP_ID });

  if (!dupe || !keep) { console.error('User not found'); await client.close(); return; }
  console.log(`Dupe : ${dupe._id} "${dupe.name}" phone=${dupe.phone} orders=${dupe.totalOrders} spent=${dupe.totalSpent}`);
  console.log(`Keep : ${keep._id} "${keep.name}" phone=${keep.phone} orders=${keep.totalOrders} spent=${keep.totalSpent}`);

  // Reassign orders
  const orderResult = await db.collection('orders').updateMany(
    { userId: DUPE_ID },
    { $set: { userId: KEEP_ID } },
  );
  console.log(`Orders reassigned: ${orderResult.modifiedCount}`);

  // Recalculate totals on canonical account
  const agg = await db.collection('orders').aggregate([
    { $match: { userId: KEEP_ID } },
    { $group: { _id: null, count: { $sum: 1 }, spent: { $sum: '$total' } } },
  ]).toArray();

  const { count = 0, spent = 0 } = agg[0] ?? {};
  await db.collection('users').updateOne(
    { _id: KEEP_ID },
    { $set: { totalOrders: count, totalSpent: spent } },
  );
  console.log(`Canonical totals updated: orders=${count} spent=${spent}`);

  // Delete dupe
  await db.collection('users').deleteOne({ _id: DUPE_ID });
  console.log(`Deleted dupe ${DUPE_ID}`);

  await client.close();
  console.log('Done.');
}

run().catch(e => { console.error(e.message); process.exit(1); });
