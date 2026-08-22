const { MongoClient } = require('mongodb');
require('dotenv').config();

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI not set'); process.exit(1); }

async function run() {
  const client = await MongoClient.connect(URI);
  const db = client.db();

  const result = await db.collection('coupons').updateOne(
    { code: 'SAVE5' },
    { $set: { description: 'Get 5% off on orders above Rs 2000' } },
  );

  if (result.matchedCount === 0) {
    console.error('SAVE5 coupon not found');
  } else if (result.modifiedCount === 0) {
    console.log('No change — description already correct');
  } else {
    console.log('SAVE5 description updated');
  }

  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
