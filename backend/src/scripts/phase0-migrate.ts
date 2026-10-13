/**
 * Phase 0 migration: add new fields to existing Customer and Product documents.
 * Run once: npx ts-node -r tsconfig-paths/register src/scripts/phase0-migrate.ts
 */
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/naturelite'

async function run() {
  await mongoose.connect(MONGODB_URI)
  const db = mongoose.connection.db!

  // Customer: add partyType and gstType defaults
  const custResult = await db.collection('billing_customers').updateMany(
    { partyType: { $exists: false } },
    { $set: { partyType: 'customer', gstType: 'unregistered', creditDays: 15, creditLimit: 0, openingBalance: 0, openingBalanceType: 'to_receive' } }
  )
  console.log(`Customers updated: ${custResult.modifiedCount}`)

  // Products: add hsnCode, gstRate, cessRate, taxability, uqc defaults if missing
  const prodResult = await db.collection('products').updateMany(
    { hsnCode: { $exists: false } },
    { $set: { hsnCode: '', gstRate: 5, cessRate: 0, taxability: 'taxable', uqc: 'NOS', isActive: true } }
  )
  console.log(`Products updated: ${prodResult.modifiedCount}`)

  await mongoose.disconnect()
  console.log('Migration complete')
}

run().catch(err => { console.error(err); process.exit(1) })
