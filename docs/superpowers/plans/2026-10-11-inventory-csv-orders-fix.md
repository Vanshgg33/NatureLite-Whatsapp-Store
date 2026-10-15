# NatureLite Store Admin — Fix Blueprint (Products CSV · IMS · Orders)

> **How to use:** put this file in the root of the workspace that contains BOTH `store-frontend` and `store-backend` (or open each repo and run the matching phases). Then tell Claude Code:
>
> **"Read NATURELITE_STORE_FIX_BLUEPRINT.md fully. Execute Phase 0 → Phase 7 in order. Do not skip acceptance checks. Adapt file/class names to what actually exists in the repo, but keep the behaviour exactly as specified. Run the migration in --dry-run first and show me the report before --apply."**

Audit date: 10 Oct 2026. Everything under "Evidence" was observed on the live site (`store-frontend-037y.onrender.com` → API `store-backend-037y.onrender.com/api/v1`) by reading the production JS bundles and calling read-only GET endpoints with the logged-in admin session. Nothing was written to the live database.

---

## 0. Observed stack (confirm in repo)

| Layer | What the live build shows |
|---|---|
| Frontend | Next.js 14 App Router, React Query (`@tanstack/react-query`), axios `ApiClient` class (one big file, `this.client = axios.create({ baseURL, timeout: 30000, withCredentials: true })`), zustand stores `useAdminAuthStore` / `useCustomerStore`, shadcn/ui, lucide icons |
| Backend | NestJS (error body shape `{statusCode, message, error, path, timestamp}` = Nest exception filter), MongoDB + Mongoose, deployed on Render |
| Relevant pages | `app/admin/products/page.tsx`, `app/admin/products/import/page.tsx`, `app/admin/ims/page.tsx`, `app/admin/orders/page.tsx` (create-order dialog lives here), `app/admin/orders/[id]/page.tsx` |
| Relevant API | `GET /products/export/csv`, `POST /products/import/csv`, `PUT /products/:id/stock`, `GET /products/search`, `GET/PUT /store-stock…`, `PUT /store-stock/bulk`, `POST /orders/admin-create`, `POST /billing/bills` |

Find the backend files with:
```bash
grep -rn "export/csv\|import/csv" --include=*.ts store-backend/src
grep -rn "store-stock" --include=*.ts store-backend/src
grep -rn "admin-create\|adminCreate" --include=*.ts store-backend/src
grep -rn "variantStocks\|variantSku" --include=*.ts store-backend/src
grep -rn "billing/bills\|createBill" --include=*.ts store-backend/src
grep -rn "\.stock\b" --include=*.ts store-backend/src | grep -v test
```
List every place that **writes** stock (`$inc`, `.stock =`, `save()` after stock change). Phase 2 replaces all of them.

---

## 1. Evidence — what is actually broken

### 1.1 Export CSV — crashes on the server
- `GET /products/export/csv` returns **HTTP 500 "Internal server error"** with a valid admin token. The frontend catches it and shows a generic `alert("Export failed")`, so you never see the real reason.
- Even when it worked, the exporter has no columns for variants, images, store stock, nutrition, ingredients, lab report, etc. (the import page only knows 13 flat columns).

### 1.2 Import CSV — fragile and lossy
In `app/admin/products/import/page.tsx`:
1. **Hand-written CSV parser** splits on `"\n"` → breaks on quoted multi-line descriptions, leaves `\r` on Windows/Excel files, splits the *header* on `,` without respecting quotes, and does not handle escaped `""`.
2. **Auto-mapping bug:** fuzzy match is `header.includes(alias) || alias.includes(header)`. A header like `categoryId` contains `id` → gets mapped to **SKU**; `compareAtPrice` contains `price` → can be mapped to **Price**. Silent wrong imports.
3. Existing SKUs are **skipped** — no update mode, so you cannot fix prices/stock in bulk.
4. No variants, no images, no category by name, no per-store stock.
5. All rows are posted in a single request (30 s axios timeout on Render) → large files time out.

### 1.3 Stock has THREE sources of truth that disagree
Live data, Raipur store, 75 products:

| Check | Result |
|---|---|
| `product.stock` ≠ sum of `product.variants[].stock` | 74 of 74 compared products |
| StoreStock base `stock` ≠ sum of StoreStock `variantStocks[].stock` | 70 of 71 variant products |
| Products whose `stock` = 0 but variants have stock | 9 |
| StoreStock rows for a product that no longer exists (e.g. "A2 GHEE") | 1+ |
| StoreStock variant SKUs that no longer exist on the product | 11 |
| Products with no StoreStock row for the main store | 2 |
| **Variant SKUs reused across products** | `"1"` used 54×, `"2"` 64×, `"3"` 20×, `"4"` 9×, `"5"` 4× |

Example — *Almond (Badam)*: product.stock 55, product variants sum 111, IMS base 0, IMS variants sum 61. Four different numbers for one product.

Also:
- Frontend total helpers **double count**: `total = product.stock + Σ variants.stock` and `total = storeStock.stock + Σ variantStocks.stock`. (Rajgira Flour shows 40 = 0 + 22 + 18; works by accident only when base is 0.)
- **IMS writes only to `StoreStock`** (`PUT /store-stock`). The website, product list and **order creation read `product.stock` / `product.variants[].stock`**. So an IMS update never reaches orders → this is exactly your problem #3.
- IMS dialog labels **"Damaged" as "Increases total"** (`positive: true`). Damaged goods must reduce sellable stock.
- IMS save only refetches `store-stock` queries; nothing invalidates products / product-search / billing caches.
- No atomic guard on decrements → two simultaneous sales can drive stock negative or lose an update.

### 1.4 Orders → Create Order
- Product picker uses `GET /products/search` and builds the option list from `product.variants[].stock` (not IMS). Marks `trackStock && stock <= 0` as **Out of Stock** → products you just restocked in IMS still show out of stock.
- Clicking an item again does `quantity + 1` with no knowledge of real per-store availability; the backend then rejects with insufficient stock (checked against the stale product field) → "cannot increase quantity".
- Variant identity is `productId + variantSku`; with SKUs like `"1"`/`"2"` reused everywhere, any backend code that looks up by SKU alone hits the wrong product.

### 1.5 Speed
- Warm API latency: `/health` ≈ 0.8 s, `/products/search` ≈ 0.8 s, `/store-stock/store/:id` ≈ 2.2 s, `/products?limit=500` ≈ 2.5 s; first call after idle ≈ 2.7 s+ (Render cold start).
- IMS list re-fetches the whole page + summary + analytics after every single save.

### 1.6 🔴 SECURITY (fix first)
- `GET /stores` returns every store's **`adminEmail` and `adminPassword` in plain text**, and they share a weak default. Anyone with an admin token (or a leaked one) can read store logins.

### 1.7 Auth
- During the audit the admin session expired and the app redirected to login instead of silently refreshing. Frontend and backend are on different `*.onrender.com` subdomains; `onrender.com` is on the Public Suffix List, so cookies between them are third-party and are blocked by many browsers. Refresh must not depend on cookies (Phase 6).

---

## 2. Target design (rules every phase must follow)

1. **StoreStock is the only source of truth** for quantity, per store.
2. **One writer:** a new backend `InventoryService` is the ONLY code allowed to change stock. IMS, website orders, admin orders, billing bills, cancellations, returns, and CSV import all call it.
3. **Variant products keep stock only on variants.** For a product with ≥1 variant, StoreStock base `stock` is always 0 and `total = Σ variantStocks`. For a product with no variants, `total = stock`. Never add both.
4. **Variants are identified by `variantId` (the variant `_id`)**, not by SKU. Variant SKUs become globally unique anyway (migration).
5. `product.stock` and `product.variants[].stock` become a **read-only cache** = sum across all active stores, recomputed by `InventoryService` after every movement (used only for catalogue badges/sorting).
6. Every change writes a **StockMovement** ledger row (who, what, why, before, after).
7. Decrements are **atomic and guarded** (`stock >= qty` in the update filter) inside a Mongo transaction when multiple items are involved.
8. **Damaged decreases** stock. (If you ever want different behaviour, change the sign in `MOVEMENT_SIGN`.)
9. Orders consume stock from the **fulfilment store** = the active store whose `cities` contains the order city; fallback = `isMainStore`.

---

## Phase 0 — Safety

- [ ] `mongodump --uri "$MONGODB_URI" --out backups/pre-inventory-fix-$(date +%F)` (or Atlas snapshot). Do not continue without a backup.
- [ ] Create branch `fix/inventory-csv-orders` in both repos.
- [ ] Confirm the backend can run Mongo transactions (Atlas = replica set ✓). If `MONGODB_URI` points to a standalone dev instance, use a replica-set dev container for local testing.

---

## Phase 1 — Security hotfix (store passwords)

Backend `Store` schema:
```ts
@Prop({ select: false }) adminPassword?: string;   // hashed only
```
- [ ] Hash existing values with bcrypt (cost 12) in a one-off script; anything that logs in with store credentials must compare with `bcrypt.compare`.
- [ ] Every `find` on stores must not return `adminPassword` (the `select:false` does this; also strip it in the DTO/serializer).
- [ ] Remove any frontend code that displays/edits plain store passwords; replace with "Reset password" action that sets a new hashed value.
- [ ] Tell Om to change all store passwords after deploy (old ones were exposed).

**Accept:** `GET /stores` response contains no `adminPassword` key.

---

## Phase 2 — Inventory core (backend)

### 2.1 Schemas

`store-stock.schema.ts` (update existing):
```ts
@Schema({ timestamps: true })
export class StoreStock {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true }) store: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true }) product: Types.ObjectId;
  @Prop({ default: 0, min: 0 }) stock: number;               // only for products WITHOUT variants
  @Prop({ type: [{ variantId: { type: Types.ObjectId, required: true }, variantSku: String, stock: { type: Number, default: 0, min: 0 } }], default: [] })
  variantStocks: { variantId: Types.ObjectId; variantSku: string; stock: number }[];
  @Prop({ default: 5 }) lowStockThreshold: number;
  @Prop({ default: 0 }) version: number;                    // bump on every write (cheap change detection)
}
StoreStockSchema.index({ store: 1, product: 1 }, { unique: true });
StoreStockSchema.index({ store: 1, 'variantStocks.variantId': 1 });
```

New `stock-movement.schema.ts`:
```ts
export type MovementType = 'STOCK_IN' | 'RETURNED' | 'DAMAGED' | 'SALE_LOG' | 'ADJUST_SET'
  | 'ORDER_RESERVE' | 'ORDER_CANCEL' | 'ORDER_RETURN' | 'BILL_SALE' | 'BILL_VOID' | 'IMPORT_SET' | 'MIGRATION';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class StockMovement {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true }) store: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true }) product: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) variantId?: Types.ObjectId;
  @Prop({ required: true }) type: MovementType;
  @Prop({ required: true }) delta: number;      // signed
  @Prop() before: number;
  @Prop() after: number;
  @Prop() refType?: 'order' | 'bill' | 'ims' | 'import' | 'migration';
  @Prop() refId?: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) by?: Types.ObjectId;
  @Prop() note?: string;
}
StockMovementSchema.index({ store: 1, createdAt: -1 });
StockMovementSchema.index({ refType: 1, refId: 1 });
```
The IMS daily report (`/store-stock/store/:id/analytics`) must be rebuilt from `StockMovement` (group by day/type) instead of whatever it uses now.

### 2.2 `inventory/inventory.service.ts`

```ts
export const MOVEMENT_SIGN: Record<string, 1 | -1> = {
  STOCK_IN: 1, RETURNED: 1, ORDER_CANCEL: 1, ORDER_RETURN: 1, BILL_VOID: 1,
  DAMAGED: -1, SALE_LOG: -1, ORDER_RESERVE: -1, BILL_SALE: -1,
};

export interface MoveLine {
  storeId: string; productId: string; variantId?: string | null;
  type: MovementType; qty: number;           // always positive; sign comes from type (ADJUST_SET/IMPORT_SET use setTo)
  setTo?: number;
}

export class InsufficientStockError extends BadRequestException {
  constructor(public lines: { productId: string; variantId?: string; name: string; available: number; requested: number }[]) {
    super({ code: 'INSUFFICIENT_STOCK', message: 'Insufficient stock', lines });
  }
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(StoreStock.name) private ss: Model<StoreStockDocument>,
    @InjectModel(Product.name) private products: Model<ProductDocument>,
    @InjectModel(StockMovement.name) private moves: Model<StockMovementDocument>,
    @InjectModel(Store.name) private stores: Model<StoreDocument>,
    @InjectConnection() private conn: Connection,
    private events: EventEmitter2,
  ) {}

  /** Ensure a StoreStock row exists with an entry for every current variant (no-op if present). */
  async ensureRow(storeId: string, productId: string, session?: ClientSession) {
    const p = await this.products.findById(productId, { variants: 1 }).lean().session(session ?? null);
    if (!p) throw new NotFoundException('Product not found');
    await this.ss.updateOne(
      { store: storeId, product: productId },
      { $setOnInsert: { store: storeId, product: productId, stock: 0, variantStocks: [] } },
      { upsert: true, session },
    );
    for (const v of p.variants ?? []) {
      await this.ss.updateOne(
        { store: storeId, product: productId, 'variantStocks.variantId': { $ne: v._id } },
        { $push: { variantStocks: { variantId: v._id, variantSku: v.sku, stock: 0 } } },
        { session },
      );
    }
  }

  /** Apply one or many movements atomically. Throws InsufficientStockError and rolls back everything. */
  async apply(lines: MoveLine[], ctx: { by?: string; refType?: string; refId?: string; note?: string; allowNegative?: boolean; session?: ClientSession }) {
    const run = async (session: ClientSession) => {
      const failures: InsufficientStockError['lines'] = [];
      for (const l of lines) {
        await this.ensureRow(l.storeId, l.productId, session);
        const isSet = l.type === 'ADJUST_SET' || l.type === 'IMPORT_SET';
        const delta = isSet ? 0 : MOVEMENT_SIGN[l.type] * Math.abs(l.qty);
        const guard = !isSet && delta < 0 && !ctx.allowNegative;

        let before: number; let after: number;
        if (l.variantId) {
          const filter: any = { store: l.storeId, product: l.productId,
            variantStocks: { $elemMatch: { variantId: l.variantId, ...(guard ? { stock: { $gte: -delta } } : {}) } } };
          const update = isSet ? { $set: { 'variantStocks.$[v].stock': Math.max(0, l.setTo!) }, $inc: { version: 1 } }
                               : { $inc: { 'variantStocks.$[v].stock': delta, version: 1 } };
          const prev = await this.ss.findOneAndUpdate(filter, update,
            { arrayFilters: [{ 'v.variantId': new Types.ObjectId(l.variantId) }], session, new: false, lean: true });
          if (!prev) { failures.push(await this.describe(l, session)); continue; }
          before = prev.variantStocks.find(v => String(v.variantId) === String(l.variantId))!.stock;
          after = isSet ? Math.max(0, l.setTo!) : before + delta;
        } else {
          const filter: any = { store: l.storeId, product: l.productId, ...(guard ? { stock: { $gte: -delta } } : {}) };
          const update = isSet ? { $set: { stock: Math.max(0, l.setTo!) }, $inc: { version: 1 } } : { $inc: { stock: delta, version: 1 } };
          const prev = await this.ss.findOneAndUpdate(filter, update, { session, new: false, lean: true });
          if (!prev) { failures.push(await this.describe(l, session)); continue; }
          before = prev.stock; after = isSet ? Math.max(0, l.setTo!) : before + delta;
        }
        await this.moves.create([{ store: l.storeId, product: l.productId, variantId: l.variantId ?? undefined,
          type: l.type, delta: after - before, before, after, by: ctx.by, refType: ctx.refType, refId: ctx.refId, note: ctx.note }], { session });
      }
      if (failures.length) throw new InsufficientStockError(failures);
      await this.refreshProductCache([...new Set(lines.map(l => l.productId))], session);
    };

    if (ctx.session) await run(ctx.session);
    else await this.conn.transaction(run);          // auto retry on TransientTransactionError

    this.events.emit('inventory.changed', { productIds: [...new Set(lines.map(l => l.productId))], storeIds: [...new Set(lines.map(l => l.storeId))] });
  }

  /** Recompute product.stock / product.variants[].stock = Σ over active stores. */
  async refreshProductCache(productIds: string[], session?: ClientSession) {
    const activeStores = (await this.stores.find({ isActive: true }, { _id: 1 }).lean().session(session ?? null)).map(s => s._id);
    const rows = await this.ss.find({ product: { $in: productIds }, store: { $in: activeStores } }).lean().session(session ?? null);
    const ops = [];
    for (const pid of productIds) {
      const mine = rows.filter(r => String(r.product) === String(pid));
      const p = await this.products.findById(pid, { variants: 1 }).lean().session(session ?? null);
      if (!p) continue;
      if (p.variants?.length) {
        const perVariant = new Map<string, number>();
        for (const r of mine) for (const v of r.variantStocks) perVariant.set(String(v.variantId), (perVariant.get(String(v.variantId)) ?? 0) + v.stock);
        const set: any = { stock: [...perVariant.values()].reduce((a, b) => a + b, 0) };
        p.variants.forEach((v, i) => { set[`variants.${i}.stock`] = perVariant.get(String(v._id)) ?? 0; });
        ops.push({ updateOne: { filter: { _id: pid }, update: { $set: set } } });
      } else {
        ops.push({ updateOne: { filter: { _id: pid }, update: { $set: { stock: mine.reduce((a, r) => a + r.stock, 0) } } } });
      }
    }
    if (ops.length) await this.products.bulkWrite(ops, { session });
  }

  /** Available qty for one store (used by order picker, billing, website checkout). */
  async availability(storeId: string, productIds: string[]) {
    const rows = await this.ss.find({ store: storeId, product: { $in: productIds } }, { product: 1, stock: 1, variantStocks: 1 }).lean();
    const map = new Map<string, { base: number; variants: Record<string, number> }>();
    for (const r of rows) map.set(String(r.product), { base: r.stock, variants: Object.fromEntries(r.variantStocks.map(v => [String(v.variantId), v.stock])) });
    return map;
  }

  async resolveFulfilmentStore(city?: string) {
    const c = (city ?? '').trim().toLowerCase();
    const stores = await this.stores.find({ isActive: true }).lean();
    return stores.find(s => (s.cities ?? []).some(x => x.toLowerCase() === c)) ?? stores.find(s => s.isMainStore) ?? stores[0];
  }

  private async describe(l: MoveLine, session?: ClientSession) {
    const p = await this.products.findById(l.productId, { name: 1, variants: 1 }).lean().session(session ?? null);
    const row = await this.ss.findOne({ store: l.storeId, product: l.productId }).lean().session(session ?? null);
    const v = l.variantId ? p?.variants?.find(x => String(x._id) === String(l.variantId)) : null;
    const available = l.variantId ? (row?.variantStocks.find(x => String(x.variantId) === String(l.variantId))?.stock ?? 0) : (row?.stock ?? 0);
    return { productId: l.productId, variantId: l.variantId ?? undefined, name: v ? `${p?.name} · ${v.name}` : p?.name ?? '?', available, requested: l.qty };
  }
}
```

Register `EventEmitterModule.forRoot()` in `AppModule` if not present; export `InventoryService` from an `InventoryModule` and import it in Products, StoreStock, Orders, Billing modules.

### 2.3 Replace every stock writer
- [ ] `PUT /store-stock` (IMS save) → build `MoveLine[]` from `stockInDelta / returnedDelta / damagedDelta / saleLogDelta` (+ `lowStockThreshold` update separately) and call `inventory.apply(...)` with `refType:'ims'`. Accept `variantId` (keep accepting `variantSku` for one release, resolve it **within that product only**).
- [ ] `PUT /store-stock/bulk` → same, one transaction.
- [ ] `PUT /products/:id/stock` → `ADJUST_SET` on the **main store** (or require `storeId`). No direct writes to `product.stock`.
- [ ] Product create/update: never accept `stock` / `variants[].stock` from the body (strip them). After adding/removing a variant call `ensureRow` for every store and `refreshProductCache`.
- [ ] Orders (website `POST /orders`, `/orders/guest`, `/orders/admin-create`, `/orders/reorder`): see Phase 4.
- [ ] Order cancel / return / delete-before-dispatch → `ORDER_CANCEL` / `ORDER_RETURN` with the same store and variantIds stored on the order.
- [ ] Billing `POST /billing/bills` → `BILL_SALE` for the biller's store; bill void/edit → `BILL_VOID` + new `BILL_SALE`.
- [ ] grep again: **no** remaining `$inc` on `stock`, `variants.$.stock`, `variantStocks` outside `InventoryService`. Add an ESLint `no-restricted-syntax` rule or a unit test that greps for it.

### 2.4 Speed
- [ ] All list/read queries: `.lean()`, explicit projection, no populate of full product docs in loops (one `$in` query instead of N+1).
- [ ] `GET /store-stock/store/:id`: single aggregation `$match {store}` → `$lookup` products with `pipeline: [{ $project: { name:1, sku:1, price:1, images:{ $slice:['$images',1] }, variants:{ _id:1, name:1, sku:1, price:1 } } }]` → server-side search/lowStockOnly filter → `$facet` for page + count. Target < 300 ms warm.
- [ ] `GET /products/search`: text or regex index on `name`, `sku`, `variants.sku`; projection; limit 20. Accept `storeId` (Phase 4).
- [ ] Add compression (`app.use(compression())`) and `Cache-Control: no-store` on stock endpoints.
- [ ] Render: free/starter instances sleep → cold start. Either upgrade the backend instance to an always-on plan or add a 10-minute keep-alive ping to `/health` (cron-job.org or a Render cron). Put Render region and Atlas region in the same area (e.g. Singapore + Mumbai/Singapore). Log `responseTime` per request to confirm.
- [ ] Optional realtime: `GET /inventory/stream` (SSE) that forwards `inventory.changed` events; frontend invalidates matching React Query keys. If skipped, use the version polling in Phase 3.

**Accept (Phase 2):** unit tests for `InventoryService`: (a) two concurrent `ORDER_RESERVE` of the last unit → one succeeds, one throws `INSUFFICIENT_STOCK`; (b) multi-line order where line 2 fails leaves line 1 unchanged; (c) DAMAGED decreases; (d) product cache equals Σ stores after each test.

---

## Phase 3 — IMS page (frontend)

File: `app/admin/ims/page.tsx` (+ shared helper file that defines the `aX`-style total function — search for `variantStocks` reduce).

- [ ] **One total helper used everywhere** (`lib/stock.ts`):
  ```ts
  export const productTotal = (p: { stock?: number; variants?: { stock?: number }[] }) =>
    p.variants?.length ? p.variants.reduce((a, v) => a + (v.stock ?? 0), 0) : (p.stock ?? 0);
  export const storeTotal = (s: { stock?: number; variantStocks?: { stock?: number }[] }) =>
    s.variantStocks?.length ? s.variantStocks.reduce((a, v) => a + (v.stock ?? 0), 0) : (s.stock ?? 0);
  ```
  Replace every `stock + Σ variants` occurrence (products list, IMS, orders/[id], PDF report).
- [ ] Movement dialog: **Damaged → "Decreases total"** (red), and show a live preview "Current → New" for the selected variant before saving; block save if result < 0.
- [ ] For variant products: hide "Base product" option (no base stock). Variant selector sends `variantId`.
- [ ] **Optimistic update** in the mutation:
  ```ts
  onMutate: async (vars) => {
    await qc.cancelQueries({ queryKey: ['store-stock', storeId] });
    const key = ['store-stock', storeId, page, search, lowOnly];
    const prev = qc.getQueryData(key);
    qc.setQueryData(key, (old: any) => old && ({ ...old, items: old.items.map((r: any) =>
      r.product === vars.productId || r.product?._id === vars.productId ? applyDeltaLocally(r, vars) : r) }));
    return { prev, key };
  },
  onError: (_e, _v, ctx) => ctx && qc.setQueryData(ctx.key, ctx.prev),
  onSettled: () => {
    qc.invalidateQueries({ queryKey: ['store-stock', storeId] });
    qc.invalidateQueries({ queryKey: ['store-stock-summary', storeId] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['product-search'] });
    qc.invalidateQueries({ queryKey: ['billing-products'] });   // use the real billing search key
  },
  ```
- [ ] Disable the Save button while pending and debounce double-clicks (prevents duplicate movements).
- [ ] **Bulk mode**: toggle that turns the table into editable "Stock In" / "Sale Log" columns; one `PUT /store-stock/bulk` call; per-row result chips.
- [ ] Show the error message from the API (`INSUFFICIENT_STOCK` lines) instead of a generic toast.
- [ ] Add "History" drawer per product reading `GET /store-stock/movements?store=&product=` (last 50 movements).
- [ ] If SSE not implemented: poll `GET /store-stock/store/:id/version` (returns max `version`/`updatedAt`) every 15 s and refetch only when it changes.

**Accept:** update a variant in IMS → the same number appears in Products list, Create-Order picker and Billing search within 1 s, without page reload.

---

## Phase 4 — Orders: create/edit order

Backend `POST /orders/admin-create` (and website order endpoints):
- [ ] Resolve store: explicit `storeId` in body (admin picks it) else `inventory.resolveFulfilmentStore(shippingAddress.city)`. Save `fulfilmentStore` on the order.
- [ ] Items carry `variantId` (accept `variantSku` for one release and resolve **inside that product**). Save `variantId`, `variantSku`, `variantName` on each order item.
- [ ] Inside **one** `conn.transaction`: create the order document and call `inventory.apply(items.map(i => ({ storeId, productId, variantId, type:'ORDER_RESERVE', qty:i.quantity })), { session, refType:'order', refId:orderId })`. If `InsufficientStockError` → abort, return 400 with the `lines` array.
- [ ] Order edit (`PUT /orders/:id` items change): compute diff old vs new items → `ORDER_CANCEL` for removed/decreased qty, `ORDER_RESERVE` for added/increased qty, same transaction.
- [ ] Cancel/return/delete → `ORDER_CANCEL` / `ORDER_RETURN` exactly once (store a `stockReleased: true` flag to make it idempotent).
- [ ] Superadmin-only `allowBackorder: true` flag → passes `allowNegative` (logged in StockMovement note). Default off.

Backend `GET /products/search?q=&limit=&storeId=`:
- [ ] When `storeId` given, attach per-store availability: `available` on simple products and `variants[].available`. Use `inventory.availability`.

Frontend `app/admin/orders/page.tsx` (create-order dialog and edit-items dialog):
- [ ] Add a **Store** select at the top of the dialog (defaults to the store matched from the City field; re-resolves when City changes).
- [ ] Search query key: `['product-search', storeId, q]`; pass `storeId`; `staleTime: 0`.
- [ ] Build options from `available` (not `stock`). Out-of-Stock = `trackStock && available <= 0`.
- [ ] Line item row gets – / input / + controls; `+` and typed values are clamped to `available` with a hint "Only N left at <Store>". Out-of-stock items can be added only when superadmin ticks "Allow backorder".
- [ ] Items identified by `productId + variantId`.
- [ ] On 400 `INSUFFICIENT_STOCK`, highlight the offending lines with the server's `available` and refetch search.
- [ ] After success invalidate `['orders']`, `['store-stock']`, `['products']`, `['product-search']`.

**Accept:** stock-in 10 units of a variant in IMS for Raipur → create order for a Raipur address → picker shows "10 left", + stops at 10, order succeeds, IMS shows 10 − qty immediately, cancelling the order restores it.

---

## Phase 5 — Products CSV: full export + reliable import

### 5.1 Format (export = import, exactly the same headers)
One row **per variant** (a product without variants = one row with empty variant columns). Product-level columns repeat on each row of the same product; the importer groups by `product_sku`.

| Column | Notes |
|---|---|
| `product_sku` * | product key (unique) |
| `name` * | |
| `slug` | auto from name if empty |
| `category` | category **path by name**, e.g. `Oils > Wood Pressed Oils` |
| `short_description` | |
| `description` | may contain new lines / commas (quoted) |
| `price` * | product base price (used when no variants) |
| `compare_at_price` | |
| `special_offer_active` | true/false |
| `special_offer_price`, `special_offer_label` | |
| `gst_percentage`, `hsn_code` | |
| `track_stock` | true/false |
| `low_stock_threshold` | |
| `is_active`, `is_featured` | true/false |
| `tags` | pipe separated `ghee|a2|bilona` |
| `images` | pipe separated full URLs (Cloudinary), in display order |
| `image_alts` | pipe separated, same order as images |
| `video_url`, `videos` | `videos` pipe separated |
| `lab_report_url` | |
| `ingredients` | text |
| `nutritional_facts` | JSON string |
| `related_product_skus`, `upsell_product_skus` | pipe separated product SKUs |
| `variant_name` | e.g. `500ml` |
| `variant_sku` | globally unique (after migration) |
| `variant_price`, `variant_compare_at_price` | |
| `variant_is_active` | true/false |
| `variant_images` | pipe separated URLs |
| `stock_<storecode>` | one column per active store, e.g. `stock_raipur`, `stock_bhilai`, `stock_store3` — from StoreStock (variant level for variant rows) |
| `stock_total` | read-only, ignored on import |
| `total_sold`, `view_count`, `created_at`, `updated_at`, `product_id`, `variant_id` | read-only, ignored on import |

Write the column list ONCE in a shared constant (backend `products/csv/columns.ts`) and expose it via `GET /products/csv/template` so the frontend never hard-codes headers.

### 5.2 Export (backend)
- [ ] Fix the 500 first: wrap the current handler, log `err.stack`, reproduce locally (likely a null category / undefined field in string building). Then replace the implementation:
- [ ] Use `csv-stringify` (stream) + Mongoose cursor (`Product.find(filter).lean().cursor()`), join StoreStock for all active stores in batches of 100 products, write rows to `res`.
- [ ] Headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="naturelite-products-YYYY-MM-DD.csv"`, prepend UTF-8 BOM `﻿` (Hindi names open correctly in Excel).
- [ ] Optional query `?category=` (already sent by frontend), `?includeInactive=true` default true.
- [ ] Frontend: keep blob download, but on error read the text body and show the server message in a toast, not `alert`.

### 5.3 Import (backend does the parsing)
- [ ] New endpoint `POST /products/import` `multipart/form-data` (`file`, `mode = create | update | upsert`, `dryRun = true|false`, `defaultCategoryId?`). Max 5 MB. Parse with `csv-parse` (`bom:true, columns:true, relax_quotes:true, skip_empty_lines:true, trim:true`). Also accept `.xlsx` via `xlsx` package if easy.
- [ ] Group rows by `product_sku`; build product + variants; validate everything first (required fields, numbers ≥ 0, unique variant SKUs inside file and across DB, URLs valid, category path exists → create if `createMissingCategories=true`).
- [ ] Images: keep Cloudinary URLs as-is; any non-Cloudinary URL → existing `uploadImageFromUrl` service, replace with returned URL (max 4 in parallel).
- [ ] Upsert by `product_sku`; variants matched by `variant_sku` (then by name); new variants created; variants missing from the file are **left untouched** (never auto-deleted) unless `removeMissingVariants=true`.
- [ ] Stock columns `stock_<code>` → `InventoryService.apply` with `IMPORT_SET` per store/variant (ledger records it). Empty cell = don't touch stock.
- [ ] Process in chunks of 25 products; each product in its own transaction so one bad row doesn't kill the file.
- [ ] Response: `{ dryRun, created, updated, unchanged, skipped, errors: [{ row, product_sku, field, message }], warnings: [] }`. For dry run nothing is written.

### 5.4 Import page (frontend)
- [ ] Replace the hand-written parser with `papaparse` (`header:true, skipEmptyLines:true`) for preview only; the real parse happens on the server.
- [ ] Auto-mapping: normalise headers (`lowercase, strip non-alphanumerics`); match **exact alias first**, then `startsWith`; **never** use bidirectional `includes`. Exported files must map 100 % automatically.
- [ ] Mode selector (Create only / Update only / Create + Update), "Dry run" default ON → shows the server report → button "Apply import".
- [ ] "Download template" (calls `/products/csv/template`) and "Download error rows" (CSV of failed rows + error column).
- [ ] Remove the old 13-column `j` field list and the `N` header list; read columns from the template endpoint.

**Accept:** Export → open in Excel/Sheets (Hindi text fine) → re-import the same file with mode Update + dry run → report says 0 created, 0 updated, all unchanged. Change one variant price and `stock_raipur` → apply → product page and IMS show new values; StockMovement has an `IMPORT_SET` row.

---

## Phase 6 — Auth refresh (prevents "Export failed"/random logouts)

- [ ] Backend `/auth/refresh` must accept `{ refreshToken }` in the **body** (frontend already sends it) and return `{ accessToken, refreshToken }`; rotate and store the hash of the refresh token; access token 30–60 min, refresh 30 days.
- [ ] Frontend interceptor: on refresh success write BOTH tokens to `useAdminAuthStore` (persisted) and retry the original request (including `responseType:'text'`/blob requests); on refresh failure clear store and redirect once to `/admin-login?next=<current path>`.
- [ ] Don't rely on cross-subdomain cookies (`*.onrender.com` is a public suffix). Long term: put both apps behind your own domain (`admin.naturelite.xx` + `api.naturelite.xx`).

**Accept:** set access TTL to 1 min in dev, wait 2 min, click Export → export succeeds without a login screen.

---

## Phase 7 — One-time data repair migration

Script `store-backend/scripts/inventory-repair.ts` (run with `ts-node`), flags `--dry-run` (default) / `--apply`. Writes `reports/inventory-repair-<timestamp>.csv` with one line per change: `product, variant, store, field, old, new, reason`.

Steps:
1. **Unique variant SKUs.** For every variant whose SKU is used by more than one product (or empty): new SKU = `${product.sku}-${slug(variant.name)}` (uppercase, e.g. `AMARNATH-500GM`; add `-2` on collision). Update `product.variants[].sku`, `StoreStock.variantStocks[].variantSku`, billing tag-price records, and any other collection storing variantSku (grep). Historic orders/bills keep their old SKU text but get `variantId` back-filled where productId + old sku matches.
2. **Back-fill `variantId`** on every `StoreStock.variantStocks` entry (match by productId + old sku within that product).
3. **Stale variant entries** (variant no longer on product): remove; report qty dropped.
4. **Base stock on variant products:** report it, then set to 0 (variant quantities are kept as the truth). Om reviews the report — if a base number was the real count, he fixes it later via IMS Stock In.
5. **Orphan StoreStock rows** (product deleted, e.g. "A2 GHEE"): report; delete only with `--apply-orphans`.
6. **Missing rows:** `ensureRow` for every product × active store.
7. Write a `MIGRATION` StockMovement for each changed quantity.
8. `refreshProductCache` for all products.
9. Print summary counts that match the evidence table in §1.3.

After apply, add unique index on `products.variants.sku` (sparse) and on `storestocks {store, product}`.

Recommend Om does a **physical count** of the Experience Centre right after the migration and enters it through IMS bulk mode (`ADJUST_SET`), so the system starts from verified numbers.

---

## Phase 8 — Final verification checklist

- [ ] `npm run build` passes for frontend and backend; no TypeScript `any` leaks in new code beyond Mongoose filters.
- [ ] Unit tests from Phase 2 pass; add e2e test: IMS stock-in → admin order → cancel → stock back.
- [ ] Load test: 20 parallel orders for an item with 5 units → exactly 5 succeed, stock = 0, never negative.
- [ ] `GET /stores` has no password field.
- [ ] Export file has all columns from §5.1, every product, every variant, every image URL, every store's stock.
- [ ] Round-trip import report = all unchanged.
- [ ] IMS save → products list / order picker / billing search show the new number within 1 s.
- [ ] Damaged reduces stock; ledger shows `DAMAGED` with negative delta.
- [ ] p95 warm latency: IMS list < 400 ms, product search < 300 ms (log it).
- [ ] Commit per phase with clear messages; deploy backend first (it still accepts `variantSku`), then frontend, then run the migration with `--apply`.

## Files you will most likely touch

Backend: `src/inventory/*` (new), `src/store-stock/*`, `src/products/products.service.ts`, `src/products/products.controller.ts`, `src/products/csv/*` (new), `src/orders/orders.service.ts`, `src/billing/*bill*.service.ts`, `src/stores/schemas/store.schema.ts`, `src/auth/*refresh*`, `scripts/inventory-repair.ts` (new), `src/app.module.ts`.

Frontend: `lib/api*.ts` (ApiClient — add `importProducts(formData)`, `getCsvTemplate()`, `getStockMovements()`, `searchProducts(q, limit, storeId)`), `lib/stock.ts` (new), `app/admin/ims/page.tsx`, `app/admin/products/page.tsx`, `app/admin/products/import/page.tsx`, `app/admin/orders/page.tsx`, `app/admin/orders/[id]/page.tsx`, the auth store + axios interceptor.
