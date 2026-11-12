/**
 * Blueprint phase 2 migration: old 6 order tags -> 4 sales channels, and drop price tiers other than B2B / Store/Retail.
 * Idempotent. Dry run by default (prints counts, writes nothing).
 *
 * Run:   npx ts-node -r tsconfig-paths/register scripts/migrate-billing-channels.ts
 * Apply: ... --apply     (take a mongodump first)
 *
 * The original tag is kept on each bill as `legacyTag`; products missing a B2B or Store/Retail price are listed
 * (nothing is auto-filled from Wholesale).
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { LEGACY_TAG_TO_CHANNEL, PRICE_TIERS } from '../src/modules/billing/channels';

dotenv.config({ path: '.env' });

async function run() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const bills = db.collection('billingbills');
  const prices = db.collection('billingtagprices');

  for (const [legacy, channel] of Object.entries(LEGACY_TAG_TO_CHANNEL)) {
    const n = await bills.countDocuments({ orderTag: legacy });
    console.log(`bills ${legacy} -> ${channel}: ${n}`);
    if (apply && n) {
      await bills.updateMany({ orderTag: legacy }, [{ $set: { legacyTag: '$orderTag', orderTag: channel } }]);
    }
  }
  const unmapped = await bills.countDocuments({
    orderTag: { $nin: Object.values(LEGACY_TAG_TO_CHANNEL).concat(Object.keys(LEGACY_TAG_TO_CHANNEL)) },
  });
  console.log(`bills with an unknown tag (need manual review): ${unmapped}`);

  const extra = await prices.countDocuments({ tag: { $nin: [...PRICE_TIERS] } });
  console.log(`tag-price rows for removed tiers: ${extra}`);
  if (apply && extra) {
    // keep a backup copy before deleting
    const backup = `billingtagprices_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    await db.collection(backup).insertMany(await prices.find({ tag: { $nin: [...PRICE_TIERS] } }).toArray());
    await prices.deleteMany({ tag: { $nin: [...PRICE_TIERS] } });
    console.log(`removed; copy kept in ${backup}`);
  }

  const have = await prices.aggregate([{ $group: { _id: '$productId', tiers: { $addToSet: '$tag' } } }]).toArray();
  const missing = have.filter(h => !PRICE_TIERS.every(t => h.tiers.includes(t)));
  console.log(`products with only one tier priced: ${missing.length} (products with none are not listed here)`);

  console.log(apply ? 'APPLIED' : 'DRY RUN - re-run with --apply');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
