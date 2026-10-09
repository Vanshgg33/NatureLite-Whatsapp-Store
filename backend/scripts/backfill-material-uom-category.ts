/**
 * Guess uom and category for existing PurchaseMaterial docs from their names.
 * Prints a CSV for Om to review. Does NOT write anything by default.
 *
 * Run:   npx ts-node -r tsconfig-paths/register scripts/backfill-material-uom-category.ts
 * Apply: ... --apply
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const MATERIAL_SCHEMA = new mongoose.Schema(
  { name: String, category: String, uom: String, isActive: Boolean },
  { timestamps: true, strict: false },
);

function guessUom(name: string): string {
  const n = name.toLowerCase();
  // Pack SKUs: have explicit volume/weight in the name
  if (/\d+\s*ml|\d+\s*l\b|\d+\s*gm|\d+\s*g\b|\d+\s*lt/.test(n)) return 'pcs';
  if (/pouch|box|pack|bottle|jar|tin|can/.test(n)) return 'pcs';
  if (/oil|ghee/.test(n)) return 'L';
  return 'kg';
}

function guessCategory(name: string): string {
  const n = name.toLowerCase();
  if (/oil|groundnut|sesame|mustard|sunflower|coconut|copra|flax/.test(n)) return 'OILS';
  if (/ghee/.test(n)) return 'GHEE';
  if (/wheat|rice|chawal|khapli|millet|bajra|jowar|ragi|oat|barley/.test(n)) return 'GRAINS_MILLETS';
  if (/dal|lentil|chana|toor|moong|urad|masoor|rajma|chole|pulse/.test(n)) return 'PULSES';
  if (/jaggery|gur|salt|namak/.test(n)) return 'JAGGERY_SALT';
  if (/masala|spice|snack|mix|nuts|dry fruit|almond|cashew|raisin|walnut/.test(n)) return 'SNACKS_MASALA';
  if (/dry fruit|seed|flax|chia|pumpkin/.test(n)) return 'DRY_FRUITS_SEEDS';
  if (/turmeric|haldi|jeera|cumin|pepper|coriander|ajwain|methi|cardamom|clove|cinnamon/.test(n)) return 'WHOLE_SPICES';
  if (/pack|pouch|bag|box|label|sticker|tape|seal/.test(n)) return 'PACKAGING';
  return 'OTHER';
}

async function run() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI!);
  const Material = mongoose.model('PurchaseMaterial', MATERIAL_SCHEMA);
  const materials = await Material.find({}).lean();

  console.log('\n"id","name","current_category","current_uom","guessed_category","guessed_uom","needs_review"');

  let changed = 0;
  for (const m of materials) {
    const gc = guessCategory(m.name || '');
    const gu = guessUom(m.name || '');
    const catChanged = m.category !== gc;
    const uomChanged = (m.uom || 'kg') !== gu;
    const needsReview = catChanged || uomChanged ? 'YES' : '';
    if (catChanged || uomChanged) changed++;

    console.log(`"${m._id}","${m.name}","${m.category || ''}","${m.uom || 'kg'}","${gc}","${gu}","${needsReview}"`);

    if (apply && (catChanged || uomChanged)) {
      await Material.updateOne({ _id: m._id }, { $set: { category: gc, uom: gu } });
    }
  }

  console.log(`\n-- ${changed} of ${materials.length} materials would change.`);
  if (!apply) console.log('Re-run with --apply to write changes. Review the CSV above first.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
