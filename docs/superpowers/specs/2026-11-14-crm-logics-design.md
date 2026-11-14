# CRM Logics page + assistant (design, approved 2026-11-14)

## Intent
Same as billing Logics: the owner edits how the CRM decides things (visual flow, click a box, edit in a side panel) and the floating admin assistant can guide and prepare changes (Confirm card first).

## Goals
- Visual flow: Orders -> Reorder cycle -> Days late -> Segment -> VIP -> Priority -> Call queue.
- Block-formula boxes (2): personal reorder cycle (built-in: median gap between orders, clamped 7..120) and priority score (built-in: 50*ltvPct + 40*clamp(daysLate,0,30)/30 + (orders>=2 ? 10 : 0)).
- Value boxes: at-risk/dormant/lost days, due-soon window (7), min orders before personal cycle (3), VIP min orders + lifetime value, high/medium score cut-offs (60/35), reorder days per category, fallback cycle, daily call target. Existing Settings values move in; Settings page stays and links here.
- Each box shows a sample-customer before/after.
- Assistant: CRM Logics knowledge, propose -> Confirm -> apply. New permission `crm_logics` view/edit.

## Non-goals
Formulas for segment rules (if-then chain), editing any CRM data other than Logics, start dates.

## Constraints
- Changes apply to all customers immediately; engine recompute runs after publish (as Settings already does). Confirm card warns it relabels everyone.
- Server-side selfCheck on sample customers (score finite 0..100; cycle finite > 0) before publishing; refuse otherwise.
- Versioned + change log + revert to built-in or earlier version. Optimistic concurrency like billing.
- Engine file duplicated backend/frontend (sync test) if the frontend needs it.
- Push to `production` only, only when the user asks.

## Approaches
1. (chosen) Reuse billing formula engine (parser/printer/evaluator) with CRM-specific slots, variables, samples, checks.
2. Separate engine copy - rejected (duplication).

## Builder's calls
Variables for cycle formula: medianGap, meanGap, lastGap, orders. Priority: ltvPct, daysLate, orders.
