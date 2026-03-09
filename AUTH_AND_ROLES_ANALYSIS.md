# Auth & Role-Based Login Analysis

This document summarizes how authentication and role-based access work across the Store backend and frontend, and notes gaps or improvements.

---

## 1. Authentication Flows

### 1.1 Customer (storefront)

| Aspect | Implementation |
|--------|----------------|
| **Login** | `POST /auth/customer/login` (phone + OTP) or `POST /auth/customer/email-login` (email + password) |
| **Register** | `POST /auth/customer/register` (name, email, password, phone optional) |
| **Token** | Backend sets `access_token` cookie; frontend also stores `customer-token` (Bearer) and `customer-refresh-token` in localStorage for refresh flow |
| **JWT payload** | `sub` (userId), `phone`, `role: 'customer'` |
| **Validation** | `AuthService.validateUser()`: load user by `sub`, reject if blocked |

- Cart, orders (own), profile, addresses require JWT (cookie or `Authorization: Bearer`).
- 401 on storefront triggers refresh using `customer-refresh-token`; if refresh fails or no token, request is rejected (no automatic redirect to login in the interceptor for non-admin paths).

### 1.2 Admin & department users (panel)

| Aspect | Implementation |
|--------|----------------|
| **Login** | `POST /auth/admin/login` (email, password). Same endpoint used by both **admin-login** and **department-login** pages. |
| **Register** | `POST /auth/admin/register` (name, email, password, phone, role, storeId) — not restricted by role on this endpoint; consider restricting to superadmin if only superadmin should create admins. |
| **Token** | Backend sets `access_token` **httpOnly cookie** only. Frontend does **not** store admin refresh token; admin requests rely on cookie. |
| **JWT payload** | `sub` (adminId), `phone`, `role: 'admin' \| 'superadmin'`, `storeId?` (optional). **Note:** `departmentType` is **not** in the JWT; it is returned in the login **response body** and stored in frontend Zustand only. |
| **Validation** | `AuthService.validateUser()`: for non-customer, load admin by `sub`, reject if `!isActive`. Lockout after 5 failed attempts (15 min). |

- All admin/department API calls use the same cookie (same origin / CORS with credentials).
- Access token expiry is **15 minutes**. Admin refresh token is returned by backend but **never stored or used** on the frontend, so admin/department sessions effectively expire after 15 minutes and the next API call returns 401.

---

## 2. Roles (backend)

### 2.1 Role type

- **Defined in:** `backend/src/common/decorators/roles.decorator.ts`
- **Type:** `Role = 'customer' | 'admin' | 'superadmin'`
- **JWT payload** (`current-user.decorator.ts`): `role: 'customer' | 'admin' | 'superadmin'`

### 2.2 Admin user model

- **Schema:** `backend/src/modules/admin/schemas/admin-user.schema.ts`
  - `role: AdminRole` = `'admin' | 'superadmin'`
  - `departmentType?: 'packing' | 'billing' | 'delivery'`
  - `isActive`, `store?`, etc.

So:

- **Superadmin:** `role === 'superadmin'`. Full access; no `departmentType` needed.
- **General admin:** `role === 'admin'`, no `departmentType` (or store-scoped via `store`).
- **Department user:** `role === 'admin'` and `departmentType === 'packing' | 'billing' | 'delivery'`. Same JWT role as “admin”; differentiation is only via `departmentType` in login response and frontend store.

---

## 3. Global and per-route protection (backend)

### 3.1 Global guard

- **AppModule** registers `JwtAuthGuard` as `APP_GUARD`.
- Every route requires a valid JWT unless marked `@Public()`.

### 3.2 Public routes

- Auth: `admin/login`, `admin/register`, `customer/login`, `customer/register`, `customer/email-login`, `customer/send-otp`, `refresh`, `logout`.
- Others as needed (e.g. some settings, feedback, webhooks) — see `@Public()` usage in controllers.

### 3.3 Role-based routes (`@Roles()`)

- **Superadmin only**
  - `GET/POST/PUT/DELETE /admin/users` (AdminController) — create/update/delete logins, reset password.
  - Users: `DELETE /users/:id`.
  - Stores: create store, delete store (see stores.controller).
  - Store-sales: some analytics endpoints (e.g. superadmin-only).
- **Admin or superadmin**
  - Orders: list orders, get stats, by-status, update status, payment status, delivery workflow, notes, shipping, priority tags.
  - Users: list, get, create, update, block, unblock (but not delete).
  - Products, categories, coupons, media, notifications, feedback, settings, analytics, WhatsApp, chatbot, audit, reminders, payments (admin parts), store-stock, store-sales (where not superadmin-only).

So **department users** (role `admin`) can call all “admin or superadmin” endpoints, including orders list, update status, and delivery workflow. Restricting department users to only “their” actions (e.g. packing vs billing vs delivery) is **not** enforced by backend roles; it’s done by **frontend routing** (department dashboards and layout redirects).

---

## 4. Store-scoped access (StoreGuard)

- **Used with:** store-stock and store-sales controllers.
- **Logic:**  
  - If `user.role === 'superadmin'` or `!user.storeId` → allow.  
  - Else (store-scoped admin): require `storeId` in param/body/query and it must match `user.storeId`; if no `storeId` in request, block.

So **department users** (typically no `storeId`) satisfy `!user.storeId` and **bypass** store checks — they can hit store-stock/store-sales without a storeId. If that’s not desired, backend would need an explicit “department vs store-admin” check (e.g. by `departmentType` or a separate role).

---

## 5. Frontend auth and role behavior

### 5.1 Customer

- Token: localStorage `customer-token` + `customer-refresh-token`; cookie also set by backend.
- Refresh: on 401, frontend tries refresh with `customer-refresh-token`; on success retries request; on failure clears tokens.

### 5.2 Admin / department

- **Login:** `api.login()` → `POST /auth/admin/login` → backend sets cookie; frontend saves `user` (including `departmentType`) in **Zustand** (`useAdminAuthStore`).
- **No** admin refresh token stored; cookie is the only credential. After 15 minutes the cookie is expired and the next request returns 401.
- **401 handling:** In `api.ts`, on 401 the interceptor only redirects to `/admin-login` when `window.location.pathname.startsWith('/admin')`. So:
  - **Admin panel** (`/admin/*`): 401 → redirect to `/admin-login`.
  - **Department** (`/department/*`): 401 → **no redirect**; request just fails. User should be redirected to department (or admin) login for consistency.

### 5.3 Routing by role and department

- **Admin layout** (`/admin/layout.tsx`):
  - If not authenticated → redirect to `/admin-login`.
  - If authenticated and `user.departmentType` is set → redirect to the matching department dashboard (e.g. `billing` → `/department/billing`) when the path is not already that department’s path. Then it **returns null** (no admin UI rendered), so department users never see the main admin panel.
- **Department layout** (`/department/layout.tsx`): Only checks `isAuthenticated`; if not, redirect to `/department-login`. No role or departmentType check.
- **Sidebar:** “Superadmin” nav (Logins, Stores, Analytics, etc.) is shown when `user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin')`. Department users never see the sidebar because the admin layout returns null for them.

---

## 6. Summary table (who can do what)

| Action | Customer | Admin (general) | Department (packing/billing/delivery) | Superadmin |
|--------|----------|-----------------|----------------------------------------|------------|
| Customer login/register, own cart/orders | ✅ | — | — | — |
| Admin login (cookie) | — | ✅ | ✅ (same endpoint) | ✅ |
| View admin panel (sidebar, dashboard) | — | ✅ | ❌ (redirect to department) | ✅ |
| View department dashboard | — | ✅ (if they go to /department/…) | ✅ (only their own) | ✅ |
| Orders: list, update status, delivery workflow | — | ✅ | ✅ (backend allows) | ✅ |
| Admin users CRUD, reset password | — | ❌ | ❌ | ✅ |
| Delete user (customer) | — | ❌ | ❌ | ✅ |
| Store-stock / store-sales | — | ✅ (store-scoped if storeId) | ✅ (no storeId → bypass StoreGuard) | ✅ |

---

## 7. Findings and recommendations

### 7.1 Working as intended

- Single admin login endpoint for both full admin and department users; `departmentType` in response drives frontend redirect and UI.
- Department users are blocked from seeing the main admin UI by layout (redirect + null).
- Orders and delivery workflow are allowed for role `admin`, so packing/billing/delivery can use their dashboards and APIs.
- Customer vs admin separation (JWT role, different guards) is clear.
- Superadmin-only actions (Logins, delete user, etc.) are protected by `@Roles('superadmin')`.

### 7.2 Gaps / improvements

1. **401 on department pages**  
   When a department user’s session expires on `/department/*`, the API returns 401 but the frontend does not redirect to login. **Recommendation:** In the 401 interceptor, also redirect to `/department-login` (or `/admin-login`) when `pathname.startsWith('/department')`.

2. **Admin session lifetime**  
   Access token is 15 minutes; admin refresh token is not used on the frontend. **Recommendation:** Either extend access token expiry for admin or implement frontend storage and use of admin refresh token so sessions can be renewed without re-login.

3. **JWT does not carry departmentType**  
   Backend cannot enforce “only packing can mark packed” etc. by JWT alone; it would need to load admin and check `departmentType` in a guard if you want backend enforcement. Currently enforcement is frontend-only (which dashboard they see).

4. **StoreGuard and department users**  
   Department users (no `storeId`) bypass StoreGuard and can call store-stock/store-sales without a store. If they should not have access to those at all, add a guard or check that excludes users with `departmentType` (or a dedicated role) from those controllers.

5. **Admin register**  
   `POST /auth/admin/register` is public and does not require superadmin. If only superadmins should create new admins, restrict registration (e.g. invite-only or superadmin-only create via `/admin/users`).

6. **Change password**  
   `POST /auth/change-password` is `@Roles('admin', 'superadmin')` and uses `userId` from JWT; department users can change their own password. No change needed unless you want to restrict to full admin only.

---

## 8. File reference

| Area | Backend | Frontend |
|------|---------|----------|
| Auth controller/service | `modules/auth/auth.controller.ts`, `auth.service.ts` | — |
| JWT strategy | `modules/auth/strategies/jwt.strategy.ts` | — |
| Guards | `common/guards/jwt-auth.guard.ts`, `roles.guard.ts`, `store.guard.ts` | — |
| Roles decorator | `common/decorators/roles.decorator.ts` | — |
| Admin user schema | `modules/admin/schemas/admin-user.schema.ts` | — |
| Admin CRUD (logins) | `modules/admin/admin.controller.ts` | `app/admin/logins/page.tsx` |
| Login / redirect | — | `app/admin-login/page.tsx`, `app/department-login/page.tsx` |
| Admin layout / redirect | — | `app/admin/layout.tsx`, `app/department/layout.tsx` |
| API client & 401 | — | `lib/api.ts` |
| Admin state | — | `lib/admin-store.ts` |
