/**
 * One-time migration: normalize all user phone numbers to E.164-ish format
 * (91 prefix for Indian numbers). Merges duplicate accounts that map to the
 * same normalized phone by keeping the one with more orders.
 *
 * Run from backend/: node scripts/normalize-phones.js
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI not set'); process.exit(1); }

function normalizePhone(raw) {
  const digits = (raw || '').replace(/[^\d]/g, '');
  let n = digits;
  if (n.length === 10) n = '91' + n;
  else if (n.length === 11 && n.startsWith('0')) n = '91' + n.slice(1);
  return n.length >= 10 ? n : null;
}

async function run() {
  const client = await MongoClient.connect(URI);
  const db = client.db();
  const users = db.collection('users');

  const all = await users.find({}, {
    projection: { _id: 1, phone: 1, name: 1, totalOrders: 1, totalSpent: 1 }
  }).toArray();
  console.log(`Total users: ${all.length}`);

  // Group by normalized phone
  const groups = new Map();
  for (const u of all) {
    const n = normalizePhone(u.phone);
    if (!n) {
      console.log(`  SKIP (invalid phone): ${u._id} phone=${u.phone}`);
      continue;
    }
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(u);
  }

  let updated = 0;
  let deleted = 0;
  const warnings = [];

  for (const [normalized, group] of groups) {
    if (group.length === 1 && group[0].phone === normalized) continue; // already clean

    // Sort: most orders first (most active account is canonical), then highest spend
    group.sort((a, b) =>
      (b.totalOrders || 0) - (a.totalOrders || 0) ||
      (b.totalSpent || 0) - (a.totalSpent || 0)
    );
    const [keep, ...dupes] = group;

    // Step 1: delete zero-order dupes FIRST (clears the unique index slots)
    for (const dupe of dupes) {
      if ((dupe.totalOrders || 0) === 0) {
        await users.deleteOne({ _id: dupe._id });
        console.log(`  DELETE dupe: ${dupe._id} "${dupe.name}" phone=${dupe.phone} (0 orders)`);
        deleted++;
      } else {
        warnings.push(`  WARN manual merge needed: ${dupe._id} "${dupe.name}" phone=${dupe.phone} orders=${dupe.totalOrders} totalSpent=${dupe.totalSpent} → canonical is ${keep._id} "${keep.name}"`);
      }
    }

    // Step 2: now update canonical phone to normalized form
    if (keep.phone !== normalized) {
      try {
        await users.updateOne({ _id: keep._id }, { $set: { phone: normalized } });
        console.log(`  NORMALIZE: ${keep._id} "${keep.name}" ${keep.phone} → ${normalized}`);
        updated++;
      } catch (e) {
        console.log(`  ERROR updating ${keep._id} "${keep.name}" ${keep.phone} → ${normalized}: ${e.message}`);
      }
    }
  }

  console.log(`\nDone. Normalized: ${updated}, Deleted zero-order dupes: ${deleted}`);
  if (warnings.length) {
    console.log(`\nManual merges needed (accounts with orders that share a normalized phone):`);
    for (const w of warnings) console.log(w);
  }
  await client.close();
}

run().catch(e => { console.error(e.message); process.exit(1); });
