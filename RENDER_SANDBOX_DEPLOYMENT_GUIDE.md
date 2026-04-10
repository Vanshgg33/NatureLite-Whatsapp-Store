# Render Sandbox Deployment Guide

This guide sets up the 360sandbox branch on Render without touching the live 360production deployment.

## 1. Branch model

Keep these branches separate:

- `360production` for live traffic and the production 360dialog API.
- `360sandbox` for development, testing, and the 360dialog sandbox API.

Do not commit sandbox credentials into production env vars.

## 2. What this branch is configured to use

The sandbox branch uses:

- `WHATSAPP_PROVIDER=360dialog_sandbox`
- `WHATSAPP_API_URL=https://waba-sandbox.360dialog.io`
- A separate MongoDB database
- Separate Render services for backend and frontend

The sandbox blueprint lives in [render.sandbox.yaml](render.sandbox.yaml).

## 3. Prerequisites

Before deploying, prepare these items:

1. A dedicated MongoDB database for sandbox data.
2. A 360dialog sandbox API key.
3. A webhook verify token for sandbox.
4. A sandbox frontend domain and backend domain on Render.
5. The `360sandbox` branch pushed to GitHub.

## 4. Create the Render services

1. Open Render and create a new Blueprint deployment.
2. Connect the GitHub repository.
3. Select the `360sandbox` branch.
4. Choose the sandbox blueprint file: [render.sandbox.yaml](render.sandbox.yaml).
5. Let Render create two services:
   - `store-backend-sandbox`
   - `store-frontend-sandbox`

## 5. Backend environment variables

Set these for `store-backend-sandbox`:

- `NODE_ENV=staging`
- `API_PREFIX=api/v1`
- `FRONTEND_URL=https://<sandbox-frontend-domain>`
- `MONGODB_URI=<sandbox-mongodb-connection-string>`
- `JWT_SECRET=<strong-random-secret>`
- `JWT_EXPIRES_IN=7d`
- `WHATSAPP_PROVIDER=360dialog_sandbox`
- `WHATSAPP_API_URL=https://waba-sandbox.360dialog.io`
- `WHATSAPP_D360_API_KEY=<sandbox-360dialog-api-key>`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN=<sandbox-webhook-token>`
- `WHATSAPP_APP_SECRET=`
- `CLOUDINARY_CLOUD_NAME=<...>`
- `CLOUDINARY_API_KEY=<...>`
- `CLOUDINARY_API_SECRET=<...>`
- `RAZORPAY_KEY_ID=<optional>`
- `RAZORPAY_KEY_SECRET=<optional>`
- `RAZORPAY_WEBHOOK_SECRET=<optional>`
- `SMTP_HOST=<...>`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=<...>`
- `SMTP_PASS=<...>`
- `SMTP_FROM=<...>`

Important:

- Do not reuse the production MongoDB URI.
- Keep `NODE_ENV=staging` so the backend does not trigger the production-only sandbox guard.

## 6. Frontend environment variables

Set these for `store-frontend-sandbox`:

- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://<sandbox-backend-domain>/api/v1`
- `NEXT_PUBLIC_SITE_URL=https://<sandbox-frontend-domain>`

Important:

- `NEXT_PUBLIC_*` values are baked into the Next.js build.
- If you change them, trigger a new deploy.

## 7. Configure the 360dialog sandbox webhook

After the backend is live:

1. Copy the Render backend domain, for example `https://store-backend-sandbox.onrender.com`.
2. Register the webhook URL in 360dialog sandbox:
   - `https://store-backend-sandbox.onrender.com/api/v1/whatsapp/webhook`
3. Use the same value that you set in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

If you need to run the webhook registration manually, send a POST request to:

- `https://waba-sandbox.360dialog.io/v1/configs/webhook`

## 8. Suggested first validation steps

1. Check the backend health endpoint:
   - `https://<sandbox-backend-domain>/api/v1/health`
2. Open the frontend sandbox URL.
3. Sign in to the admin dashboard.
4. Load dashboard, analytics, orders, and WhatsApp pages.
5. Send a test message through sandbox WhatsApp.
6. Confirm the message appears in the WhatsApp message log.

## 9. Keeping sandbox and production aligned

To keep sandbox useful:

1. Merge `origin/360production` into `360sandbox` regularly.
2. Test the merged result on Render sandbox.
3. Promote only code that passes sandbox checks into production.

## 10. If you need local fallback testing

Use the local examples in:

- [backend/.env.sandbox.example](backend/.env.sandbox.example)
- [frontend/.env.sandbox.example](frontend/.env.sandbox.example)

These mirror the Render sandbox values and help with local debugging.