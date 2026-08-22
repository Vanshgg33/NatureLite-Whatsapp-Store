/**
 * Import Vyapar Sales Report → users + orders (zero duplicates)
 *
 * Usage:
 *   node scripts/import-vyapar.js --file C:/Users/jaisw/Downloads/SaleReport.xlsx --dry-run
 *   node scripts/import-vyapar.js --file C:/Users/jaisw/Downloads/SaleReport.xlsx
 *
 * - Skips cancelled invoices
 * - Matches existing users by phone (no duplicate users)
 * - Skips orders already imported (idempotent, safe to re-run)
 */

const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI ||
  'mongodb+srv://hariguptax1_db_user:yaJKUDWTmdFjvNY7@cluster0.xsfv7e3.mongodb.net/whatsapp-store?retryWrites=true&w=majority';

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length > 10) return `+91${digits.slice(-10)}`;
  return null;
}

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
      if (err.code === 11000) return null; // duplicate key — already imported, skip
      const retriable = err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.name === 'MongoNetworkError' || err.name === 'MongoServerSelectionError';
      if (!retriable || attempt === 5) throw err;
      console.log(`  [retry ${attempt}/5] ${label} — ${err.code || err.message}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
      if (mongoose.connection.readyState !== 1) {
        console.log('  Reconnecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
      }
    }
  }
}

async function rollback() {
  console.log('Connecting to DB for rollback...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');
  const ordersCol = db.collection('orders');

  // 1. Delete all imported orders
  const { deletedCount: ordersDeleted } = await ordersCol.deleteMany({ source: 'vyapar_import' });
  console.log(`Deleted ${ordersDeleted} imported orders`);

  // 2. Delete users created by import (tagged vyapar-import)
  const { deletedCount: usersDeleted } = await usersCol.deleteMany({ tags: 'vyapar-import' });
  console.log(`Deleted ${usersDeleted} imported users`);

  // 3. Re-aggregate totalOrders + totalSpent for pre-existing users from remaining orders
  console.log('Re-aggregating stats for existing users...');
  const pipeline = [
    { $group: { _id: '$user', totalOrders: { $sum: 1 }, totalSpent: { $sum: '$total' }, lastOrderAt: { $max: '$createdAt' } } },
    { $match: { _id: { $ne: null } } },
  ];
  const stats = await ordersCol.aggregate(pipeline).toArray();
  let updated = 0;
  for (const s of stats) {
    await usersCol.updateOne(
      { _id: s._id },
      { $set: { totalOrders: s.totalOrders, totalSpent: s.totalSpent, lastOrderAt: s.lastOrderAt, updatedAt: new Date() } }
    );
    updated++;
  }
  // Zero out users with no remaining orders
  await usersCol.updateMany(
    { _id: { $nin: stats.map(s => s._id) }, totalOrders: { $gt: 0 } },
    { $set: { totalOrders: 0, totalSpent: 0, lastOrderAt: null, updatedAt: new Date() } }
  );
  console.log(`Re-aggregated stats for ${updated} users`);

  await mongoose.disconnect();
  console.log('\n=== ROLLBACK COMPLETE ===');
  console.log(`Orders removed : ${ordersDeleted}`);
  console.log(`Users removed  : ${usersDeleted}`);
}

async function run() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx !== -1 ? path.resolve(args[fileIdx + 1]) : null;
  const dryRun = args.includes('--dry-run');
  const doRollback = args.includes('--rollback');

  if (doRollback) return rollback();

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage:');
    console.error('  node scripts/import-vyapar.js --file <path.xlsx> [--dry-run]   # import');
    console.error('  node scripts/import-vyapar.js --rollback                        # undo import');
    process.exit(1);
  }

  console.log('Reading Sale Report...');
  const invoices = loadSaleReport(filePath);
  console.log(`Reading Item Details...`);
  const itemMap = loadItemDetails(filePath);
  console.log(`Invoices to import: ${invoices.length} | Item Detail entries: ${itemMap.size}`);

  if (dryRun) {
    console.log('--- DRY RUN: no DB writes ---\n');
    console.log('Sample (first 10):');
    invoices.slice(0, 10).forEach(inv => {
      const phone = normalizePhone(inv.phone);
      const items = itemMap.get(inv.invoiceNo) || [];
      console.log(`  VYP-${inv.invoiceNo} | ${inv.partyName} | ${phone || 'no phone'} | ₹${inv.totalAmount} | ${inv.paymentType} → ${mapPaymentMethod(inv.paymentType)} | ${inv.paymentStatus} | ${items.length} item(s)`);
    });
    console.log('\n=== DRY RUN SUMMARY ===');
    console.log(`Total invoices to import: ${invoices.length}`);
    console.log(`Invoices with items     : ${[...itemMap.keys()].filter(k => invoices.find(i => i.invoiceNo === k)).length}`);
    console.log(`Invoices without phone  : ${invoices.filter(i => !normalizePhone(i.phone)).length}`);
    const pmCounts = {};
    invoices.forEach(i => { const m = mapPaymentMethod(i.paymentType); pmCounts[m] = (pmCounts[m]||0)+1; });
    console.log('Payment methods         :', pmCounts);
    return;
  }

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');
  const ordersCol = db.collection('orders');

  // Pre-load all existing VYP order numbers to avoid per-row queries
  const existingOrders = new Set(
    (await ordersCol.distinct('orderNumber', { orderNumber: /^VYP-/ }))
  );
  console.log(`Already imported orders in DB: ${existingOrders.size}`);

  // Phone → userId cache to avoid repeat user lookups
  const phoneCache = new Map();

  let userCreated = 0, userMatched = 0, orderCreated = 0, orderSkipped = 0, noPhone = 0;

  for (const inv of invoices) {
    const orderNumber = `VYP-${inv.invoiceNo}`;

    if (existingOrders.has(orderNumber)) {
      orderSkipped++;
      continue;
    }

    const phone = normalizePhone(inv.phone);
    const name = inv.partyName || 'Unknown';

    // Find or create user
    let userId = null;
    if (phone) {
      if (phoneCache.has(phone)) {
        userId = phoneCache.get(phone);
        userMatched++;
      } else {
        const existing = await usersCol.findOne({ phone }, { projection: { _id: 1 } });
        if (existing) {
          userId = existing._id;
          phoneCache.set(phone, userId);
          userMatched++;
        } else if (!dryRun) {
          const res = await withRetry(() => usersCol.insertOne({
            phone,
            name,
            isActive: true,
            isBlocked: false,
            totalOrders: 0,
            totalSpent: 0,
            addresses: [{
              label: 'Home',
              fullName: name,
              phone,
              house: '', building: '', area: '', street: '',
              city: inv.city,
              state: '',
              pincode: '',
              landmark: '',
              addressType: 'home',
              isDefault: true,
            }],
            preferences: {},
            tags: ['vyapar-import'],
            notes: '',
            failedLoginAttempts: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }), 'user-insert');
          userId = res.insertedId;
          phoneCache.set(phone, userId);
          userCreated++;
        }
      }
    } else {
      noPhone++;
    }

    const items = itemMap.get(inv.invoiceNo) || [{
      name: 'Vyapar Item',
      quantity: 1,
      price: inv.totalAmount,
      total: inv.totalAmount,
      gstAmount: 0,
    }];

    const invoiceDate = parseExcelDate(inv.date);
    const paymentMethod = mapPaymentMethod(inv.paymentType);
    const paymentStatus = mapPaymentStatus(inv.paymentStatus);

    if (dryRun) {
      process.stdout.write(`  [DRY] ${orderNumber} | ${name} | ${phone || 'no phone'} | ₹${inv.totalAmount} | ${paymentMethod} | ${paymentStatus}\n`);
      orderCreated++;
      continue;
    }

    await withRetry(() => ordersCol.insertOne({
      orderNumber,
      user: userId,
      items,
      shippingAddress: {
        name,
        phone: phone || '',
        street: '',
        city: inv.city,
        state: '',
        pincode: '',
        landmark: '',
      },
      source: 'vyapar_import',
      status: 'delivered',
      paymentStatus,
      paymentMethod,
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
    }), orderNumber);

    if (userId) {
      await withRetry(() => usersCol.updateOne(
        { _id: userId },
        { $inc: { totalOrders: 1, totalSpent: inv.totalAmount }, $set: { lastOrderAt: invoiceDate, updatedAt: new Date() } }
      ), 'user-update');
    }

    existingOrders.add(orderNumber); // prevent duplicates within this run
    orderCreated++;

    if (orderCreated % 500 === 0) process.stdout.write(`  ... ${orderCreated} orders imported\n`);
  }

  await mongoose.disconnect();

  console.log('\n=== SUMMARY ===');
  console.log(`Users created  : ${userCreated}`);
  console.log(`Users matched  : ${userMatched} (existing, no duplicate)`);
  console.log(`No-phone orders: ${noPhone}`);
  console.log(`Orders imported: ${orderCreated}`);
  console.log(`Orders skipped : ${orderSkipped} (already in DB)`);
}

run().catch(err => { console.error(err); process.exit(1); });
