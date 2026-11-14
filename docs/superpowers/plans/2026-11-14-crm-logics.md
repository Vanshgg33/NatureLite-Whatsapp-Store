# CRM Logics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CRM Logics page (visual flow, click a box, edit) with two block-formula boxes and editable values, plus assistant support that prepares CRM Logics changes behind a Confirm card.

**Architecture:** Reuse the billing formula evaluator (`parseExpr/printExpr/compile`). CRM-specific slots, variables, sample customers and checks live in a new pure file `crm/engine/crm-formulas.ts`. The pure functions in `crm/engine/status-model.ts` gain an optional `rules` argument (defaults = today's behaviour). A `CrmLogicsService` stores formula versions + a change log and writes values into the existing `CrmSettings`, then triggers `engine.refreshAll('settings')`. The assistant gets a second agent + proposal service that mirror the billing ones.

**Tech Stack:** NestJS + Mongoose + Jest (backend), Next.js 14 + React Query + Tailwind (frontend), Gemini via existing `runToolLoop`, Redis proposals.

**Spec:** `docs/superpowers/specs/2026-11-14-crm-logics-design.md`. Billing code to mirror: `backend/src/modules/billing/logics/*`, `backend/src/modules/admin-chatbot/{agents/logics.agent.ts,logics-proposal.service.ts}`, `frontend/src/app/billing/logics/*`, `frontend/src/components/admin/admin-chat-fab.tsx`.

## Global Constraints

- Built-in behaviour must be unchanged until someone publishes: segments, cycles, priority and VIP for every customer equal today's (proven by a randomized equivalence test, Task 1).
- Built-in formulas: `personalCycle` = `min(max(medianGap, 7), 120)`; `priorityScore` = `50 * ltvPct + 40 * min(max(daysLate, 0), 30) / 30 + (orders >= 2 ? 10 : 0)`.
- Built-in values: due-soon window 7 days; own pattern used from 3 orders; high >= 60, medium >= 35; at-risk 15 / dormant 60 / lost 180 days; VIP 2 orders and 4000; fallback cycle 30; daily call target 50.
- Formula variables: cycle = `medianGap, meanGap, lastGap, orders`; priority = `ltvPct, daysLate, orders`. Only functions round, floor, ceil, min, max, abs (billing engine).
- Changes apply to all customers at once (no start dates). Priority result is rounded and clamped to 0..100 at runtime; cycle result is rounded, and a non-finite or < 1 result falls back to category/fallback cycle instead of crashing `refreshAll`.
- Value ranges: at-risk < dormant < lost (each 1..1000 whole days); due-soon 0..60; own-pattern min orders 2..10; high > medium, both 1..100; fallback 1..365; category cycles 1..365; VIP orders 1..100, VIP value 0..10,000,000; call target 1..1000.
- Page and endpoints blocked for `departmentType` `crm_senior` / `crm_viewer` (same as Settings). New access page key `crm_logics` (view, edit). Assistant card Confirm needs `crm_logics.edit`.
- Engine file is duplicated: after editing `billing/logics/formula-engine.ts`, `cp` it to `frontend/src/lib/billing/formula-engine.ts` (byte-identical).
- Commit per task; do NOT push (user pushes only when asked, to `production` only).

## Review Focus

- A formula that divides by zero or gives NaN for a customer with sparse history: refused at publish by the sample check; at runtime never throws (falls back). Test in Tasks 1 and 3.
- Priority formula returning < 0 or > 100: clamped at runtime. Test in Task 1.
- Two admins publishing at once: stale `baseVersion` rejected. Test in Task 3.
- Values that contradict each other (at-risk >= dormant, medium >= high): refused with a plain message. Test in Task 3.
- The Settings page saving after Logics changed new fields: must not wipe them (its `$set` only sends its own fields). Test in Task 2.
- Assistant card for someone without `crm_logics.edit`, an expired or reused card, another admin's card: refused, nothing applied. Test in Task 5.
- Reverting to an older version while newer ones exist: publishes the old formulas as a new version. Test in Task 3.

---

### Task 1: Pure CRM rules (formulas + status-model hooks)

**Files:**
- Modify: `backend/src/modules/billing/logics/formula-engine.ts` (export `compile` only); then `cp` to `frontend/src/lib/billing/formula-engine.ts`
- Create: `backend/src/modules/crm/engine/crm-formulas.ts`, `backend/src/modules/crm/engine/crm-formulas.spec.ts`
- Modify: `backend/src/modules/crm/engine/status-model.ts` (optional `rules` args)

**Interfaces:**
- Produces in `crm-formulas.ts`:
  - `CRM_SLOT_KEYS = ['personalCycle','priorityScore'] as const`; `type CrmSlotKey`; `type CrmFormulas = Record<CrmSlotKey,string>`; `DEFAULT_CRM_FORMULAS: CrmFormulas`
  - `CRM_SLOT_META: Array<{key: CrmSlotKey; label: string; help: string; vars: string[]}>`; `CRM_VAR_LABELS: Record<string,string>`
  - `interface CrmRules { formulas: CrmFormulas; dueSoonDays: number; minOrdersForPersonal: number; priorityHighAt: number; priorityMediumAt: number }`; `DEFAULT_CRM_RULES: CrmRules`
  - `evalCycle(f: CrmFormulas, v: {medianGap:number; meanGap:number; lastGap:number; orders:number}): number | null` (rounded integer >= 1, else null)
  - `evalPriority(f: CrmFormulas, v: {ltvPct:number; daysLate:number; orders:number}): number` (rounded, clamped 0..100; throws on unknown name/NaN)
  - `crmSelfCheck(f: CrmFormulas): string[]` (empty = safe) and `CRM_SAMPLES` (sample customers with `text` description)
- Produces in `status-model.ts` (all new params optional, defaults = today): `resolveCycle(orders, categoryDays, fallbackDays, rules?: CrmRules)`, `computeSegment(daysLate, totalOrders, thresholds?, dueSoonDays = 7)`, `computePriority(ltvPct, daysLate, totalOrders, rules?: CrmRules)`.

- [ ] **Step 1: Write failing tests** in `crm-formulas.spec.ts`: (a) built-ins equal legacy: 3000 randomized customers (gaps lists, ltvPct, daysLate -40..200, orders 1..9) give identical `resolveCycle`/`computePriority` with and without `DEFAULT_CRM_RULES`; (b) `evalCycle` with `meanGap` formula returns the rounded mean; (c) `crmSelfCheck(DEFAULT_CRM_FORMULAS)` is `[]`; `priorityScore: '1/0'` and `'ltvPct * 1000'` return problems; `personalCycle: 'medianGap / (orders - orders)'` returns problems; (d) `evalPriority` clamps `'200'` to 100 and `'-5'` to 0; (e) `computeSegment(-5, 3, undefined, 3)` is `active` while default is `due_soon`; (f) unknown name in formula throws.
- [ ] **Step 2: Run** `cd backend && npx jest src/modules/crm/engine` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `crm-formulas.ts` using exported `compile`; variables passed as `Vars`. `resolveCycle` personal branch: uses `orders.length >= rules.minOrdersForPersonal` and non-empty gaps, computes median/mean/last gap (last = newest gap), calls `evalCycle`, falls through to the category/fallback branches when it returns null. `computePriority` uses `evalPriority` and bands from `priorityHighAt/priorityMediumAt`. Keep the existing code path byte-for-byte equivalent when `rules` is omitted.
- [ ] **Step 4: Export `compile`** in billing engine, `cp` to frontend, run `cmp` on both files (identical) and `npx jest src/modules/crm src/modules/billing/logics` — Expected: all PASS including the existing `status-model.spec.ts` unchanged.
- [ ] **Step 5: Commit** `git add backend/src frontend/src/lib && git commit -m "feat: CRM rules as editable formulas (pure engine)"`.

### Task 2: Stored values, formula versions, engine uses rules

**Files:**
- Modify: `crm/schemas/crm-settings.schema.ts` (new fields `dueSoonDays` 7, `minOrdersForPersonal` 3, `priorityHighAt` 60, `priorityMediumAt` 35)
- Create: `crm/schemas/crm-logic-set.schema.ts` (`CrmLogicSet`: `version` unique number, `formulas` object, `reason`, `createdBy`; collection `crm_logic_sets`), `crm/schemas/crm-logic-log.schema.ts` (`CrmLogicLog`: `area` string, `before`, `after`, `reason`, `userId`, `ip`, `at`)
- Modify: `crm/crm-engine.service.ts` (load rules once per run/refresh, pass to `resolveCycle`, `computeSegment`, `computePriority`; second-pass priority too), `crm/crm.module.ts` (register new schemas)
- Test: `crm/crm-engine-rules.spec.ts`

**Interfaces:**
- Produces: `CrmEngineService.loadRules(): Promise<CrmRules>` (latest `CrmLogicSet` formulas merged over defaults + the four value fields from `CrmSettings`).

- [ ] **Step 1: Failing tests** (mock models like `crm-foundation.spec.ts` does): `loadRules` returns `DEFAULT_CRM_RULES` with no stored data; returns published formulas merged over defaults; returns stored value fields; engine refresh for a customer with `dueSoonDays` 3 labels a customer due in 5 days `active`; an `updateSettings` call with only `thresholds` does not unset the four new fields (the `$set` contains only given keys).
- [ ] **Step 2: Run** `npx jest src/modules/crm/crm-engine-rules.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** schema changes, `loadRules`, wiring. Value fields read with `?? default` so existing documents work without migration.
- [ ] **Step 4: Run** `npx jest src/modules/crm` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: CRM engine reads editable rules`.

### Task 3: CrmLogicsService + controller + permission

**Files:**
- Create: `crm/logics/crm-param-defs.ts` (value definitions: key, label, group, unit, min, max, default, help; plus `checkCrmValues(current, patch): {value} | {error}` enforcing the ranges and orderings in Global Constraints), `crm/logics/crm-groups.ts` (flow boxes: id, title, help, lane, which slots/value keys; ready-made options for the two formula boxes e.g. cycle "Average gap", "Latest gap"; priority "Value matters more (70/20/10)", "Lateness matters more (30/60/10)"; every option must pass `crmSelfCheck`), `crm/logics/crm-logics.service.ts`, `crm/logics/crm-logics.controller.ts`
- Modify: `common/permissions/admin-pages.ts` (`crm_logics`, '/crm/logics', view / 'Edit formulas and values'), `crm/crm.module.ts` (provider, controller, export `CrmLogicsService`)
- Test: `crm/logics/crm-logics.service.spec.ts`, `crm/logics/crm-groups.spec.ts`

**Interfaces:**
- Produces on `CrmLogicsService`: `registry(): Promise<{slots; groups; defaults; active:{version;formulas}; latestVersion:number; history; values: Array<ParamDef & {value:number|Record<string,number>}>}>`; `preview(formulas?: unknown, values?: unknown): {problems:string[]; today: SampleOut[]; withChange: SampleOut[]}`; `publishFormulas(raw: unknown, reason: string, userId: string, ip: string, baseVersion?: number): Promise<{version:number}>` (cleans both slots, requires reason, runs `crmSelfCheck`, rejects stale baseVersion, writes `CrmLogicSet` + `CrmLogicLog`, then `engine.refreshAll('settings')`); `setValues(patch: unknown, reason: string, userId: string, ip: string): Promise<void>` (validates with `checkCrmValues`, `$set` into `CrmSettings`, logs before/after, refreshes); `activeRules(): Promise<CrmRules>` delegating to `engine.loadRules()`.
- Endpoints under `crm/logics`: `GET /` (`crm_logics.view`), `POST /preview`, `POST /formulas`, `PUT /values` (`crm_logics.edit`); all throw `ForbiddenException` for `crm_senior`/`crm_viewer`.

- [ ] **Step 1: Failing tests:** registry returns built-ins/`latestVersion` 0; `publishFormulas` refuses empty reason, a failing formula (`'1/0'`), stale baseVersion; creates version 1 then 2; reverting = publishing the older formulas creates version 3; logs a change; triggers refresh. `setValues` accepts `{thresholds:{atRiskAfterDays:10,dormantAfterDays:50,lostAfterDays:150}}`, rejects `atRisk 70` (not below dormant), `priorityMediumAt 70` with high 60, non-integer days, unknown key; only changed keys are `$set`. Groups spec: every ready-made option passes `crmSelfCheck`; every slot and value key appears in exactly one box.
- [ ] **Step 2: Run** `npx jest src/modules/crm/logics` — Expected: FAIL.
- [ ] **Step 3: Implement** the service/controller mirroring `billing/logics/logics.service.ts` and `logics.controller.ts` (version number = last + 1; unique index collision surfaces as an error; `departmentType` check as in `crm.controller.ts:211`).
- [ ] **Step 4: Run** `npx jest src/modules/crm src/common` and `npx tsc --noEmit -p backend` — Expected: PASS / no errors.
- [ ] **Step 5: Commit** `feat: CRM Logics service and endpoints`.

### Task 4: CRM Logics page

**Files:**
- Create: `frontend/src/app/crm/logics/page.tsx`
- Modify: `frontend/src/lib/api.ts` (`crmLogics()`, `crmLogicsPreview`, `crmLogicsPublish`, `crmLogicsSetValues`), `frontend/src/app/crm/layout.tsx` (nav item "Logics"), `frontend/src/lib/admin-access.ts` (`{ page: 'crm_logics', href: '/crm/logics' }`), `frontend/src/app/crm/settings/page.tsx` (one-line link "Edit the rules behind these on the Logics page")

**Interfaces:**
- Consumes: Task 3 endpoints; `FormulaBuilder` from `frontend/src/app/billing/logics/FormulaBuilder.tsx` (props `{value, names: {name,label}[], disabled?, onChange}`); `CRM_VAR_LABELS` via the registry response (so no frontend copy of CRM code).

- [ ] **Step 1:** Build the page following `billing/logics/page.tsx`: flow Orders -> Reorder cycle -> Days late -> Segment -> VIP -> Priority -> Call queue (boxes from `registry.groups`); side panel per box: formula boxes get ready-made options + block builder + advanced text + "Try it on sample customers" (calls `preview`, shows before/after table); value boxes get number fields with units; sticky bar with reason field and "Publish" / "Discard changes"; a banner on publish confirm: "This changes every customer's label and priority."; sends `baseVersion: latestVersion`; history list with "Go back to this version" (publishes that version's formulas); errors shown plainly.
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit` and `npx next lint --dir src/app/crm` — Expected: clean.
- [ ] **Step 3:** Verify in the browser with Playwright and a mocked API (as done for billing): open `/crm/logics`, click a box, change a value, change a formula to "Average gap", preview, publish; screenshot at desktop and phone width; check console for errors.
- [ ] **Step 4: Commit** `feat: CRM Logics page`.

### Task 5: Assistant — CrmLogicsAgent and proposals (backend)

**Files:**
- Create: `admin-chatbot/agents/crm-logics.agent.ts`, `admin-chatbot/agents/crm-logics.knowledge.ts`, `admin-chatbot/crm-logics-proposal.service.ts`, specs for both
- Modify: `admin-chatbot/agent-utils.ts` (`Domain` adds `'crm_logics'`; `ChatProposal` gains `area?: 'billing' | 'crm'`, `startsOn` optional), `admin-chatbot/agents/router.agent.ts` (domain + page tag `/crm/logics` + examples), `admin-chatbot/admin-chatbot.service.ts` (route `crm_logics` to the agent, same `canPropose` rule), `admin-chatbot/admin-chatbot.controller.ts` (`POST crm-proposals/:id/confirm` and `/cancel`, `@RequireAccess('crm_logics.edit')`, same `departmentType` block), `admin-chatbot/admin-chatbot.module.ts` (import `CrmModule`, provide the new classes), `crm/crm.module.ts` (already exports `CrmLogicsService`)
- Test: `crm-logics.agent.spec.ts`, `crm-logics-proposal.service.spec.ts`, update `admin-chatbot.module/router/service` specs

**Interfaces:**
- Produces: `CrmLogicsAgent(crmLogics, proposals).run(query, history, ctx?)` with tools `get_crm_logics_state`, `check_crm_formula_change({changes:[{step,formula}]})`, `propose_crm_logics_change({kind:'formula'|'values'|'revert', ...reason})`; `CrmLogicsProposalService.create(adminId, args): Promise<ChatProposal | {error}>`, `.confirm(user, id, ip)`, `.cancel(user, id)`; Redis key `chat:crm-logic-proposal:{id}`, TTL 600 s, single-use `SET NX` claim, bound to the admin; confirm re-applies stored patch through `CrmLogicsService.publishFormulas/setValues` with reason suffix " (via assistant)".
- Knowledge text generated from `CRM_SLOT_META`, groups and param defs (drift-test like `logics.agent.spec.ts`).

- [ ] **Step 1: Failing tests:** mirror `logics.agent.spec.ts` and `logics-proposal.service.spec.ts` (knowledge names every box/option/value/step with built-in formula; propose refuses without ctx / `!canPropose` / > 3 cards; create validates via the same checks as the page and stores without applying; confirm applies once, `via assistant` suffix, another admin Forbidden, expired NotFound, concurrent double-confirm only one applies, formula patch re-applied to newest formulas, revert replaces everything); router test: "make VIPs need 3 orders" routes to `crm_logics`; module spec lists the new providers.
- [ ] **Step 2: Run** `npx jest src/modules/admin-chatbot` — Expected: FAIL.
- [ ] **Step 3: Implement** by mirroring the billing agent and proposal service; the card lines for a values change show old -> new, and every card carries the warning "This changes every customer's label and priority."
- [ ] **Step 4: Run** `npx jest src/modules/admin-chatbot && npx tsc --noEmit -p backend` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: assistant can prepare CRM Logics changes`.

### Task 6: Assistant widget cards + full verification

**Files:**
- Modify: `frontend/src/lib/api.ts` (`confirmChatProposal`/`cancelChatProposal` pick the endpoint by `proposal.area`; `AdminChatProposal.area`), `frontend/src/components/admin/admin-chat-fab.tsx` (card shows the area warning line; nothing else changes — `/crm/logics` is already sent as `page`)
- Test: `frontend/src/lib/api` has no test harness; verify in browser.

- [ ] **Step 1:** Implement the two small frontend edits.
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit` — Expected: clean.
- [ ] **Step 3:** Playwright with mocked chat API on `/crm/logics`: assistant returns a proposal with `area:'crm'` -> card shows -> Confirm hits `crm-proposals/:id/confirm`, Cancel hits `/cancel`; screenshot.
- [ ] **Step 4:** Full `cd backend && npx jest` and `cmp` of the two engine copies — Expected: all suites pass, files identical.
- [ ] **Step 5: Commit** `feat: CRM Logics cards in the assistant widget`. Report to the user plainly what was and was not verified (live model, real Redis/Mongo not exercised); do not push.
