# Staged Rollout Plan

This rollout minimizes risk by increasing real traffic gradually with explicit go/no-go gates.

## Stage 0: Production Prep (Internal)

Duration: 3-7 days

Goals
- Finalize infra, secrets, domains, monitoring.
- Complete all items in `PRODUCTION_CHECKLIST.md`.

Entry Criteria
- Production infra provisioned.
- Environment variables set in host platforms.
- Database backup/restore tested.

Exit Criteria
- Build + deploy pipeline green.
- Smoke tests pass on production-like environment.

Rollback
- Stop promotion to Stage 1.
- Keep traffic on current stable environment.

## Stage 1: Internal Team Pilot

Duration: 2-4 days

Traffic Scope
- Internal users only (admins, operations team).
- Limited real orders and WhatsApp interactions.

What to Validate
- Admin login/session stability.
- Product/order workflows end-to-end.
- WhatsApp inbound/outbound and chatbot order path.
- Payment webhook and order status reconciliation.

Success Metrics
- Error rate < 2% on critical APIs.
- No payment/order data mismatches.
- No P1/P2 incidents.

Rollback Trigger
- Any data integrity issue.
- Repeated payment/webhook failures.

## Stage 2: Soft Launch (5-10% Controlled Customers)

Duration: 3-7 days

Traffic Scope
- Limited customer cohort by invite, region, or campaign.
- Controlled daily order volume.

What to Validate
- Real customer journeys across catalog -> order -> delivery updates.
- Customer support load and response process.
- Scalability of dashboards, stock updates, analytics lag.

Success Metrics
- p95 API latency within target.
- Critical funnel completion rate acceptable.
- Stable WhatsApp delivery/read event processing.

Rollback Trigger
- Sustained elevated error/latency.
- Business KPI regression beyond threshold.

## Stage 3: Expanded Launch (25-50%)

Duration: 3-5 days

Traffic Scope
- Broader customer access with active monitoring.

What to Validate
- Capacity under higher concurrency.
- Queue/backlog behavior for reminders/notifications.
- Support + operations throughput.

Success Metrics
- No critical incidents for 48h.
- On-call alerts within normal thresholds.

Rollback Trigger
- Critical incident frequency above agreed threshold.

## Stage 4: Full Launch (100%)

Duration: Ongoing

Actions
- Open access to full audience.
- Keep launch war-room active for first 72 hours.
- Daily metric review and incident review.

Post-Launch Hardening (Week 1-2)
- Performance tuning from real traffic patterns.
- Cost optimization for infra and third-party APIs.
- Backlog triage for non-critical defects.

## Operational Runbook During Rollout

- Keep one release owner and one incident commander per shift.
- Freeze non-critical feature releases during Stage 2-4.
- Use canary deploys for backend changes.
- Verify webhook health after each deploy.
- Maintain rollback command list and last-known-good release tag.

## Recommended Production Hosting Topology

- Frontend: Vercel + custom domain.
- Backend: Render/Railway/Fly (or AWS ECS Fargate for stricter control).
- Database: MongoDB Atlas.
- Optional cache/queue: Redis Cloud.
- Edge/WAF/DNS: Cloudflare.
- Monitoring: Sentry + uptime checks + log aggregation.
