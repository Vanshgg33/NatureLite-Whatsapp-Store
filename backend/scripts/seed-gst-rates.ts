/**
 * Seed effective-dated GST rate rules (billing_tax_rate_rules) for ghee/butter and edible oils.
 * Ghee/butter (HSN 0405) moved 12% -> 5% on 22 Sep 2025 (GST 2.0); edible oils stay at 5%.
 * Idempotent: a rule with the same scope + HSN prefix + effectiveFrom is skipped.
 * HSN list is a starting point: confirm every SKU's HSN and rate with your CA before applying.
 *
 * Dry-run by default.
 * Run:   npx ts-node -r tsconfig-paths/register scripts/seed-gst-rates.ts
 * Apply: npx ts-node -r tsconfig-paths/register scripts/seed-gst-rates.ts --apply
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const RuleSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

const RULES = [
  { hsnPrefix: '0405', gstRate: 12, effectiveFrom: '2017-07-01', effectiveTo: '2025-09-22', reason: 'Butter and ghee at 12% before GST 2.0' },
  { hsnPrefix: '0405', gstRate: 5, effectiveFrom: '2025-09-22', effectiveTo: null, reason: 'Butter and ghee at 5% from GST 2.0 (22 Sep 2025)' },
  ...['1507', '1508', '1509', '1510', '1511', '1512', '1513', '1514', '1515'].map(hsnPrefix => ({
    hsnPrefix, gstRate: 5, effectiveFrom: '2017-07-01', effectiveTo: null, reason: 'Edible oils at 5%',
  })),
];

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI not set in .env');
  await mongoose.connect(uri);
  const Rule = mongoose.model('SeedTaxRule', RuleSchema, 'billing_tax_rate_rules');

  for (const r of RULES) {
    const from = new Date(r.effectiveFrom);
    const exists = await Rule.exists({ scope: 'hsn', hsnPrefix: r.hsnPrefix, effectiveFrom: from });
    if (exists) { console.log(`skip   ${r.hsnPrefix} from ${r.effectiveFrom} (already there)`); continue; }
    console.log(`${apply ? 'insert' : 'would insert'} ${r.hsnPrefix} ${r.gstRate}% from ${r.effectiveFrom}`);
    if (apply) {
      await Rule.create({
        scope: 'hsn', hsnPrefix: r.hsnPrefix, gstRate: r.gstRate, cessRate: 0, taxability: 'taxable',
        effectiveFrom: from, effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
        reason: r.reason, status: r.effectiveTo ? 'expired' : 'active', createdBy: 'seed-script',
      });
    }
  }
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
