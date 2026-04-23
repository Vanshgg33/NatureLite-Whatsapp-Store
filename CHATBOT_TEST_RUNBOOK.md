# Chatbot Test Runbook (Local + Render)

This runbook gives a repeatable way to verify the UCM + WhatsApp chatbot flow in two stages:

1. Local and sandbox-safe checks.
2. Render live checks.

## 1. What You Can Run Right Now

### Backend smoke checks (local)

From backend:

```bash
npm run test
npm run test:cov
npm run test:smoke
```

Notes:
- `test` and `test:cov` now pass even when no Jest spec files exist yet.
- `test:smoke` validates health and optionally verifies webhook/auth/UCM endpoints.

Optional authenticated smoke check:

```bash
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD='your-password' \
WHATSAPP_WEBHOOK_VERIFY_TOKEN='your-token' \
BASE_URL='http://localhost:7001/api/v1' \
npm run test:smoke
```

### Frontend build and lint checks

From frontend:

```bash
npm run lint
npm run build
```

## 2. Local End-to-End Bringup

### Terminal A (backend)

```bash
cd backend
cp .env.sandbox.example .env
npm install
npm run start:dev
```

### Terminal B (frontend)

```bash
cd frontend
cp .env.sandbox.example .env.local
npm install
npm run dev
```

### Quick API check

```bash
curl -s http://localhost:7001/api/v1/health
```

Expected: JSON with `ok: true`.

## 3. Render Sandbox Checks

### Deploy

- Use `render.sandbox.yaml` on branch `360sandbox`.
- Confirm env vars are set in Render (including catalog vars if you want live Meta sync tests):
  - `CATALOG_API_URL`
  - `CATALOG_BUSINESS_ID`
  - `CATALOG_ACCESS_TOKEN`

### Post-deploy smoke check from your machine

```bash
cd backend
BASE_URL='https://store-backend-sandbox.onrender.com/api/v1' \
WHATSAPP_WEBHOOK_VERIFY_TOKEN='your-token' \
ADMIN_EMAIL='admin@example.com' \
ADMIN_PASSWORD='your-password' \
npm run test:smoke
```

## 4. Chatbot Message Verification (Real User Flow)

After backend deploy + webhook configuration:

1. Ensure webhook URL is configured in 360dialog sandbox:
   - `https://<your-backend-domain>/api/v1/whatsapp/webhook`
2. Open admin dashboard and confirm products exist.
3. In UCM page, keep `dry_run` mode for sandbox-safe testing.
4. Send a WhatsApp message from a test phone to your connected number.
5. Confirm:
   - inbound webhook is logged,
   - chatbot replies,
   - product/category flow is visible.

## 5. Live Catalog Validation (Meta mode)

Only after these values are available:

- `CATALOG_BUSINESS_ID`
- `CATALOG_ACCESS_TOKEN` (with catalog permissions)
- selected catalog ID to keep

Steps:

1. Set env vars in backend service.
2. In admin UCM page, set `syncMode=meta` and select the target catalog.
3. Run a manual sync from UCM page.
4. Send a WhatsApp product/catalog interaction and confirm chatbot resolves the selected product in chat.

## 6. Suggested CI Test Command Set

Use this on both sandbox and production branches:

### Backend

```bash
npm run build
npm run test
npm run test:cov
```

### Frontend

```bash
npm run lint
npm run build
```
