/**
 * Import Vyapar Party Report → users (no duplicates)
 *
 * - Matches existing users by phone — updates name/address if blank, skips otherwise
 * - Creates new users for phones not in DB
 * - Skips rows with no phone
 *
 * Usage:
 *   node scripts/import-vyapar-parties.js --file "C:/Users/jaisw/Downloads/PartyReport.xlsx" --dry-run
 *   node scripts/import-vyapar-parties.js --file "C:/Users/jaisw/Downloads/PartyReport.xlsx"
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

function loadParties(filePath) {
  const wb = xlsx.readFile(filePath);
  const raw = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', header: 1 });
  // Row 0 = headers, row 1 = empty, data from row 2
  const parties = [];
  for (const row of raw.slice(2)) {
    const name = String(row[0] || '').trim();
    const phone = normalizePhone(row[2]);
    if (!name || name === '' || !phone) continue; // skip empty + totals row
    parties.push({
      name,
      email: String(row[1] || '').trim().toLowerCase() || null,
      phone,
      address: String(row[3] || '').trim(),
    });
  }
  return parties;
}

async function run() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx !== -1 ? path.resolve(args[fileIdx + 1]) : null;
  const dryRun = args.includes('--dry-run');

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: node scripts/import-vyapar-parties.js --file <path.xlsx> [--dry-run]');
    process.exit(1);
  }

  const parties = loadParties(filePath);
  console.log(`Loaded ${parties.length} parties with valid phones`);
  if (dryRun) {
    console.log('--- DRY RUN ---');
    console.log('Sample (first 5):');
    parties.slice(0, 5).forEach(p => console.log(`  ${p.phone} | ${p.name} | ${p.address || 'no address'}`));
    console.log(`\nTotal to process: ${parties.length}`);
    return;
  }

  await mongoose.connect(MONGO_URI);
  const usersCol = mongoose.connection.db.collection('users');

  let created = 0, updated = 0, skipped = 0, noPhone = 0;

  for (const p of parties) {
    const existing = await usersCol.findOne({ phone: p.phone }, { projection: { _id: 1, name: 1, addresses: 1 } });

    if (existing) {
      // Only fill in blanks — never overwrite existing data
      const setFields = {};
      if (!existing.name || existing.name === 'Unknown') setFields.name = p.name;
      if (p.address && (!existing.addresses || existing.addresses.length === 0)) {
        setFields.addresses = [{
          label: 'Home', fullName: p.name, phone: p.phone,
          house: '', building: '', area: '', street: p.address,
          city: '', state: '', pincode: '', landmark: '',
          addressType: 'home', isDefault: true,
        }];
      }
      if (Object.keys(setFields).length > 0) {
        setFields.updatedAt = new Date();
        await usersCol.updateOne({ _id: existing._id }, { $set: setFields });
        updated++;
      } else {
        skipped++;
      }
    } else {
      await usersCol.insertOne({
        phone: p.phone,
        name: p.name,
        email: p.email || undefined,
        isActive: true,
        isBlocked: false,
        totalOrders: 0,
        totalSpent: 0,
        addresses: p.address ? [{
          label: 'Home', fullName: p.name, phone: p.phone,
          house: '', building: '', area: '', street: p.address,
          city: '', state: '', pincode: '', landmark: '',
          addressType: 'home', isDefault: true,
        }] : [],
        preferences: {},
        tags: ['vyapar-import'],
        notes: '',
        failedLoginAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      created++;
    }

    if ((created + updated + skipped) % 500 === 0)
      process.stdout.write(`  ... ${created + updated + skipped} processed\n`);
  }

  await mongoose.disconnect();

  console.log('\n=== SUMMARY ===');
  console.log(`Created : ${created} new users`);
  console.log(`Updated : ${updated} existing users (filled blank name/address)`);
  console.log(`Skipped : ${skipped} (already complete, no changes needed)`);
}

run().catch(err => { console.error(err); process.exit(1); });
