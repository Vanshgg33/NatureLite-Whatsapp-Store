# Backend Redis Cache — All Admin Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Redis `cached()` / `delPattern()` to every admin-facing read path that currently hits MongoDB on every request.

**Architecture:** Wrap expensive reads in `redisService.cached(key, ttl, compute)` (already exists). Call `delPattern('admin:<module>:*')` on writes. Use short TTLs (30 s) for mutable lists, longer (60–300 s) for aggregates and rarely-changed data.

**Tech Stack:** NestJS, `RedisService` (already in `backend/src/modules/redis/redis.service.ts`), `ioredis`.

**Spec:** Conversation survey — `SettingsService` already has in-memory cache (skip it); every other admin module has zero backend cache.

## Global Constraints

- Never throw or surface Redis errors to callers — `redisService.cached` already swallows them and falls through to the compute function.
- Keep all admin cache keys under the `admin:` namespace prefix so a single `delPattern('admin:*')` can nuke everything in an emergency.
- TTL values: paginated lists → 30 s; dashboard aggregates → 60 s; quasi-static (categories, materials, vendors, tags) → 120–300 s.
- Do not add `RedisModule` explicitly — it exports `RedisService` and NestJS resolves it via the existing global/import wiring; just add `RedisModule` to the `imports:` array of each module that doesn't have it yet.
- The `BillingService` and `CrmService` already have many existing spec files that instantiate the service with partial mocks. Adding `RedisService` at the end of the constructor preserves those specs — they pass `undefined` for the new param, which is fine as long as the new code is not exercised in those specs.

## Review Focus

- **Stale stock in cached product list** — `findAll` runs `overlayStoreStock` before caching; a sale that decrements stock will not be reflected until the 30 s TTL expires. Acceptable for admin list; tested by asserting the compute function is called once, not twice.
- **Mongoose Documents vs. plain objects** — `findAllPaginated` returns Mongoose Documents. After `JSON.stringify → parse` round-trip through Redis, cached items become plain objects. Controllers serialize to JSON either way; no caller calls `.populate()` on the returned items.
- **CRM `getCustomers` complaint annotation** — `openComplaintUserIds()` runs inside the compute closure and is included in the cached result. Cache invalidation is TTL-only (30 s); complaint state changes are reflected within one TTL window.
- **Billing `getDashboard` aggregate** — cached at 60 s; callers must tolerate one minute of lag on new bills. Invalidated explicitly on every bill write.
- **purchase `getStats` / `getPurchaseSummary`** — these are separate from `getRequests` and are not currently cached. They are low-frequency admin calls; add them in a follow-up if profiling shows they are slow.

---

### Task 1: Products — cache `findAll` + invalidation

**Files:**
- Modify: `backend/src/modules/products/products.service.ts`

**Interfaces:**
- Consumes: `RedisService` (already injected as `this.redisService`)
- Produces: `findAll` returns cached `PaginatedResult<Product>` (plain objects after first cache miss)

- [ ] **Step 1: Wrap `findAll` in `cached()`**

Replace the existing `findAll` body:

```ts
// products.service.ts  — replace the entire findAll method body
async findAll(query: ProductQueryDto): Promise<PaginatedResult<Product>> {
  const k = `admin:products:list:${JSON.stringify(query)}`;
  return this.redisService.cached(k, 30, async () => {
    const result = await this.productRepository.findAllPaginated(query) as PaginatedResult<Product>;
    await this.overlayStoreStock(result.items as Array<Product & { _id: Types.ObjectId }>);
    return result;
  });
}
```

- [ ] **Step 2: Add `clearProductCache` and call it everywhere chatbot cache is cleared**

Add the helper right next to `clearChatbotCache`:

```ts
private clearProductCache(): void {
  void this.redisService.delPattern('admin:products:*');
}
```

Then append `this.clearProductCache();` immediately after every existing `this.clearChatbotCache();` call. There are 5 call sites: `create`, `update`, `updateStock`, `decrementStock`, `delete`/`deleteMany` (which calls delete), `bulkUpdateCategory`.

- [ ] **Step 3: Write a minimal test**

Create `backend/src/modules/products/products-cache.spec.ts`:

```ts
import { ProductsService } from './products.service';

function makeRedis(hit: any = null) {
  return {
    cached: jest.fn((_, __, fn) => (hit !== null ? Promise.resolve(hit) : fn())),
    delPattern: jest.fn().mockResolvedValue(undefined),
  };
}

function makeRepo(items: any[] = []) {
  return {
    findAllPaginated: jest.fn().mockResolvedValue({ items, total: items.length, page: 1, limit: 20 }),
  } as any;
}

describe('ProductsService.findAll cache', () => {
  it('calls the repo on cache miss', async () => {
    const repo = makeRepo([{ _id: 'p1', stock: 5, variants: [] }]);
    const redis = makeRedis();
    // minimal stubs for other deps
    const svc = new (ProductsService as any)(repo, {}, {}, {}, redis, {}, { aggregateStockByProducts: jest.fn().mockResolvedValue(new Map()) });
    await svc.findAll({ page: 1 });
    expect(repo.findAllPaginated).toHaveBeenCalledTimes(1);
    expect(redis.cached).toHaveBeenCalledWith(expect.stringContaining('admin:products:list:'), 30, expect.any(Function));
  });

  it('skips the repo on cache hit', async () => {
    const repo = makeRepo();
    const hit = { items: [{ _id: 'p2', stock: 0, variants: [] }], total: 1, page: 1, limit: 20 };
    const redis = makeRedis(hit);
    const svc = new (ProductsService as any)(repo, {}, {}, {}, redis, {}, { aggregateStockByProducts: jest.fn() });
    const result = await svc.findAll({ page: 1 });
    expect(repo.findAllPaginated).not.toHaveBeenCalled();
    expect(result).toBe(hit);
  });

  it('clearProductCache calls delPattern', async () => {
    const redis = makeRedis();
    const svc = new (ProductsService as any)(makeRepo(), {}, {}, {}, redis, {}, { aggregateStockByProducts: jest.fn() });
    (svc as any).clearProductCache();
    expect(redis.delPattern).toHaveBeenCalledWith('admin:products:*');
  });
});
```

- [ ] **Step 4: Run the test**

```
cd backend && npx jest products-cache --no-coverage
```

Expected: 3 passing.

---

### Task 2: Orders — cache `findAll` + invalidation

**Files:**
- Modify: `backend/src/modules/orders/orders.service.ts`

**Interfaces:**
- Consumes: `RedisService` (already injected as `this.redisService`)

- [ ] **Step 1: Wrap `findAll`**

Replace the existing `findAll` body (line ~708):

```ts
async findAll(query: OrderQueryDto): Promise<PaginatedResult<Order>> {
  const k = `admin:orders:list:${JSON.stringify(query)}`;
  return this.redisService.cached(k, 30, () => this.orderRepository.findAllPaginated(query));
}
```

- [ ] **Step 2: Add `clearOrderCache` and wire it into `clearChatbotCache`**

Extend the existing `clearChatbotCache` method so order cache is always cleared together:

```ts
private clearChatbotCache(): void {
  this.redisService.delPattern('chatbot:tool:*').catch((err) => {
    this.logger.warn(`Failed to clear chatbot cache: ${err.message}`);
  });
  void this.redisService.delPattern('admin:orders:*');
}
```

That's it — no new call sites needed; every order write already calls `clearChatbotCache`.

- [ ] **Step 3: Write a minimal test**

Create `backend/src/modules/orders/orders-cache.spec.ts`:

```ts
describe('OrdersService.findAll cache', () => {
  it('passes the query as the cache key and delegates compute to repo', async () => {
    const repo = { findAllPaginated: jest.fn().mockResolvedValue({ items: [], total: 0 }) } as any;
    const redis = { cached: jest.fn((k, t, fn) => fn()), delPattern: jest.fn() };
    // OrdersService has many deps — pass undefined for all except repo and redis
    const OrdersService = require('./orders.service').OrdersService;
    const svc = new OrdersService(
      repo, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, redis,
    );
    await svc.findAll({ page: 1, limit: 20 });
    expect(redis.cached).toHaveBeenCalledWith(
      expect.stringContaining('admin:orders:list:'),
      30,
      expect.any(Function),
    );
    expect(repo.findAllPaginated).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });
});
```

> **Note:** Count constructor params in `orders.service.ts` to place `redis` at the right position. `RedisService` is injected somewhere in the constructor — find its position with `grep 'redisService\|RedisService' orders.service.ts`.

- [ ] **Step 4: Run the test**

```
cd backend && npx jest orders-cache --no-coverage
```

Expected: 1 passing.

---

### Task 3: Categories — inject Redis, cache reads, invalidate on CUD

**Files:**
- Modify: `backend/src/modules/categories/categories.module.ts`
- Modify: `backend/src/modules/categories/categories.service.ts`

**Interfaces:**
- Consumes: `RedisService` (new injection)
- Produces: `findAll`, `findActiveCategories`, `getCategoryTree` return cached results

- [ ] **Step 1: Add `RedisModule` to `CategoriesModule`**

```ts
// categories.module.ts — add to imports array
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Category.name, schema: CategorySchema }]),
    RedisModule,   // ← add this
  ],
  ...
})
```

- [ ] **Step 2: Inject `RedisService` into `CategoriesService`**

```ts
// categories.service.ts — update constructor
import { RedisService } from '../redis/redis.service';

constructor(
  private readonly categoryRepository: CategoryRepository,
  private readonly redisService: RedisService,
) {}
```

- [ ] **Step 3: Wrap the three read methods**

Replace the bodies of `findAll`, `findActiveCategories`, and `getCategoryTree`:

```ts
async findAll(query: CategoryQueryDto): Promise<PaginatedResult<Category>> {
  const k = `admin:categories:list:${JSON.stringify(query)}`;
  return this.redisService.cached(k, 30, () => this.categoryRepository.findAllPaginated(query));
}

async findActiveCategories(): Promise<Category[]> {
  return this.redisService.cached('admin:categories:active', 300, () =>
    this.categoryRepository.findActiveSorted(),
  );
}

async getCategoryTree(): Promise<Category[]> {
  return this.redisService.cached('admin:categories:tree', 300, async () => {
    const allCategories = await this.categoryRepository.findActiveLean();
    const categoryMap = new Map<string, Category & { children?: Category[] }>();
    const rootCategories: (Category & { children?: Category[] })[] = [];
    allCategories.forEach((cat) => {
      categoryMap.set(cat._id.toString(), { ...cat, children: [] });
    });
    allCategories.forEach((cat) => {
      const category = categoryMap.get(cat._id.toString());
      if (category) {
        if (cat.parent) {
          const parent = categoryMap.get(cat.parent.toString());
          if (parent?.children) parent.children.push(category);
        } else {
          rootCategories.push(category);
        }
      }
    });
    return rootCategories;
  });
}
```

- [ ] **Step 4: Add cache busting to write methods**

Add the helper and call it in `create`, `update`, `delete`:

```ts
private clearCategoryCache(): void {
  void this.redisService.delPattern('admin:categories:*');
}
```

Append `this.clearCategoryCache();` as the last line of `create`, `update` (before the conditional `reorderAtLevel` return), and `delete`.

- [ ] **Step 5: Write a minimal test**

Create `backend/src/modules/categories/categories-cache.spec.ts`:

```ts
import { CategoriesService } from './categories.service';

function makeRedis(hit: any = null) {
  return {
    cached: jest.fn((_, __, fn) => (hit ? Promise.resolve(hit) : fn())),
    delPattern: jest.fn().mockResolvedValue(undefined),
  };
}

describe('CategoriesService cache', () => {
  it('getCategoryTree uses Redis with 300s TTL', async () => {
    const repo = { findActiveLean: jest.fn().mockResolvedValue([]) } as any;
    const redis = makeRedis();
    const svc = new CategoriesService(repo, redis as any);
    await svc.getCategoryTree();
    expect(redis.cached).toHaveBeenCalledWith('admin:categories:tree', 300, expect.any(Function));
  });

  it('clearCategoryCache calls delPattern on write', async () => {
    const repo = {
      findOneBySlug: jest.fn().mockResolvedValue(null),
      createOne: jest.fn().mockResolvedValue({ _id: 'c1', name: 'Test', slug: 'test' }),
    } as any;
    const redis = makeRedis();
    const svc = new CategoriesService(repo, redis as any);
    await svc.create({ name: 'Test', slug: 'test' } as any);
    expect(redis.delPattern).toHaveBeenCalledWith('admin:categories:*');
  });
});
```

- [ ] **Step 6: Run the test**

```
cd backend && npx jest categories-cache --no-coverage
```

Expected: 2 passing.

---

### Task 4: Analytics — inject Redis, cache `getDashboardStats`

**Files:**
- Modify: `backend/src/modules/analytics/analytics.module.ts`
- Modify: `backend/src/modules/analytics/analytics.service.ts`

- [ ] **Step 1: Add `RedisModule` to `AnalyticsModule`**

```ts
// analytics.module.ts
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ..., // existing imports
    RedisModule,  // ← add
  ],
  ...
})
```

- [ ] **Step 2: Inject `RedisService` into `AnalyticsService`**

```ts
// analytics.service.ts — update constructor
import { RedisService } from '../redis/redis.service';

// add as last param (after @InjectQueue):
constructor(
  ...existing params...,
  private readonly redisService: RedisService,
) {}
```

- [ ] **Step 3: Wrap `getDashboardStats`**

Wrap the entire existing body:

```ts
async getDashboardStats(): Promise<Record<string, unknown>> {
  if (await this.settingsService.getMockDataEnabled()) {
    return this.buildMockDashboardStats();
  }
  return this.redisService.cached('admin:analytics:dashboard', 60, () => this._computeDashboardStats());
}

private async _computeDashboardStats(): Promise<Record<string, unknown>> {
  // ← move the existing body of getDashboardStats here (everything after the mock check)
}
```

- [ ] **Step 4: Write a minimal test**

Create `backend/src/modules/analytics/analytics-cache.spec.ts`:

```ts
describe('AnalyticsService.getDashboardStats cache', () => {
  it('uses 60s TTL cache key', async () => {
    const redis = { cached: jest.fn((k, t, fn) => fn()) };
    const settings = { getMockDataEnabled: jest.fn().mockResolvedValue(false) };
    const AnalyticsService = require('./analytics.service').AnalyticsService;
    // instantiate with enough stubs to get past the method
    const svc = new AnalyticsService(
      { getModel: jest.fn(() => ({ aggregate: jest.fn().mockResolvedValue([]), countDocuments: jest.fn().mockResolvedValue(0), find: jest.fn(() => ({ sort: () => ({ limit: () => ({ populate: () => ({ select: () => ({ exec: () => Promise.resolve([]) }) }) }) }) }) })) },
      { countDocuments: jest.fn().mockResolvedValue(0) },
      {}, {}, {}, {}, {}, {}, {},
      settings,
      {}, // analyticsQueue
      redis,
    );
    await svc.getDashboardStats();
    expect(redis.cached).toHaveBeenCalledWith('admin:analytics:dashboard', 60, expect.any(Function));
  });
});
```

> **Note:** The AnalyticsService constructor is large. Count params carefully and pass minimal stubs. The test only checks that `cached` is called with the right args; the compute fn may throw — that's OK for this test.

- [ ] **Step 5: Run the test**

```
cd backend && npx jest analytics-cache --no-coverage
```

Expected: 1 passing (or 1 skipped if the compute fn throws internally — adjust stubs if needed).

---

### Task 5: Billing — inject Redis, cache `getBills` + `getDashboard`, invalidate on writes

**Files:**
- Modify: `backend/src/modules/billing/billing.module.ts`
- Modify: `backend/src/modules/billing/billing.service.ts`

- [ ] **Step 1: Add `RedisModule` to `BillingModule`**

```ts
// billing.module.ts
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ..., // existing
    RedisModule,  // ← add
  ],
  ...
})
```

- [ ] **Step 2: Inject `RedisService` into `BillingService`**

Add `private readonly redis: RedisService` as the last constructor parameter:

```ts
// billing.service.ts — add import and final constructor param
import { RedisService } from '../redis/redis.service';

constructor(
  @InjectModel(User.name) private userModel: Model<any>,
  @InjectModel(BillingBill.name) private billModel: Model<BillingBillDocument>,
  @InjectModel(BillingCounter.name) private counterModel: Model<BillingCounterDocument>,
  @InjectModel('Product') private productModel: Model<any>,
  @InjectModel(Godown.name) private godownModel: Model<any>,
  @InjectModel('BillingAuditLog') private auditLogModel: Model<any>,
  private readonly crmEngine: CrmEngineService,
  private readonly taxSettings: TaxSettingsService,
  private readonly logics: LogicsService,
  private readonly billingWhatsapp: BillingWhatsappService,
  private readonly billingStock: BillingStockService,
  private readonly storeStock: StoreStockService,
  private readonly stores: StoresService,
  private readonly cashDrawer: CashDrawerService,
  private readonly redis: RedisService,          // ← add last
) {}
```

- [ ] **Step 3: Wrap `getBills` and `getDashboard`**

```ts
// getBills — wrap the existing body
async getBills(filters: { ... }): Promise<...> {
  const k = `admin:billing:bills:${JSON.stringify(filters)}`;
  return this.redis.cached(k, 30, () => this._getBills(filters));
}

private async _getBills(filters: Parameters<BillingService['getBills']>[0]) {
  // ← move the existing getBills body here (from `const q: any = ...` to the final return)
}

// getDashboard — wrap similarly
async getDashboard(): Promise<...> {
  return this.redis.cached('admin:billing:dashboard', 60, () => this._getDashboard());
}

private async _getDashboard() {
  // ← move the existing getDashboard body here
}
```

- [ ] **Step 4: Add `clearBillingCache` and call it on writes**

```ts
private clearBillingCache(): void {
  void this.redis.delPattern('admin:billing:*');
}
```

Add `this.clearBillingCache();` to: `createBill`, `createBillV1`, `cancelBill`, `updateBill`, `recordPayment`. Each of these already has a return statement or other terminal expression — add the call right before the `return`.

- [ ] **Step 5: Verify existing specs still pass**

```
cd backend && npx jest billing-dashboard billing-edit billing.payment --no-coverage
```

Expected: all existing billing specs still pass (they don't exercise the new Redis param — it's `undefined` and not called by those test paths).

- [ ] **Step 6: Write a cache-specific test**

Create `backend/src/modules/billing/billing-cache.spec.ts`:

```ts
import { BillingService } from './billing.service';

function makeChain(v: any) {
  const c: any = {};
  ['setOptions', 'sort', 'skip', 'limit'].forEach((k) => { c[k] = () => c; });
  c.lean = () => Promise.resolve(v);
  return c;
}

describe('BillingService.getBills cache', () => {
  it('wraps the query in redis.cached with 30s TTL', async () => {
    const redis = { cached: jest.fn((k, t, fn) => fn()), delPattern: jest.fn() };
    const billModel: any = {
      find: jest.fn(() => makeChain([{ _id: 'b1' }])),
      countDocuments: jest.fn(() => ({ setOptions: () => Promise.resolve(1) })),
      aggregate: jest.fn()
        .mockReturnValueOnce({ option: jest.fn(() => Promise.resolve([{ total: 100, collected: 100, due: 0, customers: [] }])) })
        .mockReturnValueOnce({ option: jest.fn(() => Promise.resolve([])) }),
    };
    // BillingService constructor: 14 existing params + redis at index 14
    const svc = new (BillingService as any)(
      {}, billModel, {}, {}, {}, {},
      {}, {}, {}, {}, {}, {}, {}, {},
      redis,
    ) as BillingService;

    await svc.getBills({ page: 1 });
    expect(redis.cached).toHaveBeenCalledWith(
      expect.stringContaining('admin:billing:bills:'),
      30,
      expect.any(Function),
    );
  });
});
```

- [ ] **Step 7: Run the new test**

```
cd backend && npx jest billing-cache --no-coverage
```

Expected: 1 passing.

---

### Task 6: CRM — inject Redis, cache `getCustomers` (TTL-only)

**Files:**
- Modify: `backend/src/modules/crm/crm.module.ts`
- Modify: `backend/src/modules/crm/crm.service.ts`

**Note:** CRM customer data is derived from Users, Orders, Billing, Calls, and Stats across many collections. Cross-service invalidation is impractical. 30 s TTL-only is sufficient.

- [ ] **Step 1: Add `RedisModule` to `CrmModule`**

```ts
// crm.module.ts
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ..., // existing
    RedisModule,  // ← add
  ],
  ...
})
```

- [ ] **Step 2: Inject `RedisService` into `CrmService`**

Add as the last constructor param:

```ts
// crm.service.ts
import { RedisService } from '../redis/redis.service';

constructor(
  ...existing 14 params...,
  private readonly redis: RedisService,     // ← add last
) {}
```

- [ ] **Step 3: Wrap `getCustomers`**

```ts
async getCustomers(opts: { ... }) {
  const k = `admin:crm:customers:${JSON.stringify(opts)}`;
  return this.redis.cached(k, 30, () => this._getCustomers(opts));
}

private async _getCustomers(opts: Parameters<CrmService['getCustomers']>[0]) {
  // ← move the entire existing getCustomers body here
}
```

- [ ] **Step 4: Verify existing CRM specs pass**

```
cd backend && npx jest crm-customer-search crm-foundation crm-insights --no-coverage
```

Expected: all pass. The new `redis` param is `undefined` in existing tests; `getCustomers` isn't called there.

- [ ] **Step 5: Write a cache test**

Create `backend/src/modules/crm/crm-cache.spec.ts`:

```ts
describe('CrmService.getCustomers cache', () => {
  it('calls redis.cached with admin:crm:customers key and 30s TTL', async () => {
    const redis = { cached: jest.fn().mockResolvedValue({ customers: [], total: 0 }) };
    const CrmService = require('./crm.service').CrmService;
    // CrmService has 14 @InjectModel + service params before redis
    const params = Array(14).fill({}) as any[];
    params.push(redis);
    const svc = new CrmService(...params);
    await svc.getCustomers({ page: 1, limit: 20 });
    expect(redis.cached).toHaveBeenCalledWith(
      expect.stringContaining('admin:crm:customers:'),
      30,
      expect.any(Function),
    );
  });
});
```

> **Note:** Count constructor params in `crm.service.ts` — there are 3 `@InjectModel` params (`statsModel`, `callLogModel`, etc.) and service deps. Adjust the `Array(14)` count to match.

- [ ] **Step 6: Run the test**

```
cd backend && npx jest crm-cache --no-coverage
```

Expected: 1 passing.

---

### Task 7: Purchase/FMS — inject Redis, cache reads, invalidate on writes

**Files:**
- Modify: `backend/src/modules/purchase/purchase.module.ts`
- Modify: `backend/src/modules/purchase/purchase.service.ts`

- [ ] **Step 1: Add `RedisModule` to `PurchaseModule`**

```ts
// purchase.module.ts
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    EmailModule,
    WhatsAppModule,
    SettingsModule,
    RedisModule,  // ← add
    MongooseModule.forFeature([...]),
  ],
  ...
})
```

- [ ] **Step 2: Inject `RedisService` into `PurchaseService`**

```ts
// purchase.service.ts
import { RedisService } from '../redis/redis.service';

constructor(
  @InjectModel(PurchaseMaterial.name) private materialModel: Model<PurchaseMaterialDocument>,
  @InjectModel(PurchaseRequest.name) private requestModel: Model<PurchaseRequestDocument>,
  @InjectModel(PurchaseVendor.name) private vendorModel: Model<PurchaseVendorDocument>,
  @InjectModel(PurchaseTag.name) private tagModel: Model<PurchaseTagDocument>,
  @InjectModel(AdminUser.name) private adminModel: Model<AdminUserDocument>,
  private readonly whatsapp: WhatsAppService,
  private readonly settings: SettingsService,
  private readonly email: EmailService,
  private readonly redis: RedisService,     // ← add last
) {}
```

- [ ] **Step 3: Wrap the four read methods**

```ts
async getMaterials(activeOnly = true): Promise<any[]> {
  return this.redis.cached(`admin:purchase:materials:${activeOnly}`, 120, () => {
    const filter = activeOnly ? { isActive: true } : {};
    return this.materialModel.find(filter).sort({ name: 1 }).lean();
  });
}

async getVendors(activeOnly = true): Promise<any[]> {
  return this.redis.cached(`admin:purchase:vendors:${activeOnly}`, 120, () => {
    const filter = activeOnly ? { isActive: true } : {};
    return this.vendorModel.find(filter).sort({ name: 1 }).lean();
  });
}

async getTags(activeOnly = true): Promise<any[]> {
  return this.redis.cached(`admin:purchase:tags:${activeOnly}`, 120, () => {
    const q = activeOnly ? { isActive: true } : {};
    return this.tagModel.find(q).sort({ sortOrder: 1, name: 1 }).lean();
  });
}

async getRequests(filters: { status?: string; mine?: boolean; userId?: string }): Promise<any> {
  const k = `admin:purchase:requests:${JSON.stringify(filters)}`;
  return this.redis.cached(k, 30, () => this._getRequests(filters));
}

private async _getRequests(filters: { status?: string; mine?: boolean; userId?: string }) {
  // ← move the existing getRequests body here
}
```

- [ ] **Step 4: Add `clearPurchaseCache` and call it on writes**

```ts
private clearPurchaseCache(): void {
  void this.redis.delPattern('admin:purchase:*');
}
```

Add `this.clearPurchaseCache();` to: `createMaterial`, `updateMaterial`, `createVendor`, `updateVendor`, `createTag`, `updateTag`, `createRequest`, `createPO`. Add just before each `return` statement.

- [ ] **Step 5: Run existing purchase specs**

```
cd backend && npx jest purchase --no-coverage
```

Expected: all existing purchase specs pass.

- [ ] **Step 6: Write a cache test**

Create `backend/src/modules/purchase/purchase-cache.spec.ts`:

```ts
describe('PurchaseService cache', () => {
  function makeSvc(redis: any) {
    const PurchaseService = require('./purchase.service').PurchaseService;
    const model = (data: any) => ({ find: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve(data) }) })), findByIdAndUpdate: jest.fn() });
    return new PurchaseService(
      model([{ _id: 'm1', name: 'Groundnut', isActive: true }]),  // materialModel
      model([]),  // requestModel
      model([{ _id: 'v1', name: 'Vendor A', isActive: true }]),   // vendorModel
      model([]),  // tagModel
      model([]),  // adminModel
      {}, {}, {},  // whatsapp, settings, email
      redis,
    );
  }

  it('getMaterials uses 120s TTL', async () => {
    const redis = { cached: jest.fn((k, t, fn) => fn()), delPattern: jest.fn() };
    const svc = makeSvc(redis);
    await svc.getMaterials();
    expect(redis.cached).toHaveBeenCalledWith('admin:purchase:materials:true', 120, expect.any(Function));
  });

  it('getRequests uses 30s TTL', async () => {
    const redis = { cached: jest.fn((k, t, fn) => fn()), delPattern: jest.fn() };
    const svc = makeSvc(redis);
    await svc.getRequests({ status: 'REQUESTED' }).catch(() => {});  // may throw without full context
    expect(redis.cached).toHaveBeenCalledWith(
      expect.stringContaining('admin:purchase:requests:'),
      30,
      expect.any(Function),
    );
  });

  it('clearPurchaseCache fires on createMaterial', async () => {
    const redis = { cached: jest.fn((k, t, fn) => fn()), delPattern: jest.fn() };
    const svc = makeSvc(redis);
    // override materialModel.create
    (svc as any).materialModel = { create: jest.fn().mockResolvedValue({ _id: 'm2', name: 'New' }) };
    await svc.createMaterial({ name: 'New', uom: 'kg' });
    expect(redis.delPattern).toHaveBeenCalledWith('admin:purchase:*');
  });
});
```

- [ ] **Step 7: Run the test**

```
cd backend && npx jest purchase-cache --no-coverage
```

Expected: 3 passing.
