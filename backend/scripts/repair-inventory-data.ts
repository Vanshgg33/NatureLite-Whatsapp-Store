/**
 * Phase-7 data repair: inventory consistency
 *
 * 1. Report variant SKU collisions across products (manual fix required).
 * 2. Backfill variantId on StoreStock.variantStocks[] by matching variantSku.
 * 3. Remove orphan StoreStock rows (product deleted).
 * 4. Remove stale variantStocks entries (variant deleted from product).
 * 5. Zero out product.stock for variant-products (stock lives in StoreStock).
 *
 * Run (dry-run):  npx ts-node -r tsconfig-paths/register scripts/repair-inventory-data.ts
 * Apply changes:  npx ts-node -r tsconfig-paths/register scripts/repair-inventory-data.ts --apply
 */
import mongoose, { Types } from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const apply = process.argv.includes('--apply');

// ── Minimal schemas ──────────────────────────────────────────────────────────

const VariantSchema = new mongoose.Schema(
  { sku: String, name: String, price: Number, stock: Number, isActive: Boolean },
  { _id: true, strict: false },
);

const ProductSchema = new mongoose.Schema(
  {
    sku: String,
    name: String,
    stock: { type: Number, default: 0 },
    variants: { type: [VariantSchema], default: [] },
  },
  { timestamps: true, strict: false },
);

const VariantStockSchema = new mongoose.Schema(
  {
    variantId: { type: Types.ObjectId, default: null },
    variantSku: String,
    stock: { type: Number, default: 0 },
  },
  { _id: false, strict: false },
);

const StoreStockSchema = new mongoose.Schema(
  {
    store: { type: Types.ObjectId, ref: 'Store', required: true },
    product: { type: Types.ObjectId, ref: 'Product', required: true },
    stock: { type: Number, default: 0 },
    variantStocks: { type: [VariantStockSchema], default: [] },
  },
  { timestamps: true, strict: false },
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(msg + '\n');
}

function dryTag(n: number, noun: string) {
  return apply ? `→ applied (${n} ${noun})` : `→ would apply (${n} ${noun}) [dry-run]`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if (!uri) {
    log('ERROR: MONGODB_URI not set in .env');
    process.exit(1);
  }

  log(`Connecting to MongoDB…`);
  await mongoose.connect(uri);
  log('Connected.\n');

  const Product = mongoose.model('Product', ProductSchema);
  const StoreStock = mongoose.model('StoreStock', StoreStockSchema, 'storestocks');

  // ── 1. Variant SKU collision report ─────────────────────────────────────
  log('=== 1. Variant SKU collision check ===');

  const allProducts = await Product.find({}).lean().exec() as any[];
  const skuMap: Map<string, string[]> = new Map(); // sku → [productId]
  for (const p of allProducts) {
    for (const v of (p.variants ?? [])) {
      const sku: string = v.sku?.trim() ?? '';
      if (!sku) continue;
      const list = skuMap.get(sku) ?? [];
      list.push(String(p._id));
      skuMap.set(sku, list);
    }
  }
  const collisions = [...skuMap.entries()].filter(([, ids]) => ids.length > 1);
  if (collisions.length === 0) {
    log('  No variant SKU collisions found. ✓');
  } else {
    log(`  WARN: ${collisions.length} variant SKUs appear in multiple products:`);
    for (const [sku, ids] of collisions) {
      log(`    SKU "${sku}" → products: ${ids.join(', ')}`);
    }
    log('  These require manual deduplication before deployment.');
  }
  log('');

  // ── 2. Backfill variantId on StoreStock.variantStocks[] ─────────────────
  log('=== 2. Backfill variantId on variantStocks ===');

  // Build lookup: productId → { variantSku → variantId }
  const variantLookup: Map<string, Map<string, Types.ObjectId>> = new Map();
  for (const p of allProducts) {
    if (!p.variants?.length) continue;
    const inner: Map<string, Types.ObjectId> = new Map();
    for (const v of p.variants) {
      if (v.sku && v._id) inner.set(v.sku.trim(), v._id);
    }
    variantLookup.set(String(p._id), inner);
  }

  const allStoreStock = await StoreStock.find({}).lean().exec() as any[];
  let backfillCount = 0;
  const backfillOps: any[] = [];

  for (const ss of allStoreStock) {
    if (!ss.variantStocks?.length) continue;
    const inner = variantLookup.get(String(ss.product));
    if (!inner) continue;

    let changed = false;
    const updatedVariantStocks = ss.variantStocks.map((vs: any) => {
      if (vs.variantId) return vs; // already set
      const vid = inner.get(vs.variantSku?.trim() ?? '');
      if (!vid) return vs;
      changed = true;
      return { ...vs, variantId: vid };
    });

    if (changed) {
      backfillCount++;
      backfillOps.push({
        updateOne: {
          filter: { _id: ss._id },
          update: { $set: { variantStocks: updatedVariantStocks } },
        },
      });
    }
  }

  if (backfillOps.length > 0) {
    log(`  ${dryTag(backfillCount, 'StoreStock docs')}`);
    if (apply) {
      await StoreStock.bulkWrite(backfillOps);
    }
  } else {
    log('  All variantIds already set or no variantStocks found. ✓');
  }
  log('');

  // ── 3. Remove orphan StoreStock rows (product deleted) ───────────────────
  log('=== 3. Remove orphan StoreStock rows ===');

  const productIdSet = new Set(allProducts.map((p: any) => String(p._id)));
  const orphans = allStoreStock.filter((ss: any) => !productIdSet.has(String(ss.product)));

  if (orphans.length > 0) {
    log(`  Found ${orphans.length} orphan StoreStock rows (no matching product).`);
    for (const ss of orphans.slice(0, 5)) {
      log(`    StoreStock ${ss._id} → product ${ss.product} (deleted)`);
    }
    if (orphans.length > 5) log(`    … and ${orphans.length - 5} more`);
    log(`  ${dryTag(orphans.length, 'rows deleted')}`);
    if (apply) {
      const ids = orphans.map((ss: any) => ss._id);
      await StoreStock.deleteMany({ _id: { $in: ids } });
    }
  } else {
    log('  No orphan StoreStock rows found. ✓');
  }
  log('');

  // ── 4. Remove stale variantStocks entries (variant deleted) ──────────────
  log('=== 4. Remove stale variantStocks entries ===');

  let staleCount = 0;
  const staleOps: any[] = [];

  for (const ss of allStoreStock) {
    if (!ss.variantStocks?.length) continue;
    const inner = variantLookup.get(String(ss.product));

    const validEntries = ss.variantStocks.filter((vs: any) => {
      if (!inner) return false; // product has no variants anymore
      return inner.has(vs.variantSku?.trim() ?? '');
    });

    if (validEntries.length !== ss.variantStocks.length) {
      staleCount++;
      staleOps.push({
        updateOne: {
          filter: { _id: ss._id },
          update: { $set: { variantStocks: validEntries } },
        },
      });
    }
  }

  if (staleOps.length > 0) {
    log(`  ${dryTag(staleCount, 'StoreStock docs cleaned')}`);
    if (apply) {
      await StoreStock.bulkWrite(staleOps);
    }
  } else {
    log('  No stale variantStocks entries found. ✓');
  }
  log('');

  // ── 5. Zero product.stock for variant products ────────────────────────────
  log('=== 5. Zero product.stock for variant-only products ===');

  const variantProducts = allProducts.filter((p: any) => p.variants?.length > 0 && p.stock !== 0);

  if (variantProducts.length > 0) {
    log(`  Found ${variantProducts.length} variant-products with non-zero base stock:`);
    for (const p of variantProducts.slice(0, 5)) {
      log(`    ${p.sku} "${p.name}" stock=${p.stock}`);
    }
    if (variantProducts.length > 5) log(`    … and ${variantProducts.length - 5} more`);
    log(`  ${dryTag(variantProducts.length, 'products zeroed')}`);
    if (apply) {
      const ids = variantProducts.map((p: any) => p._id);
      await Product.updateMany({ _id: { $in: ids } }, { $set: { stock: 0 } });
    }
  } else {
    log('  All variant-products already have stock=0. ✓');
  }
  log('');

  // ── Summary ──────────────────────────────────────────────────────────────
  log('=== Summary ===');
  log(`  SKU collisions:    ${collisions.length} (manual fix needed if > 0)`);
  log(`  variantId backfill: ${backfillCount} StoreStock docs`);
  log(`  Orphan rows:       ${orphans.length}`);
  log(`  Stale entries:     ${staleCount} StoreStock docs`);
  log(`  Variant stock zero: ${variantProducts.length} products`);
  if (!apply) {
    log('\n  [DRY RUN] Re-run with --apply to commit changes.');
  } else {
    log('\n  [APPLIED] All changes committed.');
  }

  await mongoose.disconnect();
  log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
