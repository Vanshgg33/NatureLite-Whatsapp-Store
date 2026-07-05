const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGO_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://hariguptax1_db_user:yaJKUDWTmdFjvNY7@cluster0.xsfv7e3.mongodb.net/whatsapp-store?retryWrites=true&w=majority';

const EMAIL = 'om@admin.com';
const PASSWORD = '12345678';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const col = mongoose.connection.db.collection('adminusers');

  const hashedPassword = await bcrypt.hash(PASSWORD, 10);

  const existing = await col.findOne({ email: EMAIL });
  if (existing) {
    await col.updateOne({ email: EMAIL }, { $set: { password: hashedPassword, updatedAt: new Date() } });
    console.log(`Superadmin password updated: ${EMAIL}`);
  } else {
    await col.insertOne({
      name: 'Super Admin',
      email: EMAIL,
      password: hashedPassword,
      role: 'superadmin',
      isActive: true,
      permissions: [],
      preferences: {},
      metadata: {},
      failedLoginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Superadmin created: ${EMAIL}`);
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
