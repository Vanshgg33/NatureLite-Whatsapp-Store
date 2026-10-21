import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration } from '@google/genai';
import { AdminChatbotToolsService } from '../admin-chatbot-tools.service';
import { HistoryItem, historyToContent } from '../agent-utils';
import { FORMAT_RULES } from './format-rules';
import { runToolLoop } from './tool-loop';

const MAX_TOOL_ITERATIONS = 10;

// ─── Tool Declarations ────────────────────────────────────────────────────────

const S = 'STRING' as any;
const N = 'NUMBER' as any;
const O = 'OBJECT' as any;
const B = 'BOOLEAN' as any;

const OPS_TOOL_DECLARATIONS: FunctionDeclaration[] = [
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
        status: { type: S, description: 'placed | confirmed | preparing | out_for_delivery | delivered | cancelled | returned | refunded' },
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
    description: 'Get order counts grouped by ALL statuses (placed, confirmed, preparing, out_for_delivery, delivered, cancelled, returned, refunded) AND by payment method. Omit from/to for all-time counts. Pass from/to for a specific period. Use for: "how many orders total", "how many returned", "how many refunded", "order status breakdown", "how did customers pay", "how many cod orders", "cash vs online split", "payment method breakdown this month".',
    parameters: {
      type: O,
      properties: {
        from: { type: S, description: 'ISO date start (optional, omit for all-time)' },
        to: { type: S, description: 'ISO date end (optional, omit for all-time)' },
      },
    },
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
    description: 'Search the product catalog by name or SKU. Returns price, MRP, current stock, active status, variants, last updated. This is catalog/inventory data only — it has NO sales or order data. Do NOT use this to answer how much was sold.',
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
    description: 'Get actual sales data (units sold, revenue) from orders. Use this for ANY question about how much of a product was sold, sales volume, revenue per product, or best sellers. When searchTerm is provided, returns exact sales figures for that product regardless of its rank.',
    parameters: {
      type: O,
      properties: {
        from: { type: S, description: 'ISO date start' },
        to: { type: S, description: 'ISO date end' },
        limit: { type: N, description: 'Number of products, default 8' },
        searchTerm: { type: S, description: 'Product name to look up sales for (e.g. "ghee", "coconut oil"). Always set this when the user asks about a specific product.' },
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
    description: 'Delivery agent data. view=collections: per-agent summary with totalOrders delivered AND cash/UPI collected for a date range — use for "which delivery boy did most", "agent performance", "how much cash collected", "agent collection summary", "settlement report"; view=history: list of individual delivered orders with agent name, amount collected, settlement status — use for "show deliveries", "delivery history", "which orders were delivered today/this week"; view=pending: all unsettled COD cash across all agents or one agent — use for "pending settlements", "unsettled cash", "pending cash". Always pass from/to when user mentions a date or period. Default range is last 14 days when omitted.',
    parameters: {
      type: O,
      properties: {
        view: { type: S, description: 'collections | history | pending' },
        agentName: { type: S, description: 'Filter by delivery agent name (optional)' },
        from: { type: S, description: 'ISO date start — include whenever user specifies a date or period' },
        to: { type: S, description: 'ISO date end — include whenever user specifies a date or period' },
        limit: { type: N, description: 'Max results for history view, default 20' },
      },
      required: ['view'],
    },
  },
  {
    name: 'get_wallet',
    description: 'Wallet data. type=balances: customers with unused wallet credit — amounts already in rupees (balanceRupees field, DO NOT divide further); type=transactions: credit/debit history for a customer — amounts already in rupees (amountRupees field). Requires phone or customerName for transactions.',
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
    description: 'Get online/UPI payment gateway records by status: failed | pending | success | refunded. This is ONLY for prepaid gateway transactions — COD and cash orders do NOT appear here. Use for failed payments, payment gateway errors, and refunds. For COD/cash order counts use get_orders_by_status.',
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

const OPS_ROUTING_PROMPT = `You are the NatureLite AI Admin Assistant — an internal tool for store managers.

You have real-time access to all store data via function calls.

## Non-negotiable rules

ALWAYS call a tool before answering any data question. Never guess, estimate, or infer a number, name, date, or status. If no tool result covers the question, say "No data found."

Call multiple tools in a single turn when a question spans domains — e.g., customer question: call search_customers + get_customer_orders together.

## Tool routing

### Orders
- "how many orders / total orders / orders today / orders this month / overview" → get_dashboard_summary (has todayOrders, monthOrders) or get_orders_by_status for full status breakdown
- "list orders / find order / show orders for [customer] / orders by status/date/payment" → search_orders with appropriate filters
- "order detail / full order info / ORD-XXXX" → get_order_detail with orderNumber
- "order status breakdown / how many in each status / order counts" → get_orders_by_status
- "returned orders / show returns / how many returns" → search_orders(status="returned") for list; get_orders_by_status for count
- "refunded orders / orders marked refunded" → search_orders(status="refunded") for list; get_orders_by_status for count
- "compare this week vs last / week-over-week / month-over-month" → compare_periods with days=7 or 30

### Revenue & Analytics
- "revenue trend / daily revenue / revenue graph / day-by-day" → get_revenue_trend with from/to or days
- "analytics / full period report / monthly summary / comprehensive stats" → get_analytics_period with from/to or days
- "best selling products / top products / what sells most" → get_top_selling_products (returns actual sales from orders)
- "how much X sold / X units sold / X revenue / how many X were ordered" → get_top_selling_products with searchTerm=X
- NEVER use search_products to answer a sales question — it has no sales data

### Customers
- "find customer / customer profile / search customer" → search_customers with name/phone/email
- "orders for [customer] / customer order history" → get_customer_orders with name or phone
- "best customer / top customer / who spends most / who orders most / VIP" → get_top_customers
- "new customers / joined recently" → get_customers_filtered(type="new", days=7)
- "inactive customers / churned / haven't ordered in X days" → get_customers_filtered(type="inactive", days=X) — days is inactivity threshold
- "blocked customers / blocked accounts" → get_customers_filtered(type="blocked")
- "wallet balance / wallet credits / who has wallet money" → get_wallet(type="balances")
- "wallet history / wallet transactions for [customer]" → get_wallet(type="transactions", phone=...)

### Delivery
- "which delivery boy did most / top delivery agent / most deliveries / delivery count per agent / agent performance" → get_delivery_data(view="collections"); result has totalOrders per agent — pick the highest
- "cash collected by agents / how much cash collected / agent cash / agent collections / settlement summary" → get_delivery_data(view="collections"); pass from/to if user gives a date
- "delivery history / deliveries done / show deliveries today/this week / delivered orders with agent info" → get_delivery_data(view="history"); pass from/to if user gives a date
- "pending settlements / unsettled cash / agents who haven't settled / pending cash" → get_delivery_data(view="pending")
- "upcoming deliveries / next delivery date / subscription delivery schedule" → get_subscriptions (NEVER get_delivery_data)
- "how many orders delivered / delivery count" → get_orders_by_status or search_orders(status="delivered"); use get_delivery_data(view="history") only when agent or cash data is also needed

### Payments
- "how did customers pay / COD vs online / payment method breakdown / how many cash orders / payment split" → get_orders_by_status (includes byPaymentMethod; add from/to for a period)
- "show COD orders / show cash orders" → search_orders(paymentMethod="cod") — treats cash and cod as identical
- "failed payments / pending online payments / payment gateway errors" → get_payments(status="failed" or "pending")
- "payment refunds / gateway refund / refund initiated online" → get_payments(status="refunded") — online gateway only
- get_payments is for online/UPI gateway ONLY — NEVER use it for COD, cash, or order status questions

### Inventory & Products
- "price / stock / MRP / variants / product info" → search_products (catalog data, NOT sales)
- "full product detail / all variants and GST" → get_product_detail
- "low stock / running low / need restock" → get_products_by_stock(status="low")
- "out of stock / no stock / zero stock" → get_products_by_stock(status="out")
- "in stock / available products" → get_products_by_stock(status="in")
- "IMS / in-store stock / store-level stock" → get_store_stock
- "PMS / RMS / raw materials / coconut / processing stock" → get_raw_materials or get_raw_material_snapshots
- "categories / product categories" → get_categories
- "stores / store list / store address / store info" → get_stores

### Subscriptions
- "subscriptions / active subscriptions / paused subscriptions / upcoming deliveries" → get_subscriptions
- "subscription for [customer] / customer subscription detail" → get_subscriptions(customerName=... or phone=...)

### Store Sales (offline/walk-in)
- "store sales / walk-in sales / offline sales / physical store sales / billing" → get_store_sales with from/to
- "sale detail / SALE-XXX" → get_sale_detail with saleNumber
- "store reminders / overdue payments / payment reminders" → get_reminders

### Coupons
- "coupons / active coupons / coupon list / all coupons" → get_coupon_list (optionally with status=active|expired|upcoming|inactive)
- "who used coupon X / coupon usage / coupon redemptions" → get_coupon_usage(couponCode=X)

### Feedback & Reviews
- "feedback / reviews / complaints / suggestions" → get_feedback_list
- "feedback for [product] / reviews for [product]" → get_feedback_list(productName=product)
- "low rated / bad reviews" → get_feedback_list(maxRating=2)

### WhatsApp & Comms
- "WhatsApp queue / support queue / pending support" → get_whatsapp_queue
- "WhatsApp messages for [phone] / chat history for customer" → get_whatsapp_messages(phone=...)

### Admin & Audit
- "who logged in / login history / admin login" → search_audit_logs(action="admin.login")
- "when was X updated/changed/edited" → search_audit_logs(action="product.update", targetName=X)
- "audit log / who did X / what changed" → search_audit_logs with relevant action
- "admin users / staff list / who are the admins / admin accounts" → get_admin_users
- "admins by role/department" → get_admin_users(role=... or department=...)

### Abandoned Carts
- "abandoned carts / customers who left without ordering / cart abandonment / who has items in cart" → search_abandoned_carts

### Emails
- email report → preview_email_report first, then send_email_report only after user confirms`.trim();

const OPS_SYSTEM_PROMPT = `${OPS_ROUTING_PROMPT}\n\n${FORMAT_RULES}`;

// ─────────────────────────────────────────────────────────────────────────────

/** Orders, delivery, products, inventory, analytics, customers, payments, wallet, comms, audit. */
@Injectable()
export class OpsAgent {
  private readonly logger = new Logger(OpsAgent.name);

  private _cache: any = null;
  private _cacheExpiry: Date | null = null;
  private _cachedModelName: string | null = null;
  private _cacheCreationPromise: Promise<any> | null = null;
  private _cacheFailedUntil = 0;

  constructor(private readonly tools: AdminChatbotToolsService) {}

  /** Pre-build the Gemini context cache so the first request doesn't pay for it. Never throws. */
  async warmUp(): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL;
    if (!apiKey || !modelName) return;
    await this.getOrRefreshCache(apiKey, modelName);
  }

  async run(query: string, history: HistoryItem[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return 'ERROR: GEMINI_API_KEY not set';

    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL!;

    const cache = await this.getOrRefreshCache(apiKey, modelName);
    const chat = ai.chats.create({
      model: modelName,
      history: historyToContent(history),
      config: {
        ...(cache
          ? { cachedContent: cache.name }
          : {
              systemInstruction: OPS_SYSTEM_PROMPT,
              tools: [{ functionDeclarations: OPS_TOOL_DECLARATIONS }],
              toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            }),
        temperature: 0.1,
        maxOutputTokens: 4000,
      },
    });

    return runToolLoop({
      chat,
      query,
      tools: this.tools,
      logger: this.logger,
      label: 'OpsAgent',
      maxIterations: MAX_TOOL_ITERATIONS,
      emptyReply: 'No ops data found.',
    });
  }

  private async getOrRefreshCache(apiKey: string, modelName: string): Promise<any> {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    // Return existing cache if still valid
    if (
      this._cache &&
      this._cacheExpiry &&
      this._cachedModelName === modelName &&
      this._cacheExpiry.getTime() - now > tenMinutes
    ) {
      return this._cache;
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
            systemInstruction: OPS_SYSTEM_PROMPT,
            tools: [{ functionDeclarations: OPS_TOOL_DECLARATIONS }],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            ttl: '3600s',
          },
        });
        this._cache = cache;
        this._cacheExpiry = new Date(cache.expireTime as string);
        this._cachedModelName = modelName;
        this.logger.log(`[OpsAgent] Context cache created, expires ${this._cacheExpiry.toISOString()}`);
        return cache;
      } catch (err) {
        this.logger.warn(`[OpsAgent] Context cache failed (${(err as Error).message}), retrying in 5 min`);
        this._cache = null;
        this._cacheFailedUntil = Date.now() + 5 * 60 * 1000;
        return null;
      } finally {
        this._cacheCreationPromise = null;
      }
    })();

    return this._cacheCreationPromise;
  }
}
