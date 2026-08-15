import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  type Content,
  type Part,
} from '@google/genai';
import { RedisService } from '../redis/redis.service';
import { QUEUE_ADMIN, ADMIN_JOBS, QUEUE_CHATBOT, CHATBOT_JOBS, DEFAULT_JOB_OPTIONS } from '../queues/queues.constants';
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
import { Subscription } from '../subscriptions/schemas/subscription.schema';
import { RawMaterial } from '../raw-materials/schemas/raw-material.schema';
import { RawMaterialDailyEntry } from '../raw-materials/schemas/raw-material-snapshot.schema';
import { Store } from '../stores/schemas/store.schema';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { parseDateRange } from '../../common/utils/date-parse.util';

export type HistoryItem = { role: 'user' | 'assistant'; text: string };

const MAX_TOOL_ITERATIONS = 4;

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
};

function capArrays(obj: Record<string, unknown>, max: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = Array.isArray(v) && v.length > max ? v.slice(0, max) : v;
  }
  return out;
}

// ─── Tool Declarations ────────────────────────────────────────────────────────

const S = 'STRING' as any;
const N = 'NUMBER' as any;
const O = 'OBJECT' as any;
const B = 'BOOLEAN' as any;

const ADMIN_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_dashboard_summary',
    description: 'Get today and month overview: orders, revenue, pending count, recent orders, total customers.',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'search_orders',
    description: 'Search orders with filters. Use for listing orders, finding a specific order by number, filtering by status/customer/payment/date.',
    parameters: {
      type: O,
      properties: {
        orderNumber: { type: S, description: 'Exact or partial order number e.g. ORD-2025-001' },
        status: { type: S, description: 'placed | confirmed | preparing | out_for_delivery | delivered | cancelled' },
        customerName: { type: S, description: 'Customer name or phone to filter' },
        paymentMethod: { type: S, description: 'cod | upi | online | wallet' },
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Max results, default 15' },
      },
    },
  },
  {
    name: 'get_order_detail',
    description: 'Get complete detail of one order: all items, full timeline, delivery agent, shipping address, notes, edits.',
    parameters: {
      type: O,
      properties: {
        orderNumber: { type: S, description: 'Order number e.g. ORD-2025-001' },
      },
      required: ['orderNumber'],
    },
  },
  {
    name: 'get_orders_by_status',
    description: 'Get all-time order count grouped by status (placed, confirmed, preparing, delivered, cancelled, etc.).',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'compare_periods',
    description: 'Compare current period vs previous period for orders, revenue, customers.',
    parameters: {
      type: O,
      properties: {
        days: { type: N, description: 'Days per period, e.g. 7 for week-over-week, 30 for month-over-month' },
      },
    },
  },
  {
    name: 'search_products',
    description: 'Search products by name or SKU. Returns price, MRP, stock, active status, variants, last updated.',
    parameters: {
      type: O,
      properties: {
        searchTerm: { type: S, description: 'Product name or keyword' },
      },
    },
  },
  {
    name: 'get_product_detail',
    description: 'Get full detail of one product: all variants, stock, MRP, GST, updatedAt, category.',
    parameters: {
      type: O,
      properties: {
        productName: { type: S, description: 'Product name to look up' },
      },
      required: ['productName'],
    },
  },
  {
    name: 'get_products_by_stock',
    description: 'Find products by stock status. status=low: at/below threshold ("low stock", "running low", "need restock"); status=out: zero stock ("out of stock", "no stock"); status=in: available ("in stock", "available", "which X can I sell").',
    parameters: {
      type: O,
      properties: {
        status: { type: S, description: 'low | out | in' },
        searchTerm: { type: S, description: 'Optional product name filter e.g. "oil", "ghee"' },
      },
      required: ['status'],
    },
  },
  {
    name: 'get_store_stock',
    description: 'Get IMS (in-store stock) levels per store. Shows stock, stockIn, damaged, threshold per product.',
    parameters: {
      type: O,
      properties: {
        storeName: { type: S, description: 'Store name or code filter' },
        productName: { type: S, description: 'Product name filter' },
        lowStockOnly: { type: B, description: 'If true, only return low/zero stock items' },
      },
    },
  },
  {
    name: 'get_raw_materials',
    description: 'Get RMS raw material list with current total stock per store.',
    parameters: {
      type: O,
      properties: {
        storeName: { type: S, description: 'Store name filter' },
        searchTerm: { type: S, description: 'Material name filter' },
      },
    },
  },
  {
    name: 'get_raw_material_snapshots',
    description: 'Get PMS daily entries: opening stock, stock-in, processed, output litres, closing stock per date.',
    parameters: {
      type: O,
      properties: {
        storeName: { type: S, description: 'Store name filter' },
        materialName: { type: S, description: 'Material name filter e.g. "coconut"' },
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
      },
    },
  },
  {
    name: 'get_categories',
    description: 'List all product categories with product counts.',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'get_stores',
    description: 'List all stores with address, phone, active status.',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'search_customers',
    description: 'Search customers by name, phone, or email. Returns profile: orders, spent, status, address.',
    parameters: {
      type: O,
      properties: {
        searchTerm: { type: S, description: 'Customer name, phone, or email' },
        limit: { type: N, description: 'Max results, default 10' },
      },
      required: ['searchTerm'],
    },
  },
  {
    name: 'get_customer_orders',
    description: 'Get full order history for a specific customer by name or phone.',
    parameters: {
      type: O,
      properties: {
        name: { type: S, description: 'Customer name' },
        phone: { type: S, description: 'Customer phone number' },
        limit: { type: N, description: 'Max orders, default 10' },
      },
    },
  },
  {
    name: 'get_top_customers',
    description: 'Get top customers ranked by total spend.',
    parameters: {
      type: O,
      properties: {
        limit: { type: N, description: 'Number of customers, default 10' },
        minSpent: { type: N, description: 'Minimum total spend filter in rupees' },
      },
    },
  },
  {
    name: 'get_customers_filtered',
    description: 'Get customers by type: new=joined recently ("new customers", "joined this week"); inactive=not ordered in N days ("churned", "inactive", "haven\'t ordered"); blocked=blocked accounts.',
    parameters: {
      type: O,
      properties: {
        type: { type: S, description: 'new | inactive | blocked' },
        days: { type: N, description: 'Lookback days for new (default 7); inactivity threshold for inactive (default 30)' },
        limit: { type: N, description: 'Max results, default 20' },
      },
      required: ['type'],
    },
  },
  {
    name: 'get_revenue_trend',
    description: 'Get day-by-day revenue and order counts for a date range.',
    parameters: {
      type: O,
      properties: {
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        days: { type: N, description: 'Lookback days if no from/to, default 14' },
      },
    },
  },
  {
    name: 'get_analytics_period',
    description: 'Get comprehensive analytics for a period: orders, revenue, customers, inventory, top products, top customers.',
    parameters: {
      type: O,
      properties: {
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        days: { type: N, description: 'Lookback days if no from/to, default 30' },
      },
    },
  },
  {
    name: 'get_top_selling_products',
    description: 'Get best-selling products by units sold and revenue for a period.',
    parameters: {
      type: O,
      properties: {
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Number of products, default 8' },
        searchTerm: { type: S, description: 'Filter by product name' },
      },
    },
  },
  {
    name: 'search_abandoned_carts',
    description: 'Find customers with items in cart who have not ordered in 60+ minutes.',
    parameters: {
      type: O,
      properties: {
        limit: { type: N, description: 'Max results, default 30' },
        productSearch: { type: S, description: 'Filter by product name in cart' },
      },
    },
  },
  {
    name: 'get_store_sales',
    description: 'Get offline store sales (walk-in and delivery) for a date range with summary.',
    parameters: {
      type: O,
      properties: {
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Max sales to return, default 20' },
      },
    },
  },
  {
    name: 'get_sale_detail',
    description: 'Get full detail of one store sale including all items, customer, payment.',
    parameters: {
      type: O,
      properties: {
        saleNumber: { type: S, description: 'Sale number e.g. SALE-001' },
      },
      required: ['saleNumber'],
    },
  },
  {
    name: 'get_delivery_data',
    description: 'Delivery agent data. view=collections: cash/UPI collected per agent for a period; view=history: delivered orders with amounts and settlement status; view=pending: unsettled cash for a specific agent.',
    parameters: {
      type: O,
      properties: {
        view: { type: S, description: 'collections | history | pending' },
        agentName: { type: S, description: 'Filter by delivery agent name' },
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Max results, default 20' },
      },
      required: ['view'],
    },
  },
  {
    name: 'get_wallet',
    description: 'Wallet data. type=balances: customers with unused wallet credit (amounts in paise ÷ 100 = rupees); type=transactions: credit/debit history for a specific customer (requires phone or customerName).',
    parameters: {
      type: O,
      properties: {
        type: { type: S, description: 'balances | transactions' },
        phone: { type: S, description: 'Customer phone (required for transactions)' },
        customerName: { type: S, description: 'Customer name (for transactions)' },
        limit: { type: N, description: 'Max results' },
      },
      required: ['type'],
    },
  },
  {
    name: 'get_subscriptions',
    description: 'Subscription data. Without phone/customerName: all active/paused subscriptions and upcoming deliveries. With phone or customerName: that customer\'s subscription detail.',
    parameters: {
      type: O,
      properties: {
        phone: { type: S, description: 'Customer phone for detail lookup' },
        customerName: { type: S, description: 'Customer name for detail lookup' },
      },
    },
  },
  {
    name: 'get_payments',
    description: 'Get payment records by status: failed | pending | success | refunded. When status=refunded, returns refund-specific details (refund amount, reason, refund date). Use for payment failures, successful payments, and refund queries.',
    parameters: {
      type: O,
      properties: {
        status: { type: S, description: 'failed | pending | success | refunded' },
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'search_audit_logs',
    description: 'Search admin audit logs. Use for "when was X updated/changed", "who did X", login history, product stock changes. action can be: admin.login, product.update, product.create, product.delete, order.status_change, order.cancel, user.block, user.unblock, coupon.create, coupon.update, settings.update, category.create, category.update.',
    parameters: {
      type: O,
      properties: {
        action: { type: S, description: 'Audit action type e.g. product.update, admin.login, order.status_change' },
        targetName: { type: S, description: 'Name of the thing that was modified e.g. "Coconut Oil", "Rahul"' },
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Max results, default 20' },
      },
    },
  },
  {
    name: 'get_admin_users',
    description: 'List all admin staff with role, department, store, last login.',
    parameters: {
      type: O,
      properties: {
        role: { type: S, description: 'admin | superadmin' },
        department: { type: S, description: 'packing | billing | delivery | crm_head | crm_senior' },
      },
    },
  },
  {
    name: 'get_coupon_list',
    description: 'List coupons with usage count, discount, validity, status.',
    parameters: {
      type: O,
      properties: {
        status: { type: S, description: 'active | expired | upcoming | inactive' },
      },
    },
  },
  {
    name: 'get_coupon_usage',
    description: 'See which customers used a specific coupon code and when.',
    parameters: {
      type: O,
      properties: {
        couponCode: { type: S, description: 'Coupon code e.g. SAVE20' },
      },
      required: ['couponCode'],
    },
  },
  {
    name: 'get_feedback_list',
    description: 'Get customer reviews and feedback with ratings.',
    parameters: {
      type: O,
      properties: {
        limit: { type: N, description: 'Max results, default 15' },
        minRating: { type: N, description: 'Minimum star rating' },
        maxRating: { type: N, description: 'Maximum star rating' },
        type: { type: S, description: 'review | complaint | suggestion' },
        productName: { type: S, description: 'Filter by product name' },
      },
    },
  },
  {
    name: 'get_whatsapp_queue',
    description: 'Get current WhatsApp support queue: sessions handed off to human agents, recent activity.',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'get_whatsapp_messages',
    description: 'Get WhatsApp message history for a specific customer phone number.',
    parameters: {
      type: O,
      properties: {
        phone: { type: S, description: 'Customer phone number' },
        limit: { type: N, description: 'Max messages, default 20' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'get_reminders',
    description: 'Get overdue and upcoming payment reminders for store sales.',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'preview_email_report',
    description: 'Preview an email report before sending. ALWAYS call this before send_email_report.',
    parameters: {
      type: O,
      properties: {
        to: { type: S, description: 'Recipient email address' },
        reportType: { type: S, description: 'dashboard | analytics | orders | revenue | customers | feedback | coupons | store_sales | inventory | payments | abandoned' },
      },
      required: ['to', 'reportType'],
    },
  },
  {
    name: 'send_email_report',
    description: 'Send an email report. Only call after user confirms from preview.',
    parameters: {
      type: O,
      properties: {
        to: { type: S, description: 'Recipient email address' },
        reportType: { type: S, description: 'Report type matching the previewed report' },
      },
      required: ['to', 'reportType'],
    },
  },
];

// ─── System Prompt ────────────────────────────────────────────────────────────

const ADMIN_SYSTEM_PROMPT = `You are the NatureLite AI Admin Assistant — an internal tool for store managers.

You have real-time access to all store data via function calls.

## Non-negotiable rules

ALWAYS call a tool before answering any data question. Never guess, estimate, or infer a number, name, date, or status. If no tool result covers the question, say "No data found."

Call multiple tools in a single turn when a question spans domains — e.g., customer question: call search_customers + get_customer_orders together.

## Tool routing
- "when was X updated / changed / edited" → search_audit_logs with action="product.update" and targetName=X
- "who logged in / login history" → search_audit_logs with action="admin.login"
- IMS / in-store stock → get_store_stock
- PMS / RMS / raw materials / processing → get_raw_materials or get_raw_material_snapshots
- low stock / out of stock / in stock → get_products_by_stock with status=low|out|in
- wallet balance → get_wallet(type="balances"); wallet history → get_wallet(type="transactions", phone=...)
- new/inactive/blocked customers → get_customers_filtered with type=new|inactive|blocked
- delivery collections/history/pending → get_delivery_data with view=collections|history|pending
- subscriptions → get_subscriptions (add phone/customerName for one customer's detail)
- refunds → get_payments(status="refunded")
- email report → preview_email_report first, send only after user confirms

## Precision rules — read carefully

1. **Answer-first.** State the exact value in the first sentence. Never open with context, "based on", "it appears", or "the data shows."
   ✓ "Vansh has placed **7 orders** totalling **₹3,240**."
   ✗ "Based on the customer data, Vansh seems to have placed several orders."

2. **Copy numbers verbatim.** Never round, estimate, or paraphrase a quantity from a tool result. If the tool says 42 — write 42.

3. **Dates are pre-formatted in IST.** Report date/time strings exactly as received from tool results — do NOT re-convert or add/subtract hours.
   ✓ "Last updated on **15 Jan 2025, 3:42 PM IST** by Rahul."
   ✗ Modifying the time shown in the tool result.

4. **Empty result ≠ zero.** If the tool returns an empty array, say "No [X] found" — not "0 orders". If stock field is 0, say "Out of stock (0 units)."

5. **Error field in tool result.** If the result has an \`error\` key, report exactly what wasn't found and suggest narrowing the search (different spelling, phone number instead of name, etc.).

6. **Single-value questions → one sentence.** "How many orders does Vansh have?" → one sentence, done.

7. **Lists:** show as a markdown table when ≥3 rows with multiple columns. Bullet list for ≤5 items.

8. **Money:** always ₹ with Indian formatting (e.g., ₹1,24,500). Never show paise in final answer.

9. **Never mention** "tool", "function", "database", "API", or "query" in replies.

10. **No filler.** No "Sure!", "Great question!", "Of course!", "Certainly!" — ever.`.trim();

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AdminChatbotService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminChatbotService.name);

  private _geminiCache: any = null;
  private _cacheExpiry: Date | null = null;
  private _cachedModelName: string | null = null;
  private _cacheCreationPromise: Promise<any> | null = null;
  private _cacheFailedUntil: number = 0;

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
    private readonly redisService: RedisService,
    @InjectQueue(QUEUE_ADMIN) private readonly adminQueue: Queue,
    @InjectQueue(QUEUE_CHATBOT) private readonly chatbotQueue: Queue,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private resolveRange(params: Record<string, unknown>): { from: Date; to: Date } {
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

  private escape(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private sanitize(message: string): string {
    return message.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 500);
  }

  private historyToContent(history: HistoryItem[]): Content[] {
    return history.map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    }));
  }

  private toIST(d: Date | string | null | undefined, dateOnly = false): string {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d as string);
    if (isNaN(date.getTime())) return '';
    const ist = new Date(date.getTime() + 19_800_000); // UTC+5:30
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

  private async getOrRefreshCache(apiKey: string, modelName: string): Promise<any> {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    // Return existing cache if still valid
    if (
      this._geminiCache &&
      this._cacheExpiry &&
      this._cachedModelName === modelName &&
      this._cacheExpiry.getTime() - now > tenMinutes
    ) {
      return this._geminiCache;
    }

    // Cooldown: don't retry within 5 minutes of a failure
    if (now < this._cacheFailedUntil) return null;

    // Reuse in-flight creation to prevent race condition
    if (this._cacheCreationPromise) return this._cacheCreationPromise;

    this._cacheCreationPromise = (async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const cache = await ai.caches.create({
          model: modelName,
          config: {
            systemInstruction: ADMIN_SYSTEM_PROMPT,
            tools: [{ functionDeclarations: ADMIN_TOOL_DECLARATIONS }],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            ttl: '3600s',
          },
        });
        this._geminiCache = cache;
        this._cacheExpiry = new Date(cache.expireTime as string);
        this._cachedModelName = modelName;
        this.logger.log(`[Admin AI] Context cache created, expires ${this._cacheExpiry.toISOString()}`);
        return cache;
      } catch (err) {
        this.logger.warn(`[Admin AI] Context cache failed (${(err as Error).message}), retrying in 5 min`);
        this._geminiCache = null;
        this._cacheFailedUntil = Date.now() + 5 * 60 * 1000;
        return null;
      } finally {
        this._cacheCreationPromise = null;
      }
    })();

    return this._cacheCreationPromise;
  }

  private async persistSession(adminId: string, userMsg: string, reply: string) {
    const ts = new Date().toISOString();
    await this.adminChatSessionRepository.appendMessages(adminId, [
      { id: `${Date.now()}-u`, sender: 'user', text: userMsg, timestamp: ts },
      { id: `${Date.now()}-a`, sender: 'assistant', text: reply, timestamp: ts },
    ]).catch(() => {});
  }

  // ─── Core agentic loop ────────────────────────────────────────────────────────

  private async runAgenticLoop(
    userMessage: string,
    geminiHistory: Content[],
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return '⚠️ GEMINI_API_KEY not configured.';

    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL!;

    const cache = await this.getOrRefreshCache(apiKey, modelName);
    const chat = ai.chats.create({
      model: modelName,
      history: geminiHistory,
      config: {
        ...(cache
          ? { cachedContent: cache.name }
          : {
              systemInstruction: ADMIN_SYSTEM_PROMPT,
              tools: [{ functionDeclarations: ADMIN_TOOL_DECLARATIONS }],
              toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            }),
        temperature: 0.2,
        maxOutputTokens: 800,
      },
    });

    let response = await chat.sendMessage({ message: userMessage });

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const candidate = response.candidates?.[0];
      if (!candidate) break;

      const parts = candidate.content?.parts ?? [];
      const fnParts = parts.filter((p: Part) => p.functionCall != null);

      if (fnParts.length === 0) {
        return (response.text ?? '').trim();
      }

      const toolResponseParts: Part[] = [];
      for (const part of fnParts) {
        const { name, args } = (part as any).functionCall as { name: string; args: Record<string, unknown> };
        this.logger.log(`[Admin AI] ${name}(${JSON.stringify(args)})`);
        try {
          const toolResult = await this.executeTool(name, args ?? {});
          toolResponseParts.push({ functionResponse: { name, response: capArrays(toolResult, 10) } } as any);
        } catch (err) {
          toolResponseParts.push({ functionResponse: { name, response: { error: (err as Error).message } } } as any);
        }
      }

      response = await chat.sendMessage({ message: toolResponseParts as any });
    }

    return (response.text ?? '').trim() || '⚠️ Could not generate a response.';
  }

  // ─── Tool dispatcher ──────────────────────────────────────────────────────────

  async executeTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (UNCACHED_TOOLS.has(name)) {
      return this._runTool(name, args);
    }

    return this.cachedTool(name, args, () => this._runTool(name, args), TOOL_TTL[name] ?? 90);
  }

  private async _runTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (name) {
      case 'get_dashboard_summary':    return this.toolDashboard();
      case 'search_orders':            return this.toolSearchOrders(args);
      case 'get_order_detail':         return this.toolOrderDetail(args);
      case 'get_orders_by_status':     return this.toolOrdersByStatus();
      case 'compare_periods':          return this.toolComparePeriods(args);
      case 'search_products':          return this.toolSearchProducts(args);
      case 'get_product_detail':       return this.toolProductDetail(args);
      case 'get_products_by_stock': {
        const s = String(args.status ?? '').toLowerCase();
        if (s === 'out') return this.toolOutOfStock(args);
        if (s === 'in')  return this.toolInStock(args);
        return this.toolLowStock(args); // 'low' default
      }
      case 'get_store_stock':          return this.toolStoreStock(args);
      case 'get_raw_materials':        return this.toolRawMaterials(args);
      case 'get_raw_material_snapshots': return this.toolRawMaterialSnapshots(args);
      case 'get_categories':           return this.toolCategories();
      case 'get_stores':               return this.toolStores();
      case 'search_customers':         return this.toolSearchCustomers(args);
      case 'get_customer_orders':      return this.toolCustomerOrders(args);
      case 'get_top_customers':        return this.toolTopCustomers(args);
      case 'get_customers_filtered': {
        const t = String(args.type ?? '').toLowerCase();
        if (t === 'new')     return this.toolNewCustomers(args);
        if (t === 'blocked') return this.toolBlockedCustomers();
        return this.toolInactiveCustomers(args); // 'inactive' default
      }
      case 'get_revenue_trend':        return this.toolRevenueTrend(args);
      case 'get_analytics_period':     return this.toolAnalyticsPeriod(args);
      case 'get_top_selling_products': return this.toolTopSelling(args);
      case 'search_abandoned_carts':   return this.toolAbandonedCarts(args);
      case 'get_store_sales':          return this.toolStoreSales(args);
      case 'get_sale_detail':          return this.toolSaleDetail(args);
      case 'get_delivery_data': {
        const v = String(args.view ?? '').toLowerCase();
        if (v === 'collections') return this.toolDeliveryCollections(args);
        if (v === 'pending')     return this.toolPendingCollections(args);
        return this.toolDeliveryHistory(args); // 'history' default
      }
      case 'get_wallet':
        return String(args.type ?? '').toLowerCase() === 'transactions'
          ? this.toolWalletTransactions(args)
          : this.toolWalletBalances(args);
      case 'get_subscriptions':
        return (args.phone || args.customerName)
          ? this.toolSubscriptionDetail(args)
          : this.toolSubscriptionData();
      case 'get_payments':
        return String(args.status ?? '').toLowerCase() === 'refunded'
          ? this.toolRefundHistory(args)
          : this.toolPayments(args);
      case 'search_audit_logs':        return this.toolAuditLogs(args);
      case 'get_admin_users':          return this.toolAdminUsers(args);
      case 'get_coupon_list':          return this.toolCouponList(args);
      case 'get_coupon_usage':         return this.toolCouponUsage(args);
      case 'get_feedback_list':        return this.toolFeedbackList(args);
      case 'get_whatsapp_queue':       return this.toolWhatsAppQueue();
      case 'get_whatsapp_messages':    return this.toolWhatsAppMessages(args);
      case 'get_reminders':            return this.toolReminders();
      case 'preview_email_report':     return this.toolPreviewEmail(args);
      case 'send_email_report':        return this.toolSendEmail(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  // ─── Tool implementations ─────────────────────────────────────────────────────

  private async toolDashboard() {
    const stats = await this.analyticsService.getDashboardStats() as any;
    return {
      todayOrders: stats.todayOrders ?? 0,
      todayRevenue: stats.todayRevenue ?? 0,
      monthOrders: stats.monthOrders ?? 0,
      monthRevenue: stats.monthRevenue ?? 0,
      totalCustomers: stats.totalCustomers ?? 0,
      pendingOrders: stats.pendingOrders ?? 0,
      recentOrders: (stats.recentOrders ?? []).slice(0, 5).map((o: any) => ({
        orderNumber: o.orderNumber,
        customer: o.user?.name ?? 'Guest',
        total: o.total,
        status: o.status,
      })),
    };
  }

  private async toolSearchOrders(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 15);
    const STATUS_MAP: Record<string, string> = { shipped: 'out_for_delivery', pending: 'placed', processing: 'preparing', dispatched: 'out_for_delivery', completed: 'delivered', done: 'delivered' };
    const rawStatus = args.status as string | undefined;
    const status = rawStatus ? (STATUS_MAP[rawStatus.toLowerCase()] ?? rawStatus.toLowerCase()) : undefined;
    const customerName = String(args.customerName ?? '').trim();
    const paymentMethod = String(args.paymentMethod ?? '').trim().toLowerCase();
    const orderNumber = String(args.orderNumber ?? '').trim();

    const filter: Record<string, unknown> = {};
    if (orderNumber) filter.orderNumber = { $regex: this.escape(orderNumber), $options: 'i' };
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = { $regex: paymentMethod, $options: 'i' };
    if (args.from && args.to) {
      const fromD = new Date(args.from as string);
      const toD = new Date(args.to as string);
      if (!isNaN(fromD.getTime()) && !isNaN(toD.getTime()))
        filter.createdAt = { $gte: fromD, $lte: toD };
    }

    if (customerName) {
      const esc = this.escape(customerName);
      const users = await this.userRepository.getModel()
        .find({ $or: [{ name: { $regex: esc, $options: 'i' } }, { phone: { $regex: esc, $options: 'i' } }] })
        .select('_id').limit(20).lean();
      if (!users.length) return { orders: [], total: 0, message: `No customer found matching "${customerName}"` };
      filter.user = { $in: users.map((u: any) => u._id) };
    }

    const orders = await this.orderRepository.getModel()
      .find(filter).sort({ createdAt: -1 }).limit(limit)
      .populate('user', 'name phone').lean();

    return {
      total: orders.length,
      orders: orders.map((o: any) => ({
        orderNumber: o.orderNumber,
        customer: o.user?.name ?? 'Guest',
        phone: o.user?.phone ?? '',
        total: o.total,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        createdAt: this.toIST(o.createdAt),
        couponCode: o.couponCode,
        discount: o.discount,
        walletUsed: o.walletUsed,
        items: (o.items ?? []).map((i: any) => `${i.name}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity} @₹${i.price}`),
      })),
    };
  }

  private async toolOrderDetail(args: Record<string, unknown>) {
    const orderNum = String(args.orderNumber ?? '').trim();
    const order = await this.orderRepository.getModel()
      .findOne({ orderNumber: { $regex: this.escape(orderNum), $options: 'i' } })
      .populate('user', 'name phone email')
      .lean();

    if (!order) return { error: `Order "${orderNum}" not found` };

    const o = order as any;
    let agentName = '';
    if (o.assignedDeliveryUserId) {
      const agent = await this.adminUserRepository.getModel().findById(o.assignedDeliveryUserId).select('name').lean().catch(() => null);
      agentName = (agent as any)?.name ?? String(o.assignedDeliveryUserId);
    }

    return {
      orderNumber: o.orderNumber,
      customer: { name: o.user?.name, phone: o.user?.phone, email: o.user?.email },
      status: o.status,
      total: o.total,
      gstTotal: o.gstTotal,
      shippingCharge: o.shippingCharge,
      discount: o.discount,
      walletUsed: o.walletUsed,
      couponCode: o.couponCode,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      shippingAddress: o.shippingAddress,
      items: (o.items ?? []).map((i: any) => ({ name: i.name, variant: i.variantName, qty: i.quantity, price: i.price, total: i.total })),
      timeline: (o.timeline ?? []).map((t: any) => ({ status: t.status, at: this.toIST(t.changedAt), by: t.changedBy })),
      assignedDeliveryAgent: agentName,
      deliveredAt: this.toIST(o.deliveredAt),
      packedAt: this.toIST(o.packedAt),
      packedBy: o.packedBy,
      adminNotes: o.adminNotes,
      amountCollected: o.amountCollected,
      collectionStatus: o.collectionStatus,
      createdAt: this.toIST(o.createdAt),
    };
  }

  private async toolOrdersByStatus() {
    const counts = await this.orderRepository.getOrdersByStatus();
    const total = Object.values(counts).reduce((s: number, n: any) => s + (n || 0), 0);
    return { total, byStatus: counts };
  }

  private async toolComparePeriods(args: Record<string, unknown>) {
    const days = Number(args.days ?? 7);
    const now = new Date();
    const aEnd = now;
    const aStart = new Date(now.getTime() - days * 86_400_000);
    const bEnd = new Date(aStart.getTime());
    const bStart = new Date(bEnd.getTime() - days * 86_400_000);

    const [ma, mb, ca, cb] = await Promise.all([
      this.analyticsService.getOrderMetrics(aStart, aEnd),
      this.analyticsService.getOrderMetrics(bStart, bEnd),
      this.analyticsService.getCustomerMetrics(aStart, aEnd),
      this.analyticsService.getCustomerMetrics(bStart, bEnd),
    ]);

    const a = ma as any; const b = mb as any;
    return {
      periodA: { from: this.toIST(aStart, true), to: this.toIST(aEnd, true), days },
      periodB: { from: this.toIST(bStart, true), to: this.toIST(bEnd, true), days },
      orders: { current: a.totalOrders ?? 0, previous: b.totalOrders ?? 0 },
      revenue: { current: a.totalRevenue ?? 0, previous: b.totalRevenue ?? 0 },
      avgOrderValue: { current: Math.round(a.avgOrderValue ?? 0), previous: Math.round(b.avgOrderValue ?? 0) },
      newCustomers: { current: (ca as any).newCustomers ?? 0, previous: (cb as any).newCustomers ?? 0 },
      delivered: { current: a.completedOrders ?? 0, previous: b.completedOrders ?? 0 },
      cancelled: { current: a.cancelledOrders ?? 0, previous: b.cancelledOrders ?? 0 },
    };
  }

  private async toolSearchProducts(args: Record<string, unknown>) {
    const term = String(args.searchTerm ?? '').trim();
    const items = await this.productRepository.searchByText(term);
    return {
      total: items.length,
      products: items.slice(0, 10).map((p: any) => ({
        name: p.name,
        sku: p.sku,
        price: p.price,
        mrp: p.mrp,
        stock: p.stock,
        isActive: p.isActive,
        updatedAt: this.toIST(p.updatedAt),
        category: (p.category as any)?.name ?? '',
        variants: Array.isArray(p.variants) ? p.variants.map((v: any) => ({ name: v.name, sku: v.sku, price: v.price, stock: v.stock })) : [],
      })),
    };
  }

  private async toolProductDetail(args: Record<string, unknown>) {
    const name = String(args.productName ?? '').trim();
    const product = await this.productRepository.getModel()
      .findOne({ name: { $regex: this.escape(name), $options: 'i' } })
      .populate('category', 'name')
      .lean();
    if (!product) return { error: `Product "${name}" not found` };
    const p = product as any;
    return {
      name: p.name, sku: p.sku, price: p.price, mrp: p.mrp,
      stock: p.stock, isActive: p.isActive, trackStock: p.trackStock,
      lowStockThreshold: p.lowStockThreshold, gstPercentage: p.gstPercentage,
      category: (p.category as any)?.name ?? '',
      description: p.description,
      updatedAt: this.toIST(p.updatedAt), createdAt: this.toIST(p.createdAt),
      variants: Array.isArray(p.variants) ? p.variants.map((v: any) => ({
        name: v.name, sku: v.sku, price: v.price, mrp: v.mrp, stock: v.stock, isActive: v.isActive,
      })) : [],
    };
  }

  private async toolLowStock(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const nameFilter = searchTerm ? { name: { $regex: this.escape(searchTerm), $options: 'i' } } : {};
    const THRESHOLD = 10;
    const items = await this.productRepository.getModel().aggregate([
      { $match: { isActive: true, ...nameFilter } },
      { $addFields: {
        totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] },
        effectiveThreshold: { $cond: [{ $and: [{ $eq: ['$trackStock', true] }, { $gt: ['$lowStockThreshold', 0] }] }, '$lowStockThreshold', THRESHOLD] },
      }},
      { $match: { $expr: { $lte: ['$totalStock', '$effectiveThreshold'] } } },
      { $sort: { totalStock: 1 } }, { $limit: 20 },
    ]).exec();
    return {
      count: items.length,
      products: items.map((p: any) => ({ name: p.name, sku: p.sku, stock: p.totalStock, threshold: p.lowStockThreshold || THRESHOLD })),
    };
  }

  private async toolOutOfStock(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const nameFilter = searchTerm ? { name: { $regex: this.escape(searchTerm), $options: 'i' } } : {};
    const items = await this.productRepository.getModel().aggregate([
      { $match: { isActive: true, trackStock: { $ne: false }, ...nameFilter } },
      { $addFields: { totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] } } },
      { $match: { totalStock: { $lte: 0 } } },
      { $sort: { name: 1 } }, { $limit: 50 },
    ]).exec();
    return {
      count: items.length,
      products: items.map((p: any) => ({ name: p.name, sku: p.sku ?? 'N/A', price: p.price })),
    };
  }

  private async toolInStock(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const nameFilter = searchTerm ? { name: { $regex: this.escape(searchTerm), $options: 'i' } } : {};
    const items = await this.productRepository.getModel().aggregate([
      { $match: { isActive: true, ...nameFilter } },
      { $addFields: { totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] } } },
      { $match: { $or: [{ trackStock: false }, { totalStock: { $gt: 0 } }] } },
      { $sort: { name: 1 } }, { $limit: 30 },
    ]).exec();
    return {
      count: items.length,
      products: items.map((p: any) => ({ name: p.name, sku: p.sku, stock: p.trackStock === false ? 'unlimited' : p.totalStock, price: p.price })),
    };
  }

  private async toolStoreStock(args: Record<string, unknown>) {
    const storeName = String(args.storeName ?? '').trim();
    const productName = String(args.productName ?? '').trim();
    const lowStockOnly = Boolean(args.lowStockOnly);

    const pipeline: any[] = [
      {
        $lookup: {
          from: 'stores', localField: 'store', foreignField: '_id',
          pipeline: [{ $project: { name: 1, code: 1 } }], as: 'storeInfo',
        },
      },
      { $unwind: '$storeInfo' },
      {
        $lookup: {
          from: 'products', localField: 'product', foreignField: '_id',
          pipeline: [{ $project: { name: 1, sku: 1 } }], as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
    ];

    const matchConds: any[] = [];
    if (storeName) matchConds.push({ $or: [{ 'storeInfo.name': { $regex: this.escape(storeName), $options: 'i' } }, { 'storeInfo.code': { $regex: this.escape(storeName), $options: 'i' } }] });
    if (productName) matchConds.push({ 'productInfo.name': { $regex: this.escape(productName), $options: 'i' } });
    if (lowStockOnly) matchConds.push({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } });
    if (matchConds.length) pipeline.push({ $match: { $and: matchConds } });

    pipeline.push({ $sort: { 'storeInfo.name': 1, 'productInfo.name': 1 } }, { $limit: 100 });

    const rows = await this.storeStockRepository.getModel().aggregate(pipeline).exec();
    return {
      count: rows.length,
      items: rows.map((r: any) => ({
        store: r.storeInfo?.name ?? 'Unknown',
        product: r.productInfo?.name ?? 'Unknown',
        sku: r.productInfo?.sku,
        stock: r.stock,
        stockIn: r.stockIn,
        returned: r.returned,
        damaged: r.damaged,
        threshold: r.lowStockThreshold,
        updatedAt: this.toIST(r.updatedAt),
      })),
    };
  }

  private async toolRawMaterials(args: Record<string, unknown>) {
    const storeName = String(args.storeName ?? '').trim();
    const searchTerm = String(args.searchTerm ?? '').trim();

    let storeIds: any[] = [];
    if (storeName) {
      const stores = await this.storeModel.find({ $or: [{ name: { $regex: this.escape(storeName), $options: 'i' } }, { code: { $regex: this.escape(storeName), $options: 'i' } }] }).select('_id').lean();
      storeIds = stores.map((s: any) => s._id);
      if (!storeIds.length) return { materials: [], message: `No store found matching "${storeName}"` };
    }

    const filter: any = { isActive: true };
    if (storeIds.length) filter.store = { $in: storeIds };
    if (searchTerm) filter.name = { $regex: this.escape(searchTerm), $options: 'i' };

    const materials = await this.rawMaterialModel.find(filter).populate('store', 'name code').sort({ name: 1 }).lean();
    return {
      count: materials.length,
      materials: materials.map((m: any) => ({
        name: m.name,
        unit: m.unit,
        totalStock: m.totalStock,
        store: (m.store as any)?.name ?? 'Unknown',
        updatedAt: this.toIST(m.updatedAt),
      })),
    };
  }

  private async toolRawMaterialSnapshots(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange({ ...args, days: args.days ?? 7 });
    const storeName = String(args.storeName ?? '').trim();
    const materialName = String(args.materialName ?? '').trim();

    const pipeline: any[] = [
      { $match: { date: { $gte: from.toISOString().split('T')[0], $lte: to.toISOString().split('T')[0] } } },
      { $lookup: { from: 'rawmaterials', localField: 'rawMaterial', foreignField: '_id', pipeline: [{ $project: { name: 1, unit: 1 } }], as: 'mat' } },
      { $unwind: { path: '$mat', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'stores', localField: 'store', foreignField: '_id', pipeline: [{ $project: { name: 1, code: 1 } }], as: 'storeInfo' } },
      { $unwind: { path: '$storeInfo', preserveNullAndEmptyArrays: true } },
    ];

    const matchConds: any[] = [];
    if (storeName) matchConds.push({ $or: [{ 'storeInfo.name': { $regex: this.escape(storeName), $options: 'i' } }, { 'storeInfo.code': { $regex: this.escape(storeName), $options: 'i' } }] });
    if (materialName) matchConds.push({ 'mat.name': { $regex: this.escape(materialName), $options: 'i' } });
    if (matchConds.length) pipeline.push({ $match: { $and: matchConds } });

    pipeline.push({ $sort: { date: -1 } }, { $limit: 50 });

    const entries = await this.rawMaterialEntryModel.aggregate(pipeline).exec();
    return {
      count: entries.length,
      period: `${from.toDateString()} to ${to.toDateString()}`,
      entries: entries.map((e: any) => ({
        date: e.date,
        material: e.mat?.name ?? 'Unknown',
        unit: e.mat?.unit,
        store: e.storeInfo?.name ?? 'Unknown',
        openingStock: e.openingStock,
        stockIn: e.stockIn,
        processed: e.processed,
        outputLitres: e.outputLitres,
        closing: e.closing,
      })),
    };
  }

  private async toolCategories() {
    const cats = await this.categoryRepository.getModel().find({}).lean();
    const counts = await this.productRepository.getModel().aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]).exec();
    const countMap = new Map(counts.map((c: any) => [c._id?.toString(), c.count]));
    return {
      count: cats.length,
      categories: cats.map((c: any) => ({ name: c.name, slug: c.slug, productCount: countMap.get(c._id?.toString()) ?? 0 })),
    };
  }

  private async toolStores() {
    const stores = await this.storeModel.find({}).sort({ isActive: -1, name: 1 }).lean();
    return {
      count: stores.length,
      stores: stores.map((s: any) => ({
        name: s.name, code: s.code, address: s.address, phone: s.phone,
        isActive: s.isActive, isMainStore: s.isMainStore,
      })),
    };
  }

  private async toolSearchCustomers(args: Record<string, unknown>) {
    const term = String(args.searchTerm ?? '').trim();
    const limit = Number(args.limit ?? 10);
    if (!term) return { error: 'searchTerm required' };
    const esc = this.escape(term);
    const customers = await this.userRepository.getModel()
      .find({ $or: [{ name: { $regex: esc, $options: 'i' } }, { phone: { $regex: esc, $options: 'i' } }, { email: { $regex: esc, $options: 'i' } }] })
      .sort({ totalSpent: -1 }).limit(limit).lean();
    return {
      count: customers.length,
      customers: customers.map((c: any) => {
        const addr = c.addresses?.find((a: any) => a.isDefault) ?? c.addresses?.[0];
        return {
          name: c.name, phone: c.phone, email: c.email,
          totalOrders: c.totalOrders, totalSpent: c.totalSpent,
          isBlocked: c.isBlocked, blockedReason: c.blockedReason,
          isActive: c.isActive, tags: c.tags, notes: c.notes,
          lastOrderAt: this.toIST(c.lastOrderAt), createdAt: this.toIST(c.createdAt),
          defaultAddress: addr ? `${addr.street ?? ''}, ${addr.city ?? ''}, ${addr.state ?? ''} ${addr.pincode ?? ''}`.trim() : null,
        };
      }),
    };
  }

  private async toolCustomerOrders(args: Record<string, unknown>) {
    const phone = String(args.phone ?? '').trim();
    const name = String(args.name ?? '').trim();
    const limit = Number(args.limit ?? 10);

    let user: any = null;
    if (phone) {
      user = await this.userRepository.getModel().findOne({ phone: { $regex: this.escape(phone), $options: 'i' } }).lean().catch(() => null);
    }
    if (!user && name) {
      user = await this.userRepository.getModel().findOne({ name: { $regex: this.escape(name), $options: 'i' } }).sort({ totalOrders: -1 }).lean().catch(() => null);
    }
    if (!user) return { error: `No customer found for ${phone || name}` };

    const orders = await this.orderRepository.getModel().find({ user: user._id }).sort({ createdAt: -1 }).limit(limit).lean();
    const addr = user.addresses?.find((a: any) => a.isDefault) ?? user.addresses?.[0];

    return {
      customer: {
        name: user.name, phone: user.phone, email: user.email,
        totalOrders: user.totalOrders, totalSpent: user.totalSpent,
        isBlocked: user.isBlocked, blockedReason: user.blockedReason,
        lastOrderAt: this.toIST(user.lastOrderAt), createdAt: this.toIST(user.createdAt),
        address: addr ? `${addr.street ?? ''}, ${addr.city ?? ''}, ${addr.state ?? ''} ${addr.pincode ?? ''}`.trim() : null,
        tags: user.tags, notes: user.notes,
      },
      orders: orders.map((o: any) => ({
        orderNumber: o.orderNumber, total: o.total, status: o.status,
        paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
        createdAt: this.toIST(o.createdAt), deliveredAt: this.toIST(o.deliveredAt),
        items: (o.items ?? []).map((i: any) => `${i.name}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity} @₹${i.price}`),
      })),
    };
  }

  private async toolTopCustomers(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 10);
    const minSpent = args.minSpent ? Number(args.minSpent) : 0;
    const filter: any = { totalOrders: { $gt: 0 } };
    if (minSpent > 0) filter.totalSpent = { $gte: minSpent };
    const customers = await this.userRepository.getModel().find(filter).sort({ totalSpent: -1 }).limit(limit).lean();
    return {
      count: customers.length,
      customers: customers.map((c: any, i: number) => ({
        rank: i + 1, name: c.name, phone: c.phone,
        totalOrders: c.totalOrders, totalSpent: c.totalSpent,
        lastOrderAt: this.toIST(c.lastOrderAt),
      })),
    };
  }

  private async toolNewCustomers(args: Record<string, unknown>) {
    const { from } = this.resolveRange({ ...args, days: args.days ?? 7 });
    const to = args.to ? new Date(args.to as string) : new Date();
    const [count, customers] = await Promise.all([
      this.userRepository.getModel().countDocuments({ createdAt: { $gte: from, $lte: to } }),
      this.userRepository.getModel().find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    return {
      count,
      customers: customers.map((c: any) => ({
        name: c.name, phone: c.phone, email: c.email,
        totalOrders: c.totalOrders, totalSpent: c.totalSpent, createdAt: this.toIST(c.createdAt),
      })),
    };
  }

  private async toolInactiveCustomers(args: Record<string, unknown>) {
    const days = Number(args.days ?? 30);
    const limit = Number(args.limit ?? 20);
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const customers = await this.userRepository.getModel()
      .find({ totalOrders: { $gt: 0 }, $or: [{ lastOrderAt: { $lt: cutoff } }, { lastOrderAt: { $exists: false } }] })
      .sort({ lastOrderAt: 1 }).limit(limit).lean();
    return {
      count: customers.length,
      inactiveDays: days,
      customers: customers.map((c: any) => ({
        name: c.name, phone: c.phone,
        totalOrders: c.totalOrders, totalSpent: c.totalSpent,
        lastOrderAt: this.toIST(c.lastOrderAt),
      })),
    };
  }

  private async toolBlockedCustomers() {
    const customers = await this.userRepository.getModel()
      .find({ isBlocked: true }).sort({ updatedAt: -1 }).limit(50).lean();
    return {
      count: customers.length,
      customers: customers.map((c: any) => ({
        name: c.name, phone: c.phone, email: c.email,
        blockedReason: c.blockedReason, updatedAt: this.toIST(c.updatedAt),
      })),
    };
  }

  private async toolRevenueTrend(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    const trend = await this.analyticsService.getRevenueByDay(days);
    const totalRev = trend.reduce((s: number, d: any) => s + (d.revenue ?? 0), 0);
    const totalOrd = trend.reduce((s: number, d: any) => s + (d.orders ?? 0), 0);
    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      totalRevenue: totalRev,
      totalOrders: totalOrd,
      days: trend.map((d: any) => ({ date: d.date, revenue: d.revenue, orders: d.orders })),
    };
  }

  private async toolAnalyticsPeriod(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const [orders, customers, products, topSellers, topCustomers] = await Promise.all([
      this.analyticsService.getOrderMetrics(from, to),
      this.analyticsService.getCustomerMetrics(from, to),
      this.analyticsService.getProductMetrics(from, to),
      this.analyticsService.getTopSellingOverall(from, to, 5),
      this.userRepository.getModel().find({ totalOrders: { $gt: 0 } }).sort({ totalSpent: -1 }).limit(5).lean(),
    ]);
    const o = orders as any; const c = customers as any; const p = products as any;
    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      orders: { total: o.totalOrders, revenue: o.totalRevenue, avgOrderValue: Math.round(o.avgOrderValue ?? 0), delivered: o.completedOrders, pending: o.pendingOrders, cancelled: o.cancelledOrders, cod: o.codOrders, prepaid: o.prepaidOrders },
      customers: { total: c.totalCustomers, newCustomers: c.newCustomers, returning: c.returningCustomers },
      inventory: { outOfStock: p.outOfStockProducts, lowStock: p.lowStockProducts },
      topProducts: topSellers.slice(0, 5).map((s: any) => ({ name: s.name, unitsSold: s.quantitySold, revenue: s.revenue })),
      topCustomers: (topCustomers as any[]).slice(0, 5).map((tc: any) => ({ name: tc.name, phone: tc.phone, totalSpent: tc.totalSpent, totalOrders: tc.totalOrders })),
    };
  }

  private async toolTopSelling(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const limit = Number(args.limit ?? 8);
    const searchTerm = String(args.searchTerm ?? '').trim();
    const [onlineMetrics, storeTop] = await Promise.all([
      this.analyticsService.getProductMetrics(from, to),
      this.analyticsService.getTopSellingOverall(from, to, limit * 2),
    ]);
    const filter = (name: string) => !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());
    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      online: ((onlineMetrics as any).topSellingProducts ?? []).filter((p: any) => filter(p.name)).slice(0, limit).map((p: any) => ({ name: p.name, unitsSold: p.quantitySold, revenue: p.revenue })),
      store: storeTop.filter((p: any) => filter(p.name)).slice(0, limit).map((p: any) => ({ name: p.name, unitsSold: p.quantitySold, revenue: p.revenue })),
    };
  }

  private async toolAbandonedCarts(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 30);
    const productSearch = String(args.productSearch ?? '').trim().toLowerCase();
    const whatsappSettings = await this.settingsService.getWhatsAppSettings();
    const delayMinutes = whatsappSettings.abandonedCartReminderDelayMinutes ?? 60;
    const cutoff = new Date(Date.now() - delayMinutes * 60_000);

    const carts = await this.cartRepository.getModel().aggregate([
      { $match: { 'items.0': { $exists: true }, updatedAt: { $lt: cutoff } } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', pipeline: [{ $project: { name: 1, phone: 1, isBlocked: 1 } }], as: 'userInfo' } },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      { $match: { 'userInfo.isBlocked': { $ne: true } } },
      { $lookup: { from: 'orders', let: { userId: '$user', cartUpdatedAt: '$updatedAt' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$user', '$$userId'] }, { $gt: ['$createdAt', '$$cartUpdatedAt'] }, { $ne: ['$status', 'cancelled'] }] } } }, { $limit: 1 }], as: 'ordersAfterCart' } },
      { $match: { ordersAfterCart: { $size: 0 } } },
      { $sort: { updatedAt: -1 } }, { $limit: limit },
    ]).exec();

    const filtered = productSearch ? carts.filter((c: any) => c.items.some((i: any) => i.name?.toLowerCase().includes(productSearch))) : carts;

    return {
      count: filtered.length,
      inactiveMinutes: delayMinutes,
      carts: filtered.map((c: any) => ({
        customer: c.userInfo?.name ?? c.userInfo?.phone ?? 'Unknown',
        phone: c.userInfo?.phone,
        cartTotal: c.total ?? 0,
        idleHours: Math.round((Date.now() - new Date(c.updatedAt).getTime()) / 3_600_000),
        items: c.items.map((i: any) => `${i.name} x${i.quantity}`),
      })),
    };
  }

  private async toolStoreSales(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const limit = Number(args.limit ?? 20);
    const [sales, totalAgg] = await Promise.all([
      this.storeSaleRepository.getModel().find({
        $and: [
          { $or: [{ dueDate: { $exists: true, $ne: null, $gte: from, $lte: to } }, { $or: [{ dueDate: { $exists: false } }, { dueDate: null }], createdAt: { $gte: from, $lte: to } }] },
          { $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }] },
        ],
      }).populate('store', 'name code').sort({ createdAt: -1 }).limit(limit).lean(),
      this.storeSaleRepository.getModel().aggregate([
        { $addFields: { effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] } } },
        { $match: { effectiveDate: { $gte: from, $lte: to }, $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }] } },
        { $group: { _id: null, totalRevenue: { $sum: '$total' }, count: { $sum: 1 }, walkIn: { $sum: { $cond: [{ $eq: ['$saleType', 'walk_in'] }, 1, 0] } }, delivery: { $sum: { $cond: [{ $eq: ['$saleType', 'delivery'] }, 1, 0] } } } },
      ]).exec(),
    ]);
    const agg = totalAgg[0] ?? { totalRevenue: 0, count: 0, walkIn: 0, delivery: 0 };
    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      summary: { count: agg.count, totalRevenue: agg.totalRevenue, walkIn: agg.walkIn, delivery: agg.delivery },
      sales: sales.map((s: any) => ({
        saleNumber: s.saleNumber,
        store: (s.store as any)?.name ?? 'Unknown',
        type: s.saleType,
        total: s.total,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        paymentMethod: s.paymentMethod,
        date: this.toIST(s.dueDate ?? s.createdAt),
        loggedBy: s.loggedBy,
      })),
    };
  }

  private async toolSaleDetail(args: Record<string, unknown>) {
    const saleNum = String(args.saleNumber ?? '').trim();
    const sale = await this.storeSaleRepository.getModel()
      .findOne({ saleNumber: { $regex: this.escape(saleNum), $options: 'i' } })
      .populate('store', 'name code').lean();
    if (!sale) return { error: `Sale "${saleNum}" not found` };
    const s = sale as any;
    return {
      saleNumber: s.saleNumber,
      store: (s.store as any)?.name,
      type: s.saleType,
      total: s.total,
      discount: s.discount,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      customerAddress: s.customerAddress,
      paymentMethod: s.paymentMethod,
      notes: s.notes,
      loggedBy: s.loggedBy,
      date: this.toIST(s.dueDate ?? s.createdAt),
      items: (s.items ?? []).map((i: any) => ({ name: i.name, qty: i.quantity, price: i.price, total: i.total })),
    };
  }

  private async toolDeliveryCollections(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const agentName = String(args.agentName ?? '').trim();

    let agentIds: any[] | null = null;
    if (agentName) {
      const agents = await this.adminUserRepository.getModel()
        .find({ name: { $regex: this.escape(agentName), $options: 'i' } }).select('_id name').lean();
      agentIds = agents.map((a: any) => a._id.toString());
      if (!agentIds.length) return { agents: [], message: `No agent found matching "${agentName}"` };
    }

    const match: any = { status: 'delivered', deliveredAt: { $gte: from, $lte: to }, assignedDeliveryUserId: { $exists: true, $ne: null } };
    if (agentIds) match.assignedDeliveryUserId = { $in: agentIds };

    const rows = await this.orderRepository.getModel().aggregate([
      { $match: match },
      { $group: {
        _id: { $toString: '$assignedDeliveryUserId' },
        totalOrders: { $sum: 1 },
        totalCashCollected: { $sum: { $cond: [{ $in: ['$paymentMethod', ['cash', 'cod']] }, { $ifNull: ['$amountCollected', 0] }, 0] } },
        totalUpiCollected: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'upi'] }, { $ifNull: ['$amountCollected', 0] }, 0] } },
        pendingCash: { $sum: { $cond: [{ $and: [{ $in: ['$paymentMethod', ['cash', 'cod']] }, { $ne: ['$collectionStatus', 'settled'] }] }, { $ifNull: ['$amountCollected', 0] }, 0] } },
      }},
    ]).exec();

    const userIds = rows.map((r: any) => r._id).filter(Boolean);
    const users = userIds.length ? await this.adminUserRepository.getModel().find({ _id: { $in: userIds } }, 'name email').lean() : [];
    const userMap = new Map((users as any[]).map((u: any) => [u._id.toString(), u]));

    const [outstanding] = await this.orderRepository.getModel().aggregate([
      { $match: { status: 'delivered', paymentMethod: { $in: ['cash', 'cod'] }, collectionStatus: { $ne: 'settled' }, amountCollected: { $gt: 0 } } },
      { $group: { _id: { $toString: '$assignedDeliveryUserId' }, total: { $sum: '$amountCollected' } } },
    ]).exec().then((r: any[]) => [new Map(r.map((x: any) => [x._id, x.total]))]).catch(() => [new Map()]);

    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      agents: rows.map((r: any) => {
        const u = userMap.get(r._id);
        return {
          agentId: r._id,
          name: (u as any)?.name ?? r._id,
          totalOrders: r.totalOrders,
          cashCollected: r.totalCashCollected,
          upiCollected: r.totalUpiCollected,
          pendingCashInPeriod: r.pendingCash,
          totalOutstandingAllTime: (outstanding as Map<string, number>).get(r._id) ?? 0,
        };
      }),
    };
  }

  private async toolDeliveryHistory(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const limit = Number(args.limit ?? 20);
    const agentName = String(args.agentName ?? '').trim();

    const filter: any = { status: 'delivered', deliveredAt: { $gte: from, $lte: to } };
    if (agentName) {
      const agents = await this.adminUserRepository.getModel().find({ name: { $regex: this.escape(agentName), $options: 'i' } }).select('_id').lean();
      if (agents.length) filter.assignedDeliveryUserId = { $in: agents.map((a: any) => a._id.toString()) };
    }

    const orders = await this.orderRepository.getModel()
      .find(filter)
      .select('orderNumber shippingAddress total amountCollected paymentMethod collectionStatus deliveredAt assignedDeliveryUserId')
      .sort({ deliveredAt: -1 }).limit(limit).lean();

    const agentIdSet = [...new Set(orders.map((o: any) => o.assignedDeliveryUserId).filter(Boolean))];
    const agentsData = agentIdSet.length ? await this.adminUserRepository.getModel().find({ _id: { $in: agentIdSet } }, 'name').lean() : [];
    const agentMap = new Map((agentsData as any[]).map((a: any) => [a._id.toString(), a.name]));

    return {
      count: orders.length,
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      orders: orders.map((o: any) => ({
        orderNumber: o.orderNumber,
        customer: (o.shippingAddress as any)?.name ?? 'N/A',
        total: o.total,
        amountCollected: o.amountCollected,
        paymentMethod: o.paymentMethod,
        collectionStatus: o.collectionStatus,
        deliveredAt: this.toIST(o.deliveredAt),
        agent: agentMap.get(String(o.assignedDeliveryUserId)) ?? 'Unassigned',
      })),
    };
  }

  private async toolPendingCollections(args: Record<string, unknown>) {
    const agentName = String(args.agentName ?? '').trim();
    let agentFilter: any = {};
    if (agentName) {
      const agents = await this.adminUserRepository.getModel().find({ name: { $regex: this.escape(agentName), $options: 'i' } }).select('_id name').lean();
      if (!agents.length) return { orders: [], message: `No agent found matching "${agentName}"` };
      agentFilter = { assignedDeliveryUserId: { $in: agents.map((a: any) => a._id.toString()) } };
    }
    const orders = await this.orderRepository.getModel()
      .find({ status: 'delivered', paymentMethod: { $in: ['cash', 'cod'] }, collectionStatus: { $ne: 'settled' }, amountCollected: { $gt: 0 }, ...agentFilter })
      .select('orderNumber shippingAddress total amountCollected paymentMethod deliveredAt assignedDeliveryUserId')
      .sort({ deliveredAt: -1 }).limit(50).lean();
    return {
      count: orders.length,
      totalPending: orders.reduce((s: number, o: any) => s + (o.amountCollected ?? 0), 0),
      orders: orders.map((o: any) => ({
        orderNumber: o.orderNumber,
        customer: (o.shippingAddress as any)?.name ?? 'N/A',
        amountCollected: o.amountCollected,
        paymentMethod: o.paymentMethod,
        deliveredAt: this.toIST(o.deliveredAt),
      })),
    };
  }

  private async toolWalletBalances(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 20);
    const wallets = await this.walletRepository.getModel()
      .find({ balance: { $gt: 0 } }).sort({ balance: -1 }).limit(limit)
      .populate('user', 'name phone').lean();
    const total = wallets.reduce((s: number, w: any) => s + (w.balance ?? 0), 0);
    return {
      count: wallets.length,
      totalOutstandingRupees: +(total / 100).toFixed(2),
      wallets: wallets.map((w: any) => ({
        customer: (w.user as any)?.name ?? (w.user as any)?.phone ?? 'N/A',
        phone: (w.user as any)?.phone,
        balanceRupees: +((w.balance ?? 0) / 100).toFixed(2),
      })),
    };
  }

  private async toolWalletTransactions(args: Record<string, unknown>) {
    const phone = String(args.phone ?? '').trim();
    const customerName = String(args.customerName ?? '').trim();
    const limit = Number(args.limit ?? 20);

    let user: any = null;
    if (phone) user = await this.userRepository.getModel().findOne({ phone: { $regex: this.escape(phone), $options: 'i' } }).lean().catch(() => null);
    if (!user && customerName) user = await this.userRepository.getModel().findOne({ name: { $regex: this.escape(customerName), $options: 'i' } }).lean().catch(() => null);
    if (!user) return { error: `No customer found for ${phone || customerName}` };

    const txns = await this.walletTransactionRepository.getModel()
      .find({ user: user._id }).sort({ createdAt: -1 }).limit(limit).lean();
    return {
      customer: { name: user.name, phone: user.phone },
      count: txns.length,
      transactions: txns.map((t: any) => ({
        type: t.type,
        amountRupees: +((t.amount ?? 0) / 100).toFixed(2),
        reason: t.reason,
        orderId: t.orderId,
        createdAt: this.toIST(t.createdAt),
      })),
    };
  }

  private async toolSubscriptionData() {
    const [active, paused, upcoming] = await Promise.all([
      this.subscriptionModel.find({ status: 'active' }).populate('user', 'name phone').sort({ nextDeliveryDate: 1 }).limit(30).lean(),
      this.subscriptionModel.find({ status: 'paused' }).populate('user', 'name phone').limit(10).lean(),
      this.subscriptionModel.find({ status: 'active', nextDeliveryDate: { $lte: new Date(Date.now() + 3 * 86_400_000) } }).populate('user', 'name phone').sort({ nextDeliveryDate: 1 }).lean(),
    ]);
    const fmt = (s: any) => ({
      customer: (s.user as any)?.name ?? (s.user as any)?.phone ?? 'N/A',
      phone: (s.user as any)?.phone,
      frequency: s.frequency,
      totalAmount: s.totalAmount,
      nextDeliveryDate: this.toIST(s.nextDeliveryDate, true),
      items: (s.items ?? []).map((i: any) => `${i.name} x${i.quantity}`),
    });
    return {
      activeCount: active.length,
      pausedCount: paused.length,
      active: active.slice(0, 20).map(fmt),
      paused: paused.map(fmt),
      upcomingDeliveries3Days: upcoming.map(fmt),
    };
  }

  private async toolSubscriptionDetail(args: Record<string, unknown>) {
    const phone = String(args.phone ?? '').trim();
    const customerName = String(args.customerName ?? '').trim();

    let user: any = null;
    if (phone) user = await this.userRepository.getModel().findOne({ phone: { $regex: this.escape(phone), $options: 'i' } }).lean().catch(() => null);
    if (!user && customerName) user = await this.userRepository.getModel().findOne({ name: { $regex: this.escape(customerName), $options: 'i' } }).lean().catch(() => null);
    if (!user) return { error: `No customer found for ${phone || customerName}` };

    const sub = await this.subscriptionModel.findOne({ user: user._id }).lean();
    if (!sub) return { error: `No subscription found for ${user.name ?? phone}` };
    const s = sub as any;
    return {
      customer: { name: user.name, phone: user.phone },
      status: s.status, frequency: s.frequency,
      totalAmount: s.totalAmount, nextDeliveryDate: this.toIST(s.nextDeliveryDate, true),
      items: (s.items ?? []).map((i: any) => ({ name: i.name, qty: i.quantity, price: i.price })),
      createdAt: this.toIST(s.createdAt), updatedAt: this.toIST(s.updatedAt),
    };
  }

  private async toolPayments(args: Record<string, unknown>) {
    const status = String(args.status ?? 'failed').trim();
    const limit = Number(args.limit ?? 20);
    const filter: any = {};
    if (status) filter.status = status;
    if (args.from && args.to) {
      const fromD = new Date(args.from as string);
      const toD = new Date(args.to as string);
      if (!isNaN(fromD.getTime())) filter.createdAt = { $gte: fromD, $lte: toD };
    }
    const payments = await this.paymentRepository.getModel()
      .find(filter).sort({ createdAt: -1 }).limit(limit)
      .populate('user', 'name phone').populate('order', 'orderNumber total').lean();
    return {
      count: payments.length,
      status,
      payments: payments.map((p: any) => ({
        customer: (p.user as any)?.name ?? (p.user as any)?.phone ?? 'N/A',
        phone: (p.user as any)?.phone,
        orderNumber: (p.order as any)?.orderNumber ?? 'N/A',
        amountRupees: p.amount,
        status: p.status,
        gateway: p.gateway,
        failureReason: p.failureReason,
        refundAmount: p.refundAmount,
        refundedAt: this.toIST(p.refundedAt),
        createdAt: this.toIST(p.createdAt),
      })),
    };
  }

  private async toolRefundHistory(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const limit = Number(args.limit ?? 20);
    const payments = await this.paymentRepository.getModel()
      .find({ status: 'refunded', refundedAt: { $gte: from, $lte: to } })
      .sort({ refundedAt: -1 }).limit(limit)
      .populate('user', 'name phone').populate('order', 'orderNumber').lean();
    const total = payments.reduce((s: number, p: any) => s + (p.refundAmount ?? 0), 0);
    return {
      count: payments.length,
      totalRefundedRupees: total,
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      refunds: payments.map((p: any) => ({
        customer: (p.user as any)?.name ?? (p.user as any)?.phone ?? 'N/A',
        phone: (p.user as any)?.phone,
        orderNumber: (p.order as any)?.orderNumber,
        refundAmount: p.refundAmount,
        refundReason: p.refundReason,
        refundedAt: this.toIST(p.refundedAt),
      })),
    };
  }

  private async toolAuditLogs(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 20);
    const filter: any = {};
    if (args.action) filter.action = args.action;
    if (args.targetName) filter.targetName = { $regex: this.escape(String(args.targetName)), $options: 'i' };
    if (args.from && args.to) {
      const fromD = new Date(args.from as string);
      const toD = new Date(args.to as string);
      if (!isNaN(fromD.getTime())) filter.createdAt = { $gte: fromD, $lte: toD };
    }
    const [count, logs] = await Promise.all([
      this.auditLogRepository.getModel().countDocuments(filter),
      this.auditLogRepository.getModel().find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    ]);
    return {
      count,
      logs: logs.map((l: any) => ({
        action: l.action,
        performer: l.performedByName ?? l.performedBy,
        target: l.targetName,
        ipAddress: l.ipAddress,
        previousValues: l.previousValues ? JSON.stringify(l.previousValues).slice(0, 300) : null,
        newValues: l.newValues ? JSON.stringify(l.newValues).slice(0, 300) : null,
        timestamp: this.toIST(l.createdAt),
      })),
    };
  }

  private async toolAdminUsers(args: Record<string, unknown>) {
    const filter: any = {};
    if (args.role) filter.role = args.role;
    if (args.department) filter.departmentType = args.department;
    const users = await this.adminUserRepository.getModel()
      .find(filter).select('-password').populate('store', 'name code').sort({ role: 1, name: 1 }).lean();
    return {
      count: users.length,
      staff: users.map((u: any) => ({
        name: u.name, email: u.email, phone: u.phone,
        role: u.role, department: u.departmentType,
        store: (u.store as any)?.name,
        isActive: u.isActive, lastLoginAt: this.toIST(u.lastLoginAt), lastLoginIp: u.lastLoginIp,
      })),
    };
  }

  private async toolCouponList(args: Record<string, unknown>) {
    const statusFilter = String(args.status ?? '').trim().toLowerCase();
    const coupons = await this.couponRepository.getModel().find({}).sort({ createdAt: -1 }).limit(50).lean();
    const now = new Date();
    const rows = coupons.map((c: any) => {
      const notYetValid = new Date(c.validFrom) > now;
      const expired = new Date(c.validUntil) < now;
      const active = c.isActive && !expired && !notYetValid;
      const statusKey = active ? 'active' : notYetValid ? 'upcoming' : expired ? 'expired' : 'inactive';
      return { statusKey, coupon: { code: c.code, discountType: c.discountType, discountValue: c.discountValue, usedCount: c.usedCount ?? 0, maxUsageCount: c.maxUsageCount, status: statusKey, minOrderAmount: c.minOrderAmount, validFrom: this.toIST(c.validFrom, true), validUntil: this.toIST(c.validUntil, true) } };
    });
    const filtered = statusFilter ? rows.filter((r) => r.statusKey === statusFilter) : rows;
    const summary = { total: rows.length, active: rows.filter((r) => r.statusKey === 'active').length, upcoming: rows.filter((r) => r.statusKey === 'upcoming').length, expired: rows.filter((r) => r.statusKey === 'expired').length };
    return { summary, coupons: filtered.map((r) => r.coupon) };
  }

  private async toolCouponUsage(args: Record<string, unknown>) {
    const couponCode = String(args.couponCode ?? '').trim().toUpperCase();
    const orders = await this.orderRepository.getModel()
      .find({ couponCode: { $regex: `^${this.escape(couponCode)}$`, $options: 'i' } })
      .select('orderNumber user couponCode discount createdAt')
      .sort({ createdAt: -1 }).limit(50)
      .populate('user', 'name phone').lean();
    return {
      couponCode,
      usageCount: orders.length,
      totalDiscountGiven: orders.reduce((s: number, o: any) => s + (o.discount ?? 0), 0),
      usages: orders.map((o: any) => ({
        customer: (o.user as any)?.name ?? 'Guest',
        phone: (o.user as any)?.phone,
        orderNumber: o.orderNumber,
        discount: o.discount,
        usedAt: this.toIST(o.createdAt),
      })),
    };
  }

  private async toolFeedbackList(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 15);
    const filter: any = {};
    if (args.minRating != null || args.maxRating != null) {
      filter.rating = { ...(args.minRating != null ? { $gte: Number(args.minRating) } : {}), ...(args.maxRating != null ? { $lte: Number(args.maxRating) } : {}) };
    }
    if (args.type) filter.type = { $regex: String(args.type), $options: 'i' };
    const productName = String(args.productName ?? '').trim();
    const feedbacks = await this.feedbackRepository.getModel()
      .find(filter).populate('user', 'name phone').populate('product', 'name')
      .sort({ createdAt: -1 }).limit(productName ? limit * 3 : limit).lean();
    const filtered = productName ? feedbacks.filter((f: any) => f.product?.name?.toLowerCase().includes(productName.toLowerCase())) : feedbacks;
    return {
      count: filtered.length,
      feedback: filtered.slice(0, limit).map((f: any) => ({
        customer: (f.user as any)?.name ?? 'Anonymous',
        product: (f.product as any)?.name ?? 'General',
        rating: f.rating,
        type: f.type,
        message: (f.message ?? '').slice(0, 150),
        status: f.status,
        createdAt: this.toIST(f.createdAt),
      })),
    };
  }

  private async toolWhatsAppQueue() {
    const [support, recent] = await Promise.all([
      this.chatSessionRepository.getModel()
        .find({ isHandedOffToSupport: true, isExpired: { $ne: true } })
        .sort({ supportHandoffAt: -1 }).limit(30).populate('user', 'name phone').lean(),
      this.messageLogRepository.getModel()
        .find({ direction: 'inbound', createdAt: { $gte: new Date(Date.now() - 60 * 60_000) } })
        .sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    const activePhones = [...new Set((recent as any[]).map((m: any) => m.phone))];
    return {
      supportQueueCount: support.length,
      sessions: (support as any[]).map((s: any) => ({
        customer: (s.user as any)?.name ?? s.metadata?.contactName ?? s.phone,
        phone: s.phone,
        waitingMinutes: s.supportHandoffAt ? Math.round((Date.now() - new Date(s.supportHandoffAt).getTime()) / 60_000) : 0,
        hasAgent: Boolean(s.supportAgentId),
      })),
      activeLastHour: activePhones.length,
    };
  }

  private async toolWhatsAppMessages(args: Record<string, unknown>) {
    const phone = String(args.phone ?? '').trim();
    const limit = Number(args.limit ?? 20);
    const msgs = await this.messageLogRepository.getModel()
      .find({ phone }).sort({ createdAt: -1 }).limit(limit).lean();
    return {
      phone,
      count: msgs.length,
      messages: msgs.reverse().map((m: any) => ({
        direction: m.direction,
        type: m.messageType,
        text: m.content?.text ?? m.content?.caption ?? m.content?.templateName ?? '[media]',
        timestamp: this.toIST(m.createdAt),
      })),
    };
  }

  private async toolReminders() {
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 60 * 60_000);
    const [overdue, upcoming] = await Promise.all([
      this.reminderRepository.getModel().find({ dueAt: { $lt: now }, isDismissed: false }).sort({ dueAt: 1 }).limit(20).populate('sale', 'saleNumber customerName total').populate('store', 'name code').lean(),
      this.reminderRepository.getModel().find({ dueAt: { $gte: now, $lte: soon }, isDismissed: false }).sort({ dueAt: 1 }).limit(20).populate('sale', 'saleNumber customerName total').populate('store', 'name code').lean(),
    ]);
    const fmt = (r: any) => ({
      store: (r.store as any)?.name ?? 'Unknown',
      saleNumber: (r.sale as any)?.saleNumber,
      saleTotal: (r.sale as any)?.total,
      message: r.message,
      dueAt: this.toIST(r.dueAt),
    });
    return {
      overdueCount: overdue.length,
      upcomingCount: upcoming.length,
      overdue: overdue.map(fmt),
      upcoming: upcoming.map(fmt),
    };
  }

  private async toolPreviewEmail(args: Record<string, unknown>) {
    const to = String(args.to ?? '').trim();
    const reportType = String(args.reportType ?? 'dashboard').trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
      return { status: 'error', message: `Invalid email address: "${to}"` };
    try {
      const preview = await this.buildReportPreview(reportType);
      return { status: 'preview', to, reportType, subject: preview.subject, summary: preview.summary, readyToSend: true };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  private async toolSendEmail(args: Record<string, unknown>) {
    const to = String(args.to ?? '').trim();
    const reportType = String(args.reportType ?? 'dashboard').trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
      return { status: 'error', message: `Invalid email address: "${to}"` };
    try {
      const report = await this.buildReportPreview(reportType);
      await this.emailService.sendAdminReport(to, report.subject, report.html);
      this.logger.log(`Admin report "${reportType}" sent to ${to}`);
      return { status: 'sent', to, subject: report.subject };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  async chat(
    message: string,
    history: HistoryItem[],
    adminId: string | undefined,
  ): Promise<{ reply: string }> {
    try {
      const safe = this.sanitize(message);
      const reply = await this.runAgenticLoop(safe, this.historyToContent(history));
      if (adminId) await this.persistSession(adminId, safe, reply);
      return { reply };
    } catch (err) {
      this.logger.error(`chat() error: ${(err as Error).message}`);
      return { reply: '⚠️ Something went wrong. Please try again.' };
    }
  }

  async streamChat(
    message: string,
    history: HistoryItem[],
    adminId: string | undefined,
    res: any,
  ): Promise<void> {
    try {
      const safe = this.sanitize(message);
      const reply = await this.runAgenticLoop(safe, this.historyToContent(history));
      res.write(`data: ${JSON.stringify({ delta: reply })}\n\n`);
      if (adminId) await this.persistSession(adminId, safe, reply);
    } catch (err) {
      this.logger.error(`streamChat error: ${(err as Error).message}`);
      res.write(`data: ${JSON.stringify({ delta: '⚠️ Something went wrong. Please try again.' })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
  }

  async enqueueChat(
    message: string,
    history: HistoryItem[],
    adminId: string | undefined,
  ): Promise<{ jobId: string }> {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
    const job = await this.chatbotQueue.add(
      CHATBOT_JOBS.CHAT_QUERY,
      { message: this.sanitize(message), history, adminId },
      {
        ...DEFAULT_JOB_OPTIONS,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 500, age: 3600 },
        removeOnFail: { count: 200 },
        jobId: `chat-${adminId ?? 'anon'}-${Date.now()}`,
      },
    );
    return { jobId: job.id! };
  }

  async getChatJobResult(jobId: string): Promise<{ status: 'pending' | 'done' | 'failed'; reply?: string }> {
    const job = await this.chatbotQueue.getJob(jobId);
    if (!job) return { status: 'failed', reply: 'Job not found.' };
    const state = await job.getState();
    if (state === 'completed') return { status: 'done', reply: (job.returnvalue as any)?.reply ?? '(empty)' };
    if (state === 'failed') return { status: 'failed', reply: job.failedReason ?? 'Unknown error' };
    return { status: 'pending' };
  }

  async _executeChatQuery(data: { message: string; history: HistoryItem[]; adminId?: string }): Promise<{ reply: string }> {
    try {
      const reply = await this.runAgenticLoop(data.message, this.historyToContent(data.history));
      if (data.adminId) await this.persistSession(data.adminId, data.message, reply);
      return { reply };
    } catch (err) {
      this.logger.error(`_executeChatQuery error: ${(err as Error).message}`);
      return { reply: '⚠️ Something went wrong.' };
    }
  }

  async getBriefing(): Promise<Record<string, string | null>> {
    const [dashboard, statusCounts, lowStock] = await Promise.allSettled([
      this.executeTool('get_dashboard_summary', {}),
      this.executeTool('get_orders_by_status', {}),
      this.executeTool('get_products_by_stock', { status: 'low' }),
    ]);
    const toText = (r: PromiseSettledResult<any>): string | null => {
      if (r.status !== 'fulfilled' || !r.value) return null;
      const v = r.value;
      if (typeof v === 'string') return v;
      if (typeof v !== 'object') return String(v);
      return Object.entries(v)
        .filter(([, val]) => val !== null && val !== undefined && typeof val !== 'object')
        .map(([k, val]) => `**${k.replace(/([A-Z])/g, ' $1').trim()}**: ${val}`)
        .join('\n');
    };
    const lowStockVal = lowStock.status === 'fulfilled' ? lowStock.value : null;
    const lowStockText = lowStockVal?.count === 0
      ? 'No low stock products found.'
      : toText(lowStock);
    return {
      dashboard: toText(dashboard),
      orderStatus: toText(statusCounts),
      lowStock: lowStockText,
    };
  }

  async getHistory(adminId: string) {
    const session = await this.adminChatSessionRepository.getByAdminId(adminId);
    return (session?.messages ?? []).slice(-20);
  }

  async clearHistory(adminId: string): Promise<void> {
    await this.adminChatSessionRepository.clearByAdminId(adminId);
  }

  // ─── Scheduled daily report ───────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    const adminEmail = process.env.ADMIN_REPORT_EMAIL;
    if (!adminEmail) return;
    try {
      const repeatableJobs = await this.adminQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === ADMIN_JOBS.DAILY_BRIEFING) await this.adminQueue.removeRepeatableByKey(job.key);
      }
      await this.adminQueue.add(
        ADMIN_JOBS.DAILY_BRIEFING,
        { adminEmail },
        { repeat: { pattern: '0 9 * * *', tz: 'Asia/Kolkata' }, jobId: 'repeatable-daily-briefing' },
      );
      this.logger.log(`Daily briefing scheduled for ${adminEmail} at 9 AM IST`);
    } catch (err) {
      this.logger.error(`Failed to schedule daily briefing: ${(err as Error).message}`);
    }
  }

  async _executeDailyBriefing(data: { adminEmail: string }): Promise<void> {
    const briefing = await this.getBriefing();
    const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const section = (title: string, data: any, color = '#1E3D2B') => {
      if (!data) return '';
      const body = JSON.stringify(data, null, 2).slice(0, 800);
      return `<div style="margin-bottom:24px"><h3 style="color:${color};border-bottom:2px solid #E8A838;padding-bottom:6px">${title}</h3><pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;overflow-wrap:break-word">${body}</pre></div>`;
    };
    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f5f5f0">
      <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden">
        <div style="background:#1E3D2B;padding:28px;text-align:center">
          <h1 style="color:#E8A838;margin:0;font-size:22px">Naturelite Daily Briefing</h1>
          <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px">${date}</p>
        </div>
        <div style="padding:28px">
          ${section('Dashboard', briefing.dashboard)}
          ${section('Order Status', briefing.orderStatus)}
          ${section('Low Stock Alert', briefing.lowStock, '#c0392b')}
        </div>
        <div style="background:#f0f0ea;padding:16px;text-align:center;font-size:11px;color:#888">AI Admin — Naturelite</div>
      </div>
    </body></html>`;
    await this.emailService.sendAdminReport(data.adminEmail, `Naturelite Daily Briefing — ${date}`, html);
    this.logger.log(`Daily briefing sent to ${data.adminEmail}`);
  }

  // ─── Email report builder ─────────────────────────────────────────────────────

  private async buildReportPreview(reportType: string): Promise<{ subject: string; summary: string; html: string }> {
    const REPORT_MAP: Record<string, { label: string; tools: Array<[string, Record<string, unknown>]> }> = {
      dashboard:   { label: 'Dashboard Summary',  tools: [['get_dashboard_summary', {}], ['get_orders_by_status', {}], ['get_products_by_stock', { status: 'low' }]] },
      analytics:   { label: 'Analytics Report',   tools: [['get_analytics_period', { days: 30 }]] },
      monthly:     { label: 'Monthly Analytics',  tools: [['get_analytics_period', { days: 30 }]] },
      weekly:      { label: 'Weekly Analytics',   tools: [['get_analytics_period', { days: 7 }]] },
      orders:      { label: 'Orders Summary',     tools: [['search_orders', { limit: 20 }], ['get_orders_by_status', {}]] },
      revenue:     { label: 'Revenue Report',     tools: [['get_revenue_trend', { days: 14 }]] },
      customers:   { label: 'Customer Report',    tools: [['get_customers_filtered', { type: 'new', days: 7 }], ['get_top_customers', { limit: 10 }]] },
      feedback:    { label: 'Feedback Report',    tools: [['get_feedback_list', { limit: 20 }]] },
      coupons:     { label: 'Coupon Report',      tools: [['get_coupon_list', {}]] },
      store_sales: { label: 'Store Sales Report', tools: [['get_store_sales', { days: 30 }]] },
      inventory:   { label: 'Inventory Report',   tools: [['get_products_by_stock', { status: 'low' }], ['get_products_by_stock', { status: 'out' }]] },
      abandoned:   { label: 'Abandoned Carts',    tools: [['search_abandoned_carts', { limit: 30 }]] },
      payments:    { label: 'Payment Report',     tools: [['get_payments', { status: 'failed', limit: 20 }]] },
    };

    const config = REPORT_MAP[reportType] ?? REPORT_MAP['dashboard'];
    const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const subject = `Naturelite — ${config.label} | ${date}`;

    const blocks = await Promise.all(
      config.tools.map(async ([toolName, toolArgs]) => {
        try { return { tool: toolName, data: await this.executeTool(toolName, toolArgs) }; }
        catch { return null; }
      })
    );
    const validBlocks = blocks.filter(Boolean) as Array<{ tool: string; data: any }>;

    const firstData = validBlocks[0]?.data;
    const summary = firstData ? JSON.stringify(firstData).slice(0, 280) : 'No data available.';

    const sectionsHtml = validBlocks.map(({ tool, data }) => {
      const title = tool.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const body = JSON.stringify(data, null, 2)
        .split('\n')
        .map((line) => `<p style="margin:2px 0;font-size:12px;font-family:monospace;color:#333">${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('');
      return `<div style="margin-bottom:24px"><h3 style="color:#1E3D2B;border-bottom:2px solid #E8A838;padding-bottom:6px;font-size:15px">${title}</h3><div style="background:#f5f5f5;padding:12px;border-radius:8px;overflow-wrap:break-word">${body}</div></div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f0;font-family:sans-serif">
      <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden">
        <div style="background:#1E3D2B;padding:28px 32px;text-align:center">
          <h1 style="margin:0;color:#E8A838;font-size:22px">Naturelite</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">${config.label}</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.45);font-size:11px">${date}</p>
        </div>
        <div style="padding:28px 32px">${sectionsHtml}</div>
        <div style="background:#f0f0ea;padding:16px 32px;text-align:center;border-top:1px solid #e8e8e0">
          <p style="margin:0;font-size:11px;color:#888">AI Admin · Naturelite</p>
        </div>
      </div>
    </body></html>`;

    return { subject, summary, html };
  }
}
