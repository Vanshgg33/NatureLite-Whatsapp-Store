# Caller Command Center: Phase 0 audit

Source: `docs/NatureLite_Caller_Command_Center_Blueprint.pdf` (22 Nov 2026), checked against the repo.

## How the stack really works (blueprint assumed otherwise)

| Blueprint assumption | Reality | Decision |
|---|---|---|
| Next.js route handlers `/api/crm/*` | Separate NestJS backend (`backend/src/modules/crm`), frontend calls it via `lib/api.ts` | New endpoints live in NestJS under `/crm/caller/*` |
| Cron route `/api/cron/reminders` called externally | `@nestjs/schedule` already in use (`@Cron` in `crm-engine.service.ts`) | Reminder tick is an in-process `@Cron` every minute |
| SSE stream | API auth is a Bearer header; `EventSource` cannot send headers | Polling every 5 s (blueprint's own fallback) |
| Consent module | `/crm/admin/compliance` is a "coming soon" page; no consent data exists | Use `doNotCall`, `phoneInvalid`, `isDismissed` and open complaints as the call guard |
| Separate leaderboard | `/crm/leaderboard` and `/crm/analytics` already exist | Live Board has its own points leaderboard; existing pages stay |

## Existing models and how the blueprint maps onto them

| Blueprint model | Existing model | Mapping |
|---|---|---|
| Customer stage / nextActionAt / doNotCall | `CrmCustomerStats` (per customer: segment, priorityScore, assignedAgentId, callAttempts, consecutiveNoAnswer, callbackAt, snoozedUntil, lastCallOutcome, isDismissed, phoneInvalid) | Reuse. `snoozedUntil` = next action date; add `doNotCall` |
| CallSession | `CrmCallLog` (customerId, agentId, outcome, notes, callbackAt, istDate, recording) | Extend with startedAt, durationSec, wrapSec, mode, attemptNo, score, flagged; add outcomes busy / switched_off / call_dropped / interested / wrong_number / complaint / unlogged |
| LiveEvent | `CrmActivityEvent` (employeeId, at, istDate, hourIST, type, customerId, meta) | Reuse for call_start / call_end / wa_sent / shift events |
| CRMSettings additions | `CrmSettings` (single doc) | Add `caller` object: score weights, ladder, calling hours, targets |
| CallerShift, LeadAssignment, Reminder | none | New collections (`crm-caller.schemas.ts`) |
| CallerPoints | none | Computed from call logs + reminders on read (no extra writes to drift) |

## Auth and roles

- `JwtAuthGuard` → `RolesGuard` (`@Roles('admin','superadmin')` on `CrmController`) → `AccessGuard` (`@RequireAccess('admin.<page>.<action>')`, any-of; superadmin and staff without an access role are unrestricted).
- CRM departments: `crm_head`, `crm_manager`, `crm_senior` (callers), `crm_viewer`.
- Caller = `crm_senior`. Manager = everyone else with CRM access except `crm_viewer`.

## How calls, WhatsApp and callbacks work today

- `POST /crm/calls` → `CrmService.logCall`: writes `CrmCallLog`, sets `lastCallAt/lastCallOutcome`, refreshes engine.
- WhatsApp from CRM: `POST /crm/nudge` → `CrmService.logNudge` → `WhatsAppService.sendTextMessage` + a `type:'whatsapp'` call log.
- Heartbeat: `POST /crm/heartbeat` every 60 s from `CrmShell` → activity event; `/crm/admin/live` shows the last 5 minutes.
- Callbacks page reads `CrmCustomerStats.callbackAt`.

## Bugs found during the audit (fixed in this work)

1. **Callbacks were never saved.** `logCall` stored `callbackAt` on the call log only; the Callbacks page and the queue's Callbacks tab read it from customer stats, so they were always empty.
2. **`callAttempts` / `consecutiveNoAnswer` were never written** although the schema, queue and chatbot read them.
3. **CRM managers and viewers were locked out of every CRM endpoint.** `RolesGuard` only exempted `crm_head` / `crm_senior` from the department handler whitelist, though the CRM code expects managers (e.g. `requireCrmAdmin`).
4. A "Callback" outcome could be saved with no callback time.

## Existing UI reused

`CrmShell` (nav, heartbeat), `nav.config.ts`, `CustomerAvatar`, `Pill`, `LogCallPanel` (queue + profile), `ReportPage/DataTable`, CRM CSS tokens (`--crm-forest`, `--crm-gold`, `--crm-sand` …), recharts, framer-motion.
