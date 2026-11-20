/**
 * Import Vyapar Sales Report → users + orders (zero duplicates, safe to re-run)
 *
 * Usage (from backend/):
 *   node scripts/import-vyapar.js --file "C:/path/SALE REPORT.xlsx" --dry-run   # counts only, no writes
 *   node scripts/import-vyapar.js --file "C:/path/SALE REPORT.xlsx"             # import
 *   node scripts/import-vyapar.js --rollback                                     # undo import
 *
 * - Skips cancelled invoices
 * - Matches customers by the last 10 digits of the phone (any stored format)
 * - New customers are stored as 91XXXXXXXXXX, like the rest of the users collection
 * - Skips orders already imported (orderNumber VYP-<invoice>)
 * - Relinks imported orders whose customer is missing to the customer with that phone
 * - Recomputes totalOrders / totalSpent / lastOrderAt from real orders for every touched customer
 */

const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGODB_URI not set (backend/.env)'); process.exit(1); }

/** Last 10 digits of an Indian phone, or null. This is the matching key for customers. */
function phone10(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}
assert.strictEqual(phone10('78799 88507'), '7879988507');
assert.strictEqual(phone10('+919329150256'), '9329150256');
assert.strictEqual(phone10('09329150256'), '9329150256');
assert.strictEqual(phone10('12345'), null);

function mapPaymentMethod(type) {
  const t = (type || '').toLowerCase();
  if (!t) return 'cod';
  if (t.includes('cash') && !t.includes('suhika') && !t.includes('razorpay')) return 'cod';
  if (t.includes('cheque')) return 'netbanking';
  // SUHIKA PVT LTD = their Razorpay/bank account = online payment
  return 'upi';
}

function mapPaymentStatus(status) {
  const s = (status || '').toLowerCase();
  if (s === 'paid') return 'paid';
  return 'pending'; // Unpaid / Partial
}

function parseExcelDate(raw) {
  if (!raw) return new Date();
  if (typeof raw === 'number') {
    const d = xlsx.SSF.parse_date_code(raw);
    return new Date(d.y, d.m - 1, d.d);
  }
  // DD/MM/YYYY
  if (typeof raw === 'string' && raw.includes('/')) {
    const [d, m, y] = raw.split('/');
    const parsed = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    if (!isNaN(parsed)) return parsed;
  }
  const parsed = new Date(raw);
  return isNaN(parsed) ? new Date() : parsed;
}

function loadSaleReport(filePath) {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = xlsx.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  // Headers at row index 3, data from row 4
  const H = raw[3];
  const invoices = [];
  for (const row of raw.slice(4)) {
    const invoiceNo = String(row[H.indexOf('Invoice No')] ?? row[2] ?? '').trim();
    if (!invoiceNo) continue;
    const txType = String(row[H.indexOf('Transaction Type')] ?? row[6] ?? '').trim();
    if (txType.toLowerCase().includes('cancelled')) continue; // skip cancelled
    invoices.push({
      invoiceNo,
      date:          row[H.indexOf('Date')] ?? row[0],
      partyName:     String(row[H.indexOf('Party Name')] ?? row[3] ?? '').trim(),
      phone:         String(row[H.indexOf('Party Phone No.')] ?? row[5] ?? '').trim(),
      city:          String(row[H.indexOf('CITY')] ?? row[14] ?? '').trim(),
      totalAmount:   parseFloat(row[H.indexOf('Total Amount')] ?? row[7]) || 0,
      paymentType:   String(row[H.indexOf('Payment Type')] ?? row[8] ?? '').trim(),
      paymentStatus: String(row[H.indexOf('Payment Status')] ?? row[11] ?? '').trim(),
    });
  }
  return invoices;
}

function loadItemDetails(filePath) {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[1]]; // Item Details sheet
  const raw = xlsx.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  // Headers at row index 2, empty row 3, data from row 4
  const H = raw[2];
  const map = new Map(); // invoiceNo → items[]
  for (const row of raw.slice(4)) {
    const invoiceNo = String(row[H.indexOf('Invoice No./Txn No.')] ?? row[1] ?? '').trim();
    if (!invoiceNo) continue;
    const name = String(row[H.indexOf('Item Name')] ?? row[3] ?? '').trim();
    if (!name) continue;
    const qty      = parseFloat(row[H.indexOf('Quantity')] ?? row[9]) || 1;
    const price    = parseFloat(row[H.indexOf('UnitPrice')] ?? row[11]) || 0;
    const tax      = parseFloat(row[H.indexOf('Tax')] ?? row[15]) || 0;
    const amount   = parseFloat(row[H.indexOf('Amount')] ?? row[17]) || price * qty;
    if (!map.has(invoiceNo)) map.set(invoiceNo, []);
    map.get(invoiceNo).push({ name, quantity: qty, price, total: amount, gstAmount: tax });
  }
  return map;
}

async function withRetry(fn, label = '') {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retriable = err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.name === 'MongoNetworkError' || err.name === 'MongoServerSelectionError';
      if (!retriable || attempt === 5) throw err;
      console.log(`  [retry ${attempt}/5] ${label} — ${err.code || err.message}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

async function rollback() {
  console.log('Connecting to DB for rollback...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');
  const ordersCol = db.collection('orders');

  const { deletedCount: ordersDeleted } = await ordersCol.deleteMany({ source: 'vyapar_import' });
  console.log(`Deleted ${ordersDeleted} imported orders`);
  const { deletedCount: usersDeleted } = await usersCol.deleteMany({ tags: 'vyapar-import' });
  console.log(`Deleted ${usersDeleted} imported users`);

  console.log('Re-aggregating stats for existing users...');
  const stats = await ordersCol.aggregate([
    { $group: { _id: '$user', totalOrders: { $sum: 1 }, totalSpent: { $sum: '$total' }, lastOrderAt: { $max: '$createdAt' } } },
    { $match: { _id: { $ne: null } } },
  ]).toArray();
  for (const s of stats) {
    await usersCol.updateOne(
      { _id: s._id },
      { $set: { totalOrders: s.totalOrders, totalSpent: s.totalSpent, lastOrderAt: s.lastOrderAt, updatedAt: new Date() } }
    );
  }
  await usersCol.updateMany(
    { _id: { $nin: stats.map(s => s._id) }, totalOrders: { $gt: 0 } },
    { $set: { totalOrders: 0, totalSpent: 0, lastOrderAt: null, updatedAt: new Date() } }
  );
  console.log(`Re-aggregated stats for ${stats.length} users`);
  await mongoose.disconnect();
  console.log('\n=== ROLLBACK COMPLETE ===');
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx !== -1 ? path.resolve(args[fileIdx + 1]) : null;
  const dryRun = args.includes('--dry-run');

  if (args.includes('--rollback')) return rollback();

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage:');
    console.error('  node scripts/import-vyapar.js --file <path.xlsx> [--dry-run]   # import');
    console.error('  node scripts/import-vyapar.js --rollback                        # undo import');
    process.exit(1);
  }

  console.log('Reading Excel...');
  const invoices = loadSaleReport(filePath);
  const itemMap = loadItemDetails(filePath);
  console.log(`Non-cancelled invoices in file: ${invoices.length}`);
  if (dryRun) console.log('--- DRY RUN: reads the DB, writes nothing ---');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');
  const ordersCol = db.collection('orders');

  // last-10-digits → userId for every existing customer
  const byPhone = new Map();
  const validUserIds = new Set();
  for (const u of await usersCol.find({}, { projection: { _id: 1, phone: 1 } }).toArray()) {
    validUserIds.add(String(u._id));
    const p = phone10(u.phone);
    if (p && !byPhone.has(p)) byPhone.set(p, u._id);
  }
  console.log(`Existing customers: ${validUserIds.size}`);

  const touched = new Set(); // userIds whose stats must be recomputed
  let userCreated = 0, userMatched = 0;
  const matchedPhones = new Set();

  // Find the customer for a phone, creating one if needed (dry run: fake id, no write)
  async function resolveUser(p, name, city) {
    if (byPhone.has(p)) {
      if (!matchedPhones.has(p) && validUserIds.has(String(byPhone.get(p)))) { matchedPhones.add(p); userMatched++; }
      return byPhone.get(p);
    }
    const phone = `91${p}`;
    let id;
    if (dryRun) {
      id = new mongoose.Types.ObjectId();
    } else {
      const res = await withRetry(() => usersCol.insertOne({
        phone,
        name: name || 'Unknown',
        isActive: true,
        isBlocked: false,
        totalOrders: 0,
        totalSpent: 0,
        addresses: [{
          label: 'Home', fullName: name || 'Unknown', phone,
          house: '', building: '', area: '', street: '',
          city: city || '', state: '', pincode: '', landmark: '',
          addressType: 'home', isDefault: true,
        }],
        preferences: {},
        tags: ['vyapar-import'],
        notes: '',
        failedLoginAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }), 'user-insert');
      id = res.insertedId;
    }
    byPhone.set(p, id);
    userCreated++;
    return id;
  }

  // 1. Insert invoices not yet imported
  const existingOrders = new Set(await ordersCol.distinct('orderNumber', { orderNumber: /^VYP-/ }));
  console.log(`Already imported orders in DB: ${existingOrders.size}`);
  const toInsert = [];
  let orderSkipped = 0, noPhone = 0;
  for (const inv of invoices) {
    const orderNumber = `VYP-${inv.invoiceNo}`;
    if (existingOrders.has(orderNumber)) { orderSkipped++; continue; }
    existingOrders.add(orderNumber); // a repeated invoice row in the file counts once

    const p = phone10(inv.phone);
    const name = inv.partyName || 'Unknown';
    let userId = null;
    if (p) { userId = await resolveUser(p, name, inv.city); touched.add(String(userId)); } else noPhone++;

    const items = itemMap.get(inv.invoiceNo) || [{
      name: 'Vyapar Item', quantity: 1, price: inv.totalAmount, total: inv.totalAmount, gstAmount: 0,
    }];
    const invoiceDate = parseExcelDate(inv.date);
    toInsert.push({
      orderNumber,
      user: userId,
      items,
      shippingAddress: { name, phone: p ? `91${p}` : '', street: '', city: inv.city, state: '', pincode: '', landmark: '' },
      source: 'vyapar_import',
      status: 'delivered',
      paymentStatus: mapPaymentStatus(inv.paymentStatus),
      paymentMethod: mapPaymentMethod(inv.paymentType),
      subtotal: inv.totalAmount,
      total: inv.totalAmount,
      gstTotal: items.reduce((s, i) => s + (i.gstAmount || 0), 0),
      discount: 0,
      shippingCharge: 0,
      walletUsed: 0,
      paymentGatewayAmount: 0,
      timeline: [{ status: 'delivered', timestamp: invoiceDate, note: 'Imported from Vyapar' }],
      deliveredAt: invoiceDate,
      metadata: { vyaparInvoice: inv.invoiceNo, originalPaymentType: inv.paymentType, importedAt: new Date() },
      createdAt: invoiceDate,
      updatedAt: new Date(),
    });
  }
  const byYear = {};
  toInsert.forEach(o => { const y = o.createdAt.getUTCFullYear(); byYear[y] = (byYear[y] || 0) + 1; });
  console.log(`Orders to add: ${toInsert.length}`, byYear);
  if (!dryRun) {
    let done = 0;
    for (const batch of chunks(toInsert, 500)) {
      await withRetry(() => ordersCol.insertMany(batch, { ordered: false }), 'order-insert');
      done += batch.length;
      console.log(`  ... ${done}/${toInsert.length} orders added`);
    }
  }

  // 2. Relink previously imported orders whose customer no longer exists
  const orphans = (await ordersCol.find(
    { source: 'vyapar_import' },
    { projection: { _id: 1, user: 1, 'shippingAddress.phone': 1, 'shippingAddress.name': 1, 'shippingAddress.city': 1 } },
  ).toArray()).filter(o => !o.user || !validUserIds.has(String(o.user)));
  const relinkOps = [];
  let orphanNoPhone = 0;
  for (const o of orphans) {
    const p = phone10(o.shippingAddress?.phone);
    if (!p) { orphanNoPhone++; continue; }
    const userId = await resolveUser(p, o.shippingAddress?.name, o.shippingAddress?.city);
    if (String(userId) === String(o.user)) continue; // just inserted in step 1 with a new customer
    touched.add(String(userId));
    relinkOps.push({ updateOne: { filter: { _id: o._id }, update: { $set: { user: userId, 'shippingAddress.phone': `91${p}` } } } });
  }
  console.log(`Orphaned imported orders to relink: ${relinkOps.length} (no phone, left as is: ${orphanNoPhone})`);
  if (!dryRun) {
    let done = 0;
    for (const batch of chunks(relinkOps, 1000)) {
      await withRetry(() => ordersCol.bulkWrite(batch, { ordered: false }), 'relink');
      done += batch.length;
      console.log(`  ... ${done}/${relinkOps.length} relinked`);
    }
  }

  // 3. Recompute customer stats from their real orders (idempotent, unlike $inc)
  const touchedIds = [...touched].map(id => new mongoose.Types.ObjectId(id));
  if (!dryRun) {
    for (const ids of chunks(touchedIds, 2000)) {
      const stats = await ordersCol.aggregate([
        { $match: { user: { $in: ids }, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$user', totalOrders: { $sum: 1 }, totalSpent: { $sum: '$total' }, lastOrderAt: { $max: '$createdAt' } } },
      ]).toArray();
      if (stats.length) await withRetry(() => usersCol.bulkWrite(stats.map(s => ({
        updateOne: { filter: { _id: s._id }, update: { $set: { totalOrders: s.totalOrders, totalSpent: s.totalSpent, lastOrderAt: s.lastOrderAt, updatedAt: new Date() } } },
      })), { ordered: false }), 'stats');
    }
  }

  await mongoose.disconnect();

  console.log(`\n=== ${dryRun ? 'DRY RUN ' : ''}SUMMARY ===`);
  console.log(`Existing customers matched : ${userMatched}`);
  console.log(`New customers created      : ${userCreated}`);
  console.log(`Orders added               : ${toInsert.length} (no phone: ${noPhone})`);
  console.log(`Orders skipped (in DB)     : ${orderSkipped}`);
  console.log(`Orphaned orders relinked   : ${relinkOps.length}`);
  console.log(`Customers stats recomputed : ${dryRun ? `${touched.size} (would be)` : touchedIds.length}`);
  // these orders were written straight to the DB, so the CRM engine (LTV, AOV, segment, next due) has not seen them
  if (!dryRun && toInsert.length) {
    console.log('\nNEXT STEP: open CRM > Settings > Trigger Refresh so CRM lifetime value, segments and reorder dates include these orders.');
    console.log('(Each customer profile also recalculates when opened, and the 2 AM run catches up, but the customer list stays stale until then.)');
  }
}

run().catch(err => { console.error(err); process.exit(1); });
