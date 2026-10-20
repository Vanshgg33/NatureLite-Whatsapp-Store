# Admin Chatbot Multi-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single monolithic admin chatbot agent with a Router → Parallel Specialists → Synthesizer pipeline, adding tools for Billing, CRM, and Purchase modules.

**Architecture:** RouterAgent (Gemini Flash) classifies the query into domains; the relevant specialist agents (Ops, BillingCrm, Purchase) run in parallel via Promise.all; SynthesizerAgent merges their outputs into a final formatted reply. Single-domain queries skip the Synthesizer for speed.

**Tech Stack:** NestJS, `@google/genai` SDK, MongoDB/Mongoose, BullMQ, Redis

**Spec:** `docs/superpowers/specs/2026-10-20-admin-chatbot-multiagent-design.md`

## Global Constraints

- All new files live under `backend/src/modules/admin-chatbot/`
- Use `GEMINI_MODEL` env var for specialist agents; use `gemini-2.0-flash-001` for RouterAgent
- Preserve all existing controller endpoints, session schema, SSE streaming path — no breaking changes
- Tool result Redis caching stays in `AdminChatbotToolsService.execute()` using existing `cachedTool` pattern
- `toIST()`, `escape()`, `sanitize()`, `resolveRange()` helpers move to `admin-chatbot-tools.service.ts`
- Never commit `.env` files

## Review Focus

- **Router misclassifies cross-domain query** (e.g. "billing outstanding for at-risk customers" → only `ops`) — missing domain means agent never fires, data never appears. Test: verify Router returns `['billing_crm']` not `['ops']`.
- **Single-specialist fast-path returns raw data dump** instead of formatted reply — if Synthesizer is skipped but specialist output is not formatted. Test: single-domain query, verify reply has ₹ formatting and answer-first sentence.
- **Parallel agents fail independently** — one agent throws, Promise.allSettled should still return the other's data. Test: mock one agent to throw, verify synthesizer still gets remaining data.
- **BillingCrmAgent tool called with no args** (`get_crm_overview` requires no params) — should not crash. Test: call with empty `{}` args.
- **Purchase stage derivation** — `toolPurchaseRequests` reads `status` field which maps to stages; wrong field name returns empty results. Test: seed a PR with `status: 'REQUESTED'`, verify it appears in results.

---

## Task 1: Shared Agent Utilities

**Files:**
- Create: `backend/src/modules/admin-chatbot/agent-utils.ts`

**Interfaces:**
- Produces: `responseText(r)`, `historyToContent(history)`, `withTimeout(p)`, `capArrays(obj, max)`, `HistoryItem` type, `Domain` type, `AgentOutput` type

- [ ] **Step 1: Create the file**

```typescript
// backend/src/modules/admin-chatbot/agent-utils.ts
import type { Content, Part } from '@google/genai';

export type HistoryItem = { role: 'user' | 'assistant'; text: string };
export type Domain = 'ops' | 'billing_crm' | 'purchase';
export interface AgentOutput { domain: Domain; data: string }

export function responseText(r: any): string {
  try {
    return (r.text ?? '').trim();
  } catch {
    return (r.candidates?.[0]?.content?.parts ?? [])
      .filter((p: any) => p != null && typeof p.text === 'string' && !p.thought)
      .map((p: any) => p.text as string)
      .join('').trim();
  }
}

export function historyToContent(history: HistoryItem[]): Content[] {
  const contents = history.map((h) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }],
  }));
  while (contents.length > 0 && contents[0].role !== 'user') contents.shift();
  return contents;
}

export function withTimeout<T>(p: Promise<T>, ms = 30_000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('gemini_timeout')), ms)),
  ]);
}

export function capArrays(obj: Record<string, unknown>, max: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = Array.isArray(v) && v.length > max ? v.slice(0, max) : v;
  }
  return out;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/admin-chatbot/agent-utils.ts
git commit -m "feat(admin-chatbot): add shared agent utility types and helpers"
```

---

## Task 2: AdminChatbotToolsService (Move + New Tools)

**Files:**
- Create: `backend/src/modules/admin-chatbot/admin-chatbot-tools.service.ts`
- Modify: `backend/src/modules/crm/crm.module.ts` (export CrmService)
- Modify: `backend/src/modules/purchase/purchase.module.ts` (export PurchaseService)

**Interfaces:**
- Produces: `AdminChatbotToolsService` with `execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>`

**Context:** The existing `admin-chatbot.service.ts` has all tool implementations as private methods (`toolDashboard`, `toolSearchOrders`, etc.) plus helpers (`toIST`, `escape`, `sanitize`, `resolveRange`, `cachedTool`). This task moves them to a dedicated service and adds 12 new tools for Billing, CRM, and Purchase.

- [ ] **Step 1: Export CrmService from CrmModule**

In `backend/src/modules/crm/crm.module.ts`, change the `exports` array:

```typescript
// Before:
exports: [CrmEngineService],

// After:
exports: [CrmEngineService, CrmService],
```

- [ ] **Step 2: Export PurchaseService from PurchaseModule**

In `backend/src/modules/purchase/purchase.module.ts`, add exports:

```typescript
// After providers array, add:
exports: [PurchaseService],
```

- [ ] **Step 3: Create AdminChatbotToolsService scaffold**

```typescript
// backend/src/modules/admin-chatbot/admin-chatbot-tools.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { RedisService } from '../redis/redis.service';
import { QUEUE_ADMIN, ADMIN_JOBS, DEFAULT_JOB_OPTIONS } from '../queues/queues.constants';
import { ProductRepository } from '../products/repositories/product.repository';
import { ChatSessionRepository } from '../chatbot/repositories/chat-session.repository';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { AnalyticsService } from '../analytics/analytics.service';
import { OrderRepository } from '../orders/repositories/order.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { FeedbackRepository } from '../feedback/repositories/feedback.repository';
import { CouponRepository } from '../coupons/repositories/coupon.repository';
import { CartRepository } from '../cart/repositories/cart.repository';
import { WalletRepository } from '../wallet/repositories/wallet.repository';
import { WalletTransactionRepository } from '../wallet/repositories/wallet-transaction.repository';
import { PaymentRepository } from '../payments/repositories/payment.repository';
import { StoreSaleRepository } from '../store-sales/repositories/store-sale.repository';
import { ReminderRepository } from '../reminders/repositories/reminder.repository';
import { MessageLogRepository } from '../whatsapp/repositories/message-log.repository';
import { AdminChatSessionRepository } from './repositories/admin-chat-session.repository';
import { StoreStockRepository } from '../store-stock/repositories/store-stock.repository';
import { CategoryRepository } from '../categories/repositories/category.repository';
import { AdminUserRepository } from '../admin/repositories/admin-user.repository';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { parseDateRange } from '../../common/utils/date-parse.util';
import { Subscription } from '../subscriptions/schemas/subscription.schema';
import { RawMaterial } from '../raw-materials/schemas/raw-material.schema';
import { RawMaterialDailyEntry } from '../raw-materials/schemas/raw-material-snapshot.schema';
import { Store } from '../stores/schemas/store.schema';
import { BillingBill } from '../billing/schemas/billing-bill.schema';
import { Godown } from '../billing/schemas/godown.schema';
import { CrmCustomerStats } from '../crm/schemas/crm-customer-stats.schema';
import { CrmCallLog } from '../crm/schemas/crm-call-log.schema';
import { CrmCampaign } from '../crm/schemas/crm-campaign.schema';
import { PurchaseRequest } from '../purchase/schemas/purchase-request.schema';
import { PurchaseVendor } from '../purchase/schemas/purchase-vendor.schema';
import { PurchaseMaterial } from '../purchase/schemas/purchase-material.schema';

const UNCACHED_TOOLS = new Set(['send_email_report', 'preview_email_report']);

const TOOL_TTL: Record<string, number> = {
  get_dashboard_summary: 45, search_orders: 45, get_order_detail: 30,
  get_orders_by_status: 45, compare_periods: 90, search_products: 120,
  get_product_detail: 120, get_products_by_stock: 90, get_store_stock: 60,
  get_raw_materials: 90, get_raw_material_snapshots: 120, get_categories: 300,
  get_stores: 300, search_customers: 120, get_customer_orders: 60,
  get_top_customers: 300, get_customers_filtered: 90, get_revenue_trend: 90,
  get_analytics_period: 300, get_top_selling_products: 300, search_abandoned_carts: 90,
  get_store_sales: 90, get_sale_detail: 60, get_delivery_data: 60,
  get_wallet: 60, get_subscriptions: 90, get_payments: 60,
  search_audit_logs: 60, get_admin_users: 300, get_coupon_list: 180,
  get_coupon_usage: 90, get_feedback_list: 60, get_whatsapp_queue: 30,
  get_whatsapp_messages: 30, get_reminders: 30,
  // new
  get_billing_bills: 45, get_billing_customers: 120, get_billing_godowns: 300,
  get_crm_overview: 60, get_crm_customer_detail: 60, get_crm_call_logs: 60,
  get_crm_campaigns: 120, get_purchase_requests: 45, get_purchase_request_detail: 30,
  get_purchase_vendors: 300, get_purchase_materials: 300,
};

@Injectable()
export class AdminChatbotToolsService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly analyticsService: AnalyticsService,
    private readonly orderRepository: OrderRepository,
    private readonly userRepository: UserRepository,
    private readonly feedbackRepository: FeedbackRepository,
    private readonly couponRepository: CouponRepository,
    private readonly cartRepository: CartRepository,
    private readonly walletRepository: WalletRepository,
    private readonly walletTransactionRepository: WalletTransactionRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly storeSaleRepository: StoreSaleRepository,
    private readonly reminderRepository: ReminderRepository,
    private readonly messageLogRepository: MessageLogRepository,
    private readonly adminChatSessionRepository: AdminChatSessionRepository,
    private readonly storeStockRepository: StoreStockRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly adminUserRepository: AdminUserRepository,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    @InjectModel(Subscription.name) private readonly subscriptionModel: Model<any>,
    @InjectModel(RawMaterial.name) private readonly rawMaterialModel: Model<any>,
    @InjectModel(RawMaterialDailyEntry.name) private readonly rawMaterialEntryModel: Model<any>,
    @InjectModel(Store.name) private readonly storeModel: Model<any>,
    @InjectModel(BillingBill.name) private readonly billingBillModel: Model<any>,
    @InjectModel(Godown.name) private readonly godownModel: Model<any>,
    @InjectModel(CrmCustomerStats.name) private readonly crmStatsModel: Model<any>,
    @InjectModel(CrmCallLog.name) private readonly crmCallLogModel: Model<any>,
    @InjectModel(CrmCampaign.name) private readonly crmCampaignModel: Model<any>,
    @InjectModel(PurchaseRequest.name) private readonly purchaseRequestModel: Model<any>,
    @InjectModel(PurchaseVendor.name) private readonly purchaseVendorModel: Model<any>,
    @InjectModel(PurchaseMaterial.name) private readonly purchaseMaterialModel: Model<any>,
    private readonly redisService: RedisService,
    @InjectQueue(QUEUE_ADMIN) private readonly adminQueue: Queue,
  ) {}

  // ─── Public dispatcher ────────────────────────────────────────────────────────

  async execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (UNCACHED_TOOLS.has(name)) return this._run(name, args);
    return this.cachedTool(name, args, () => this._run(name, args), TOOL_TTL[name] ?? 90);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async cachedTool<T>(
    name: string,
    params: Record<string, unknown>,
    fn: () => Promise<T>,
    ttl = 90,
  ): Promise<T> {
    const paramStr = Object.keys(params).length
      ? ':' + Buffer.from(JSON.stringify(params)).toString('base64url').slice(0, 24)
      : '';
    const key = `admin:tool:${name}${paramStr}`;
    return this.redisService.cached<T>(key, ttl, fn);
  }

  resolveRange(params: Record<string, unknown>): { from: Date; to: Date } {
    if (params?.from && params?.to) {
      const from = new Date(params.from as string);
      const to = new Date(params.to as string);
      if (!isNaN(from.getTime()) && !isNaN(to.getTime())) return { from, to };
    }
    const days = Math.max(1, Number(params?.days ?? 14));
    const to = new Date();
    const from = new Date(Date.now() - days * 86_400_000);
    return { from, to };
  }

  escape(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  sanitize(message: string): string {
    return message.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 500);
  }

  toIST(d: Date | string | null | undefined, dateOnly = false): string {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d as string);
    if (isNaN(date.getTime())) return '';
    const ist = new Date(date.getTime() + 19_800_000);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dd = String(ist.getUTCDate()).padStart(2, '0');
    const mon = months[ist.getUTCMonth()];
    const yyyy = ist.getUTCFullYear();
    if (dateOnly) return `${dd} ${mon} ${yyyy}`;
    let h = ist.getUTCHours();
    const min = String(ist.getUTCMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${dd} ${mon} ${yyyy}, ${h}:${min} ${ampm} IST`;
  }
```

- [ ] **Step 4: Add private `_run` dispatcher — copy existing tool switch cases from `admin-chatbot.service.ts` lines 887–951, then append new cases**

The switch statement in `_run` must include all existing cases (copy verbatim from `admin-chatbot.service.ts`) **plus** these new cases at the end:

```typescript
  private async _run(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (name) {
      // ── EXISTING CASES (copy verbatim from admin-chatbot.service.ts _runTool switch) ──
      case 'get_dashboard_summary':    return this.toolDashboard();
      case 'search_orders':            return this.toolSearchOrders(args);
      // ... (all existing cases from admin-chatbot.service.ts lines 888–951) ...

      // ── NEW: Billing ──────────────────────────────────────────────────────────
      case 'get_billing_bills':        return this.toolBillingBills(args);
      case 'get_billing_customers':    return this.toolBillingCustomers(args);
      case 'get_billing_godowns':      return this.toolBillingGodowns();

      // ── NEW: CRM ─────────────────────────────────────────────────────────────
      case 'get_crm_overview':         return this.toolCrmOverview();
      case 'get_crm_customer_detail':  return this.toolCrmCustomerDetail(args);
      case 'get_crm_call_logs':        return this.toolCrmCallLogs(args);
      case 'get_crm_campaigns':        return this.toolCrmCampaigns(args);

      // ── NEW: Purchase ─────────────────────────────────────────────────────────
      case 'get_purchase_requests':         return this.toolPurchaseRequests(args);
      case 'get_purchase_request_detail':   return this.toolPurchaseRequestDetail(args);
      case 'get_purchase_vendors':          return this.toolPurchaseVendors();
      case 'get_purchase_materials':        return this.toolPurchaseMaterials(args);

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }
```

- [ ] **Step 5: Copy all existing tool private methods from `admin-chatbot.service.ts`**

Move these methods verbatim (lines ~955–2374 of `admin-chatbot.service.ts`):
`toolDashboard`, `toolSearchOrders`, `toolOrderDetail`, `toolOrdersByStatus`,
`toolComparePeriods`, `toolSearchProducts`, `toolProductDetail`, `toolLowStock`,
`toolOutOfStock`, `toolInStock`, `toolStoreStock`, `toolRawMaterials`,
`toolRawMaterialSnapshots`, `toolCategories`, `toolStores`, `toolSearchCustomers`,
`toolCustomerOrders`, `toolTopCustomers`, `toolNewCustomers`, `toolBlockedCustomers`,
`toolInactiveCustomers`, `toolRevenueTrend`, `toolAnalyticsPeriod`, `toolTopSelling`,
`toolAbandonedCarts`, `toolStoreSales`, `toolSaleDetail`, `toolDeliveryCollections`,
`toolDeliveryHistory`, `toolPendingCollections`, `toolWalletBalances`,
`toolWalletTransactions`, `toolSubscriptionData`, `toolSubscriptionDetail`,
`toolPayments`, `toolRefundHistory`, `toolAuditLogs`, `toolAdminUsers`,
`toolCouponList`, `toolCouponUsage`, `toolFeedbackList`, `toolWhatsAppQueue`,
`toolWhatsAppMessages`, `toolReminders`, `toolPreviewEmail`, `toolSendEmail`

- [ ] **Step 6: Add new billing tool implementations**

```typescript
  private async toolBillingBills(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 20);
    const filter: any = {};

    if (args.invoiceNo) filter.invoiceNo = { $regex: this.escape(String(args.invoiceNo)), $options: 'i' };
    if (args.customerName) filter.customerName = { $regex: this.escape(String(args.customerName)), $options: 'i' };
    if (args.customerPhone) filter.customerPhone = { $regex: String(args.customerPhone).replace(/[^\d]/g, '') };
    if (args.paymentStatus) filter.paymentStatus = args.paymentStatus;
    if (args.orderTag) filter.orderTag = args.orderTag;
    if (args.from && args.to) {
      filter.createdAt = { $gte: new Date(args.from as string), $lte: new Date(args.to as string) };
    }

    const bills = await this.billingBillModel
      .find(filter).sort({ createdAt: -1 }).limit(limit).lean();

    const totalOutstanding = bills
      .filter((b: any) => b.paymentStatus !== 'paid')
      .reduce((s: number, b: any) => s + (b.grandTotal - (b.amountPaid ?? 0)), 0);

    return {
      total: bills.length,
      totalOutstanding: Math.round(totalOutstanding),
      bills: bills.map((b: any) => ({
        invoiceNo: b.invoiceNo,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        customerGstNo: b.customerGstNo,
        orderTag: b.orderTag,
        grandTotal: b.grandTotal,
        amountPaid: b.amountPaid ?? 0,
        outstanding: Math.round(b.grandTotal - (b.amountPaid ?? 0)),
        paymentStatus: b.paymentStatus,
        itemCount: (b.items ?? []).length,
        createdAt: this.toIST(b.createdAt),
      })),
    };
  }

  private async toolBillingCustomers(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const tag = String(args.tag ?? '').trim();
    const hasOutstanding = args.hasOutstanding === true;
    const limit = Number(args.limit ?? 20);

    const filter: any = {};
    if (searchTerm) {
      const esc = this.escape(searchTerm);
      filter.$or = [{ name: { $regex: esc, $options: 'i' } }, { phone: { $regex: esc, $options: 'i' } }];
    }
    if (tag) filter.tags = tag;
    if (hasOutstanding) filter.outstanding = { $gt: 0 };

    const customers = await this.userRepository.getModel()
      .find(filter).sort({ outstanding: -1 }).limit(limit).lean();

    return {
      total: customers.length,
      customers: customers.map((c: any) => ({
        name: c.name,
        phone: c.phone?.replace(/^91/, '') ?? '',
        gstNo: c.gstNo,
        tags: c.tags ?? [],
        outstanding: c.outstanding ?? 0,
        totalOrders: c.totalOrders ?? 0,
        totalSpent: c.totalSpent ?? 0,
      })),
    };
  }

  private async toolBillingGodowns() {
    const godowns = await this.godownModel.find({}).sort({ name: 1 }).lean();
    return {
      count: godowns.length,
      godowns: godowns.map((g: any) => ({ name: g.name, address: g.address, isActive: g.isActive })),
    };
  }
```

- [ ] **Step 7: Add new CRM tool implementations**

```typescript
  private async toolCrmOverview() {
    const segmentCounts = await this.crmStatsModel.aggregate([
      { $group: { _id: '$segment', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).exec();

    const vipCount = await this.crmStatsModel.countDocuments({ isVip: true });
    const totalTracked = await this.crmStatsModel.countDocuments({});

    return {
      totalTracked,
      vipCount,
      segments: segmentCounts.map((s: any) => ({ segment: s._id, count: s.count })),
    };
  }

  private async toolCrmCustomerDetail(args: Record<string, unknown>) {
    const searchTerm = String(args.customerName ?? args.phone ?? '').trim();
    if (!searchTerm) return { error: 'customerName or phone required' };

    const esc = this.escape(searchTerm);
    const isPhone = /^\d{7,}$/.test(searchTerm.replace(/[^\d]/g, ''));
    const userFilter = isPhone
      ? { phone: { $regex: searchTerm.replace(/[^\d]/g, '') } }
      : { name: { $regex: esc, $options: 'i' } };

    const user = await this.userRepository.getModel().findOne(userFilter).select('_id name phone').lean();
    if (!user) return { error: `Customer "${searchTerm}" not found` };

    const stats = await this.crmStatsModel.findOne({ userId: (user as any)._id }).lean();
    if (!stats) return { name: (user as any).name, phone: (user as any).phone, message: 'No CRM data yet' };

    const s = stats as any;
    return {
      name: (user as any).name,
      phone: (user as any).phone,
      segment: s.segment,
      isVip: s.isVip,
      daysLate: s.daysLate,
      predictedReorderDate: this.toIST(s.predictedReorderDate, true),
      personalCycle: s.personalCycle,
      cycleSource: s.cycleSource,
      topCategory: s.topCategory,
      topProduct: s.topProduct,
      ltv: s.ltv,
      aov: s.aov,
      priorityScore: s.priorityScore,
      segmentUpdatedAt: this.toIST(s.segmentUpdatedAt),
    };
  }

  private async toolCrmCallLogs(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 20);
    const filter: any = {};

    if (args.customerName || args.phone) {
      const term = String(args.customerName ?? args.phone ?? '').trim();
      const esc = this.escape(term);
      const isPhone = /^\d{7,}$/.test(term.replace(/[^\d]/g, ''));
      const userFilter = isPhone
        ? { phone: { $regex: term.replace(/[^\d]/g, '') } }
        : { name: { $regex: esc, $options: 'i' } };
      const user = await this.userRepository.getModel().findOne(userFilter).select('_id').lean();
      if (!user) return { logs: [], message: `Customer "${term}" not found` };
      filter.customerId = (user as any)._id;
    }
    if (args.outcome) filter.outcome = args.outcome;
    if (args.type) filter.type = args.type;
    if (args.from && args.to) {
      filter.createdAt = { $gte: new Date(args.from as string), $lte: new Date(args.to as string) };
    }

    const logs = await this.crmCallLogModel
      .find(filter)
      .populate('customerId', 'name phone')
      .populate('agentId', 'name')
      .sort({ createdAt: -1 }).limit(limit).lean();

    return {
      total: logs.length,
      logs: logs.map((l: any) => ({
        customer: (l.customerId as any)?.name ?? 'Unknown',
        phone: (l.customerId as any)?.phone?.replace(/^91/, '') ?? '',
        agent: (l.agentId as any)?.name ?? 'Unknown',
        type: l.type,
        outcome: l.outcome,
        notes: l.notes,
        callbackAt: this.toIST(l.callbackAt),
        createdAt: this.toIST(l.createdAt),
      })),
    };
  }

  private async toolCrmCampaigns(args: Record<string, unknown>) {
    const filter: any = {};
    if (args.status) filter.status = args.status;

    const campaigns = await this.crmCampaignModel
      .find(filter)
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 }).limit(20).lean();

    return {
      total: campaigns.length,
      campaigns: campaigns.map((c: any) => ({
        name: c.name,
        status: c.status,
        segmentFilter: c.segmentFilter,
        recipientCount: c.recipientCount,
        sentCount: c.sentCount,
        sentAt: this.toIST(c.sentAt),
        createdBy: (c.createdBy as any)?.name ?? '',
        approvedBy: (c.approvedBy as any)?.name ?? '',
        createdAt: this.toIST(c.createdAt),
      })),
    };
  }
```

- [ ] **Step 8: Add new purchase tool implementations**

```typescript
  private async toolPurchaseRequests(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 20);
    const filter: any = {};
    if (args.status) filter.status = String(args.status).toUpperCase();
    if (args.department) filter.department = String(args.department).toUpperCase();
    if (args.priority) filter.priority = String(args.priority).toUpperCase();
    if (args.from && args.to) {
      filter.createdAt = { $gte: new Date(args.from as string), $lte: new Date(args.to as string) };
    }

    const requests = await this.purchaseRequestModel
      .find(filter).sort({ createdAt: -1 }).limit(limit).lean();

    return {
      total: requests.length,
      requests: requests.map((r: any) => ({
        reqNo: r.reqNo,
        status: r.status,
        department: r.department,
        priority: r.priority,
        pendingLineCount: r.pendingLineCount,
        requiredBy: this.toIST(r.requiredBy, true),
        note: r.note,
        itemCount: (r.items ?? []).length,
        items: (r.items ?? []).slice(0, 5).map((i: any) => `${i.materialName} ${i.qtyKg}${i.uom ?? 'kg'}`),
        createdAt: this.toIST(r.createdAt),
      })),
    };
  }

  private async toolPurchaseRequestDetail(args: Record<string, unknown>) {
    const reqNo = String(args.reqNo ?? '').trim();
    if (!reqNo) return { error: 'reqNo required' };

    const r = await this.purchaseRequestModel
      .findOne({ reqNo: { $regex: this.escape(reqNo), $options: 'i' } }).lean();
    if (!r) return { error: `Purchase request "${reqNo}" not found` };

    const req = r as any;
    return {
      reqNo: req.reqNo,
      status: req.status,
      department: req.department,
      priority: req.priority,
      note: req.note,
      requiredBy: this.toIST(req.requiredBy, true),
      pendingLineCount: req.pendingLineCount,
      items: (req.items ?? []).map((i: any) => ({
        material: i.materialName,
        qty: `${i.qtyKg} ${i.uom ?? 'kg'}`,
        lineStatus: i.lineStatus,
        tag: i.tagName,
      })),
      requester: req.requester,
      poCreator: req.poCreator,
      approver: req.approver,
      receiver: req.receiver,
      createdAt: this.toIST(req.createdAt),
    };
  }

  private async toolPurchaseVendors() {
    const vendors = await this.purchaseVendorModel.find({ isActive: true }).sort({ name: 1 }).lean();
    return {
      count: vendors.length,
      vendors: vendors.map((v: any) => ({
        name: v.name,
        phone: v.phone,
        email: v.email,
        gstin: v.gstin,
        paymentTerms: v.paymentTerms,
      })),
    };
  }

  private async toolPurchaseMaterials(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const filter: any = {};
    if (searchTerm) filter.name = { $regex: this.escape(searchTerm), $options: 'i' };

    const materials = await this.purchaseMaterialModel.find(filter).sort({ name: 1 }).lean();
    return {
      count: materials.length,
      materials: materials.map((m: any) => ({
        name: m.name,
        uom: m.uom,
        description: m.description,
      })),
    };
  }
} // end of AdminChatbotToolsService
```

- [ ] **Step 9: Verify the file compiles**

```bash
cd backend && npx tsc --noEmit
```

Fix any import errors. Common issue: `Godown` schema may need to be imported from `'../billing/schemas/godown.schema'`.

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/admin-chatbot/admin-chatbot-tools.service.ts \
        backend/src/modules/crm/crm.module.ts \
        backend/src/modules/purchase/purchase.module.ts
git commit -m "feat(admin-chatbot): create AdminChatbotToolsService with billing/crm/purchase tools"
```

---

## Task 3: RouterAgent

**Files:**
- Create: `backend/src/modules/admin-chatbot/agents/router.agent.ts`

**Interfaces:**
- Produces: `RouterAgent` with `classify(query: string, history: HistoryItem[]): Promise<Domain[]>`

- [ ] **Step 1: Create the router agent**

```typescript
// backend/src/modules/admin-chatbot/agents/router.agent.ts
import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { Domain, HistoryItem, historyToContent, withTimeout } from '../agent-utils';

const ROUTER_SYSTEM_PROMPT = `You are a query router for an admin dashboard chatbot.

Classify the user query into one or more of these domains:
- "ops" — orders, delivery, products, inventory, stock, raw materials, analytics, revenue, customers (general), wallet, subscriptions, coupons, feedback, WhatsApp, store sales, payments, audit logs, abandoned carts, reminders
- "billing_crm" — B2B billing invoices, billing customers, outstanding amounts, godowns, CRM segments (active/overdue/at_risk/dormant), call logs, WhatsApp campaigns, customer reorder predictions, LTV, AOV
- "purchase" — purchase requests, procurement, PO (purchase orders), vendors, raw material purchasing, department requisitions

Rules:
- A query can belong to multiple domains — return all that apply.
- When in doubt, include "ops" — it is the broadest domain.
- Return ONLY valid JSON in this exact shape: {"domains": ["ops"]}
- Never add explanation text outside the JSON.

Examples:
"show today's orders" → {"domains": ["ops"]}
"who are the at-risk customers" → {"domains": ["billing_crm"]}
"billing outstanding for overdue CRM customers" → {"domains": ["billing_crm"]}
"pending purchase requests" → {"domains": ["purchase"]}
"sales and purchase summary this month" → {"domains": ["ops", "purchase"]}
"call log for Rahul" → {"domains": ["billing_crm"]}
"low stock and pending POs" → {"domains": ["ops", "purchase"]}
`.trim();

@Injectable()
export class RouterAgent {
  private readonly logger = new Logger(RouterAgent.name);

  async classify(query: string, history: HistoryItem[]): Promise<Domain[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return ['ops'];

    try {
      const ai = new GoogleGenAI({ apiKey });
      const geminiHistory = historyToContent(history.slice(-4)); // last 2 exchanges enough for routing

      const chat = ai.chats.create({
        model: 'gemini-2.0-flash-001',
        history: geminiHistory,
        config: {
          systemInstruction: ROUTER_SYSTEM_PROMPT,
          temperature: 0.1,
          maxOutputTokens: 64,
        },
      });

      const response = await withTimeout(chat.sendMessage({ message: query }), 10_000);
      const text = (response.text ?? '').trim();

      // Extract JSON — handle markdown code blocks if model wraps it
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn(`[Router] Non-JSON response: ${text}`);
        return ['ops'];
      }

      const parsed = JSON.parse(jsonMatch[0]) as { domains?: string[] };
      const valid: Domain[] = (parsed.domains ?? []).filter(
        (d): d is Domain => d === 'ops' || d === 'billing_crm' || d === 'purchase',
      );

      this.logger.log(`[Router] "${query.slice(0, 60)}" → [${valid.join(', ')}]`);
      return valid.length > 0 ? valid : ['ops'];
    } catch (err) {
      this.logger.warn(`[Router] Failed (${(err as Error).message}), defaulting to ops`);
      return ['ops'];
    }
  }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/admin-chatbot/agents/router.agent.ts
git commit -m "feat(admin-chatbot): add RouterAgent for domain classification"
```

---

## Task 4: OpsAgent

**Files:**
- Create: `backend/src/modules/admin-chatbot/agents/ops.agent.ts`

**Interfaces:**
- Consumes: `AdminChatbotToolsService.execute(name, args)`
- Produces: `OpsAgent` with `run(query: string, history: HistoryItem[]): Promise<string>`

- [ ] **Step 1: Create the ops agent**

```typescript
// backend/src/modules/admin-chatbot/agents/ops.agent.ts
import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration, type Content, type Part } from '@google/genai';
import { AdminChatbotToolsService } from '../admin-chatbot-tools.service';
import { HistoryItem, historyToContent, responseText, withTimeout, capArrays } from '../agent-utils';

const MAX_TOOL_ITERATIONS = 10;
const UNCACHED_TOOLS = new Set(['send_email_report', 'preview_email_report']);

const S = 'STRING' as any;
const N = 'NUMBER' as any;
const O = 'OBJECT' as any;
const B = 'BOOLEAN' as any;

// Copy ADMIN_TOOL_DECLARATIONS verbatim from admin-chatbot.service.ts lines 90–501
const OPS_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  // paste all 35 tool declarations here unchanged
];

const OPS_SYSTEM_PROMPT = `You are the NatureLite data-fetching agent for operational data.

Your ONLY job: call the right tools to fetch data that answers the user query. Do NOT format for humans. Return a concise raw data summary after fetching.

## Tool routing
### Orders
- "how many orders / total orders / orders today / orders this month" → get_dashboard_summary or get_orders_by_status
- "list orders / find order / show orders" → search_orders
- "order detail / ORD-XXXX" → get_order_detail
- "order status breakdown / how many in each status" → get_orders_by_status
- "compare this week vs last / week-over-week" → compare_periods

### Revenue & Analytics
- "revenue trend / daily revenue" → get_revenue_trend
- "analytics / full period report / monthly summary" → get_analytics_period
- "best selling products / top products" → get_top_selling_products
- "how much X sold / X units sold" → get_top_selling_products(searchTerm=X)

### Customers
- "find customer / customer profile" → search_customers
- "orders for [customer] / customer order history" → get_customer_orders
- "top customer / who spends most" → get_top_customers
- "new customers" → get_customers_filtered(type="new")
- "inactive customers / churned" → get_customers_filtered(type="inactive")
- "wallet balance" → get_wallet(type="balances")

### Delivery
- "delivery agent performance / cash collected" → get_delivery_data(view="collections")
- "delivery history" → get_delivery_data(view="history")
- "pending settlements" → get_delivery_data(view="pending")

### Payments
- "payment method breakdown / COD vs online" → get_orders_by_status
- "failed payments / gateway errors" → get_payments(status="failed")

### Inventory
- "price / stock / MRP / variants" → search_products
- "low stock" → get_products_by_stock(status="low")
- "out of stock" → get_products_by_stock(status="out")
- "IMS / in-store stock" → get_store_stock
- "raw materials / coconut / PMS" → get_raw_materials or get_raw_material_snapshots
- "categories" → get_categories
- "stores" → get_stores

### Other
- "subscriptions" → get_subscriptions
- "store sales / walk-in / offline sales" → get_store_sales
- "coupons" → get_coupon_list
- "feedback / reviews" → get_feedback_list
- "WhatsApp queue / support queue" → get_whatsapp_queue
- "audit log / who changed X" → search_audit_logs
- "admin users / staff" → get_admin_users
- "abandoned carts" → search_abandoned_carts
- "email report" → preview_email_report first, then send_email_report
`.trim();

@Injectable()
export class OpsAgent {
  private readonly logger = new Logger(OpsAgent.name);
  private _cache: any = null;
  private _cacheExpiry: Date | null = null;
  private _cacheCreationPromise: Promise<any> | null = null;
  private _cacheFailedUntil = 0;

  constructor(private readonly tools: AdminChatbotToolsService) {}

  async run(query: string, history: HistoryItem[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return 'ERROR: GEMINI_API_KEY not set';

    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL!;
    const geminiHistory = historyToContent(history);

    const cache = await this.getOrRefreshCache(apiKey, modelName);
    const chat = ai.chats.create({
      model: modelName,
      history: geminiHistory,
      config: {
        ...(cache
          ? { cachedContent: cache.name }
          : {
              systemInstruction: OPS_SYSTEM_PROMPT,
              tools: [{ functionDeclarations: OPS_TOOL_DECLARATIONS }],
              toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            }),
        temperature: 0.1,
        maxOutputTokens: 3000,
      },
    });

    let response = await withTimeout(chat.sendMessage({ message: query }));

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const fnParts = parts.filter((p: Part) => p.functionCall != null);
      if (fnParts.length === 0) return responseText(response);

      const toolResponseParts: Part[] = [];
      for (const part of fnParts) {
        const { name, args } = (part as any).functionCall as { name: string; args: Record<string, unknown> };
        this.logger.log(`[OpsAgent] ${name}(${JSON.stringify(args)})`);
        try {
          const result = await this.tools.execute(name, args ?? {});
          toolResponseParts.push({ functionResponse: { name, response: capArrays(result, 25) } } as any);
        } catch (err) {
          toolResponseParts.push({ functionResponse: { name, response: { error: (err as Error).message } } } as any);
        }
      }
      response = await withTimeout(chat.sendMessage({ message: toolResponseParts as any }));
    }

    const finalParts = response.candidates?.[0]?.content?.parts ?? [];
    if (finalParts.some((p: Part) => p.functionCall != null)) {
      response = await withTimeout(chat.sendMessage({ message: 'Summarize what you found so far.' }));
    }

    return responseText(response) || 'No ops data found.';
  }

  private async getOrRefreshCache(apiKey: string, modelName: string): Promise<any> {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    if (this._cache && this._cacheExpiry && this._cacheExpiry.getTime() - now > tenMinutes) return this._cache;
    if (now < this._cacheFailedUntil) return null;
    if (this._cacheCreationPromise) return this._cacheCreationPromise;

    this._cacheCreationPromise = (async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const cache = await ai.caches.create({
          model: modelName,
          config: {
            systemInstruction: OPS_SYSTEM_PROMPT,
            tools: [{ functionDeclarations: OPS_TOOL_DECLARATIONS }],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            ttl: '3600s',
          },
        });
        this._cache = cache;
        this._cacheExpiry = new Date(cache.expireTime as string);
        this.logger.log(`[OpsAgent] Cache created, expires ${this._cacheExpiry.toISOString()}`);
        return cache;
      } catch (err) {
        this.logger.warn(`[OpsAgent] Cache failed: ${(err as Error).message}`);
        this._cacheFailedUntil = Date.now() + 5 * 60 * 1000;
        return null;
      } finally {
        this._cacheCreationPromise = null;
      }
    })();

    return this._cacheCreationPromise;
  }
}
```

> **Important:** Copy `OPS_TOOL_DECLARATIONS` verbatim from `ADMIN_TOOL_DECLARATIONS` in the current `admin-chatbot.service.ts` (lines 90–501). Do not modify them.

- [ ] **Step 2: Verify compile**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/admin-chatbot/agents/ops.agent.ts
git commit -m "feat(admin-chatbot): add OpsAgent with all existing operational tools"
```

---

## Task 5: BillingCrmAgent

**Files:**
- Create: `backend/src/modules/admin-chatbot/agents/billing-crm.agent.ts`

**Interfaces:**
- Consumes: `AdminChatbotToolsService.execute(name, args)`
- Produces: `BillingCrmAgent` with `run(query: string, history: HistoryItem[]): Promise<string>`

- [ ] **Step 1: Create the billing-crm agent**

```typescript
// backend/src/modules/admin-chatbot/agents/billing-crm.agent.ts
import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration, type Part } from '@google/genai';
import { AdminChatbotToolsService } from '../admin-chatbot-tools.service';
import { HistoryItem, historyToContent, responseText, withTimeout, capArrays } from '../agent-utils';

const MAX_TOOL_ITERATIONS = 8;

const S = 'STRING' as any;
const N = 'NUMBER' as any;
const O = 'OBJECT' as any;
const B = 'BOOLEAN' as any;

const BILLING_CRM_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_billing_bills',
    description: 'Search B2B billing invoices. Use for: "billing invoices", "show bills", "outstanding invoices", "unpaid bills", "bills for [customer]", "bills this month".',
    parameters: {
      type: O,
      properties: {
        invoiceNo: { type: S, description: 'Invoice number e.g. INV-001' },
        customerName: { type: S, description: 'Customer name filter' },
        customerPhone: { type: S, description: 'Customer phone filter' },
        paymentStatus: { type: S, description: 'paid | partial | unpaid' },
        orderTag: { type: S, description: 'B2B | Transport | Home Delivery | Wholesale | Retail' },
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'get_billing_customers',
    description: 'Get billing customers with tags and outstanding amounts. Use for: "billing customers", "customers with outstanding", "B2B customers", "wholesale customers", "who owes money".',
    parameters: {
      type: O,
      properties: {
        searchTerm: { type: S, description: 'Customer name or phone' },
        tag: { type: S, description: 'B2B | Transport | Wholesale | Retail | Home Delivery' },
        hasOutstanding: { type: B, description: 'If true, only customers with outstanding > 0' },
        limit: { type: N, description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'get_billing_godowns',
    description: 'List all godowns / warehouses.',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'get_crm_overview',
    description: 'CRM segment counts: how many customers are active, overdue, at_risk, dormant, lost, new. Use for: "CRM overview", "customer health", "how many overdue customers", "at-risk customers count", "dormant customers".',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'get_crm_customer_detail',
    description: 'CRM data for one customer: segment, LTV, AOV, predicted reorder date, days late, priority score, top product. Use for: "CRM for [customer]", "is [customer] at risk", "when will [customer] reorder", "customer health for [name]".',
    parameters: {
      type: O,
      properties: {
        customerName: { type: S, description: 'Customer name' },
        phone: { type: S, description: 'Customer phone number' },
      },
    },
  },
  {
    name: 'get_crm_call_logs',
    description: 'Call and WhatsApp contact history. Use for: "call history for [customer]", "who called [customer]", "recent calls", "calls with outcome ordered", "callback due".',
    parameters: {
      type: O,
      properties: {
        customerName: { type: S, description: 'Customer name filter' },
        phone: { type: S, description: 'Customer phone filter' },
        outcome: { type: S, description: 'connected | no_answer | ordered | not_interested | callback' },
        type: { type: S, description: 'call | whatsapp' },
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'get_crm_campaigns',
    description: 'WhatsApp CRM campaign list. Use for: "campaigns", "marketing campaigns", "sent campaigns", "draft campaigns", "campaign performance".',
    parameters: {
      type: O,
      properties: {
        status: { type: S, description: 'draft | approved | sent' },
      },
    },
  },
];

const BILLING_CRM_SYSTEM_PROMPT = `You are the NatureLite data-fetching agent for Billing and CRM data.

Your ONLY job: call the right tools to fetch billing invoices, customer outstanding, CRM segments, call logs, and campaigns. Return a concise raw data summary after fetching.

## Tool routing
- "billing invoices / bills / outstanding" → get_billing_bills (with paymentStatus="unpaid" or "partial" for outstanding)
- "billing customers / who owes money" → get_billing_customers(hasOutstanding=true)
- "B2B customers / wholesale customers" → get_billing_customers(tag="B2B" or "Wholesale")
- "godowns / warehouses" → get_billing_godowns
- "CRM overview / segment counts / how many at-risk" → get_crm_overview
- "CRM for [customer] / is [customer] overdue / reorder date" → get_crm_customer_detail
- "call log / contact history for [customer]" → get_crm_call_logs(customerName=...)
- "callbacks due / pending callbacks" → get_crm_call_logs(outcome="callback")
- "campaigns / WhatsApp campaigns" → get_crm_campaigns
`.trim();

@Injectable()
export class BillingCrmAgent {
  private readonly logger = new Logger(BillingCrmAgent.name);

  constructor(private readonly tools: AdminChatbotToolsService) {}

  async run(query: string, history: HistoryItem[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return 'ERROR: GEMINI_API_KEY not set';

    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL!;
    const geminiHistory = historyToContent(history);

    const chat = ai.chats.create({
      model: modelName,
      history: geminiHistory,
      config: {
        systemInstruction: BILLING_CRM_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: BILLING_CRM_TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        temperature: 0.1,
        maxOutputTokens: 2000,
      },
    });

    let response = await withTimeout(chat.sendMessage({ message: query }));

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const fnParts = parts.filter((p: Part) => p.functionCall != null);
      if (fnParts.length === 0) return responseText(response);

      const toolResponseParts: Part[] = [];
      for (const part of fnParts) {
        const { name, args } = (part as any).functionCall as { name: string; args: Record<string, unknown> };
        this.logger.log(`[BillingCrmAgent] ${name}(${JSON.stringify(args)})`);
        try {
          const result = await this.tools.execute(name, args ?? {});
          toolResponseParts.push({ functionResponse: { name, response: capArrays(result, 25) } } as any);
        } catch (err) {
          toolResponseParts.push({ functionResponse: { name, response: { error: (err as Error).message } } } as any);
        }
      }
      response = await withTimeout(chat.sendMessage({ message: toolResponseParts as any }));
    }

    const finalParts = response.candidates?.[0]?.content?.parts ?? [];
    if (finalParts.some((p: Part) => p.functionCall != null)) {
      response = await withTimeout(chat.sendMessage({ message: 'Summarize what you found so far.' }));
    }

    return responseText(response) || 'No billing/CRM data found.';
  }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/admin-chatbot/agents/billing-crm.agent.ts
git commit -m "feat(admin-chatbot): add BillingCrmAgent with billing and CRM tools"
```

---

## Task 6: PurchaseAgent

**Files:**
- Create: `backend/src/modules/admin-chatbot/agents/purchase.agent.ts`

**Interfaces:**
- Consumes: `AdminChatbotToolsService.execute(name, args)`
- Produces: `PurchaseAgent` with `run(query: string, history: HistoryItem[]): Promise<string>`

- [ ] **Step 1: Create the purchase agent**

```typescript
// backend/src/modules/admin-chatbot/agents/purchase.agent.ts
import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration, type Part } from '@google/genai';
import { AdminChatbotToolsService } from '../admin-chatbot-tools.service';
import { HistoryItem, historyToContent, responseText, withTimeout, capArrays } from '../agent-utils';

const MAX_TOOL_ITERATIONS = 6;

const S = 'STRING' as any;
const N = 'NUMBER' as any;
const O = 'OBJECT' as any;

const PURCHASE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_purchase_requests',
    description: 'List purchase requests (PRs) for raw materials procurement. Use for: "purchase requests", "pending PRs", "urgent requisitions", "PRs for flour mill", "approved POs", "what needs to be procured".',
    parameters: {
      type: O,
      properties: {
        status: { type: S, description: 'REQUESTED | PO_CREATED | APPROVED | VENDOR_BILL_UPLOADED | COMPLETED | CANCELLED | REJECTED' },
        department: { type: S, description: 'FLOUR_MILL | OIL_PRESS | PACKING | STORE | OTHER' },
        priority: { type: S, description: 'NORMAL | URGENT' },
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'get_purchase_request_detail',
    description: 'Get full detail of one purchase request including all line items, actors, and current stage.',
    parameters: {
      type: O,
      properties: {
        reqNo: { type: S, description: 'Purchase request number e.g. PR-001' },
      },
      required: ['reqNo'],
    },
  },
  {
    name: 'get_purchase_vendors',
    description: 'List all active vendors with contact, GSTIN, and payment terms.',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'get_purchase_materials',
    description: 'List raw materials that can be procured, with unit of measure.',
    parameters: {
      type: O,
      properties: {
        searchTerm: { type: S, description: 'Material name filter' },
      },
    },
  },
];

const PURCHASE_SYSTEM_PROMPT = `You are the NatureLite data-fetching agent for Purchase and Procurement data.

Your ONLY job: call the right tools to fetch purchase requests, PO pipeline, vendor info, and materials. Return a concise raw data summary.

## Tool routing
- "purchase requests / pending PRs / what needs procurement" → get_purchase_requests (optionally filter by status/department/priority)
- "urgent requisitions" → get_purchase_requests(priority="URGENT")
- "approved PRs / approved POs" → get_purchase_requests(status="APPROVED")
- "PR detail / full PR for [reqNo]" → get_purchase_request_detail(reqNo=...)
- "vendors / supplier list / who do we buy from" → get_purchase_vendors
- "materials / what raw materials can we procure" → get_purchase_materials
`.trim();

@Injectable()
export class PurchaseAgent {
  private readonly logger = new Logger(PurchaseAgent.name);

  constructor(private readonly tools: AdminChatbotToolsService) {}

  async run(query: string, history: HistoryItem[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return 'ERROR: GEMINI_API_KEY not set';

    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL!;
    const geminiHistory = historyToContent(history);

    const chat = ai.chats.create({
      model: modelName,
      history: geminiHistory,
      config: {
        systemInstruction: PURCHASE_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: PURCHASE_TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        temperature: 0.1,
        maxOutputTokens: 2000,
      },
    });

    let response = await withTimeout(chat.sendMessage({ message: query }));

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const fnParts = parts.filter((p: Part) => p.functionCall != null);
      if (fnParts.length === 0) return responseText(response);

      const toolResponseParts: Part[] = [];
      for (const part of fnParts) {
        const { name, args } = (part as any).functionCall as { name: string; args: Record<string, unknown> };
        this.logger.log(`[PurchaseAgent] ${name}(${JSON.stringify(args)})`);
        try {
          const result = await this.tools.execute(name, args ?? {});
          toolResponseParts.push({ functionResponse: { name, response: capArrays(result, 25) } } as any);
        } catch (err) {
          toolResponseParts.push({ functionResponse: { name, response: { error: (err as Error).message } } } as any);
        }
      }
      response = await withTimeout(chat.sendMessage({ message: toolResponseParts as any }));
    }

    const finalParts = response.candidates?.[0]?.content?.parts ?? [];
    if (finalParts.some((p: Part) => p.functionCall != null)) {
      response = await withTimeout(chat.sendMessage({ message: 'Summarize what you found so far.' }));
    }

    return responseText(response) || 'No purchase data found.';
  }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/admin-chatbot/agents/purchase.agent.ts
git commit -m "feat(admin-chatbot): add PurchaseAgent for procurement data"
```

---

## Task 7: SynthesizerAgent

**Files:**
- Create: `backend/src/modules/admin-chatbot/agents/synthesizer.agent.ts`

**Interfaces:**
- Consumes: `AgentOutput[]` from `agent-utils.ts`
- Produces: `SynthesizerAgent` with `synthesize(query: string, outputs: AgentOutput[], history: HistoryItem[]): Promise<string>`

- [ ] **Step 1: Create the synthesizer agent**

```typescript
// backend/src/modules/admin-chatbot/agents/synthesizer.agent.ts
import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AgentOutput, HistoryItem, historyToContent, responseText, withTimeout } from '../agent-utils';

const SYNTHESIZER_SYSTEM_PROMPT = `You are the NatureLite Admin Assistant response formatter.

You will receive raw data summaries from one or more specialist agents. Your job is to produce the final, accurate, well-formatted reply to the admin.

## Non-negotiable rules

1. **Answer-first.** State the exact value in the first sentence.
   ✓ "Vansh has placed **7 orders** totalling **₹3,240**."
   ✗ "Based on the data..."

2. **Copy numbers verbatim.** Never round, estimate, or paraphrase a quantity from the data.

3. **Dates are pre-formatted in IST.** Report date/time strings exactly as received.

4. **Empty result ≠ zero.** If data says "No X found", say "No [X] found" — not "0 X".

5. **Single-value questions → one sentence.**

6. **Lists:** markdown table when ≥3 rows with multiple columns. Bullet list for ≤5 items.

7. **Money:** always ₹ with Indian formatting (₹1,24,500). Never show paise.

8. **Never mention** "tool", "function", "database", "API", "agent", or "query" in replies.

9. **No filler.** No "Sure!", "Great question!", "Of course!", "Certainly!" — ever.

10. **Cross-domain synthesis:** when data comes from multiple agents, integrate it into one coherent answer. Do not show data from each agent separately — blend into a single response.
`.trim();

@Injectable()
export class SynthesizerAgent {
  private readonly logger = new Logger(SynthesizerAgent.name);

  async synthesize(query: string, outputs: AgentOutput[], history: HistoryItem[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return outputs.map((o) => o.data).join('\n\n');

    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL!;
    const geminiHistory = historyToContent(history);

    const dataSection = outputs
      .map((o) => `=== ${o.domain.toUpperCase()} DATA ===\n${o.data}`)
      .join('\n\n');

    const message = `User query: "${query}"\n\nAgent data:\n${dataSection}\n\nGenerate the final formatted reply.`;

    const chat = ai.chats.create({
      model: modelName,
      history: geminiHistory,
      config: {
        systemInstruction: SYNTHESIZER_SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 4000,
      },
    });

    try {
      const response = await withTimeout(chat.sendMessage({ message }));
      return responseText(response) || '⚠️ Could not generate a response.';
    } catch (err) {
      this.logger.warn(`[Synthesizer] Failed: ${(err as Error).message}`);
      // Fallback: return the first agent's output directly
      return outputs[0]?.data ?? '⚠️ No data available.';
    }
  }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/admin-chatbot/agents/synthesizer.agent.ts
git commit -m "feat(admin-chatbot): add SynthesizerAgent for cross-domain response formatting"
```

---

## Task 8: Refactor AdminChatbotService as Orchestrator

**Files:**
- Modify: `backend/src/modules/admin-chatbot/admin-chatbot.service.ts`

**Context:** The current file is ~2374 lines with all tool implementations. After Task 2 moved tools to `AdminChatbotToolsService`, this file needs to become a thin orchestrator (~250 lines). Keep `chat()`, `streamChat()`, `enqueueChat()`, `getChatJobResult()`, `getBriefing()`, `getHistory()`, `clearHistory()`, `persistSession()` signatures unchanged so the controller requires no edits.

- [ ] **Step 1: Replace admin-chatbot.service.ts with the orchestrator**

```typescript
// backend/src/modules/admin-chatbot/admin-chatbot.service.ts
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { QUEUE_CHATBOT, CHATBOT_JOBS, DEFAULT_JOB_OPTIONS } from '../queues/queues.constants';
import { AdminChatSessionRepository } from './repositories/admin-chat-session.repository';
import { AdminChatbotToolsService } from './admin-chatbot-tools.service';
import { RouterAgent } from './agents/router.agent';
import { OpsAgent } from './agents/ops.agent';
import { BillingCrmAgent } from './agents/billing-crm.agent';
import { PurchaseAgent } from './agents/purchase.agent';
import { SynthesizerAgent } from './agents/synthesizer.agent';
import { HistoryItem, Domain, AgentOutput, historyToContent, responseText, withTimeout } from './agent-utils';
import { SettingsService } from '../settings/settings.service';

export type { HistoryItem };

@Injectable()
export class AdminChatbotService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminChatbotService.name);

  constructor(
    private readonly adminChatSessionRepository: AdminChatSessionRepository,
    private readonly tools: AdminChatbotToolsService,
    private readonly router: RouterAgent,
    private readonly opsAgent: OpsAgent,
    private readonly billingCrmAgent: BillingCrmAgent,
    private readonly purchaseAgent: PurchaseAgent,
    private readonly synthesizer: SynthesizerAgent,
    private readonly settingsService: SettingsService,
    @InjectQueue(QUEUE_CHATBOT) private readonly chatbotQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    // Warm up OpsAgent cache in the background
    this.opsAgent['getOrRefreshCache'](process.env.GEMINI_API_KEY!, process.env.GEMINI_MODEL!).catch(() => {});
  }

  // ─── Main chat entry point ───────────────────────────────────────────────────

  async chat(message: string, _history: HistoryItem[], adminId: string): Promise<{ reply: string }> {
    const safeMessage = this.tools.sanitize(message);
    const history = await this.loadSessionHistory(adminId);
    const reply = await this.orchestrate(safeMessage, history);
    await this.persistSession(adminId, safeMessage, reply);
    return { reply };
  }

  async streamChat(message: string, _history: HistoryItem[], adminId: string, res: Response): Promise<void> {
    const safeMessage = this.tools.sanitize(message);
    const history = await this.loadSessionHistory(adminId);

    // Stream: run orchestration, then write as SSE
    const reply = await this.orchestrate(safeMessage, history);

    // Chunk the reply into tokens for streaming UX
    const words = reply.split(' ');
    for (const word of words) {
      res.write(`data: ${JSON.stringify({ delta: word + ' ' })}\n\n`);
      await new Promise((r) => setTimeout(r, 8));
    }
    res.write('data: [DONE]\n\n');

    await this.persistSession(adminId, safeMessage, reply);
  }

  async enqueueChat(message: string, history: HistoryItem[], adminId: string): Promise<{ jobId: string }> {
    const safeMessage = this.tools.sanitize(message);
    const job = await this.chatbotQueue.add(
      CHATBOT_JOBS.ADMIN_CHAT,
      { message: safeMessage, history, adminId },
      DEFAULT_JOB_OPTIONS,
    );
    return { jobId: String(job.id) };
  }

  async getChatJobResult(jobId: string): Promise<{ status: 'pending' | 'done' | 'failed'; reply?: string }> {
    const job = await this.chatbotQueue.getJob(jobId);
    if (!job) return { status: 'failed' };
    const state = await job.getState();
    if (state === 'completed') return { status: 'done', reply: job.returnvalue?.reply ?? '' };
    if (state === 'failed') return { status: 'failed' };
    return { status: 'pending' };
  }

  // ─── Core orchestration ──────────────────────────────────────────────────────

  private async orchestrate(message: string, history: HistoryItem[]): Promise<string> {
    // 1. Route
    const domains = await this.router.classify(message, history);
    this.logger.log(`[Orchestrator] domains=[${domains.join(', ')}] for "${message.slice(0, 60)}"`);

    // 2. Fire relevant agents in parallel
    const agentTasks: Promise<AgentOutput>[] = [];
    if (domains.includes('ops')) {
      agentTasks.push(
        this.opsAgent.run(message, history).then((data) => ({ domain: 'ops' as Domain, data })),
      );
    }
    if (domains.includes('billing_crm')) {
      agentTasks.push(
        this.billingCrmAgent.run(message, history).then((data) => ({ domain: 'billing_crm' as Domain, data })),
      );
    }
    if (domains.includes('purchase')) {
      agentTasks.push(
        this.purchaseAgent.run(message, history).then((data) => ({ domain: 'purchase' as Domain, data })),
      );
    }

    const settled = await Promise.allSettled(agentTasks);
    const outputs: AgentOutput[] = settled
      .filter((r): r is PromiseFulfilledResult<AgentOutput> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((o) => o.data && !o.data.startsWith('ERROR:'));

    if (outputs.length === 0) return '⚠️ Could not fetch data. Please try again.';

    // 3. Single domain → skip synthesizer (saves one LLM call)
    if (outputs.length === 1) return outputs[0].data;

    // 4. Multi-domain → synthesize
    return this.synthesizer.synthesize(message, outputs, history);
  }

  // ─── Session management ──────────────────────────────────────────────────────

  private async loadSessionHistory(adminId: string): Promise<HistoryItem[]> {
    try {
      const session = await this.adminChatSessionRepository.getByAdminId(adminId);
      const messages = (session?.messages ?? []).slice(-24);
      return messages.map((m: any) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        text: m.text as string,
      }));
    } catch {
      return [];
    }
  }

  private async persistSession(adminId: string, userMsg: string, reply: string): Promise<void> {
    const ts = new Date().toISOString();
    await this.adminChatSessionRepository.appendMessages(adminId, [
      { id: `${Date.now()}-u`, sender: 'user', text: userMsg, timestamp: ts },
      { id: `${Date.now()}-a`, sender: 'assistant', text: reply, timestamp: ts },
    ]).catch(() => {});
  }

  async getHistory(adminId: string) {
    const session = await this.adminChatSessionRepository.getByAdminId(adminId);
    return session?.messages ?? [];
  }

  async clearHistory(adminId: string): Promise<void> {
    await this.adminChatSessionRepository.clearSession(adminId);
  }

  // ─── Briefing (unchanged) ────────────────────────────────────────────────────

  async getBriefing(): Promise<Record<string, unknown>> {
    try {
      const data = await this.tools.execute('get_dashboard_summary', {});
      return { briefing: data };
    } catch {
      return { briefing: null };
    }
  }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/admin-chatbot/admin-chatbot.service.ts
git commit -m "refactor(admin-chatbot): convert AdminChatbotService to multi-agent orchestrator"
```

---

## Task 9: Update AdminChatbotModule

**Files:**
- Modify: `backend/src/modules/admin-chatbot/admin-chatbot.module.ts`

**Context:** The module must import BillingModule, CrmModule, PurchaseModule and register the new schemas (BillingBill, Godown, CrmCustomerStats, CrmCallLog, CrmCampaign, PurchaseRequest, PurchaseVendor, PurchaseMaterial) plus all new providers.

- [ ] **Step 1: Update the module**

Replace `admin-chatbot.module.ts` with:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AdminChatbotController } from './admin-chatbot.controller';
import { AdminChatbotService } from './admin-chatbot.service';
import { AdminChatbotToolsService } from './admin-chatbot-tools.service';
import { AdminChatbotProcessor, ChatbotQueueProcessor } from './admin-chatbot.processor';
import { RouterAgent } from './agents/router.agent';
import { OpsAgent } from './agents/ops.agent';
import { BillingCrmAgent } from './agents/billing-crm.agent';
import { PurchaseAgent } from './agents/purchase.agent';
import { SynthesizerAgent } from './agents/synthesizer.agent';
import { QUEUE_ADMIN, QUEUE_CHATBOT } from '../queues/queues.constants';
import { AdminChatSessionRepository } from './repositories/admin-chat-session.repository';
import { AdminChatSession, AdminChatSessionSchema } from './schemas/admin-chat-session.schema';
import { Subscription, SubscriptionSchema } from '../subscriptions/schemas/subscription.schema';
import { RawMaterial, RawMaterialSchema } from '../raw-materials/schemas/raw-material.schema';
import { RawMaterialDailyEntry, RawMaterialDailyEntrySchema } from '../raw-materials/schemas/raw-material-snapshot.schema';
import { Store, StoreSchema } from '../stores/schemas/store.schema';
import { BillingBill, BillingBillSchema } from '../billing/schemas/billing-bill.schema';
import { Godown, GodownSchema } from '../billing/schemas/godown.schema';
import { CrmCustomerStats, CrmCustomerStatsSchema } from '../crm/schemas/crm-customer-stats.schema';
import { CrmCallLog, CrmCallLogSchema } from '../crm/schemas/crm-call-log.schema';
import { CrmCampaign, CrmCampaignSchema } from '../crm/schemas/crm-campaign.schema';
import { PurchaseRequest, PurchaseRequestSchema } from '../purchase/schemas/purchase-request.schema';
import { PurchaseVendor, PurchaseVendorSchema } from '../purchase/schemas/purchase-vendor.schema';
import { PurchaseMaterial, PurchaseMaterialSchema } from '../purchase/schemas/purchase-material.schema';
import { ProductsModule } from '../products/products.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { CouponsModule } from '../coupons/coupons.module';
import { CartModule } from '../cart/cart.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsModule } from '../payments/payments.module';
import { StoreSalesModule } from '../store-sales/store-sales.module';
import { RemindersModule } from '../reminders/reminders.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EmailModule } from '../email/email.module';
import { SettingsModule } from '../settings/settings.module';
import { StoreStockModule } from '../store-stock/store-stock.module';
import { CategoriesModule } from '../categories/categories.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_ADMIN }),
    BullModule.registerQueue({ name: QUEUE_CHATBOT }),
    MongooseModule.forFeature([
      { name: AdminChatSession.name, schema: AdminChatSessionSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: RawMaterial.name, schema: RawMaterialSchema },
      { name: RawMaterialDailyEntry.name, schema: RawMaterialDailyEntrySchema },
      { name: Store.name, schema: StoreSchema },
      { name: BillingBill.name, schema: BillingBillSchema },
      { name: Godown.name, schema: GodownSchema },
      { name: CrmCustomerStats.name, schema: CrmCustomerStatsSchema },
      { name: CrmCallLog.name, schema: CrmCallLogSchema },
      { name: CrmCampaign.name, schema: CrmCampaignSchema },
      { name: PurchaseRequest.name, schema: PurchaseRequestSchema },
      { name: PurchaseVendor.name, schema: PurchaseVendorSchema },
      { name: PurchaseMaterial.name, schema: PurchaseMaterialSchema },
    ]),
    forwardRef(() => ProductsModule),
    forwardRef(() => ChatbotModule),
    forwardRef(() => AnalyticsModule),
    forwardRef(() => OrdersModule),
    UsersModule,
    FeedbackModule,
    CouponsModule,
    forwardRef(() => CartModule),
    WalletModule,
    PaymentsModule,
    StoreSalesModule,
    RemindersModule,
    forwardRef(() => WhatsAppModule),
    EmailModule,
    SettingsModule,
    StoreStockModule,
    CategoriesModule,
    AdminModule,
  ],
  controllers: [AdminChatbotController],
  providers: [
    AdminChatbotService,
    AdminChatbotToolsService,
    AdminChatSessionRepository,
    AdminChatbotProcessor,
    ChatbotQueueProcessor,
    RouterAgent,
    OpsAgent,
    BillingCrmAgent,
    PurchaseAgent,
    SynthesizerAgent,
  ],
})
export class AdminChatbotModule {}
```

- [ ] **Step 2: Full compile check**

```bash
cd backend && npx tsc --noEmit
```

Fix any remaining type errors before proceeding.

- [ ] **Step 3: Start the backend and verify it boots**

```bash
cd backend && npm run start:dev
```

Expected: `[AdminChatbotService] Nest application successfully started` with no errors. The OpsAgent cache warm-up may log `[OpsAgent] Cache created`.

- [ ] **Step 4: Smoke test — single domain query**

POST `admin/chatbot/chat` with `{ "message": "show today's orders" }`.
Expected: response contains order data, no `⚠️` error prefix.

- [ ] **Step 5: Smoke test — billing domain query**

POST `admin/chatbot/chat` with `{ "message": "show unpaid billing invoices" }`.
Expected: response contains billing data (or "No billing bills found" if empty), not an ops response.

- [ ] **Step 6: Smoke test — cross-domain query**

POST `admin/chatbot/chat` with `{ "message": "show me billing outstanding for at-risk CRM customers" }`.
Expected: response contains both billing and CRM data blended into one answer.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/admin-chatbot/admin-chatbot.module.ts
git commit -m "feat(admin-chatbot): wire up multi-agent module — router, ops, billing-crm, purchase, synthesizer"
```

---

## Task 10: Update AdminChatbotProcessor

**Files:**
- Modify: `backend/src/modules/admin-chatbot/admin-chatbot.processor.ts`

**Context:** The BullMQ processor calls `adminChatbotService.chat()` for async jobs. Since `chat()` signature is unchanged, this task is just a compile verification, but the processor may import removed types.

- [ ] **Step 1: Open and check the processor**

Read `admin-chatbot.processor.ts` and verify it only imports `AdminChatbotService` and `HistoryItem`. If it imports anything else that was removed from `admin-chatbot.service.ts`, fix the import to point to `agent-utils.ts`.

- [ ] **Step 2: Compile check**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit if any changes were needed**

```bash
git add backend/src/modules/admin-chatbot/admin-chatbot.processor.ts
git commit -m "fix(admin-chatbot): update processor imports after service refactor"
```

---

## Self-Review Checklist

After completing all tasks:

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run start:dev` boots cleanly  
- [ ] Single-domain query (`"today's orders"`) → OpsAgent fires, no Synthesizer call
- [ ] Billing query (`"unpaid bills"`) → BillingCrmAgent fires, Router returns `["billing_crm"]`
- [ ] Purchase query (`"pending purchase requests"`) → PurchaseAgent fires
- [ ] Cross-domain query (`"billing outstanding + at-risk CRM"`) → both agents fire in parallel, Synthesizer merges
- [ ] Router fallback: if Gemini returns non-JSON, defaults to `["ops"]` without throwing
- [ ] Promise.allSettled: if one agent throws, other agent's data still reaches Synthesizer
- [ ] History loaded once per request, not per agent
