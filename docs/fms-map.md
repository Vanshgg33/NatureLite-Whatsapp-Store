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
