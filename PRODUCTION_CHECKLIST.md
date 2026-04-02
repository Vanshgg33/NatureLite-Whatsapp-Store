# Production Checklist

This checklist is written for this repository and should be completed before public launch.

## 1. Environment and Secrets

- [ ] Move all secrets out of local `.env` files into a secret manager (Vercel/Render/AWS SSM/Secrets Manager).
- [ ] Rotate all previously exposed keys (MongoDB, JWT, Cloudinary, Razorpay, Gemini, Interakt, 360dialog).
- [ ] Set strong production `JWT_SECRET` (minimum 32 bytes random).
- [ ] Set production `FRONTEND_URL` to your real admin/public domain(s), comma-separated if multiple origins.
- [ ] Keep `NODE_ENV=production` in production backend.
- [ ] For production WhatsApp provider, replace sandbox settings with production provider credentials.

## 2. Infrastructure Baseline

- [ ] Backend hosted on long-running service (Render/Railway/Fly/AWS ECS).
- [ ] Frontend hosted on Vercel (or equivalent) with custom domain and TLS.
- [ ] MongoDB Atlas production cluster created with backup and PITR enabled.
- [ ] Redis provisioned if queue/caching paths are used.
- [ ] CDN/WAF configured (Cloudflare recommended).
- [ ] Healthcheck endpoint monitored for backend availability.

## 3. Database and Data Safety

- [ ] Apply IP allowlist and DB user least privilege in MongoDB Atlas.
- [ ] Enable daily backup with retention policy.
- [ ] Define restore runbook and test at least one restore drill.
- [ ] Add production indexes review for heavy collections (orders, message logs, products).
- [ ] Seed only required production defaults (settings, stores, admin roles).

## 4. Authentication and Access Control

- [ ] Verify all admin/superadmin endpoints require auth and role guards.
- [ ] Enforce password policy for admin users.
- [ ] Confirm cookie flags in production (`HttpOnly`, `Secure`, proper `SameSite`).
- [ ] Restrict department accounts to department routes only.
- [ ] Set account lock/rate-limit policy for repeated login failures.

## 5. Module-by-Module Validation

### Auth and Users
- [ ] Admin register/login/logout/profile refresh flow works.
- [ ] Customer auth flows (OTP/email) verified if enabled.
- [ ] User block/unblock and role updates audited.

### Products and Categories
- [ ] CRUD, image upload, SKU uniqueness, stock thresholds.
- [ ] Variant pricing/stock updates validated.

### Cart and Checkout
- [ ] Add/update/remove cart items including variants.
- [ ] Coupon validation with all rule types.
- [ ] Shipping charge thresholds and GST calculations verified.

### Orders and Store Operations
- [ ] Order create, status transitions, notes, cancellation, returns.
- [ ] Store stock decrement/increment paths validated.
- [ ] Store sales and dashboard metrics match order events.

### Payments
- [ ] Razorpay order creation and verification in production mode.
- [ ] Payment webhook signature validation tested.
- [ ] Wallet debit/credit/reversal reconciliation tested.

### WhatsApp and Chatbot
- [ ] Production webhook reachable over stable HTTPS domain.
- [ ] Inbound message events processed and persisted.
- [ ] Outbound sends (text/template/interactive) verified.
- [ ] Chatbot order creation path verified against real inventory.
- [ ] Admin WhatsApp conversation page shows message logs correctly.

### Notifications, Email, Reminders
- [ ] Template sends and fallback behavior tested.
- [ ] SMTP delivery and bounce handling validated.
- [ ] Reminder scheduling and execution validated.

### Analytics, Feedback, Audit
- [ ] Dashboard metrics align with source data.
- [ ] Audit logs present for privileged actions.
- [ ] Feedback moderation flow tested.

## 6. Observability and Operations

- [ ] Centralized structured logs enabled (backend + frontend).
- [ ] Error tracking configured (Sentry or equivalent).
- [ ] Uptime monitoring + alert channels configured.
- [ ] Dashboards for API latency, error rates, and webhook failures.
- [ ] On-call and escalation owner assigned.

## 7. Performance and Reliability

- [ ] Load test critical APIs (auth, products, cart, orders, webhook).
- [ ] Verify p95 latency targets under expected load.
- [ ] Enable autoscaling or vertical headroom.
- [ ] Tune rate limits for abusive paths.
- [ ] Confirm graceful restart and zero-downtime deploy strategy.

## 8. Security and Compliance

- [ ] Run dependency audit and patch critical CVEs.
- [ ] Verify CORS/CSRF behavior with production domains.
- [ ] Validate input sanitization and request validation on all endpoints.
- [ ] Ensure no credentials are committed to git history.
- [ ] Document privacy policy, data retention, and deletion process.

## 9. Release Readiness Gates

- [ ] All critical and high bugs closed.
- [ ] UAT sign-off from business team.
- [ ] Rollback procedure tested.
- [ ] Production smoke tests scripted and repeatable.
- [ ] Launch communication and support channel prepared.
