# Caller Command Center

Spec: `docs/NatureLite_Caller_Command_Center_Blueprint.pdf`. Mapping to the existing code: `docs/CALLER_AUDIT.md`.

## Where things are

| Piece | Code |
|---|---|
| Decisions (score, attempt ladder, snake deal, 11 modes, points/badges) | `backend/src/modules/crm/engine/caller-logic.ts` (+ spec) |
| Shifts, distribution, queue, calls, reminders, live numbers, minute tick | `backend/src/modules/crm/crm-caller.service.ts` (+ spec) |
| API `/crm/caller/*` | `backend/src/modules/crm/crm-caller.controller.ts` |
| New collections | `crmcallershifts`, `crmleadassignments`, `crmreminders` (`schemas/crm-caller.schemas.ts`) |
| Cockpit | `/crm/caller` |
| My Day | top of `/crm` (Today) + `/crm/caller/day?view=…` |
| Live Board / day report | `/crm/live`, `/crm/live/report` (managers) |
| Reminders | bell on every CRM page, `/crm/callbacks`, customer profile card |
| Tuning | CRM Settings → Calling (stored in `crmsettings.caller`) |

## How a day runs

1. A caller (Senior Agent) presses **Start shift**. The first caller in builds today's list; each later caller triggers a rebalance of untouched leads. Managers can also press **Distribute today** / **Rebalance** on the Live Board (with a preview).
2. The cockpit serves one lead at a time (atomic claim, so two callers never get the same customer). **Call** starts the timer and dials; **Hung up** starts wrap-up; an **outcome** is required before the next lead loads.
3. Each outcome goes through the attempt ladder: retry slots, callbacks with reminders, follow-ups, parking, wrong-number removal, complaint alerts. The second miss in a row auto-sends the "missed you" WhatsApp.
4. A minute job fires reminders, escalates callbacks 30 min late, auto-closes calls left open 30 min ("Unlogged"), and raises alerts: shift not started, idle, behind pace, untouched leads at day end.
5. Unworked leads roll over to the next day with +10 score.

## Seed data and a manual test

```
cd backend
MONGODB_URI=<a test database> SEED_CALLER_DEMO=yes node scripts/seed-caller-demo.js 500
# …test…
MONGODB_URI=<same> SEED_CALLER_DEMO=yes node scripts/seed-caller-demo.js --clean
```

1. Log in as two Senior Agents in two browsers; both press **Start shift** → each gets roughly half; the Live Board shows both cards.
2. Caller A: Call → Hung up → **Callback** "In 1 h" → the lead shows in `/crm/callbacks` and the bell; the next lead loads.
3. Caller A: No answer twice on one lead (across two days) → "missed you" WhatsApp in the call history.
4. Close caller B's tab → the Live Board shows Offline within about 60 s.
5. A third caller starts a shift → only untouched leads move to them.
6. Live Board: Force mode, Pull more, Reassign, Pause, Duel, TV mode, and a click on a distribution segment opens the list.

## Known limits

- Live updates poll every 5 s (Live Board) / 15–30 s (My Day, bell). Server-Sent Events were not used because the API's Bearer token cannot be sent by `EventSource`.
- Call times come from the cockpit timer, not from telephony. A cloud-telephony webhook could later feed `calls/start` / `calls/end`.
- There is no consent module yet. The call guard uses do-not-call, wrong-number, dismissed and open-complaint flags.
- Free-text WhatsApp (missed you, warm-up, quick-send) only reaches customers inside WhatsApp's 24-hour window. Outside it, Meta needs approved templates, the same limit as the existing CRM nudge.
- The day-close report is on screen (`/crm/live/report`, CSV export); it is not auto-sent by WhatsApp or email.
- The minute job runs inside the API process; with more than one API instance, every instance would run it. Alerts are de-duplicated by key, but keep one instance.
- Callers are users with department **Senior Agent** (`crm_senior`). Shift hours are not stored, so leads are split evenly.
