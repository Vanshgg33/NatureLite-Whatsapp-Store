# Production Audit - Phase 2

This document captures the second-pass production hardening work completed in code.

## Fixes Implemented

### 1. WhatsApp admin message log fetch path fixed

Issue
- Backend endpoint expected `phone` path param but controller used query param, causing empty/incorrect conversation fetch.

Fix
- `backend/src/modules/whatsapp/whatsapp.controller.ts`
- Updated `getMessageLogs` to use `@Param('phone')`.

### 2. WhatsApp direction compatibility fixed

Issue
- Backend stores message direction as `inbound/outbound` while frontend expected `incoming/outgoing`.

Fix
- `frontend/src/app/admin/whatsapp/page.tsx`
- Added compatibility mapping so UI handles both formats.
- `frontend/src/types/index.ts`
- Expanded `MessageLog.direction` union to include all four values.

### 3. Frontend metadata production base configured

Issue
- Next.js warned about missing metadata base in production builds.

Fix
- `frontend/src/app/layout.tsx`
- Added `metadataBase` from `NEXT_PUBLIC_SITE_URL` fallback.

### 4. Frontend API fallback hardened

Issue
- Frontend had hardcoded deployed API fallback, risky for production correctness and environment drift.

Fix
- `frontend/src/lib/api.ts`
- Replaced fallback with local explicit fallback: `http://localhost:7001/api/v1`.
- Production now expected to always set `NEXT_PUBLIC_API_URL`.

### 5. Backend production fail-fast config validation

Issue
- App could boot in production with unsafe defaults (missing frontend URL or default JWT secret).

Fix
- `backend/src/main.ts`
- Added `validateProductionConfig`:
  - fails startup if `FRONTEND_URL` missing in production
  - fails startup if `JWT_SECRET` is default/empty in production
  - fails startup if `WHATSAPP_PROVIDER=360dialog_sandbox` in production

### 6. Environment templates improved

Fixes
- `frontend/.env.example` added with required production-facing vars.
- `backend/.env.example` updated with `MONGODB_URL` alias and explicit production notes.

## Build Verification

- Backend build: passed (`npm run build`)
- Frontend build: passed (`npm run build`)

## Remaining Production Risks (Not Yet Code-Completed)

- OTP delivery is currently in-memory/non-SMS for customer auth and needs real provider integration.
- Payment and WhatsApp production providers require separate real credentials and webhook UAT.
- Full module UAT and load/perf validation are still required before 100% rollout.
- Observability stack (Sentry/log aggregation/alerts) must be wired in production infra.
