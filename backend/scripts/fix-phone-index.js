/**
 * Migration: fix the users.phone_1 index to be sparse so multiple documents
 * with phone: null/undefined are allowed (guest users without a phone number).
 *
 * Run with:
 *   MONGODB_URI=<your-uri> node backend/scripts/fix-phone-index.js
 */

const mongoose = require('mongoose');

const MONGO_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://hariguptax1_db_user:yaJKUDWTmdFjvNY7@cluster0.xsfv7e3.mongodb.net/whatsapp-store?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const collection = db.collection('users');

  const indexes = await collection.indexes();
  console.log('Current indexes:', JSON.stringify(indexes, null, 2));

  const phoneIndex = indexes.find((idx) => idx.name === 'phone_1');
  if (!phoneIndex) {
    console.log('phone_1 index not found — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  if (phoneIndex.sparse === true) {
    console.log('phone_1 index is already sparse — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log('phone_1 index is NOT sparse. Dropping and recreating...');
  await collection.dropIndex('phone_1');
  console.log('Dropped phone_1 index.');

  await collection.createIndex({ phone: 1 }, { unique: true, sparse: true, name: 'phone_1' });
  console.log('Recreated phone_1 as unique + sparse.');

  // Also fix email index if it has the same problem
  const emailIndex = indexes.find((idx) => idx.name === 'email_1');
  if (emailIndex && emailIndex.sparse !== true) {
    console.log('email_1 index is NOT sparse. Fixing...');
    await collection.dropIndex('email_1');
    await collection.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' });
    console.log('Recreated email_1 as unique + sparse.');
  }

  const finalIndexes = await collection.indexes();
  console.log('Final indexes:', JSON.stringify(finalIndexes, null, 2));

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
