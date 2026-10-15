# Billing–CRM Interconnection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the billing module's sales events into the CRM engine so in-store purchases count toward CRM segments, LTV, and reorder predictions — in real time.

**Architecture:** CRM engine's `refreshUser` currently aggregates only from `Order` (WhatsApp). We add a second aggregate from `BillingBill`, merge both arrays, and sort by date before the existing segment/LTV logic runs. Billing service fires a fire-and-forget `refreshUser` call after every `createBill` and `createCustomer`. Dependency direction is one-way: Billing → CRM.

**Tech Stack:** NestJS, Mongoose, MongoDB, Jest (jest with `--passWithNoTests`)

**Spec:** `docs/superpowers/specs/2026-10-10-billing-crm-interconnection-design.md`

## Global Constraints

- No new files — all changes are to 4 existing files.
- No circular dependencies — `CrmModule` must NOT import `BillingModule`; it registers `BillingBill` schema directly in its own `MongooseModule.forFeature`.
- All CRM refreshes triggered from billing are fire-and-forget: `.catch(() => {})` — billing requests must never block on CRM.
- `BillingBill` items carry no category information; they map to `categories: []` in the merged row shape, which `resolveCycle` already handles via fallback.
- Test runner: `cd backend && npx jest --passWithNoTests`

## Review Focus

- **Billing-only customer (0 WhatsApp orders, N billing bills):** should get a real segment (not `no_orders`). Covered in Task 1 spec test.
- **Empty categories `[]` from billing rows flows through `resolveCycle` to fallback:** already correct in pure functions, but not explicitly tested. Added in Task 1.
- **`$unwind` on empty `items` array:** if a bill somehow has no items, `$unwind` drops the document — the bill contributes nothing to LTV, which is safe. No guard needed.
- **Double-count:** WhatsApp `Order` and `BillingBill` are separate collections for separate flows. A transaction cannot appear in both. No dedup logic needed.
- **Cancelled bill excluded:** query uses `status: 'active'`, so cancelled bills are already excluded. No extra handling.

---

## File Map

| File | Change |
|------|--------|
| `backend/src/modules/crm/engine/status-model.spec.ts` | Add 2 tests documenting billing-row shape through pure functions |
| `backend/src/modules/crm/crm.module.ts` | Register `BillingBill` schema in MongooseModule.forFeature |
| `backend/src/modules/crm/crm-engine.service.ts` | Inject `billModel`; add billing aggregate; merge+sort into `rows` |
| `backend/src/modules/billing/billing.module.ts` | Import `CrmModule` |
| `backend/src/modules/billing/billing.service.ts` | Inject `CrmEngineService`; fire refresh after `createBill`/`createCustomer` |

---

## Task 1: CRM engine reads BillingBill

**Files:**
- Modify: `backend/src/modules/crm/engine/status-model.spec.ts`
- Modify: `backend/src/modules/crm/crm.module.ts`
- Modify: `backend/src/modules/crm/crm-engine.service.ts`

**Interfaces:**
- Consumes: `BillingBill` schema from `../billing/schemas/billing-bill.schema`
- Produces: `CrmEngineService.refreshUser` now accepts both WhatsApp orders and billing bills — signature unchanged

- [ ] **Step 1: Write the failing tests in `status-model.spec.ts`**

Add these two tests inside the existing `describe('resolveCycle', ...)` block, after the last `it(...)` in that block:

```typescript
it('uses fallback when single billing row has empty categories', () => {
  // billing bills have no category info → categories: []
  const orders: OrderForCycle[] = [
    { date: new Date('2026-10-10T00:00:00.000Z'), categories: [] },
  ];
  expect(resolveCycle(orders, { Oils: 30 }, 45)).toEqual({ days: 45, source: 'fallback' });
});

it('uses personal cycle when multiple billing rows have empty categories', () => {
  // 3 billing bills 31 days apart → personal cycle = 31
  const orders: OrderForCycle[] = [
    { date: new Date('2026-10-10T00:00:00.000Z'), categories: [] },
    { date: new Date('2026-09-09T00:00:00.000Z'), categories: [] },
    { date: new Date('2026-08-09T00:00:00.000Z'), categories: [] },
  ];
  const result = resolveCycle(orders, { Oils: 30 }, 45);
  expect(result.source).toBe('personal');
  expect(result.days).toBe(31);
});
```

- [ ] **Step 2: Run tests to verify they pass (pure functions already handle this)**

```bash
cd backend && npx jest status-model.spec --passWithNoTests
```

Expected: both new tests PASS — this confirms the pure functions correctly handle billing-row shape before we wire up the service.

- [ ] **Step 3: Add `BillingBill` schema to `crm.module.ts`**

At the top of `backend/src/modules/crm/crm.module.ts`, add the import:
```typescript
import { BillingBill, BillingBillSchema } from '../billing/schemas/billing-bill.schema';
```

Inside `MongooseModule.forFeature([...])`, add this entry (after the existing `CrmEngineRun` line):
```typescript
{ name: BillingBill.name, schema: BillingBillSchema },
```

- [ ] **Step 4: Inject `billModel` into `CrmEngineService` and extend `refreshUser`**

In `backend/src/modules/crm/crm-engine.service.ts`:

**4a.** Add the import at the top of the file:
```typescript
import { BillingBill } from '../billing/schemas/billing-bill.schema';
```

**4b.** Add the injected model to the constructor (after `private userModel`):
```typescript
@InjectModel(BillingBill.name) private billModel: Model<any>,
```

The constructor signature becomes:
```typescript
constructor(
  @InjectModel(CrmCustomerStats.name) private statsModel: Model<CrmCustomerStatsDocument>,
  @InjectModel(CrmSettings.name) private settingsModel: Model<CrmSettingsDocument>,
  @InjectModel(CrmEngineRun.name) private runModel: Model<CrmEngineRunDocument>,
  @InjectModel('Order') private orderModel: Model<any>,
  @InjectModel('User') private userModel: Model<any>,
  @InjectModel(BillingBill.name) private billModel: Model<any>,
) {}
```

**4c.** In `refreshUser`, replace the `Promise.all` that fetches `[user, rows]` with one that fetches `[user, orderRows, billRows]` and merges them. Locate this block (lines 73–113):

```typescript
const [user, rows] = await Promise.all([
  this.userModel.findById(uid).select('name phone').lean<{ name?: string; phone?: string }>(),
  this.orderModel.aggregate([
    ...
  ]),
]);
```

Replace it with:

```typescript
const [user, orderRows, billRows] = await Promise.all([
  this.userModel.findById(uid).select('name phone').lean<{ name?: string; phone?: string }>(),
  this.orderModel.aggregate([
    { $match: { user: uid, status: 'delivered' } },
    { $sort: { createdAt: -1 } },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: '_product',
      },
    },
    { $unwind: { path: '$_product', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        localField: '_product.category',
        foreignField: '_id',
        as: '_category',
      },
    },
    { $unwind: { path: '$_category', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$_id',
        createdAt: { $first: '$createdAt' },
        total: { $first: '$total' },
        items: {
          $push: {
            productName: '$items.name',
            qty: '$items.quantity',
            categoryName: { $ifNull: ['$_category.name', ''] },
          },
        },
      },
    },
    { $sort: { createdAt: -1 } },
  ]),
  this.billModel.aggregate([
    { $match: { customerId: uid, status: 'active' } },
    { $sort: { createdAt: -1 } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$_id',
        createdAt: { $first: '$createdAt' },
        total: { $first: '$grandTotal' },
        items: {
          $push: {
            productName: '$items.name',
            qty: '$items.qty',
            categoryName: '',
          },
        },
      },
    },
    { $sort: { createdAt: -1 } },
  ]),
]);

const rows = [...orderRows, ...billRows].sort(
  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
);
```

Everything below this block (`const nameMissing = ...` onwards) is unchanged.

- [ ] **Step 5: Build check**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors. If you see `Property 'billModel' does not exist`, confirm the constructor injection was added correctly in Step 4b.

- [ ] **Step 6: Run full test suite**

```bash
cd backend && npx jest --passWithNoTests
```

Expected: all existing tests pass; the 2 new tests from Step 1 pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/crm/engine/status-model.spec.ts backend/src/modules/crm/crm.module.ts backend/src/modules/crm/crm-engine.service.ts
git commit -m "feat(crm): include billing bills in CRM engine customer stats"
```

---

## Task 2: Billing triggers CRM refresh on sale and new contact

**Files:**
- Modify: `backend/src/modules/billing/billing.module.ts`
- Modify: `backend/src/modules/billing/billing.service.ts`

**Interfaces:**
- Consumes: `CrmEngineService.refreshUser(userId: string | Types.ObjectId): Promise<void>` from Task 1 (already existed — Task 1 only extends its data sources, not its signature)
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Import `CrmModule` in `billing.module.ts`**

In `backend/src/modules/billing/billing.module.ts`, add the import at the top:
```typescript
import { CrmModule } from '../crm/crm.module';
```

Add `CrmModule` to the `imports` array:
```typescript
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: BillingTagPrice.name, schema: BillingTagPriceSchema },
      { name: BillingBill.name, schema: BillingBillSchema },
      { name: BillingCounter.name, schema: BillingCounterSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    CrmModule,
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
```

- [ ] **Step 2: Inject `CrmEngineService` into `BillingService`**

In `backend/src/modules/billing/billing.service.ts`, add the import:
```typescript
import { CrmEngineService } from '../crm/crm-engine.service';
```

Add it to the constructor (after the last existing injected model):
```typescript
constructor(
  @InjectModel(User.name) private userModel: Model<any>,
  @InjectModel(BillingTagPrice.name) private tagPriceModel: Model<BillingTagPriceDocument>,
  @InjectModel(BillingBill.name) private billModel: Model<BillingBillDocument>,
  @InjectModel(BillingCounter.name) private counterModel: Model<BillingCounterDocument>,
  @InjectModel('Product') private productModel: Model<any>,
  private readonly crmEngine: CrmEngineService,
) {}
```

- [ ] **Step 3: Fire CRM refresh after `createBill`**

In `createBill`, locate the line that returns the newly created bill:
```typescript
return bill;
```

Insert the fire-and-forget call immediately before that return:
```typescript
this.crmEngine.refreshUser(data.customerId).catch(() => {});
return bill;
```

- [ ] **Step 4: Fire CRM refresh after `createCustomer`**

In `createCustomer`, locate the line that returns the mapped user:
```typescript
return this.mapUser(u);
```

Insert the fire-and-forget call immediately before that return:
```typescript
this.crmEngine.refreshUser(u._id).catch(() => {});
return this.mapUser(u);
```

- [ ] **Step 5: Build check**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors. If you see `Cannot find module '../crm/crm-engine.service'`, check the import path. If you see a circular dependency error from NestJS at runtime (not compile time), confirm that `CrmModule` does NOT import `BillingModule`.

- [ ] **Step 6: Run full test suite**

```bash
cd backend && npx jest --passWithNoTests
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/billing/billing.module.ts backend/src/modules/billing/billing.service.ts
git commit -m "feat(billing): trigger CRM refresh on new bill and new contact"
```
