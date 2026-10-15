/**
 * FMS v2 migration — idempotent backfill
 *   1. purchase_requests.items[]: set lineStatus = 'NEEDS_PO' where missing
 *   2. purchase_requests:     set pendingLineCount from items length where missing
 *   3. purchase_materials:    set uom = 'kg' where missing
 *
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/migrate-fms-v2.ts
 */
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/naturelite';

async function run() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db!;
  const requests = db.collection('purchaserequests');
  const materials = db.collection('purchasematerials');

  // 1. Backfill lineStatus on items subdocs that have no lineStatus
  //    MongoDB arrayFilters lets us target only the subdocs missing the field
  const lineRes = await requests.updateMany(
    { 'items.lineStatus': { $exists: false } },
    { $set: { 'items.$[el].lineStatus': 'NEEDS_PO' } },
    { arrayFilters: [{ 'el.lineStatus': { $exists: false } }] } as any,
  );
  console.log(`items.lineStatus backfilled: ${lineRes.modifiedCount} docs`);

  // 2. Backfill pendingLineCount where 0 or missing on non-terminal requests
  const terminalStatuses = ['COMPLETED', 'CANCELLED'];
  const countRes = await requests.updateMany(
    {
      status: { $nin: terminalStatuses },
      $or: [
        { pendingLineCount: { $exists: false } },
        { pendingLineCount: 0 },
      ],
    },
    [
      {
        $set: {
          pendingLineCount: {
            $size: {
              $filter: {
                input: '$items',
                as: 'i',
                cond: { $in: ['$$i.lineStatus', ['NEEDS_PO', null]] },
              },
            },
          },
        },
      },
    ],
  );
  console.log(`pendingLineCount backfilled: ${countRes.modifiedCount} docs`);

  // 3. Backfill uom = 'kg' on materials where missing
  const uomRes = await materials.updateMany(
    { uom: { $exists: false } },
    { $set: { uom: 'kg' } },
  );
  console.log(`materials.uom backfilled: ${uomRes.modifiedCount} docs`);

  await mongoose.disconnect();
  console.log('FMS v2 migration complete — all operations are idempotent');
}

run().catch(err => { console.error(err); process.exit(1); });
