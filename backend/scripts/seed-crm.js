/**
 * seed-crm.js — Creates a CRM head admin for first-time setup.
 * Usage: MONGODB_URI=<uri> node scripts/seed-crm.js
 *
 * Defaults to localhost if MONGODB_URI not set.
 * Idempotent: updates password if loginId already exists.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { randomBytes } = require('crypto');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-store';
const LOGIN_ID = process.env.CRM_LOGIN_ID || 'crm_head';
const NAME = process.env.CRM_NAME || 'CRM Head';
const EMAIL = process.env.CRM_EMAIL || 'crm@naturelite.in';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const col = mongoose.connection.db.collection('adminusers');
  const tempPassword = randomBytes(5).toString('hex');
  const hashed = await bcrypt.hash(tempPassword, 10);

  const existing = await col.findOne({ loginId: LOGIN_ID });
  if (existing) {
    await col.updateOne(
      { loginId: LOGIN_ID },
      { $set: { password: hashed, mustChangePassword: true, updatedAt: new Date() } },
    );
    console.log(`CRM head password reset — loginId: ${LOGIN_ID} | temp: ${tempPassword}`);
  } else {
    await col.insertOne({
      name: NAME,
      email: EMAIL,
      loginId: LOGIN_ID,
      password: hashed,
      role: 'admin',
      departmentType: 'crm_head',
      isActive: true,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`CRM head created — loginId: ${LOGIN_ID} | temp password: ${tempPassword}`);
  }

  console.log('Login at /admin-login → use loginId field');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
