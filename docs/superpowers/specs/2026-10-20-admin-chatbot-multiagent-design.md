# Admin Chatbot Multi-Agent Design

**Date:** 2026-10-20  
**Status:** Approved

## Problem

The admin chatbot is a single Gemini agent with 35 tools covering orders, inventory, customers, payments, WhatsApp, etc. Three business modules — **Billing** (B2B invoicing), **CRM** (segments, call logs, campaigns), and **Purchase** (procurement pipeline) — have zero tools. The chatbot returns wrong or empty answers for any query touching these domains.

## Solution: Router → Parallel Specialists → Synthesizer

Replace the single monolithic `runAgenticLoop` with a 5-agent pipeline:

```
User query
    ↓
RouterAgent          — classifies query into domains (Gemini Flash, no tools)
    ↓ domains[]
OpsAgent             — orders, delivery, products, analytics, customers, payments, wallet,
BillingCrmAgent      ← run in parallel → subscriptions, store-sales, WhatsApp, audit, coupons
PurchaseAgent                            billing bills/customers, CRM segments/calls/campaigns
                                         purchase requests/vendors/materials
    ↓ raw data strings
SynthesizerAgent     — formats final reply (no tools, single call)
    ↓
Admin reply
```

**Optimisation:** if Router returns exactly one domain, skip SynthesizerAgent — the specialist's output IS the reply. Saves one LLM call on single-domain queries (most queries).

## Agents

### RouterAgent
- Model: `gemini-2.0-flash` (cheap, fast)
- No tools
- Temperature: 0.1
- Output: `{ domains: ('ops' | 'billing_crm' | 'purchase')[] }`
- System prompt: classify only, return JSON

### OpsAgent
- Model: `GEMINI_MODEL` env var (same as today)
- Tools: all 35 existing tools unchanged
- Temperature: 0.1
- Max tool iterations: 10
- Output: raw data string

### BillingCrmAgent
- Model: `GEMINI_MODEL`
- Tools: 8 new tools (see below)
- Temperature: 0.1
- Max tool iterations: 8

**New tools:**
- `get_billing_bills` — search B2B invoices by date/customer/status/invoice number
- `get_billing_customers` — customers with tags, outstanding, GST numbers
- `get_billing_godowns` — list godowns/warehouses
- `get_crm_overview` — segment counts (active/overdue/at_risk/dormant/lost)
- `get_crm_customer_detail` — LTV, AOV, segment, reorder date for one customer
- `get_crm_call_logs` — call/WhatsApp contact history with outcomes
- `get_crm_campaigns` — campaign list with status, recipient count, sent count

### PurchaseAgent
- Model: `GEMINI_MODEL`
- Tools: 4 new tools
- Temperature: 0.1
- Max tool iterations: 6

**New tools:**
- `get_purchase_requests` — list PRs by status/department/priority
- `get_purchase_request_detail` — full PR with items, actors, stage
- `get_purchase_vendors` — vendor list with contact, payment terms
- `get_purchase_materials` — raw material list with UOM

### SynthesizerAgent
- Model: `GEMINI_MODEL`
- No tools
- Temperature: 0.2
- Single call
- Receives: original query + all agent data strings
- Output: formatted admin reply (₹ notation, answer-first, tables, no filler)

## File Structure

```
backend/src/modules/admin-chatbot/
  agent-utils.ts                        NEW — shared: responseText, historyToContent, withTimeout, capArrays
  admin-chatbot-tools.service.ts        NEW — all tool implementations (moved + 12 new)
  agents/
    router.agent.ts                     NEW
    ops.agent.ts                        NEW
    billing-crm.agent.ts                NEW
    purchase.agent.ts                   NEW
    synthesizer.agent.ts                NEW
  admin-chatbot.service.ts              MODIFIED — orchestrator only, ~200 lines
  admin-chatbot.module.ts               MODIFIED — new imports + providers

backend/src/modules/crm/crm.module.ts           MODIFIED — export CrmService
backend/src/modules/purchase/purchase.module.ts MODIFIED — export PurchaseService
```

## Session & Caching

- Chat history loaded once, passed to Router + all parallel specialists
- Each specialist's Gemini context cache is managed independently (same pattern as today)
- Redis tool-result caching preserved in `AdminChatbotToolsService.execute()`
- `streamChat()` and `enqueueChat()` entry points preserved unchanged in the controller

## Non-goals

- No changes to the controller, frontend, or session schema
- No streaming per-agent (stream still works end-to-end via existing SSE path)
- No model-level parallel requests within a single agent (sequential tool calls preserved)
