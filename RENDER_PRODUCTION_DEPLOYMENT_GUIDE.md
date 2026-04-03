# Render Production Deployment Guide (Frontend + Backend + 360dialog)

This guide is calibrated for this repository and assumes:
- Render workspace is already created in the client-owned account.
- Code is in GitHub and you have admin access to the repo.
- You are deploying both frontend and backend on Render.
- WhatsApp provider is 360dialog production.

## 1. What Was Prepared In Code

The repo has been updated for Render production readiness:
- Added root Render blueprint: `render.yaml`
- Added backend health endpoint for Render checks: `GET /api/v1/health`
  - Files: `backend/src/health.controller.ts`, `backend/src/app.module.ts`
- Added 360dialog production provider support:
  - `WHATSAPP_PROVIDER=360dialog`
  - Files: `backend/src/config/configuration.ts`, `backend/src/modules/whatsapp/whatsapp.service.ts`
- Made frontend start script Render-compatible by using `PORT`:
  - File: `frontend/package.json`
- Expanded env templates with production examples:
  - Files: `backend/.env.example`, `frontend/.env.example`

## 2. Pre-Deployment Checklist (GitHub + VS Code)

1. In VS Code terminal, verify builds:

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

2. Commit and push all deployment-prep changes:

```bash
git add .
git commit -m "Prepare Render production deployment and 360dialog production support"
git push origin <your-branch>
```

3. Merge to your production branch (usually `main`) after review.

## 3. External Services To Create Before Render Deploy

Create and collect credentials first:

1. MongoDB Atlas
- Create production cluster.
- Create DB user and password.
- Add network access:
  - Temporarily `0.0.0.0/0` for first deploy, then tighten later.
- Copy connection string for `MONGODB_URI`.

2. Cloudinary
- Collect: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

3. Razorpay
- Collect live keys and webhook secret.

4. SMTP provider
- Collect host, port, username, password, from-name/address.

5. 360dialog production
- Collect API key.
- Confirm production API base URL (typical: `https://waba-v2.360dialog.io`).
- Keep your webhook verify token ready.

## 4. Render Deployment Structure

Use one workspace and one project with one environment initially:

- Workspace: client production workspace
- Project: `store-production` (name can vary)
- Environment: `production`
- Services:
  - `store-backend` (Web Service)
  - `store-frontend` (Web Service)

## 5. Deploy On Render (Two Methods)

## Method A (Recommended): Blueprint (`render.yaml`)

1. In Render dashboard:
- New > Blueprint
- Connect GitHub repo
- Select production branch
- Render detects `render.yaml`

2. Review services that will be created:
- `store-backend`
- `store-frontend`

3. Set required secret env vars when prompted (all `sync: false` entries).

4. Click Apply.

## Method B: Manual Service Creation

If you do not want Blueprint now, create services manually.

### Backend service
- Type: Web Service
- Root directory: `backend`
- Build command: `npm ci && npm run build`
- Start command: `npm run start:prod`
- Health check path: `/api/v1/health`

### Frontend service
- Type: Web Service
- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Start command: `npm run start`

## 6. Environment Variables (Exact)

## Backend (`store-backend`)

Required:
- `NODE_ENV=production`
- `API_PREFIX=api/v1`
- `PORT` (Render auto-provides)
- `FRONTEND_URL=https://<frontend-domain>`
- `MONGODB_URI=<atlas-connection-string>`
- `JWT_SECRET=<strong-secret>`
- `JWT_EXPIRES_IN=7d`
- `WHATSAPP_PROVIDER=360dialog`
- `WHATSAPP_API_URL=https://waba-v2.360dialog.io`
- `WHATSAPP_D360_API_KEY=<360dialog-api-key>`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN=<strong-random-token>`
- `WHATSAPP_APP_SECRET=<if used in your flow, else keep blank>`
- `CLOUDINARY_CLOUD_NAME=<...>`
- `CLOUDINARY_API_KEY=<...>`
- `CLOUDINARY_API_SECRET=<...>`
- `RAZORPAY_KEY_ID=<live-key-id>`
- `RAZORPAY_KEY_SECRET=<live-key-secret>`
- `RAZORPAY_WEBHOOK_SECRET=<webhook-secret>`
- `SMTP_HOST=<...>`
- `SMTP_PORT=<...>`
- `SMTP_SECURE=<true|false>`
- `SMTP_USER=<...>`
- `SMTP_PASS=<...>`
- `SMTP_FROM=<...>`

Optional but useful:
- `THROTTLE_TTL=60`
- `THROTTLE_LIMIT=100`

## Frontend (`store-frontend`)

Required:
- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://<backend-domain>/api/v1`
- `NEXT_PUBLIC_SITE_URL=https://<frontend-domain>`

Important:
- For Next.js, `NEXT_PUBLIC_*` values are embedded at build time. After changing them, trigger a redeploy.

## 7. Domain and DNS Setup

1. Backend domain
- Add custom domain to backend service, e.g. `api.yourdomain.com`
- Update DNS as Render instructs.

2. Frontend domain
- Add custom domain to frontend service, e.g. `yourdomain.com` and `www.yourdomain.com`
- Update DNS records from Render instructions.

3. After DNS propagates:
- Update `FRONTEND_URL` in backend to final frontend domain(s).
- If multiple origins are needed, use comma-separated values.

## 8. 360dialog Production Webhook Setup

In 360dialog production dashboard/config:

1. Webhook URL:
- `https://api.yourdomain.com/api/v1/whatsapp/webhook`

2. Verify token:
- Must match `WHATSAPP_WEBHOOK_VERIFY_TOKEN` set in backend env.

3. Save and trigger verification.

4. Confirm webhook responses:
- GET verification should return challenge.
- POST webhook should return `200 OK`.

## 9. Post-Deploy Validation

Run these checks after both services are live:

1. Backend health:
- `https://api.yourdomain.com/api/v1/health` returns JSON with `ok: true`.

2. Frontend load:
- Open production frontend domain.

3. Frontend-to-backend wiring:
- Login API call succeeds from frontend.

4. CORS/CSRF:
- Mutating requests from frontend do not get `403 CSRF validation failed`.

5. WhatsApp inbound:
- Send test message to connected number, confirm webhook hit in backend logs.

6. WhatsApp outbound:
- Trigger template/text send from admin and verify delivery/logs.

## 10. Common Issues and Fast Fixes

1. Backend fails to start in production
- Check `JWT_SECRET` and `FRONTEND_URL` are set.
- The app intentionally fails fast when missing.

2. Frontend calling localhost in production
- `NEXT_PUBLIC_API_URL` not set before build.
- Set value and redeploy frontend.

3. 360dialog messages fail
- Verify `WHATSAPP_PROVIDER=360dialog`
- Verify `WHATSAPP_API_URL` and `WHATSAPP_D360_API_KEY`
- Confirm template approval and destination eligibility.

4. Webhook verification fails
- Verify token mismatch between 360dialog and backend env.
- Check exact webhook URL path includes `/api/v1/whatsapp/webhook`.

5. CSRF/CORS errors
- Ensure backend `FRONTEND_URL` includes the exact frontend origin in use.

## 11. Recommended First Hardening After Go-Live

1. Tighten Atlas IP allowlist from open access.
2. Add log drain and error monitoring (Sentry or equivalent).
3. Add staging environment in same project.
4. Enable protected environment controls in Render for production.
5. Rotate all provisional secrets used during setup.
