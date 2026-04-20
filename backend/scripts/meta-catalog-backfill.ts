/* eslint-disable no-console */
/**
 * One-time bulk sync of every active product in Mongo → Meta Commerce catalog.
 * Run with:
 *
 *   cd backend
 *   WA_CATALOG_ENABLED=true npx ts-node scripts/meta-catalog-backfill.ts
 *
 * Requires META_CATALOG_ID + META_GRAPH_TOKEN in the environment. The script
 * forces WA_CATALOG_ENABLED=true locally so you don't have to flip the flag
 * on production before backfilling.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MetaCatalogService } from '../src/modules/meta-catalog/meta-catalog.service';
import { ProductsService } from '../src/modules/products/products.service';

async function main(): Promise<void> {
  // Force-enable for the duration of the script regardless of env flag.
  process.env.WA_CATALOG_ENABLED = 'true';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const meta = app.get(MetaCatalogService);
    const products = app.get(ProductsService);

    const info = await meta.getCatalogInfo();
    if (!info) {
      console.error(
        'Could not read catalog info. Verify META_CATALOG_ID and META_GRAPH_TOKEN and that the token has catalog_management scope.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Target catalog: ${info.name} (${info.id}) — currently ${info.product_count} items`);

    // Pull every product in one shot — the admin catalog is small (<5000).
    // If the catalog grows larger, switch this to paginated reads.
    const page = await products.findAll({ page: 1, limit: 5000 } as any);
    const list = page.items ?? [];
    console.log(`Pulled ${list.length} products from Mongo. Pushing to Meta in chunks of 1000…`);

    const result = await meta.syncManyProducts(list as any);
    console.log(`Done. Sent: ${result.sent}, Failed: ${result.failed}`);

    const afterInfo = await meta.getCatalogInfo();
    if (afterInfo) {
      console.log(`Catalog now reports ${afterInfo.product_count} items.`);
    }
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exitCode = 1;
});
