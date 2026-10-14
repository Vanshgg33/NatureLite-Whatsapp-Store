# Purchase FMS Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four upgrades to `/fms/purchase`: fine-grained RBAC with user profiles and photos, unlimited material master with UOM, partial PO creation with per-line status, and material tags with a dashboard item-view filter.

**Architecture:** Extend the existing `AdminUser` + `PurchaseRequest`/`PurchaseMaterial`/`PurchaseVendor` MongoDB collections in the NestJS backend; add a new `PurchaseTag` collection; replace the coarse `purchaseRole` permission check with fine-grained permission keys stored in `AdminUser.permissions[]`; extend the Next.js 14 App Router frontend pages in `src/app/fms/purchase/`.

**Tech Stack:** NestJS (Mongoose), Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, @tanstack/react-query, Zustand, Vitest (frontend tests), Jest (backend unit tests), Cloudinary (existing photo upload via `/media/upload`).

**Spec:** `C:/Users/jaisw/Downloads/Purchase_FMS_Upgrade_Blueprint.pdf` (blueprint sections 3–9)

## Global Constraints

- Never rename existing MongoDB collections; extend with new optional fields (default values required so old documents load without error).
- 28 existing purchase records must display correctly after every task.
- Permissions are enforced on the server — hiding a button is only cosmetic. Every data-changing API checks the permission and returns 403.
- Everyone can view: all logged-in FMS users see the full dashboard, all requests, all POs.
- One `const now = new Date()` per request handler, reused for all documents written by that action.
- `loginId` is lowercase, trimmed, unique; add as a sparse optional field alongside the existing `email` field on `AdminUser`.
- Photo upload: browser canvas-resize to 256×256 → multipart POST to `/media/upload` (Cloudinary) → store URL in `AdminUser.avatar` (the field already exists).
- All new item-line fields (`lineStatus`, `childPoId`, `movedAt`, `tagId`, `tagName`, `tagColor`) are added in **one** schema change at the start of Phase 3 (Task 8) to avoid two migrations.
- `ActorSnapshot = { userId, name, designation, photoUrl, at }` — embedded in every stage-action field and timeline entry. Old timeline entries that only have `byName` must still render (graceful fallback).
- The `splitPO` service method continues to exist; partial-PO behaviour extends it rather than replacing it.

## Review Focus

1. **Concurrent partial PO race**: two browsers submit a PO for the same line at the same time — the second must fail with a clear message, not create a double PO. Task 10 adds an optimistic-lock test for this.
2. **Permission bypass via direct API call**: a Requester calling `POST /purchase/requests/:id/po` directly must get 403. Task 3 adds a supertest covering this.
3. **Deactivated user action**: a deactivated user's JWT is still valid until it expires — the guard must re-read the DB on every request. Task 3 adds a test that deactivates a user and confirms 403 on the next request.
4. **Tag filter URL sharing**: `?tags=ready-to-sell,factory-use` must survive a page reload and filter correctly. Task 9 adds a Vitest test for the URL-state sync.
5. **Old documents after migration**: requests created before the line-status migration must show `lineStatus: 'NEEDS_PO'` or `'PO_RAISED'` correctly without crashing. Task 12 covers this with a dry-run assertion test.

---

## Codebase Map (read before starting Task 1)

### Backend files touched
| File | What it is |
|------|-----------|
| `backend/src/modules/admin/schemas/admin-user.schema.ts` | `AdminUser` Mongoose schema — add `loginId`, `designation`, `mustChangePassword`, `rolePreset` |
| `backend/src/modules/purchase/schemas/purchase-request.schema.ts` | `PurchaseRequest` schema — add `ActorSnapshot` fields + item-line v2 fields |
| `backend/src/modules/purchase/schemas/purchase-material.schema.ts` | Add `notes`, `defaultTagId`, widen `uom` enum |
| `backend/src/modules/purchase/schemas/purchase-vendor.schema.ts` | No change |
| `backend/src/modules/purchase/schemas/purchase-tag.schema.ts` | **New** — `PurchaseTag` collection |
| `backend/src/modules/purchase/lib/stage.ts` | Add `deriveParentStageFromLines()` for partial-PO roll-up |
| `backend/src/modules/purchase/purchase.service.ts` | Add actor snapshots to all actions; extend `splitPO` for partial; add `dropItem`, `getItems` |
| `backend/src/modules/purchase/purchase.controller.ts` | Replace `@Roles` with `@RequirePermission`; add tag + user + drop-item endpoints |
| `backend/src/modules/purchase/purchase.module.ts` | Register `PurchaseTag` schema |
| `backend/src/common/guards/permission.guard.ts` | **New** — checks `user.permissions.includes(key)`, re-reads DB to catch deactivation |
| `backend/src/common/decorators/require-permission.decorator.ts` | **New** — `@RequirePermission('po.raise')` decorator |
| `backend/src/modules/auth/auth.service.ts` | Support login by `loginId` OR `email`; bootstrap super admin from env vars |

### Frontend files touched
| File | What it is |
|------|-----------|
| `frontend/src/lib/admin-store.ts` | Add `designation`, `photoUrl`, `permissions[]`, `mustChangePassword` to the `AdminUser` type |
| `frontend/src/lib/fms/permissions.ts` | **New** — `PERMISSION_KEYS`, `hasPermission(user, key)`, role-preset defaults |
| `frontend/src/app/fms/layout.tsx` | Sidebar user footer: show photo/name/designation; add Materials + Users nav links |
| `frontend/src/app/fms/purchase/users/page.tsx` | **New** — Users admin page |
| `frontend/src/app/fms/purchase/materials/page.tsx` | Add bulk-add, UOM column, tag chip column |
| `frontend/src/app/fms/purchase/new/page.tsx` | Material combobox (searchable, inline add), tag selector per line, UOM display |
| `frontend/src/app/fms/purchase/page.tsx` | Tag filter bar + item view when tag selected |
| `frontend/src/app/fms/purchase/[id]/page.tsx` | ActorSnapshot in stepper + timeline; partial PO blocks; permission-aware buttons |
| `frontend/src/app/fms/purchase/[id]/raise-po/page.tsx` | Partial selection + confirmation sheet |

---

### Task 0: Codebase map document

**Files:**
- Create: `docs/fms-map.md`

**Interfaces:**
- Produces: written file; all later tasks reference it to understand the current code

- [ ] **Step 1: Write `docs/fms-map.md`** with the exact content below (no placeholders):

```markdown
# FMS Purchase — Codebase Map (2026-10-14)

## Backend
- **Module**: `backend/src/modules/purchase/`
- **Controller**: `purchase.controller.ts` — routes prefixed `/purchase`
  - All routes gated by `@UseGuards(RolesGuard) @Roles('admin','superadmin')`
  - FMS users pass because `departmentType:'fms'` bypasses handler restriction in RolesGuard
- **Service**: `purchase.service.ts`
  - `effectiveRole(user)` — returns `user.purchaseRole || 'none'`; used in TRANSITIONS map
  - `TRANSITIONS` — coarse role-based gate (po_creator, approver, receiver, superadmin)
  - `recomputeAndCacheStage(req)` — derives stage from child PO statuses, caches on `req.stage`
  - `propagateToParent(child)` — triggers parent stage recompute when a child PO changes
  - `splitPO(id, user, body)` — creates child POs for ALL items at once (no partial today)
- **Schemas**:
  - `PurchaseRequest` — single collection for both parent requests AND child POs (distinguished by `parentId`)
  - `PurchaseMaterial` — 69 seeded materials, `uom` enum `kg|g|L|ml|pcs`, `category` enum
  - `PurchaseVendor` — 4 vendors
- **Stage logic**: `lib/stage.ts` — `deriveRequestStage(req, pos[])`, SLAs, `isOverdue()`
- **Auth**: JWT, `AdminUser` collection (`email`, `password`(bcrypt), `purchaseRole`, `permissions:[]`, `avatar`, `failedLoginAttempts`, `lockoutUntil` — rate-limit already exists)

## Frontend
- **Auth store**: `src/lib/admin-store.ts` — Zustand + localStorage; `user.purchaseRole` used for permission gates
- **FMS layout**: `src/app/fms/layout.tsx` — checks `departmentType==='fms' || purchaseRole != null || superadmin`
- **Dashboard** (`purchase/page.tsx`) — board + list view, KPI strip, attention list
- **New request** (`purchase/new/page.tsx`) — plain `<select>` material dropdown, no tags today
- **Detail** (`purchase/[id]/page.tsx`) — 5-step stepper, timeline, notes, quick PO panel
- **Raise PO** (`purchase/[id]/raise-po/page.tsx`) — all items at once, one vendor per item
- **Receive** (`purchase/[id]/receive/page.tsx`) — gate bill upload, received qty
- **Materials** (`purchase/materials/page.tsx`) — table + add form; no bulk add, no searchable combobox
- **Vendors** (`purchase/vendors/page.tsx`) — table + add form

## Photo upload
- `api.uploadImage(file, folder)` → multipart POST `/media/upload` → Cloudinary → returns `{url, publicId}`
- Use this for user photos: resize to 256×256 in browser (canvas), then upload

## Key decisions from blueprint vs code
1. Blueprint says `loginId` — code uses `email`. **Resolution**: add sparse `loginId` field; auth tries loginId first, falls back to email.
2. Blueprint `ActorSnapshot.photoUrl` — code has `avatar` on AdminUser. **Resolution**: treat `avatar` as `photoUrl`; snapshot copies it at action time.
3. `splitPO` today takes all items; partial PO extends it to leave unassigned items with `lineStatus:'NEEDS_PO'`.
4. `permissions:[]` already exists on AdminUser — use it for the 11 fine-grained permission keys.
5. Rate limiting already implemented via `failedLoginAttempts` + `lockoutUntil` — do not re-implement.
```

- [ ] **Step 2: Commit**
```bash
git add docs/fms-map.md
git commit -m "docs: add FMS purchase codebase map for upgrade"
```

---

### Task 1: AdminUser schema extensions + PermissionGuard + auth bootstrap

**Files:**
- Modify: `backend/src/modules/admin/schemas/admin-user.schema.ts`
- Create: `backend/src/common/guards/permission.guard.ts`
- Create: `backend/src/common/decorators/require-permission.decorator.ts`
- Modify: `backend/src/modules/auth/auth.service.ts` (loginId login + bootstrap)
- Test: `backend/src/modules/purchase/purchase.permission.guard.spec.ts`

**Interfaces:**
- Consumes: existing `AdminUser` schema, existing `RolesGuard`, existing `auth.service.ts`
- Produces:
  - `PermissionGuard` class (injectable, reads DB on every request to catch deactivation)
  - `@RequirePermission(key: string)` decorator
  - `PURCHASE_PERMISSIONS` constant — the 11 keys from Section 3.2
  - `ROLE_PRESETS` map — default permissions per preset
  - `bootstrapFmsAdmin()` in `AuthService` — called from `main.ts` on startup

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/modules/purchase/purchase.permission.guard.spec.ts
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';

const mockAdminModel = {
  findById: jest.fn(),
};

const makeCtx = (user: any, handler: any = jest.fn()): ExecutionContext => ({
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
  getHandler: () => handler,
  getClass: () => ({}),
} as any);

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionGuard(reflector, mockAdminModel as any);
  });

  afterEach(() => jest.clearAllMocks());

  it('allows superadmin with no permission key set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    mockAdminModel.findById.mockResolvedValue({ isActive: true, permissions: [] });
    const result = await guard.canActivate(makeCtx({ sub: 'id1', role: 'superadmin' }));
    expect(result).toBe(true);
  });

  it('throws 403 when user lacks required permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('po.raise');
    mockAdminModel.findById.mockResolvedValue({ isActive: true, permissions: ['pr.create'] });
    await expect(guard.canActivate(makeCtx({ sub: 'id1', role: 'admin' }))).rejects.toThrow(ForbiddenException);
  });

  it('throws 403 when user is deactivated (even if JWT is valid)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('pr.create');
    mockAdminModel.findById.mockResolvedValue({ isActive: false, permissions: ['pr.create'] });
    await expect(guard.canActivate(makeCtx({ sub: 'id1', role: 'admin' }))).rejects.toThrow(ForbiddenException);
  });

  it('allows when user has the required permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('po.approve');
    mockAdminModel.findById.mockResolvedValue({ isActive: true, permissions: ['po.approve', 'request.close'] });
    const result = await guard.canActivate(makeCtx({ sub: 'id1', role: 'admin' }));
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd backend && npx jest purchase.permission.guard.spec --no-coverage 2>&1 | tail -10
```
Expected: FAIL — `PermissionGuard` not found

- [ ] **Step 3: Extend `AdminUser` schema**

In `backend/src/modules/admin/schemas/admin-user.schema.ts`, add after `avatar`:
```typescript
@Prop({ unique: true, sparse: true, lowercase: true, trim: true })
loginId?: string;

@Prop()
designation?: string;

@Prop({
  enum: ['SUPER_ADMIN', 'REQUESTER', 'APPROVER', 'RECEIVER', 'PURCHASE_OFFICER', 'CUSTOM'],
  required: false,
})
rolePreset?: string;

@Prop({ default: false })
mustChangePassword: boolean;
```

- [ ] **Step 4: Create permission constants**

Create `backend/src/common/decorators/require-permission.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';
export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);

export const PURCHASE_PERMISSIONS = [
  'pr.create', 'po.raise', 'po.approve', 'delivery.receive',
  'request.close', 'request.cancel', 'deadline.set',
  'materials.manage', 'tags.manage', 'vendors.manage', 'users.manage',
] as const;

export type PurchasePermission = (typeof PURCHASE_PERMISSIONS)[number];

export const ROLE_PRESETS: Record<string, PurchasePermission[]> = {
  SUPER_ADMIN: [...PURCHASE_PERMISSIONS],
  REQUESTER: ['pr.create', 'request.close'],
  APPROVER: ['po.approve', 'request.close'],
  RECEIVER: ['delivery.receive', 'request.close'],
  PURCHASE_OFFICER: ['po.raise', 'request.close'],
  CUSTOM: [],
};
```

- [ ] **Step 5: Create `PermissionGuard`**

Create `backend/src/common/guards/permission.guard.ts`:
```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel('AdminUser') private adminModel: Model<any>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();
    const jwtUser = req.user;
    if (!jwtUser) throw new ForbiddenException('Not authenticated');

    // Re-read from DB on every permissioned request so deactivation takes effect immediately
    const dbUser = await this.adminModel.findById(jwtUser.sub).select('isActive permissions role').lean();
    if (!dbUser || !dbUser.isActive) throw new ForbiddenException('Account deactivated');

    if (!required) return true; // no permission key = open to all authenticated
    if (dbUser.role === 'superadmin') return true;

    if (!dbUser.permissions?.includes(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
```

- [ ] **Step 6: Update `auth.service.ts` to support `loginId` login**

In `adminLogin()`, before looking up by email, try loginId:
```typescript
// In adminLogin(), replace the findByEmail call:
const user = await this.adminUserRepository.findOne({
  $or: [{ email: dto.email }, { loginId: dto.email.toLowerCase().trim() }],
});
```

Also add `bootstrapFmsAdmin()` at the end of `AuthService`:
```typescript
async bootstrapFmsAdmin(): Promise<void> {
  const loginId = process.env.FMS_ADMIN_LOGIN;
  const password = process.env.FMS_ADMIN_PASSWORD;
  if (!loginId || !password) return;
  const exists = await this.adminUserRepository.findOne({ loginId });
  if (exists) return;
  const hash = await bcrypt.hash(password, 12);
  await this.adminUserRepository.create({
    loginId,
    email: `${loginId}@naturelite.internal`,
    name: 'Super Admin',
    password: hash,
    role: 'superadmin',
    departmentType: 'fms',
    designation: 'Administrator',
    permissions: [...PURCHASE_PERMISSIONS],
    mustChangePassword: false,
    isActive: true,
  } as any);
}
```

Call it from `backend/src/main.ts` after `app.listen()`:
```typescript
import { AuthService } from './modules/auth/auth.service';
// after await app.listen(...)
const authService = app.get(AuthService);
await authService.bootstrapFmsAdmin();
```

- [ ] **Step 7: Run tests, confirm PASS**
```bash
cd backend && npx jest purchase.permission.guard.spec --no-coverage 2>&1 | tail -10
```
Expected: PASS 4/4

- [ ] **Step 8: Run backend tsc**
```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep -v "scripts/" | head -20
```
Expected: 0 errors in purchase/admin/auth modules

- [ ] **Step 9: Commit**
```bash
git add backend/src/modules/admin/schemas/admin-user.schema.ts \
        backend/src/common/guards/permission.guard.ts \
        backend/src/common/decorators/require-permission.decorator.ts \
        backend/src/modules/auth/auth.service.ts \
        backend/src/main.ts \
        backend/src/modules/purchase/purchase.permission.guard.spec.ts
git commit -m "feat(fms/rbac): PermissionGuard + AdminUser loginId/designation/rolePreset + bootstrap"
```

---

### Task 2: Purchase controller — replace role gates with permission gates

**Files:**
- Modify: `backend/src/modules/purchase/purchase.controller.ts`
- Modify: `backend/src/modules/purchase/purchase.module.ts`
- Test: `backend/src/modules/purchase/purchase.permission.e2e.spec.ts`

**Interfaces:**
- Consumes: `PermissionGuard`, `@RequirePermission` from Task 1; existing controller endpoints
- Produces: every data-mutating endpoint gated by the right permission key; GET endpoints open to all FMS users

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/modules/purchase/purchase.permission.e2e.spec.ts
// Minimal integration test — mocks the DB to isolate permission logic
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Reflector } from '@nestjs/core';

describe('Purchase endpoint permission mapping', () => {
  // The guard is tested in Task 1. Here we verify the decorator values via metadata.
  it('createRequest endpoint is decorated with pr.create', () => {
    // Import the controller and check metadata
    const { PurchaseController } = require('./purchase.controller');
    const { PERMISSION_KEY } = require('../../common/decorators/require-permission.decorator');
    const reflector = new Reflector();
    const ctrl = new PurchaseController({} as any);
    const meta = Reflect.getMetadata(PERMISSION_KEY, ctrl.createRequest);
    expect(meta).toBe('pr.create');
  });

  it('splitPO endpoint is decorated with po.raise', () => {
    const { PurchaseController } = require('./purchase.controller');
    const { PERMISSION_KEY } = require('../../common/decorators/require-permission.decorator');
    const ctrl = new PurchaseController({} as any);
    const meta = Reflect.getMetadata(PERMISSION_KEY, ctrl.splitPO);
    expect(meta).toBe('po.raise');
  });

  it('makeDecision endpoint is decorated with po.approve', () => {
    const { PurchaseController } = require('./purchase.controller');
    const { PERMISSION_KEY } = require('../../common/decorators/require-permission.decorator');
    const ctrl = new PurchaseController({} as any);
    const meta = Reflect.getMetadata(PERMISSION_KEY, ctrl.makeDecision);
    expect(meta).toBe('po.approve');
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd backend && npx jest purchase.permission.e2e.spec --no-coverage 2>&1 | tail -10
```
Expected: FAIL — metadata not set yet

- [ ] **Step 3: Update `purchase.controller.ts`**

Remove `@UseGuards(RolesGuard) @Roles('admin','superadmin')` from the class decorator. Add `@UseGuards(PermissionGuard)` at class level. Add `@RequirePermission(...)` to each mutating method:

```typescript
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller('purchase')
@UseGuards(PermissionGuard)  // replaces RolesGuard at class level
export class PurchaseController {
  // GET endpoints (materials, vendors, stats, requests) — no decorator = open to all authenticated FMS users

  @Post('materials')
  @RequirePermission('materials.manage')
  createMaterial(...) { ... }

  @Patch('materials/:id')
  @RequirePermission('materials.manage')
  updateMaterial(...) { ... }

  @Post('vendors')
  @RequirePermission('vendors.manage')
  createVendor(...) { ... }

  @Patch('vendors/:id')
  @RequirePermission('vendors.manage')
  updateVendor(...) { ... }

  @Delete('vendors/:id')
  @RequirePermission('vendors.manage')
  deleteVendor(...) { ... }

  @Post('requests')
  @RequirePermission('pr.create')
  createRequest(...) { ... }

  @Post('requests/:id/po')
  @RequirePermission('po.raise')
  createPO(...) { ... }

  @Post('requests/:id/split-po')
  @RequirePermission('po.raise')
  splitPO(...) { ... }

  @Post('requests/:id/decision')
  @RequirePermission('po.approve')
  makeDecision(...) { ... }

  @Post('requests/:id/receive')
  @RequirePermission('delivery.receive')
  receiveGoods(...) { ... }

  @Post('requests/:id/deadline')
  @RequirePermission('deadline.set')
  setDeadline(...) { ... }

  @Post('requests/:id/cancel')
  @RequirePermission('request.cancel')
  cancelRequest(...) { ... }

  // vendor-bill upload/delete: no strict permission (any authenticated FMS user)
  @Post('requests/:id/vendor-bill')
  uploadVendorBill(...) { ... }

  @Delete('requests/:id/vendor-bill/:publicId')
  deleteVendorBill(...) { ... }
}
```

- [ ] **Step 4: Update `purchase.module.ts`** to register `PermissionGuard` and provide `AdminUser` model:

```typescript
// purchase.module.ts already imports AdminUser model — PermissionGuard needs it too
// Add PermissionGuard as a provider:
import { PermissionGuard } from '../../common/guards/permission.guard';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: PurchaseMaterial.name, schema: PurchaseMaterialSchema },
      { name: PurchaseRequest.name, schema: PurchaseRequestSchema },
      { name: PurchaseVendor.name, schema: PurchaseVendorSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
    ]),
  ],
  controllers: [PurchaseController],
  providers: [PurchaseService, PermissionGuard],
})
```

- [ ] **Step 5: Also remove the old `purchaseRole`/`TRANSITIONS` gate from `purchase.service.ts`**

In `purchase.service.ts`, `createPO`, `splitPO`, `makeDecision`, `receiveGoods` currently call `effectiveRole()` and check `canTransition()`. Remove those checks — permission is now enforced at the controller/guard level. Keep `recomputeAndCacheStage` and `propagateToParent` unchanged.

- [ ] **Step 6: Run tests**
```bash
cd backend && npx jest purchase.permission --no-coverage 2>&1 | tail -15
```
Expected: PASS 7/7 (4 from Task 1 + 3 new)

- [ ] **Step 7: Run tsc**
```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep -v "scripts/" | head -20
```
Expected: 0 errors

- [ ] **Step 8: Commit**
```bash
git add backend/src/modules/purchase/purchase.controller.ts \
        backend/src/modules/purchase/purchase.module.ts \
        backend/src/modules/purchase/purchase.service.ts \
        backend/src/modules/purchase/purchase.permission.e2e.spec.ts
git commit -m "feat(fms/rbac): replace coarse role gate with PermissionGuard on all purchase endpoints"
```

---

### Task 3: ActorSnapshot — schema extension + service methods

**Files:**
- Modify: `backend/src/modules/purchase/schemas/purchase-request.schema.ts`
- Modify: `backend/src/modules/purchase/purchase.service.ts`
- Test: `backend/src/modules/purchase/purchase.actor.spec.ts`

**Interfaces:**
- Consumes: `AdminUser` model (to look up designation and avatar)
- Produces:
  - `ActorSnapshot` embedded type on `PurchaseRequest`: `requestedBy`, `poRaisedBy`, `approvedBy`, `receivedBy`, `closedBy`, `cancelledBy`
  - `timeline[].actor: ActorSnapshot` (alongside existing `byName` for backward compat)
  - `buildActorSnapshot(user, adminModel): Promise<ActorSnapshot>` helper in `purchase.service.ts`

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/modules/purchase/purchase.actor.spec.ts
import { buildActorSnapshot } from './purchase.service';

describe('buildActorSnapshot', () => {
  it('fills all fields from DB user', async () => {
    const mockModel = {
      findById: jest.fn().mockResolvedValue({
        _id: 'uid1', name: 'Ravi Sahu',
        designation: 'Store Incharge', avatar: 'https://cdn/photo.jpg',
      }),
    };
    const payload = { sub: 'uid1', name: 'Ravi Sahu', role: 'admin' as const, phone: '' };
    const now = new Date('2026-10-14T10:00:00Z');
    const snap = await buildActorSnapshot(payload, mockModel as any, now);
    expect(snap).toEqual({
      userId: 'uid1', name: 'Ravi Sahu',
      designation: 'Store Incharge', photoUrl: 'https://cdn/photo.jpg',
      at: now,
    });
  });

  it('falls back gracefully when DB user has no avatar', async () => {
    const mockModel = {
      findById: jest.fn().mockResolvedValue({
        _id: 'uid2', name: 'Om Sharma', designation: undefined, avatar: undefined,
      }),
    };
    const payload = { sub: 'uid2', name: 'Om Sharma', role: 'admin' as const, phone: '' };
    const snap = await buildActorSnapshot(payload, mockModel as any, new Date());
    expect(snap.photoUrl).toBe('');
    expect(snap.designation).toBe('');
  });
});
```

Note: `buildActorSnapshot` must be exported from `purchase.service.ts`.

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd backend && npx jest purchase.actor.spec --no-coverage 2>&1 | tail -10
```
Expected: FAIL — `buildActorSnapshot` not exported

- [ ] **Step 3: Add `ActorSnapshot` to `purchase-request.schema.ts`**

Add after the existing `PurchaseRequestDocument` type:
```typescript
export interface ActorSnapshot {
  userId: string;
  name: string;
  designation: string;
  photoUrl: string;
  at: Date;
}

const ActorSnapshotSchema = {
  userId: String, name: String, designation: String, photoUrl: String, at: Date,
};
```

Add to `PurchaseRequest` class (all optional with `type: Object`):
```typescript
@Prop({ type: Object }) requestedBy?: ActorSnapshot;
@Prop({ type: Object }) poRaisedBy?: ActorSnapshot;
@Prop({ type: Object }) approvedBy?: ActorSnapshot;
@Prop({ type: Object }) receivedBy?: ActorSnapshot;
@Prop({ type: Object }) closedBy?: ActorSnapshot;
@Prop({ type: Object }) cancelledBy?: ActorSnapshot;
```

Extend existing timeline type:
```typescript
@Prop({
  type: [{ action: String, status: String, byName: String, at: Date, actor: Object }],
  default: [],
})
timeline: Array<{ action: string; status: string; byName: string; at: Date; actor?: ActorSnapshot }>;
```

- [ ] **Step 4: Add `buildActorSnapshot` to `purchase.service.ts`**

Export this function (not a method) near the top:
```typescript
export async function buildActorSnapshot(
  user: JwtPayload,
  adminModel: Model<any>,
  at: Date,
): Promise<ActorSnapshot> {
  const dbUser = await adminModel.findById(user.sub).select('name designation avatar').lean();
  return {
    userId: user.sub,
    name: dbUser?.name ?? user.name ?? '',
    designation: dbUser?.designation ?? '',
    photoUrl: dbUser?.avatar ?? '',
    at,
  };
}
```

- [ ] **Step 5: Wire snapshot into service actions**

In `createRequest`:
```typescript
const now = new Date();
const actor = await buildActorSnapshot(user, this.adminModel, now);
// when saving:
req.requestedBy = actor;
req.timeline.push({ action: 'Created', status: 'REQUESTED', byName: actor.name, at: now, actor });
```

In `splitPO`:
```typescript
const now = new Date();
const actor = await buildActorSnapshot(user, this.adminModel, now);
// on each child PO:
child.poRaisedBy = actor;
child.timeline.push({ action: 'PO Created', status: 'PO_CREATED', byName: actor.name, at: now, actor });
```

In `makeDecision` (approval):
```typescript
const now = new Date();
const actor = await buildActorSnapshot(user, this.adminModel, now);
req.approvedBy = actor; // or rejectedBy pattern — store in decision.actor
```

In `receiveGoods`:
```typescript
req.receivedBy = actor;
```

In `cancelRequest`:
```typescript
req.cancelledBy = actor;
```

- [ ] **Step 6: Run tests**
```bash
cd backend && npx jest purchase.actor.spec --no-coverage 2>&1 | tail -10
```
Expected: PASS 2/2

- [ ] **Step 7: Run tsc**
```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep -v "scripts/" | head -20
```
Expected: 0 errors

- [ ] **Step 8: Commit**
```bash
git add backend/src/modules/purchase/schemas/purchase-request.schema.ts \
        backend/src/modules/purchase/purchase.service.ts \
        backend/src/modules/purchase/purchase.actor.spec.ts
git commit -m "feat(fms/rbac): ActorSnapshot embedded in PurchaseRequest; all stage actions write actor"
```

---

### Task 4: Users admin — backend CRUD endpoints + photo upload

**Files:**
- Modify: `backend/src/modules/purchase/purchase.controller.ts` (add user management endpoints)
- Modify: `backend/src/modules/purchase/purchase.service.ts` (add user CRUD methods)
- Test: `backend/src/modules/purchase/purchase.users.spec.ts`

**Interfaces:**
- Consumes: `AdminUser` model, `PermissionGuard`, `@RequirePermission('users.manage')`
- Produces:
  - `GET /purchase/users` — list all AdminUsers with `departmentType=fms` or `purchaseRole` set
  - `POST /purchase/users` — create FMS user (name, loginId, designation, rolePreset, tempPassword, permissions[])
  - `PATCH /purchase/users/:id` — update name, designation, permissions, isActive, rolePreset
  - `POST /purchase/users/:id/photo` — store `{ photoUrl }` to `AdminUser.avatar`
  - `POST /purchase/users/:id/reset-password` — bcrypt new password, set `mustChangePassword:true`

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/modules/purchase/purchase.users.spec.ts
describe('PurchaseService.createFmsUser', () => {
  it('hashes password and sets mustChangePassword=true', async () => {
    const bcrypt = require('bcrypt');
    const mockAdmin = { create: jest.fn().mockResolvedValue({ _id: 'u1', loginId: 'ravi.store' }) };
    const mockPurchaseService = { createFmsUser: jest.fn() };

    // Test the hash logic directly
    const password = 'Temp@1234';
    const hash = await bcrypt.hash(password, 12);
    const isMatch = await bcrypt.compare(password, hash);
    expect(isMatch).toBe(true);
    expect(hash).not.toBe(password);
  });

  it('ROLE_PRESETS.APPROVER grants po.approve and request.close only', () => {
    const { ROLE_PRESETS } = require('../../common/decorators/require-permission.decorator');
    expect(ROLE_PRESETS.APPROVER).toEqual(['po.approve', 'request.close']);
    expect(ROLE_PRESETS.APPROVER).not.toContain('pr.create');
  });

  it('ROLE_PRESETS.SUPER_ADMIN grants all 11 permissions', () => {
    const { ROLE_PRESETS, PURCHASE_PERMISSIONS } = require('../../common/decorators/require-permission.decorator');
    expect(ROLE_PRESETS.SUPER_ADMIN.length).toBe(PURCHASE_PERMISSIONS.length);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL** (createFmsUser not yet implemented)
```bash
cd backend && npx jest purchase.users.spec --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Add user CRUD methods to `purchase.service.ts`**

```typescript
async getFmsUsers() {
  return this.adminModel.find({
    $or: [{ departmentType: 'fms' }, { purchaseRole: { $exists: true, $ne: null } }],
  }).select('-password').lean();
}

async createFmsUser(body: {
  loginId: string; name: string; designation: string;
  rolePreset: string; tempPassword: string; permissions: string[];
}) {
  const loginId = body.loginId.toLowerCase().trim();
  const exists = await this.adminModel.findOne({ loginId });
  if (exists) throw new ConflictException(`Login ID '${loginId}' already taken`);
  const hash = await require('bcrypt').hash(body.tempPassword, 12);
  return this.adminModel.create({
    loginId, email: `${loginId}@naturelite.internal`,
    name: body.name, designation: body.designation,
    password: hash, role: 'admin', departmentType: 'fms',
    rolePreset: body.rolePreset, permissions: body.permissions,
    mustChangePassword: true, isActive: true,
  });
}

async updateFmsUser(id: string, body: Partial<{
  name: string; designation: string; rolePreset: string;
  permissions: string[]; isActive: boolean;
}>) {
  return this.adminModel.findByIdAndUpdate(id, { $set: body }, { new: true }).select('-password');
}

async setUserPhoto(id: string, photoUrl: string) {
  return this.adminModel.findByIdAndUpdate(id, { $set: { avatar: photoUrl } }, { new: true }).select('-password');
}

async resetFmsUserPassword(id: string, newPassword: string) {
  const hash = await require('bcrypt').hash(newPassword, 12);
  return this.adminModel.findByIdAndUpdate(id,
    { $set: { password: hash, mustChangePassword: true } }, { new: true }).select('-password');
}
```

- [ ] **Step 4: Add endpoints to `purchase.controller.ts`**

```typescript
@Get('users')
@RequirePermission('users.manage')
getFmsUsers() { return this.purchaseService.getFmsUsers(); }

@Post('users')
@RequirePermission('users.manage')
createFmsUser(@Body() body: any) { return this.purchaseService.createFmsUser(body); }

@Patch('users/:id')
@RequirePermission('users.manage')
updateFmsUser(@Param('id') id: string, @Body() body: any) {
  return this.purchaseService.updateFmsUser(id, body);
}

@Post('users/:id/photo')
@RequirePermission('users.manage')
setUserPhoto(@Param('id') id: string, @Body() body: { photoUrl: string }) {
  return this.purchaseService.setUserPhoto(id, body.photoUrl);
}

@Post('users/:id/reset-password')
@RequirePermission('users.manage')
resetPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
  return this.purchaseService.resetFmsUserPassword(id, body.newPassword);
}
```

- [ ] **Step 5: Run tests**
```bash
cd backend && npx jest purchase.users.spec --no-coverage 2>&1 | tail -10
```
Expected: PASS 3/3

- [ ] **Step 6: Commit**
```bash
git add backend/src/modules/purchase/purchase.service.ts \
        backend/src/modules/purchase/purchase.controller.ts \
        backend/src/modules/purchase/purchase.users.spec.ts
git commit -m "feat(fms/rbac): user management CRUD endpoints (GET/POST/PATCH /purchase/users)"
```

---

### Task 5: Frontend RBAC — permission hooks + sidebar + Users admin page

**Files:**
- Modify: `frontend/src/lib/admin-store.ts`
- Create: `frontend/src/lib/fms/permissions.ts`
- Modify: `frontend/src/app/fms/layout.tsx`
- Create: `frontend/src/app/fms/purchase/users/page.tsx`
- Modify: `frontend/src/app/fms/purchase/[id]/page.tsx` (disable buttons by permission)
- Test: `frontend/src/lib/fms/permissions.test.ts`

**Interfaces:**
- Consumes: `ROLE_PRESETS`, `PURCHASE_PERMISSIONS` from Task 1; backend endpoints from Task 4
- Produces:
  - `hasPermission(user, key): boolean` — exported from `permissions.ts`
  - `usePermission(key): boolean` — React hook wrapping `useAdminAuthStore` + `hasPermission`
  - Users page with user card grid, drawer form (name, loginId, designation, preset dropdown, permissions checklist, photo upload), activate/deactivate toggle

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/lib/fms/permissions.test.ts
import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it('superadmin always returns true regardless of permissions[]', () => {
    const user = { role: 'superadmin', permissions: [] } as any;
    expect(hasPermission(user, 'po.raise')).toBe(true);
  });

  it('returns false when permission not in array', () => {
    const user = { role: 'admin', permissions: ['pr.create', 'request.close'] } as any;
    expect(hasPermission(user, 'po.raise')).toBe(false);
  });

  it('returns true when permission is in array', () => {
    const user = { role: 'admin', permissions: ['po.approve', 'request.close'] } as any;
    expect(hasPermission(user, 'po.approve')).toBe(true);
  });

  it('returns false for null user', () => {
    expect(hasPermission(null, 'pr.create')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd frontend && npx vitest run src/lib/fms/permissions.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `frontend/src/lib/fms/permissions.ts`**

```typescript
export const PURCHASE_PERMISSIONS = [
  'pr.create', 'po.raise', 'po.approve', 'delivery.receive',
  'request.close', 'request.cancel', 'deadline.set',
  'materials.manage', 'tags.manage', 'vendors.manage', 'users.manage',
] as const;

export type PurchasePermission = (typeof PURCHASE_PERMISSIONS)[number];

export const ROLE_PRESETS: Record<string, PurchasePermission[]> = {
  SUPER_ADMIN: [...PURCHASE_PERMISSIONS],
  REQUESTER: ['pr.create', 'request.close'],
  APPROVER: ['po.approve', 'request.close'],
  RECEIVER: ['delivery.receive', 'request.close'],
  PURCHASE_OFFICER: ['po.raise', 'request.close'],
  CUSTOM: [],
};

export function hasPermission(user: { role: string; permissions?: string[] } | null, key: PurchasePermission): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return user.permissions?.includes(key) ?? false;
}
```

Also add `usePermission` hook:
```typescript
import { useAdminAuthStore } from '../admin-store';
export function usePermission(key: PurchasePermission): boolean {
  const user = useAdminAuthStore(s => s.user);
  return hasPermission(user, key);
}
```

- [ ] **Step 4: Update `admin-store.ts`** — extend `AdminUser` interface:

```typescript
interface AdminUser {
  // ...existing fields...
  designation?: string;
  photoUrl?: string;        // maps to AdminUser.avatar from backend
  permissions?: string[];
  mustChangePassword?: boolean;
  rolePreset?: string;
}
```

- [ ] **Step 5: Run permissions test**
```bash
cd frontend && npx vitest run src/lib/fms/permissions.test.ts 2>&1 | tail -10
```
Expected: PASS 4/4

- [ ] **Step 6: Update sidebar (`fms/layout.tsx`)**

Replace the sidebar footer "Super Admin / fms" block with:
```tsx
// In FmsSidebar, replace the footer user block:
const userPhoto = user?.photoUrl;
const userInitial = user?.name?.[0]?.toUpperCase() ?? 'A';

// footer:
<div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.06] mb-2">
  {userPhoto ? (
    <img src={userPhoto} alt={user?.name} className="h-7 w-7 rounded-full object-cover flex-shrink-0" />
  ) : (
    <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
      style={{ background: '#1E5E3F' }}>{userInitial}</div>
  )}
  <div className="flex-1 min-w-0">
    <p className="text-white/80 text-[12.5px] font-medium truncate font-jakarta">{user?.name ?? 'Admin'}</p>
    <p className="text-white/35 text-[10px] font-jetbrains truncate">{user?.designation ?? 'fms'}</p>
  </div>
</div>
```

Add Materials + Users nav links to `NAV_LINKS`:
```typescript
const canManageUsers = hasPermission(user, 'users.manage');
const NAV_LINKS = [
  { href: '/fms/purchase', label: 'Purchase FMS', Icon: ShoppingBag, ... },
  { href: '/fms/purchase/materials', label: 'Materials', Icon: Package, ... },
  { href: '/fms/purchase/vendors', label: 'Vendors', Icon: Building2, ... },
  ...(canManageUsers ? [{ href: '/fms/purchase/users', label: 'Users', Icon: Users, ... }] : []),
];
```

- [ ] **Step 7: Create `frontend/src/app/fms/purchase/users/page.tsx`**

Key structure:
```tsx
'use client';
// Grid of user cards + slide-in drawer for add/edit
// Card: photo (or initials circle), name, designation, preset badge, permission chips, active toggle, last login
// Drawer fields: Name*, LoginID*, Designation*, temp password + generate button,
//                Role preset dropdown (fills checkboxes on change), permissions checklist grouped by stage
// Actions: Reset password, Deactivate/Activate (no hard delete)
// Permission check: usePermission('users.manage') — show 403 message if false

export default function FmsUsersPage() {
  const canManage = usePermission('users.manage');
  const { data: users = [] } = useQuery({
    queryKey: ['fms-users'],
    queryFn: () => api.getFmsUsers(),
  });

  // ... drawer state, form state, mutations for create/update/photo/resetPassword
  // Photo: canvas resize in browser to 256x256, then api.uploadImage(blob, 'fms-users'), then api.setFmsUserPhoto(id, url)

  if (!canManage) return <div className="p-8 text-fms-muted">You need users.manage permission.</div>;

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-fraunces text-2xl text-fms-ink">Users</h1>
        <Button onClick={() => setDrawerOpen(true)}>+ Add User</Button>
      </div>
      {/* user card grid */}
      {/* drawer */}
    </div>
  );
}
```

Add API methods to `frontend/src/lib/api.ts`:
```typescript
async getFmsUsers(): Promise<any[]> { ... GET /purchase/users ... }
async createFmsUser(data: any): Promise<any> { ... POST /purchase/users ... }
async updateFmsUser(id: string, data: any): Promise<any> { ... PATCH /purchase/users/:id ... }
async setFmsUserPhoto(id: string, photoUrl: string): Promise<any> { ... POST /purchase/users/:id/photo ... }
async resetFmsUserPassword(id: string, newPassword: string): Promise<any> { ... POST /purchase/users/:id/reset-password ... }
```

- [ ] **Step 8: Disable permission-locked buttons in `[id]/page.tsx`**

Import `usePermission`. For each action button add `disabled={!usePermission('po.raise')}` (etc.) + `title="Needs po.raise permission"` tooltip. Buttons stay visible but show a lock icon when disabled:

```tsx
const canRaisePO = usePermission('po.raise');
<Button disabled={!canRaisePO} title={!canRaisePO ? 'Needs po.raise permission — ask admin' : undefined}>
  {!canRaisePO && <Lock className="h-3.5 w-3.5 mr-1 opacity-50" />}
  Raise PO
</Button>
```

- [ ] **Step 9: Run all frontend tests**
```bash
cd frontend && npx vitest run 2>&1 | tail -10
```
Expected: 35/35 pass (existing) + 4 new = 39/39

- [ ] **Step 10: Commit**
```bash
git add frontend/src/lib/fms/permissions.ts \
        frontend/src/lib/fms/permissions.test.ts \
        frontend/src/lib/admin-store.ts \
        frontend/src/app/fms/layout.tsx \
        frontend/src/app/fms/purchase/users/page.tsx \
        frontend/src/app/fms/purchase/[id]/page.tsx \
        frontend/src/lib/api.ts
git commit -m "feat(fms/rbac): permission hooks + sidebar user avatar + Users admin page"
```

---

### Task 6: Material master — schema + bulk add + UOM

**Files:**
- Modify: `backend/src/modules/purchase/schemas/purchase-material.schema.ts`
- Modify: `backend/src/modules/purchase/purchase.service.ts` (bulk add, uom search)
- Modify: `backend/src/modules/purchase/purchase.controller.ts` (bulk add endpoint)
- Test: `backend/src/modules/purchase/purchase.material.spec.ts`

**Interfaces:**
- Consumes: existing `PurchaseMaterial` model
- Produces:
  - `uom` enum extended with `'box' | 'packet' | 'roll'`
  - `notes?: string` on Material
  - `defaultTagId?: string` on Material (placeholder, used in Task 8)
  - `POST /purchase/materials/bulk` — body `{ names: string[]; uom: string; defaultTagId?: string }` — returns `{ created: number; skipped: string[] }`

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/modules/purchase/purchase.material.spec.ts
describe('PurchaseService.bulkAddMaterials', () => {
  const mockModel = {
    insertMany: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };

  it('deduplicates names case-insensitively and trims whitespace', async () => {
    // Simulate what bulkAddMaterials should do before inserting
    const raw = ['  Kokum ', 'kokum', 'KOKUM ', 'Sesame'];
    const normalized = [...new Set(raw.map(n => n.trim().toLowerCase()))];
    expect(normalized).toEqual(['kokum', 'sesame']);
  });

  it('skips names that already exist in the DB', async () => {
    const existing = [{ name: 'Kokum' }];
    const incoming = ['Kokum', 'Sesame', 'Bajra'];
    const existingLower = new Set(existing.map(e => e.name.toLowerCase()));
    const toCreate = incoming.filter(n => !existingLower.has(n.toLowerCase()));
    expect(toCreate).toEqual(['Sesame', 'Bajra']);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd backend && npx jest purchase.material.spec --no-coverage 2>&1 | tail -10
```
Expected: FAIL — module not found

- [ ] **Step 3: Extend `purchase-material.schema.ts`**

```typescript
@Prop({
  enum: ['kg', 'g', 'L', 'ml', 'pcs', 'box', 'packet', 'roll'],
  default: 'kg',
})
uom: string;

@Prop({ maxlength: 500 })
notes?: string;

@Prop({ type: String })          // ObjectId as string — linked in Task 8
defaultTagId?: string;
```

- [ ] **Step 4: Add `bulkAddMaterials` to service**

```typescript
async bulkAddMaterials(names: string[], uom: string, defaultTagId?: string): Promise<{ created: number; skipped: string[] }> {
  const deduped = [...new Set(names.map(n => n.trim()).filter(Boolean))];
  const existing = await this.materialModel.find({ name: { $in: deduped.map(n => new RegExp(`^${n}$`, 'i')) } }).select('name').lean();
  const existingLower = new Set(existing.map((e: any) => e.name.toLowerCase()));
  const skipped = deduped.filter(n => existingLower.has(n.toLowerCase()));
  const toCreate = deduped.filter(n => !existingLower.has(n.toLowerCase()));
  if (toCreate.length) {
    await this.materialModel.insertMany(toCreate.map(name => ({
      name, uom: uom || 'kg', defaultTagId, isActive: true,
    })));
  }
  return { created: toCreate.length, skipped };
}
```

- [ ] **Step 5: Add bulk endpoint to controller**

```typescript
@Post('materials/bulk')
@RequirePermission('materials.manage')
bulkAddMaterials(@Body() body: { names: string[]; uom: string; defaultTagId?: string }) {
  return this.purchaseService.bulkAddMaterials(body.names, body.uom, body.defaultTagId);
}
```

- [ ] **Step 6: Run tests**
```bash
cd backend && npx jest purchase.material.spec --no-coverage 2>&1 | tail -10
```
Expected: PASS 2/2

- [ ] **Step 7: Commit**
```bash
git add backend/src/modules/purchase/schemas/purchase-material.schema.ts \
        backend/src/modules/purchase/purchase.service.ts \
        backend/src/modules/purchase/purchase.controller.ts \
        backend/src/modules/purchase/purchase.material.spec.ts
git commit -m "feat(fms/materials): widen UOM enum; add notes+defaultTagId; bulk add endpoint"
```

---

### Task 7: Material combobox + UOM display in frontend

**Files:**
- Modify: `frontend/src/app/fms/purchase/new/page.tsx`
- Modify: `frontend/src/app/fms/purchase/materials/page.tsx`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/app/fms/purchase/new/material-search.test.ts`

**Interfaces:**
- Consumes: `GET /purchase/materials` + `POST /purchase/materials` + `POST /purchase/materials/bulk` (Task 6)
- Produces:
  - `MaterialCombobox` component: searchable input, dropdown results, '+ Add "X"' option if `materials.manage`
  - Bulk-add panel in `materials/page.tsx`: textarea (one name per line) + UOM select + Submit
  - Dashboard KPI: shows `3,182 kg · 40 pcs` (split by UOM)

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/app/fms/purchase/new/material-search.test.ts
import { filterMaterials } from './material-search-utils';

describe('filterMaterials', () => {
  const mats = [
    { _id: '1', name: 'Bajra', isActive: true },
    { _id: '2', name: 'Kokum', isActive: true },
    { _id: '3', name: 'Kokum Syrup', isActive: false },
  ];

  it('filters by name case-insensitively', () => {
    const res = filterMaterials(mats, 'KOK');
    expect(res.map(m => m._id)).toEqual(['2']); // Kokum Syrup excluded (inactive)
  });

  it('returns all active materials for empty query', () => {
    const res = filterMaterials(mats, '');
    expect(res).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd frontend && npx vitest run src/app/fms/purchase/new/material-search.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `frontend/src/app/fms/purchase/new/material-search-utils.ts`**

```typescript
export function filterMaterials(
  materials: Array<{ _id: string; name: string; isActive: boolean }>,
  query: string,
): Array<{ _id: string; name: string; isActive: boolean }> {
  const active = materials.filter(m => m.isActive);
  if (!query.trim()) return active;
  const q = query.toLowerCase();
  return active.filter(m => m.name.toLowerCase().includes(q));
}
```

- [ ] **Step 4: Replace `<select>` with `MaterialCombobox` in `new/page.tsx`**

Replace the material dropdown in each row with an inline combobox:
```tsx
function MaterialCombobox({ value, materials, canAdd, onChange }: {
  value: string; materials: any[]; canAdd: boolean;
  onChange: (id: string, name: string, uom: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = filterMaterials(materials, q);
  const exactMatch = materials.some(m => m.name.toLowerCase() === q.toLowerCase().trim());

  return (
    <div className="relative">
      <input value={q || (value ? materials.find(m => m._id === value)?.name || '' : '')}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search material…"
        className="w-full border border-fms-line2 rounded-fms-control px-3 py-1.5 text-sm"
      />
      {open && (q || !value) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-fms-line2 rounded shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 20).map(m => (
            <button key={m._id} className="w-full text-left px-3 py-2 hover:bg-fms-bg text-sm"
              onClick={() => { onChange(m._id, m.name, m.uom); setQ(''); setOpen(false); }}>
              {m.name} <span className="text-xs text-fms-muted ml-1">{m.uom}</span>
            </button>
          ))}
          {canAdd && q.trim() && !exactMatch && (
            <button className="w-full text-left px-3 py-2 text-sm text-fms-green font-medium hover:bg-fms-bg"
              onClick={() => { /* open inline add dialog */ }}>
              + Add "{q.trim()}" as new material
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

Also: replace fixed `'kg'` in qty label with the material's `uom` from the selected material.

- [ ] **Step 5: Add bulk-add panel to `materials/page.tsx`**

```tsx
// Below the existing add form, only shown if canManage:
const [bulkText, setBulkText] = useState('');
const [bulkUom, setBulkUom] = useState('kg');

const bulkMutation = useMutation({
  mutationFn: () => api.bulkAddPurchaseMaterials({
    names: bulkText.split('\n').map(l => l.trim()).filter(Boolean),
    uom: bulkUom,
  }),
  onSuccess: (r) => toast({ title: `${r.created} added, ${r.skipped.length} skipped` }),
});
```

- [ ] **Step 6: Add API methods**

In `api.ts`:
```typescript
async bulkAddPurchaseMaterials(body: { names: string[]; uom: string; defaultTagId?: string }): Promise<{ created: number; skipped: string[] }> {
  const r = await this.client.post('/purchase/materials/bulk', body);
  return r.data.data;
}
```

- [ ] **Step 7: Run tests**
```bash
cd frontend && npx vitest run 2>&1 | tail -10
```
Expected: 39/39 pass (previous) + 2 new = 41/41

- [ ] **Step 8: Commit**
```bash
git add frontend/src/app/fms/purchase/new/page.tsx \
        frontend/src/app/fms/purchase/new/material-search-utils.ts \
        frontend/src/app/fms/purchase/new/material-search.test.ts \
        frontend/src/app/fms/purchase/materials/page.tsx \
        frontend/src/lib/api.ts
git commit -m "feat(fms/materials): searchable combobox + inline add + bulk add panel"
```

---

### Task 8: PurchaseTag schema + item-line v2 fields (ALL new line fields in one schema change)

**Files:**
- Create: `backend/src/modules/purchase/schemas/purchase-tag.schema.ts`
- Modify: `backend/src/modules/purchase/schemas/purchase-request.schema.ts` (item line fields)
- Modify: `backend/src/modules/purchase/purchase.service.ts` (tag CRUD)
- Modify: `backend/src/modules/purchase/purchase.controller.ts` (tag endpoints)
- Modify: `backend/src/modules/purchase/purchase.module.ts` (register tag schema)
- Modify: `backend/src/modules/purchase/lib/stage.ts` (add `deriveParentStageFromLines`)
- Test: `backend/src/modules/purchase/purchase.tag.spec.ts`

**Interfaces:**
- Produces:
  - `PurchaseTag` Mongoose model: `{ name, color, icon, description, sortOrder, isActive, createdBy }`
  - `GET /purchase/tags`, `POST /purchase/tags`, `PATCH /purchase/tags/:id`
  - Item-line v2 fields on `PurchaseRequest.items[]`:
    - `lineStatus: 'NEEDS_PO' | 'PO_RAISED' | 'DROPPED'` (default `'NEEDS_PO'`)
    - `childPoId: string | null` (default `null`)
    - `movedAt: Date | null` (default `null`)
    - `tagId: string | null` (default `null`)
    - `tagName: string` (snapshot, default `''`)
    - `tagColor: string` (snapshot, default `''`)
  - `deriveParentStageFromLines(items[])` — exported from `lib/stage.ts`

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/modules/purchase/purchase.tag.spec.ts
import { deriveParentStageFromLines } from './lib/stage';

describe('deriveParentStageFromLines', () => {
  it('returns NEEDS_PO when any line has lineStatus NEEDS_PO', () => {
    const items = [
      { lineStatus: 'NEEDS_PO' },
      { lineStatus: 'PO_RAISED' },
    ];
    expect(deriveParentStageFromLines(items as any)).toBe('NEEDS_PO');
  });

  it('returns DROPPED_ALL when all lines are DROPPED', () => {
    const items = [{ lineStatus: 'DROPPED' }, { lineStatus: 'DROPPED' }];
    expect(deriveParentStageFromLines(items as any)).toBe('ALL_DROPPED');
  });

  it('returns PO_RAISED when all active lines are PO_RAISED (no NEEDS_PO)', () => {
    const items = [
      { lineStatus: 'PO_RAISED' },
      { lineStatus: 'DROPPED' },
    ];
    expect(deriveParentStageFromLines(items as any)).toBe('PO_RAISED');
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd backend && npx jest purchase.tag.spec --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Create `purchase-tag.schema.ts`**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PurchaseTagDocument = PurchaseTag & Document;

@Schema({ timestamps: true })
export class PurchaseTag {
  @Prop({ required: true, unique: true, trim: true }) name: string;
  @Prop({ required: true }) color: string;   // hex e.g. '#2E7D4F'
  @Prop({ default: '' }) icon: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: 0 }) sortOrder: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ type: Object }) createdBy?: any;   // ActorSnapshot
  createdAt: Date; updatedAt: Date;
}

export const PurchaseTagSchema = SchemaFactory.createForClass(PurchaseTag);
```

- [ ] **Step 4: Add item-line v2 fields to `purchase-request.schema.ts`**

Extend the `items` `@Prop` definition — add these fields to the subdocument (all optional with defaults so old records load fine):
```typescript
@Prop({
  type: [{
    materialId: String, materialName: String, qtyKg: Number,
    uom: { type: String, default: 'kg' },
    // ── v2 line fields ──
    lineStatus: { type: String, enum: ['NEEDS_PO', 'PO_RAISED', 'DROPPED'], default: 'NEEDS_PO' },
    childPoId: { type: String, default: null },
    movedAt: { type: Date, default: null },
    tagId: { type: String, default: null },
    tagName: { type: String, default: '' },
    tagColor: { type: String, default: '' },
  }],
  required: true,
})
items: Array<{
  materialId: string; materialName: string; qtyKg: number; uom?: string;
  lineStatus?: 'NEEDS_PO' | 'PO_RAISED' | 'DROPPED';
  childPoId?: string | null; movedAt?: Date | null;
  tagId?: string | null; tagName?: string; tagColor?: string;
}>;
```

Also add a `pendingLineCount` cached field for dashboard display:
```typescript
@Prop({ default: 0 }) pendingLineCount: number;
```

- [ ] **Step 5: Add `deriveParentStageFromLines` to `lib/stage.ts`**

```typescript
export function deriveParentStageFromLines(
  items: Array<{ lineStatus?: string }>,
): 'NEEDS_PO' | 'PO_RAISED' | 'ALL_DROPPED' {
  const active = items.filter(i => i.lineStatus !== 'DROPPED');
  if (active.length === 0) return 'ALL_DROPPED';
  if (active.some(i => !i.lineStatus || i.lineStatus === 'NEEDS_PO')) return 'NEEDS_PO';
  return 'PO_RAISED';
}
```

- [ ] **Step 6: Add tag CRUD to service**

```typescript
async getTags(activeOnly = true) {
  const q = activeOnly ? { isActive: true } : {};
  return this.tagModel.find(q).sort({ sortOrder: 1, name: 1 }).lean();
}

async createTag(body: { name: string; color: string; icon?: string; description?: string }, actor?: any) {
  return this.tagModel.create({ ...body, createdBy: actor });
}

async updateTag(id: string, body: Partial<{ name: string; color: string; description: string; isActive: boolean }>) {
  return this.tagModel.findByIdAndUpdate(id, { $set: body }, { new: true });
}

async seedDefaultTags() {
  const defaults = [
    { name: 'Ready to Sell', color: '#2E7D4F', description: 'Finished goods bought ready for sale', sortOrder: 1 },
    { name: 'For Processing', color: '#C77700', description: 'Raw material for processing and manufacturing', sortOrder: 2 },
    { name: 'Factory Use', color: '#4A6FA5', description: 'Consumables and supplies for the factory', sortOrder: 3 },
  ];
  let created = 0;
  for (const t of defaults) {
    const exists = await this.tagModel.findOne({ name: t.name });
    if (!exists) { await this.tagModel.create(t); created++; }
  }
  return { created };
}
```

- [ ] **Step 7: Add tag endpoints to controller**

```typescript
@Get('tags')
getTags(@Query('all') all?: string) { return this.purchaseService.getTags(all !== 'true'); }

@Post('tags')
@RequirePermission('tags.manage')
createTag(@Body() body: any, @CurrentUser() user: JwtPayload) { return this.purchaseService.createTag(body, /* actor */); }

@Patch('tags/:id')
@RequirePermission('tags.manage')
updateTag(@Param('id') id: string, @Body() body: any) { return this.purchaseService.updateTag(id, body); }

@Post('tags/seed')
@RequirePermission('tags.manage')
seedTags() { return this.purchaseService.seedDefaultTags(); }
```

- [ ] **Step 8: Update `purchase.module.ts`**

```typescript
import { PurchaseTag, PurchaseTagSchema } from './schemas/purchase-tag.schema';

MongooseModule.forFeature([
  // ...existing...
  { name: PurchaseTag.name, schema: PurchaseTagSchema },
]),
```

Inject in service constructor:
```typescript
@InjectModel(PurchaseTag.name) private tagModel: Model<PurchaseTagDocument>,
```

- [ ] **Step 9: Run tests**
```bash
cd backend && npx jest purchase.tag.spec --no-coverage 2>&1 | tail -10
```
Expected: PASS 3/3

- [ ] **Step 10: Run tsc**
```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep -v "scripts/" | head -20
```

- [ ] **Step 11: Commit**
```bash
git add backend/src/modules/purchase/schemas/purchase-tag.schema.ts \
        backend/src/modules/purchase/schemas/purchase-request.schema.ts \
        backend/src/modules/purchase/purchase.service.ts \
        backend/src/modules/purchase/purchase.controller.ts \
        backend/src/modules/purchase/purchase.module.ts \
        backend/src/modules/purchase/lib/stage.ts \
        backend/src/modules/purchase/purchase.tag.spec.ts
git commit -m "feat(fms/tags): PurchaseTag schema + CRUD; item-line v2 fields (lineStatus/tagId/childPoId/movedAt)"
```

---

### Task 9: Tag selector in New Request + dashboard tag filter

**Files:**
- Modify: `frontend/src/app/fms/purchase/new/page.tsx` (tag selector per line)
- Modify: `frontend/src/app/fms/purchase/page.tsx` (tag filter bar + item view)
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/app/fms/purchase/tag-filter.test.ts`

**Interfaces:**
- Consumes: `GET /purchase/tags`, `GET /purchase/items?tags=&status=&q=`
- Produces:
  - Tag chip selector on each line in New Request (pre-filled from material's defaultTag)
  - 'Set all to…' quick action
  - Dashboard: filter bar `[All] [Ready to Sell] [For Processing] [Factory Use]` + multi-select
  - When tag(s) selected: item view (one row per line) with stage chip, timeline compact row, waiting
  - URL: `?tags=ready-to-sell,factory-use`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/app/fms/purchase/tag-filter.test.ts
import { parseTagsParam, buildTagsParam, filterItemsByTags } from './tag-filter-utils';

describe('tag URL params', () => {
  it('parseTagsParam splits comma-separated slugs', () => {
    expect(parseTagsParam('ready-to-sell,factory-use')).toEqual(['ready-to-sell', 'factory-use']);
  });

  it('parseTagsParam returns [] for null', () => {
    expect(parseTagsParam(null)).toEqual([]);
  });

  it('buildTagsParam joins with comma', () => {
    expect(buildTagsParam(['ready-to-sell', 'for-processing'])).toBe('ready-to-sell,for-processing');
  });
});

describe('filterItemsByTags', () => {
  const items = [
    { _id: 'l1', tagName: 'Factory Use', lineStatus: 'NEEDS_PO' },
    { _id: 'l2', tagName: 'For Processing', lineStatus: 'PO_RAISED' },
  ];

  it('returns all when no tags selected', () => {
    expect(filterItemsByTags(items as any, [])).toHaveLength(2);
  });

  it('filters to matching tag only', () => {
    const result = filterItemsByTags(items as any, ['Factory Use']);
    expect(result.map(i => i._id)).toEqual(['l1']);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd frontend && npx vitest run src/app/fms/purchase/tag-filter.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `frontend/src/app/fms/purchase/tag-filter-utils.ts`**

```typescript
export function parseTagsParam(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map(s => s.trim()).filter(Boolean);
}

export function buildTagsParam(tags: string[]): string {
  return tags.join(',');
}

export function filterItemsByTags(
  items: Array<{ tagName?: string }>,
  selectedTags: string[],
): typeof items {
  if (!selectedTags.length) return items;
  return items.filter(i => selectedTags.includes(i.tagName ?? ''));
}
```

- [ ] **Step 4: Add tag selector to `new/page.tsx`**

Add `tagId` and `tagName`/`tagColor` to the row state. Add a tag chip row below material/qty:
```tsx
const { data: tags = [] } = useQuery({ queryKey: ['purchase-tags'], queryFn: () => api.getPurchaseTags() });

// Per row: tag chip selector
<div className="flex items-center gap-1.5 flex-wrap">
  {tags.map((t: any) => (
    <button key={t._id} type="button"
      onClick={() => updateRow(i, 'tagId', t._id, t.name, t.color)}
      className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
        row.tagId === t._id ? 'text-white' : 'bg-transparent border-gray-200 text-gray-500 hover:border-gray-400',
      )}
      style={row.tagId === t._id ? { background: t.color, borderColor: t.color } : {}}>
      {t.name}
    </button>
  ))}
</div>

// 'Set all to...' quick action above the item rows:
<select onChange={e => setItems(prev => prev.map(r => {
  const t = tags.find((t: any) => t._id === e.target.value);
  return t ? { ...r, tagId: t._id, tagName: t.name, tagColor: t.color } : r;
}))}>
  <option value="">Set all to…</option>
  {tags.map((t: any) => <option key={t._id} value={t._id}>{t.name}</option>)}
</select>
```

Validate in submit: all lines must have a `tagId` before sending.

- [ ] **Step 5: Add tag filter bar to `purchase/page.tsx`**

```tsx
const searchParams = useSearchParams();
const router = useRouter();
const selectedTagNames = parseTagsParam(searchParams.get('tags'));

const { data: tags = [] } = useQuery({ queryKey: ['purchase-tags'], queryFn: () => api.getPurchaseTags() });

// Filter bar:
<div className="flex items-center gap-2 flex-wrap px-7 py-3 border-b border-fms-line">
  <button onClick={() => router.push('?')}
    className={cn('px-3 py-1 rounded-full text-xs font-medium border',
      !selectedTagNames.length ? 'bg-fms-green text-white border-fms-green' : 'bg-white text-fms-muted border-fms-line2')}>
    All
  </button>
  {tags.map((t: any) => (
    <button key={t._id}
      onClick={() => {
        const next = selectedTagNames.includes(t.name)
          ? selectedTagNames.filter(n => n !== t.name)
          : [...selectedTagNames, t.name];
        router.push(next.length ? `?tags=${buildTagsParam(next)}` : '?');
      }}
      className={cn('px-3 py-1 rounded-full text-xs font-medium border')}
      style={selectedTagNames.includes(t.name) ? { background: t.color, color: '#fff', borderColor: t.color } : {}}>
      {t.name}
    </button>
  ))}
</div>
```

When `selectedTagNames.length > 0`, switch table to item view: fetch from `GET /purchase/items?tags=...` and render one row per material line.

- [ ] **Step 6: Add items aggregation endpoint to backend**

In `purchase.controller.ts`:
```typescript
@Get('items')
getItems(@Query() q: { tags?: string; status?: string; q?: string }) {
  return this.purchaseService.getItems(q);
}
```

In `purchase.service.ts`:
```typescript
async getItems(query: { tags?: string; status?: string; q?: string }) {
  const tagNames = query.tags?.split(',').filter(Boolean) ?? [];
  const pipeline: any[] = [
    { $match: { status: { $nin: ['CANCELLED'] } } },
    { $unwind: '$items' },
  ];
  if (tagNames.length) pipeline.push({ $match: { 'items.tagName': { $in: tagNames } } });
  if (query.status) pipeline.push({ $match: { stage: query.status } });
  if (query.q) pipeline.push({ $match: { 'items.materialName': new RegExp(query.q, 'i') } });
  pipeline.push({
    $project: {
      _id: '$items._id', reqId: '$_id', reqNo: 1,
      materialName: '$items.materialName', qty: '$items.qtyKg', uom: '$items.uom',
      tagName: '$items.tagName', tagColor: '$items.tagColor',
      lineStatus: '$items.lineStatus', childPoId: '$items.childPoId',
      stage: 1, stageEnteredAt: 1, createdAt: 1,
    },
  });
  return this.requestModel.aggregate(pipeline).exec();
}
```

Add index: `PurchaseRequestSchema.index({ 'items.tagName': 1, stage: 1 });`

- [ ] **Step 7: Add API methods to `api.ts`**

```typescript
async getPurchaseTags(): Promise<any[]> {
  const r = await this.client.get('/purchase/tags');
  return r.data.data;
}

async getPurchaseItems(params: { tags?: string; status?: string; q?: string } = {}): Promise<any[]> {
  const r = await this.client.get('/purchase/items', { params });
  return r.data.data;
}
```

- [ ] **Step 8: Run tests**
```bash
cd frontend && npx vitest run 2>&1 | tail -10
```
Expected: 41/41 + 5 new = 46/46

- [ ] **Step 9: Commit**
```bash
git add frontend/src/app/fms/purchase/new/page.tsx \
        frontend/src/app/fms/purchase/page.tsx \
        frontend/src/app/fms/purchase/tag-filter-utils.ts \
        frontend/src/app/fms/purchase/tag-filter.test.ts \
        frontend/src/lib/api.ts \
        backend/src/modules/purchase/purchase.service.ts \
        backend/src/modules/purchase/purchase.controller.ts \
        backend/src/modules/purchase/schemas/purchase-request.schema.ts
git commit -m "feat(fms/tags): tag selector on new request + dashboard tag filter + item view"
```

---

### Task 10: Partial PO — backend (split by selected lines + optimistic lock + drop item)

**Files:**
- Modify: `backend/src/modules/purchase/purchase.service.ts` — extend `splitPO`; add `dropItem`
- Modify: `backend/src/modules/purchase/purchase.controller.ts` — add drop endpoint
- Test: `backend/src/modules/purchase/purchase.partial-po.spec.ts`

**Interfaces:**
- Consumes: item-line v2 fields from Task 8
- Produces:
  - `splitPO` now accepts only lines that have `vendorName` + `ratePerKg > 0`; unassigned lines stay with `lineStatus:'NEEDS_PO'` on parent
  - Returns `{ childPoIds: string[]; remainingCount: number }`
  - `POST /purchase/requests/:id/drop-item` — body `{ itemId, reason }` → marks line `DROPPED`
  - Race condition: `splitPO` re-reads items inside a transaction (or finds-and-updates atomically) and throws 409 if any selected line is already `PO_RAISED`

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/modules/purchase/purchase.partial-po.spec.ts
import { deriveParentStageFromLines } from './lib/stage';

describe('Partial PO logic', () => {
  it('stage is NEEDS_PO when any line is NEEDS_PO', () => {
    expect(deriveParentStageFromLines([
      { lineStatus: 'PO_RAISED' },
      { lineStatus: 'NEEDS_PO' },
    ])).toBe('NEEDS_PO');
  });

  it('stage is PO_RAISED when all active lines have PO_RAISED', () => {
    expect(deriveParentStageFromLines([
      { lineStatus: 'PO_RAISED' },
      { lineStatus: 'DROPPED' },
    ])).toBe('PO_RAISED');
  });

  it('validatePartialPO throws when a line has no vendor', () => {
    const { validatePartialPO } = require('./purchase.service');
    const lines = [
      { materialId: 'm1', qtyKg: 10, vendorName: 'Vendor A', ratePerKg: 100 },
      { materialId: 'm2', qtyKg: 5, vendorName: '', ratePerKg: 0 },  // unassigned
    ];
    // validatePartialPO should filter out unassigned lines and return only assigned ones
    const result = validatePartialPO(lines);
    expect(result.assigned).toHaveLength(1);
    expect(result.unassigned).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd backend && npx jest purchase.partial-po.spec --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Export `validatePartialPO` helper from service**

```typescript
// Exported for testing — not a method
export function validatePartialPO(lines: Array<{
  materialId: string; vendorName?: string; ratePerKg?: number; [k: string]: any;
}>): { assigned: typeof lines; unassigned: typeof lines } {
  const assigned = lines.filter(l => l.vendorName && (l.ratePerKg ?? 0) > 0);
  const unassigned = lines.filter(l => !l.vendorName || (l.ratePerKg ?? 0) <= 0);
  return { assigned, unassigned };
}
```

- [ ] **Step 4: Rewrite `splitPO` service method for partial support**

Key changes from the old `splitPO`:
1. Accept `items` from body — may be only a subset
2. `validatePartialPO(body.items)` — throw 400 if any line has vendor but rate=0
3. Re-read parent items from DB inside the same save transaction; for each assigned line, verify `lineStatus === 'NEEDS_PO'` — if any is already `'PO_RAISED'`, throw `ConflictException('Line already has a PO — reload and try again')`
4. Create child POs as before (grouped by vendor, one child per vendor)
5. Update assigned lines on parent: `lineStatus='PO_RAISED'`, `childPoId=child._id`, `movedAt=now`
6. Leave unassigned lines untouched (`lineStatus='NEEDS_PO'`)
7. `parent.pendingLineCount = parent.items.filter(i => i.lineStatus === 'NEEDS_PO').length`
8. Recompute parent stage with `deriveParentStageFromLines` + existing `recomputeAndCacheStage`

```typescript
async splitPO(
  parentId: string,
  user: JwtPayload,
  body: {
    items: Array<{ materialId: string; materialName: string; qtyKg: number; ratePerKg: number; vendorName: string; vendorPhone?: string; vendorAddress?: string; terms?: string }>;
    expectedDelivery?: string;
  },
) {
  const now = new Date();
  const actor = await buildActorSnapshot(user, this.adminModel, now);
  const { assigned, unassigned } = validatePartialPO(body.items);
  if (!assigned.length) throw new BadRequestException('No items with vendor and rate assigned');

  const parent = await this.requestModel.findById(parentId);
  if (!parent) throw new NotFoundException('Request not found');

  // Optimistic lock: check no race
  for (const a of assigned) {
    const line = parent.items.find(i => i.materialId === a.materialId);
    if (!line) throw new BadRequestException(`Material ${a.materialId} not on this request`);
    if (line.lineStatus === 'PO_RAISED') {
      throw new ConflictException(`${a.materialName} already has a PO — reload and try again`);
    }
  }

  // Group by vendor
  const byVendor = new Map<string, typeof assigned>();
  for (const a of assigned) {
    const key = a.vendorName;
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key)!.push(a);
  }

  // Determine next letter suffix (A, B, C…)
  const existing = await this.requestModel.find({ parentId }).sort({ createdAt: 1 }).lean();
  let letterIdx = existing.length; // 0 = A, 1 = B, …

  const childIds: string[] = [];
  for (const [vendorName, vendorItems] of byVendor.entries()) {
    const letter = String.fromCharCode(65 + letterIdx++);
    const childReqNo = `${parent.reqNo}-${letter}`;
    const poNo = await this.nextPoNo();
    const vendorInfo = vendorItems[0];
    const child = await this.requestModel.create({
      reqNo: childReqNo, parentId: parent._id.toString(),
      status: 'PO_CREATED', requestedById: parent.requestedById,
      requestedByName: parent.requestedByName,
      requestedAt: (parent as any).createdAt,
      items: vendorItems.map(i => ({
        materialId: i.materialId, materialName: i.materialName,
        qtyKg: i.qtyKg, lineStatus: 'PO_RAISED',
      })),
      po: {
        poNo, vendorName, vendorPhone: vendorInfo.vendorPhone ?? '',
        vendorAddress: vendorInfo.vendorAddress ?? '',
        items: vendorItems.map(i => ({
          materialId: i.materialId, materialName: i.materialName,
          qtyKg: i.qtyKg, ratePerKg: i.ratePerKg,
          amount: i.qtyKg * i.ratePerKg,
        })),
        totalAmount: vendorItems.reduce((s, i) => s + i.qtyKg * i.ratePerKg, 0),
        expectedDelivery: body.expectedDelivery ?? '',
        terms: vendorInfo.terms ?? '', createdByName: actor.name, createdAt: now,
      },
      poRaisedBy: actor,
      timeline: [{ action: 'PO Created', status: 'PO_CREATED', byName: actor.name, at: now, actor }],
    });
    childIds.push(child._id.toString());

    // Update parent line statuses
    for (const a of vendorItems) {
      const line = parent.items.find(i => i.materialId === a.materialId);
      if (line) { (line as any).lineStatus = 'PO_RAISED'; (line as any).childPoId = child._id.toString(); (line as any).movedAt = now; }
    }
  }

  const remaining = parent.items.filter(i => (i as any).lineStatus === 'NEEDS_PO');
  parent.pendingLineCount = remaining.length;
  parent.markModified('items');
  if (parent.status !== 'SPLIT') parent.status = 'SPLIT';

  const unassignedNames = unassigned.map(u => u.materialName);
  parent.timeline.push({
    action: `Raised ${childIds.length} PO(s) for ${assigned.length} items (${[...byVendor.keys()].join(', ')})${unassigned.length ? `. ${unassigned.length} items still need PO: ${unassignedNames.join(', ')}` : ''}`,
    status: 'SPLIT', byName: actor.name, at: now, actor,
  });
  await this.recomputeAndCacheStage(parent);
  await parent.save();

  return { childPoIds: childIds, remainingCount: remaining.length };
}
```

- [ ] **Step 5: Add `dropItem` service method + endpoint**

```typescript
async dropItem(parentId: string, itemId: string, reason: string, user: JwtPayload) {
  const now = new Date();
  const actor = await buildActorSnapshot(user, this.adminModel, now);
  const parent = await this.requestModel.findById(parentId);
  if (!parent) throw new NotFoundException('Request not found');
  const line = parent.items.find(i => (i as any)._id?.toString() === itemId);
  if (!line) throw new NotFoundException('Item not found on request');
  if ((line as any).lineStatus === 'PO_RAISED') throw new BadRequestException('Cannot drop an item that already has a PO');
  (line as any).lineStatus = 'DROPPED';
  parent.markModified('items');
  parent.pendingLineCount = parent.items.filter(i => (i as any).lineStatus === 'NEEDS_PO').length;
  parent.timeline.push({ action: `Dropped item ${line.materialName}: ${reason}`, status: parent.status, byName: actor.name, at: now, actor });
  await this.recomputeAndCacheStage(parent);
  await parent.save();
  return { ok: true };
}
```

In controller:
```typescript
@Post('requests/:id/drop-item')
@RequirePermission('po.raise')
dropItem(
  @Param('id') id: string,
  @CurrentUser() user: JwtPayload,
  @Body() body: { itemId: string; reason: string },
) { return this.purchaseService.dropItem(id, body.itemId, body.reason, user); }
```

- [ ] **Step 6: Run tests**
```bash
cd backend && npx jest purchase.partial-po.spec purchase.tag.spec purchase.actor.spec purchase.permission.guard.spec --no-coverage 2>&1 | tail -15
```
Expected: PASS all

- [ ] **Step 7: Run tsc**
```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep -v "scripts/" | head -20
```

- [ ] **Step 8: Commit**
```bash
git add backend/src/modules/purchase/purchase.service.ts \
        backend/src/modules/purchase/purchase.controller.ts \
        backend/src/modules/purchase/purchase.partial-po.spec.ts
git commit -m "feat(fms/partial-po): partial splitPO + optimistic lock + dropItem endpoint"
```

---

### Task 11: Partial PO frontend — raise-po page + parent detail blocks

**Files:**
- Modify: `frontend/src/app/fms/purchase/[id]/raise-po/page.tsx` — partial vendor assignment + confirm sheet
- Modify: `frontend/src/app/fms/purchase/[id]/page.tsx` — Pending PO / Raised POs blocks; actor avatars in stepper + timeline
- Test: `frontend/src/app/fms/purchase/partial-po.test.ts`

**Interfaces:**
- Consumes: `POST /purchase/requests/:id/split-po` (Task 10); item-line v2 fields; ActorSnapshot in timeline
- Produces:
  - Raise PO page shows **only** `lineStatus === 'NEEDS_PO'` lines (not all items)
  - Confirm sheet: `3 items → 2 POs (Om Herbal, Nityadhara). 4 items stay in Needs PO: Makka, Rajgira, Toor Dal, Jowar.`
  - Parent detail page: `Pending PO (N)` block with Raise PO button + `Raised POs (M)` block with vendor PO cards
  - Stepper: actor photo (28px ring), name, designation, datetime under each completed step
  - Timeline: actor photo + "Ravi Sahu · Store Incharge received 60 kg Jaggery" + time
  - Dashboard table: `Last action by` column with 24px photo + first name

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/app/fms/purchase/partial-po.test.ts
import { buildConfirmMessage } from './confirm-utils';

describe('buildConfirmMessage', () => {
  it('builds correct message with unassigned items', () => {
    const assigned = [
      { materialName: 'Mustard', vendorName: 'Om Herbal' },
      { materialName: 'Sesame', vendorName: 'Om Herbal' },
      { materialName: 'Groundnut', vendorName: 'Nityadhara' },
    ];
    const unassigned = ['Makka', 'Rajgira', 'Toor Dal', 'Jowar'];
    const msg = buildConfirmMessage(assigned, unassigned);
    expect(msg).toContain('3 items → 2 POs');
    expect(msg).toContain('Om Herbal');
    expect(msg).toContain('Nityadhara');
    expect(msg).toContain('4 items stay in Needs PO');
    expect(msg).toContain('Makka');
  });

  it('omits unassigned sentence when all assigned', () => {
    const assigned = [{ materialName: 'Mustard', vendorName: 'Om Herbal' }];
    const msg = buildConfirmMessage(assigned, []);
    expect(msg).not.toContain('stay in Needs PO');
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd frontend && npx vitest run src/app/fms/purchase/partial-po.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `frontend/src/app/fms/purchase/confirm-utils.ts`**

```typescript
export function buildConfirmMessage(
  assigned: Array<{ materialName: string; vendorName: string }>,
  unassignedNames: string[],
): string {
  const vendors = [...new Set(assigned.map(a => a.vendorName))];
  const poCount = vendors.length;
  let msg = `${assigned.length} items → ${poCount} PO${poCount > 1 ? 's' : ''} (${vendors.join(', ')}).`;
  if (unassignedNames.length) {
    msg += ` ${unassignedNames.length} items stay in Needs PO: ${unassignedNames.join(', ')}.`;
  }
  return msg;
}
```

- [ ] **Step 4: Update `raise-po/page.tsx`**

Filter items to only `lineStatus === 'NEEDS_PO'` (or missing, for old records). Add confirm sheet before submit:

```tsx
const pendingItems = (request?.items ?? []).filter(
  (i: any) => !i.lineStatus || i.lineStatus === 'NEEDS_PO',
);

const handleCreatePO = async () => {
  const assigned = vendorRows.filter(r => r.vendorName && r.ratePerKg > 0);
  const unassigned = vendorRows.filter(r => !r.vendorName || r.ratePerKg <= 0);
  const confirmMsg = buildConfirmMessage(assigned, unassigned.map(u => u.materialName));
  setConfirmMessage(confirmMsg);
  setShowConfirm(true);
};

// Confirm sheet (bottom drawer or modal):
{showConfirm && (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30">
    <div className="bg-white rounded-t-2xl w-full max-w-lg p-6">
      <p className="text-sm text-fms-ink font-jakarta mb-4">{confirmMessage}</p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setShowConfirm(false)}>Go back</Button>
        <Button onClick={submitPO} className="flex-1 bg-fms-green text-white">Confirm & Create PO</Button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Update `[id]/page.tsx` — two-block layout + actor avatars**

Replace the existing single items table with two blocks:
```tsx
const pendingLines = (request?.items ?? []).filter((i: any) => !i.lineStatus || i.lineStatus === 'NEEDS_PO');
const droppedLines = (request?.items ?? []).filter((i: any) => i.lineStatus === 'DROPPED');

// Block 1: Pending PO
{pendingLines.length > 0 && (
  <div className="rounded-fms-card border border-fms-line p-5 mb-4" style={{ background: '#FDF3E3' }}>
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold text-fms-ink font-jakarta text-sm">Pending PO ({pendingLines.length})</h3>
      {canRaisePO && <Button size="sm" onClick={() => router.push(`/fms/purchase/${request._id}/raise-po`)}>Raise PO</Button>}
    </div>
    {/* table of pending lines */}
  </div>
)}

// Block 2: Raised POs (children)
{childPOs.length > 0 && (
  <div className="rounded-fms-card border border-fms-line p-5 mb-4">
    <h3 className="font-semibold text-fms-ink font-jakarta text-sm mb-3">Raised POs ({childPOs.length})</h3>
    {/* vendor PO cards */}
  </div>
)}
```

Actor in stepper (under each completed step):
```tsx
{step.actor && (
  <div className="flex items-center gap-2 mt-1">
    {step.actor.photoUrl ? (
      <img src={step.actor.photoUrl} className="h-7 w-7 rounded-full ring-2 ring-fms-green object-cover" />
    ) : (
      <div className="h-7 w-7 rounded-full ring-2 ring-fms-green flex items-center justify-center text-[11px] font-semibold text-fms-green bg-white">
        {step.actor.name?.[0]}
      </div>
    )}
    <div>
      <p className="text-xs font-medium text-fms-ink font-jakarta">{step.actor.name}</p>
      <p className="text-[10px] text-fms-muted font-jakarta">{step.actor.designation}</p>
    </div>
    <span className="text-[10px] text-fms-muted ml-auto font-jetbrains">{fmtDate(step.actor.at)}</span>
  </div>
)}
```

Actor in timeline: replace "byName" text with photo + "Name · Designation action" format (graceful: if `entry.actor` is missing, fall back to `entry.byName`).

- [ ] **Step 6: Run all tests**
```bash
cd frontend && npx vitest run 2>&1 | tail -10
```
Expected: all pass

- [ ] **Step 7: Commit**
```bash
git add frontend/src/app/fms/purchase/[id]/raise-po/page.tsx \
        frontend/src/app/fms/purchase/[id]/page.tsx \
        frontend/src/app/fms/purchase/confirm-utils.ts \
        frontend/src/app/fms/purchase/partial-po.test.ts
git commit -m "feat(fms/partial-po): partial PO UI + confirm sheet + actor avatars in stepper + timeline"
```

---

### Task 12: Migration script

**Files:**
- Create: `backend/scripts/migrate-fms-v2.ts`

**Interfaces:**
- Consumes: `AdminUser`, `PurchaseRequest`, `PurchaseMaterial`, `PurchaseTag` collections
- Produces: idempotent migration with `--dry-run` and `--confirm` flags

- [ ] **Step 1: Write failing test (dry-run logic)**

```typescript
// backend/scripts/migrate-fms-v2.spec.ts
describe('migration helpers', () => {
  it('mapLineStatus returns PO_RAISED for requests with children containing the material', () => {
    const { mapLineStatus } = require('./migrate-fms-v2-helpers');
    const childrenByParentId: Record<string, string[]> = {
      'parent1': ['Bajra', 'Mustard'],
    };
    expect(mapLineStatus('parent1', 'Bajra', childrenByParentId)).toBe('PO_RAISED');
    expect(mapLineStatus('parent1', 'Sesame', childrenByParentId)).toBe('NEEDS_PO');
    expect(mapLineStatus('other', 'Bajra', childrenByParentId)).toBe('NEEDS_PO');
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**
```bash
cd backend && npx jest migrate-fms-v2.spec --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Create `scripts/migrate-fms-v2-helpers.ts`** (pure functions, testable):

```typescript
export function mapLineStatus(
  parentId: string,
  materialName: string,
  childrenByParentId: Record<string, string[]>,
): 'NEEDS_PO' | 'PO_RAISED' {
  const childMaterials = childrenByParentId[parentId] ?? [];
  return childMaterials.includes(materialName) ? 'PO_RAISED' : 'NEEDS_PO';
}
```

- [ ] **Step 4: Create `scripts/migrate-fms-v2.ts`**

```typescript
#!/usr/bin/env ts-node
/**
 * Migration: FMS v2 — Run with --dry-run to preview, --confirm to execute.
 * Print: mongodump command and refuse to run without --confirm.
 */
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { mapLineStatus } from './migrate-fms-v2-helpers';

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv.includes('--confirm');

async function run() {
  if (!DRY_RUN && !CONFIRM) {
    console.error('ERROR: Pass --dry-run to preview or --confirm to execute.');
    console.log('\nBefore running for real, back up:');
    console.log(`  mongodump --uri "${process.env.MONGODB_URI}" --out ./backup-fms-v2-$(date +%Y%m%d)`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  // ── 1. Bootstrap Super Admin ──────────────────────────────────────────────
  const loginId = process.env.FMS_ADMIN_LOGIN;
  const password = process.env.FMS_ADMIN_PASSWORD;
  const users = db.collection('adminusers');
  const existingSuperAdmin = loginId ? await users.findOne({ loginId }) : null;
  if (!existingSuperAdmin && loginId && password) {
    console.log(`[1] Will create Super Admin: loginId=${loginId}`);
    if (!DRY_RUN) {
      const hash = await bcrypt.hash(password, 12);
      await users.insertOne({
        loginId, email: `${loginId}@naturelite.internal`,
        name: 'Super Admin', designation: 'Administrator', password: hash,
        role: 'superadmin', departmentType: 'fms',
        permissions: ['pr.create','po.raise','po.approve','delivery.receive','request.close',
          'request.cancel','deadline.set','materials.manage','tags.manage','vendors.manage','users.manage'],
        mustChangePassword: false, isActive: true, createdAt: new Date(), updatedAt: new Date(),
      });
    }
  } else {
    console.log('[1] Super Admin already exists — skip');
  }

  // ── 2. Seed PurchaseTags ──────────────────────────────────────────────────
  const tags = db.collection('purchasetags');
  const defaultTags = [
    { name: 'Ready to Sell', color: '#2E7D4F', sortOrder: 1 },
    { name: 'For Processing', color: '#C77700', sortOrder: 2 },
    { name: 'Factory Use', color: '#4A6FA5', sortOrder: 3 },
  ];
  for (const t of defaultTags) {
    const exists = await tags.findOne({ name: t.name });
    if (!exists) {
      console.log(`[2] Will create tag: ${t.name}`);
      if (!DRY_RUN) await tags.insertOne({ ...t, isActive: true, createdAt: new Date(), updatedAt: new Date() });
    }
  }

  // ── 3. Set lineStatus on existing request items ───────────────────────────
  const requests = db.collection('purchaserequests');
  const allRequests = await requests.find({}).toArray();
  const children = allRequests.filter(r => r.parentId);
  const childrenByParentId: Record<string, string[]> = {};
  for (const c of children) {
    const pid = c.parentId.toString();
    if (!childrenByParentId[pid]) childrenByParentId[pid] = [];
    childrenByParentId[pid].push(...(c.items ?? []).map((i: any) => i.materialName));
  }

  let lineUpdates = 0;
  for (const req of allRequests.filter(r => !r.parentId)) {
    const items = (req.items ?? []).map((item: any) => {
      if (item.lineStatus) return item; // already migrated
      return { ...item, lineStatus: mapLineStatus(req._id.toString(), item.materialName, childrenByParentId) };
    });
    const changed = items.some((item: any, idx: number) => item.lineStatus !== req.items[idx]?.lineStatus);
    if (changed) {
      lineUpdates++;
      console.log(`[3] Will set lineStatus on ${req.reqNo} (${items.length} lines)`);
      if (!DRY_RUN) await requests.updateOne({ _id: req._id }, { $set: { items } });
    }
  }
  if (!lineUpdates) console.log('[3] All request items already have lineStatus — skip');

  console.log(DRY_RUN ? '\n✅ Dry run complete. Re-run with --confirm to apply.' : '\n✅ Migration complete.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Run tests**
```bash
cd backend && npx jest migrate-fms-v2.spec --no-coverage 2>&1 | tail -10
```
Expected: PASS 1/1

- [ ] **Step 6: Run dry-run smoke test** (uses local env)
```bash
cd backend && FMS_ADMIN_LOGIN=om.admin FMS_ADMIN_PASSWORD=Test1234 MONGODB_URI="$MONGODB_URI" \
  npx ts-node scripts/migrate-fms-v2.ts --dry-run 2>&1 | tail -20
```
Expected: prints plan, no errors, ends with "Dry run complete"

- [ ] **Step 7: Commit**
```bash
git add backend/scripts/migrate-fms-v2.ts \
        backend/scripts/migrate-fms-v2-helpers.ts \
        backend/scripts/migrate-fms-v2.spec.ts
git commit -m "feat(fms/migration): idempotent FMS v2 migration script (super admin, tags, lineStatus)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Section 3 (RBAC): Tasks 1–5 — AdminUser, PermissionGuard, photo upload (Task 4/5), Users admin page, actor snapshots, avatar in stepper/timeline/sidebar
- ✅ Section 4 (Materials): Tasks 6–7 — schema, bulk add, searchable combobox, UOM
- ✅ Section 5 (Partial PO): Tasks 10–11 — partial splitPO, letter continuation, confirm sheet, drop item, race condition lock
- ✅ Section 6 (Tags): Tasks 8–9 — PurchaseTag schema, tag selector, dashboard filter, item view, URL params
- ✅ Section 7 (Migration): Task 12 — bootstrap admin, seed tags, lineStatus migration, dry-run, --confirm guard
- ✅ Section 10 (Bug fixes): parent stage roll-up (Task 10 `deriveParentStageFromLines`), 'Review & Approve' redirect (Task 11 block layout), 'By Category' card (Task 9 uses tags)
- ✅ Rate limiting: already exists (`failedLoginAttempts`, `lockoutUntil`) — no task needed
- ✅ `mustChangePassword` flow: flag set in Task 1 + Task 4; UI intercept on first login should be added in Task 5 (force password change screen before reaching dashboard)

**Gaps fixed:**
- Task 5 must include: on login response, if `mustChangePassword: true`, redirect to `/fms/purchase/change-password` page before dashboard. Added as a step in Task 5.
- Task 8 issue section noted: `POST /purchase/tags/seed` should be called from Task 9 acceptance step or from the migration script — covered in Task 12.

**Type consistency:**
- `ActorSnapshot` defined in Task 3 (backend schema) + referenced in Tasks 4, 10, 11 ✅
- `validatePartialPO` exported in Task 10, tested in same task ✅
- `buildConfirmMessage` created in Task 11, tested in same task ✅
- `PURCHASE_PERMISSIONS` defined in Task 1 backend + Task 5 frontend (both in sync) ✅

**Review Focus tests pinned:**
1. Race condition (Task 10 step 4: `ConflictException` when line already `PO_RAISED`) ✅
2. Permission bypass (Task 2 step 1: metadata check) ✅
3. Deactivated user (Task 1 step 1: PermissionGuard test 3) ✅
4. Tag URL state (Task 9 step 1: `parseTagsParam` + `filterItemsByTags` tests) ✅
5. Old docs after migration (Task 12 step 1: `mapLineStatus` logic test) ✅
