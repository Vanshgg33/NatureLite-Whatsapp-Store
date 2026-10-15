# Billing–CRM Interconnection Design

**Date:** 2026-10-10

## Overview

Billing (`BillingBill`) and CRM (`CrmCustomerStats`) already exist. They share the `User` model for contacts. The gap is purchase history: the CRM engine reads only `Order` (WhatsApp store), so in-store billing sales are invisible. A customer who buys exclusively in-store appears as `no_orders` in CRM — wrong LTV, wrong segment, wrong nudge priority.

This spec covers the minimal backend wiring to unify both purchase channels in CRM with real-time sync from billing events.

---

## Requirements

1. Any bill created in the billing system triggers an immediate CRM stats refresh for that customer.
2. Any new contact (customer) created in billing is immediately visible in CRM.
3. CRM segments, LTV, AOV, and predicted reorder date are computed from both `Order` (WhatsApp) and `BillingBill` (in-store) purchase history combined.
4. WhatsApp nudges are shared: the existing CRM nudge endpoint is reused by the billing UI — no new backend code.
5. Billing-specific features (bill generation, GSTR, party/item reports) remain in the billing module and have no CRM equivalent.

---

## Architecture

### Shared foundation (no change)

Both modules read the `User` collection for customer identity. Contact sync is already live — creating a customer in billing creates a `User` record which CRM reads on its next refresh.

### Change 1 — CRM engine reads BillingBill

**File:** `backend/src/modules/crm/crm-engine.service.ts`  
**File:** `backend/src/modules/crm/crm.module.ts`

`CrmEngineService.refreshUser` currently aggregates from `Order` (status: `delivered`). We add a second aggregation from `BillingBill` (status: `active`) for the same `customerId`. Results are merged and sorted descending by `createdAt` before the existing LTV/segment/cycle logic runs.

BillingBill items carry `name` and `qty` but no `categoryName`. They are mapped to the same `OrderForCycle` shape with `categories: []`. The cycle resolver already handles empty categories by falling back to the configured fallback cycle — no logic change needed.

LTV is the sum of `grandTotal` across all rows (Orders + Bills). AOV, segment, reorder prediction, VIP, and priority all derive from this unified row array — no changes to those functions.

`CrmModule` registers `BillingBill` schema in its own `MongooseModule.forFeature`. It does **not** import `BillingModule`, avoiding a circular dependency.

### Change 2 — Billing triggers CRM refresh

**File:** `backend/src/modules/billing/billing.service.ts`  
**File:** `backend/src/modules/billing/billing.module.ts`

After `createBill` succeeds, fire-and-forget `engine.refreshUser(customerId)`.  
After `createCustomer` succeeds, fire-and-forget `engine.refreshUser(newUser._id)`.

`BillingService` receives `CrmEngineService` via constructor injection. `BillingModule` imports `CrmModule` (which already exports `CrmEngineService`). Dependency direction: Billing → CRM only. No circular dep.

### Change 3 — WhatsApp nudges (no backend change)

`CrmService.logNudge` is already exposed at `POST /crm/customers/:id/nudge`. The billing frontend calls this endpoint. No new code.

---

## Data Flow

```
In-store sale (BillingModule)
  └─ createBill()
       ├─ writes BillingBill
       ├─ increments User.outstanding
       └─ [fire & forget] CrmEngineService.refreshUser(customerId)
                               ├─ aggregates Order (WhatsApp history)
                               ├─ aggregates BillingBill (in-store history)
                               ├─ merges + sorts by date
                               └─ upserts CrmCustomerStats

New contact (BillingModule)
  └─ createCustomer()
       ├─ writes User
       └─ [fire & forget] CrmEngineService.refreshUser(newUser._id)
                               └─ upserts CrmCustomerStats (no_orders segment)

WhatsApp nudge (shared)
  └─ POST /crm/customers/:id/nudge  ← billing UI calls this directly
```

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/modules/crm/crm.module.ts` | Add `BillingBill` schema to `MongooseModule.forFeature` |
| `backend/src/modules/crm/crm-engine.service.ts` | Inject `BillingBill` model; merge billing rows in `refreshUser` |
| `backend/src/modules/billing/billing.module.ts` | Import `CrmModule` |
| `backend/src/modules/billing/billing.service.ts` | Inject `CrmEngineService`; fire refresh after `createBill` and `createCustomer` |

No new files. No schema changes. No frontend changes.

---

## What's Out of Scope

- Billing-side nudge endpoint — billing UI reuses the CRM endpoint; add a billing-namespaced one only if payload shapes diverge.
- Cross-view UI (seeing CRM segments inside the billing screen) — separate UI task.
- Double-count guard — WhatsApp orders and billing bills are separate purchase flows; the same transaction will not appear in both collections.
- Cancellation sync — when a bill is cancelled (`status: cancelled`), it is already excluded from the BillingBill query (`status: active`). No extra handling needed.
