# NatureLite CRM — Design Spec
_2026-09-20_

## Overview

A repurchase-prediction engine with a CRM shell, built as a separate entity at `/crm` — same pattern as `/billing`. Every customer silently generates a reorder due date when they place an order; the CRM makes that signal visible as a daily prioritised call queue for agents.

---

## 1. Data Architecture

### Reused (no changes)

| Collection | What we use |
|---|---|
| `User` | CRM customer — `totalOrders`, `totalSpent`, `lastOrderAt`, `tags`, `notes`, phone |
| `Order` | Full item history for repurchase math |
| `Product` / `Category` | Top-product / top-category calculation |
| `AdminUser` | Agents (`crm_senior`) and managers (`crm_head`) — already in enum |
| WhatsApp module | One-click sends |
| Notifications module | Task-due alerts |

### New collections (3)

**`CrmCustomerStats`**
```
userId            ObjectId ref User  (unique index)
segment           enum: New|Active|Due Soon|Overdue|At Risk|Dormant|Lost
isVip             boolean
predictedReorderDate  Date
personalCycle     number (days)
topCategory       string
topProduct        string
ltv               number
aov               number
priorityScore     number
assignedAgentId   ObjectId ref AdminUser (nullable)
lastCallAt        Date
lastCallOutcome   enum: connected|no_answer|ordered|not_interested|callback
updatedAt         Date

Indexes: segment, predictedReorderDate, assignedAgentId, priorityScore
```

**`CrmCallLog`**
```
customerId        ObjectId ref User
agentId           ObjectId ref AdminUser
outcome           enum: connected|no_answer|ordered|not_interested|callback
notes             string
callbackAt        Date (optional — set when outcome=callback)
createdAt         Date
```

**`CrmCampaign`**
```
name              string
segmentFilter     string[] (segments to include)
waMessage         string
status            enum: draft|approved|sent
createdBy         ObjectId ref AdminUser
approvedBy        ObjectId ref AdminUser
recipientCount    number
sentAt            Date
createdAt         Date
```

**`CrmSettings`** (single document, upserted)
```
reorderCycles     Record<category, days>  — configurable defaults per category
updatedAt         Date
```

Default cycles:
```
Oils (Wood-Pressed): 32
Oils (Cold-Pressed): 20
Ghee: 50
Flours: 22
Pulses: 28
Spices: 45
Snacks: 18
```

---

## 2. Repurchase Engine

Runs in `CrmEngineService`. Triggered by:
1. Order status change to `delivered`/`completed` (existing order update flow hooks in)
2. Nightly cron `0 2 * * *` (full refresh of all users)

**Per-customer algorithm:**

```
1. Pull all completed orders for user, sort by createdAt desc
2. totalOrders, ltv, aov, lastOrderDate, daysSinceLast
3. topCategory = category with highest cumulative qty across all items
   topProduct  = product with highest cumulative qty
4. personalCycle:
     if totalOrders >= 3: median of gaps between consecutive orders
     else: DEFAULT_CYCLES[topCategory] from CrmSettings
5. predictedReorderDate = lastOrderDate + personalCycle
6. daysOverdue = today - predictedReorderDate
7. segment:
     totalOrders == 1 && daysOverdue < 0       → New
     totalOrders >= 2 && daysOverdue < -3      → Active
     daysOverdue in [-3, 0)                    → Due Soon
     daysOverdue in [0, 30)                    → Overdue
     daysOverdue in [30, 90)                   → At Risk
     daysOverdue in [90, 180)                  → Dormant
     daysOverdue >= 180                        → Lost
8. isVip: top 10% by ltv across all users (computed at full refresh only)
9. priorityScore = daysOverdue + (ltv/1000) + (isVip ? 50 : 0) - (lost ? 999 : 0)
10. Upsert CrmCustomerStats document
```

**Retarget queue query:**
```ts
CrmCustomerStats.find({
  assignedAgentId: agentId,  // omit for manager/admin
  segment: { $in: ['Due Soon', 'Overdue', 'At Risk'] }
}).sort({ priorityScore: -1 })
```

"Due Today" = Overdue entries where `daysOverdue === 0` — frontend filter, no separate bucket.

---

## 3. Backend Module

```
backend/src/modules/crm/
  crm.module.ts
  crm.controller.ts
  crm-engine.service.ts   ← repurchase math, segment logic, VIP calc
  crm.service.ts          ← queue, call logs, campaigns, leaderboard, analytics
  schemas/
    crm-customer-stats.schema.ts
    crm-call-log.schema.ts
    crm-campaign.schema.ts
    crm-settings.schema.ts
```

**Endpoints:**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/crm/customers` | all CRM roles | Paginated, filterable by segment |
| GET | `/crm/customers/:id` | all CRM roles | Customer 360 — stats + call history + order history |
| GET | `/crm/queue` | all CRM roles | Retarget queue, filtered by agent for crm_senior |
| POST | `/crm/queue/:id/assign` | admin, crm_head | Assign customer to agent |
| POST | `/crm/calls` | all CRM roles | Log call disposition |
| GET | `/crm/calls/:customerId` | all CRM roles | Call history for customer |
| GET | `/crm/campaigns` | admin, crm_head | List campaigns |
| POST | `/crm/campaigns` | admin, crm_head | Create campaign |
| POST | `/crm/campaigns/:id/approve` | admin, crm_head | Approve campaign |
| POST | `/crm/campaigns/:id/send` | admin, crm_head | Send via WhatsApp |
| GET | `/crm/leaderboard` | all CRM roles | Agent performance stats |
| GET | `/crm/analytics` | admin, crm_head | Repeat rate, retention, revenue at risk |
| GET | `/crm/settings` | admin | Reorder cycles |
| PUT | `/crm/settings` | admin | Update reorder cycles |
| POST | `/crm/engine/refresh` | admin | Manual full refresh |

**Auth guard:** Extend existing admin guard — check `departmentType in ['crm_head', 'crm_senior']` or `role in ['admin', 'superadmin']`.

---

## 4. Frontend Routes

```
frontend/src/app/crm/
  layout.tsx                ← billing layout copy, mustard/deep-green palette
  page.tsx                  ← redirect to /crm/queue
  queue/
    page.tsx                ← Due Today / Overdue / At Risk / Upcoming tabs, sorted by priorityScore
  customers/
    page.tsx                ← Customer list, segment filter chips, search
    [id]/
      page.tsx              ← Customer 360: profile card, health gauge, stats, timeline, quick actions
  campaigns/
    page.tsx                ← Campaign list + create form (admin/crm_head only)
  leaderboard/
    page.tsx                ← Agent points, streaks, conversion rate
  analytics/
    page.tsx                ← Repeat purchase rate, revenue at risk, category breakdown
  settings/
    page.tsx                ← Reorder cycle config (admin only)
```

**Visual identity:** Mustard (`#D4A017`) primary, deep green (`#1A3625`) sidebar (same as billing), terracotta accents (`#C1643C`), cream background (`#FAF7F2`). Reuses `layout.tsx` sidebar shell from billing verbatim.

**Auth pattern:** Copy billing `layout.tsx` guard — `useAdminAuthStore`, redirect to `/admin-login` if not authenticated or wrong departmentType.

---

## 5. Role / Permission Matrix

| Action | admin/superadmin | crm_head (Manager) | crm_senior (Agent) |
|---|---|---|---|
| View all customers | ✓ | ✓ | assigned only |
| View full analytics | ✓ | ✓ | own stats only |
| Reassign queue | ✓ | ✓ | ✗ |
| Create / approve campaigns | ✓ | crm_head can approve | ✗ |
| Send campaigns | ✓ | ✓ | ✗ |
| Log calls / send WA | ✓ | ✓ | ✓ |
| Manage settings | ✓ | ✗ | ✗ |
| Trigger engine refresh | ✓ | ✗ | ✗ |

---

## 6. Out of scope (v1)

- **AI Script Generator** — needs Anthropic API key; add as a follow-on once the queue is live
- **Offline mode** — PWA service worker; add when floor-team usage is validated
- **Command palette** — add after core flows are stable
- **Duplicate merge** — add when duplicates are observed in production data
- **Predictive calendar** — the data is there; build the calendar view after queue is adopted
