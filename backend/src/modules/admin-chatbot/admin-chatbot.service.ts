import { Injectable, Logger } from '@nestjs/common';
import { ProductRepository } from '../products/repositories/product.repository';
import { ChatSessionRepository } from '../chatbot/repositories/chat-session.repository';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { AnalyticsService } from '../analytics/analytics.service';
import { OrderRepository } from '../orders/repositories/order.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { FeedbackRepository } from '../feedback/repositories/feedback.repository';
import { CouponRepository } from '../coupons/repositories/coupon.repository';
import { CartRepository } from '../cart/repositories/cart.repository';

type RagStep = { tool: string; params?: Record<string, unknown> };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

@Injectable()
export class AdminChatbotService {
  private readonly logger = new Logger(AdminChatbotService.name);

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
  ) {}

  // ─── Gemini helper: retries once on 429/5xx, returns null on all other failures ───

  private async geminiRequest(
    apiKey: string,
    body: object,
    label: string,
  ): Promise<GeminiResponse | null> {
    const url = `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (networkErr) {
        this.logger.warn(`Gemini ${label} attempt ${attempt} — network error: ${(networkErr as Error).message}`);
        if (attempt === 1) { await this.sleep(1000); continue; }
        return null;
      }

      if (response.ok) {
        return response.json() as Promise<GeminiResponse>;
      }

      const status = response.status;
      const errorSnippet = (await response.text()).slice(0, 300);
      this.logger.warn(`Gemini ${label} attempt ${attempt} — HTTP ${status}: ${errorSnippet}`);

      // Don't retry on auth or bad-request errors — they won't fix themselves
      if (status === 401 || status === 403) {
        this.logger.error(`Gemini ${label}: invalid or missing API key (${status})`);
        return null;
      }
      if (status === 400) {
        this.logger.error(`Gemini ${label}: bad request (400) — ${errorSnippet}`);
        return null;
      }

      // Retry once on rate-limit or server error
      if ((status === 429 || status >= 500) && attempt === 1) {
        const delay = status === 429 ? 3000 : 1500;
        this.logger.log(`Gemini ${label}: retrying after ${delay}ms (HTTP ${status})`);
        await this.sleep(delay);
        continue;
      }

      return null;
    }

    return null;
  }

  private extractText(data: GeminiResponse | null): string {
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── Keyword-based fallback plan — works even when Gemini is completely down ───

  private keywordFallbackPlan(message: string): RagStep[] {
    const m = message.toLowerCase();
    const plan: RagStep[] = [];

    if (/stock|inventory|low.stock|out.of.stock|running.out|restock|replenish/.test(m))
      plan.push({ tool: 'search_low_stock_products', params: {} });

    if (/login|logged.in|audit|security|who.logged|access.log/.test(m))
      plan.push({ tool: 'get_login_audit_logs', params: { limit: 20 } });

    if (/abandon|left.without|didn.t.order|cart|stuck.in.checkout|left.in.between|left.halfway|half.way|didn.t.complete|incomplete.order|never.ordered|not.ordered|left.without.buy|left.without.order|who.left|who.didn|dropped.off|gave.up/.test(m))
      plan.push({ tool: 'search_abandoned_chats', params: { limit: 30 } });

    if (/top.sell|best.sell|popular|most.sold|best.product|trending/.test(m))
      plan.push({ tool: 'get_top_selling_products', params: { limit: 8, days: 30 } });

    if (/order.status|status.of.order|how.many.order|order.count|orders.by.status/.test(m))
      plan.push({ tool: 'get_orders_by_status', params: {} });

    if (/pending|awaiting|undelivered|unfulfilled/.test(m)) {
      plan.push({ tool: 'get_orders_by_status', params: {} });
      if (!plan.some((s) => s.tool === 'search_recent_orders'))
        plan.push({ tool: 'search_recent_orders', params: { limit: 10, status: 'placed' } });
    }

    if (/recent.order|latest.order|new.order|last.order|show.order|list.order|all.order|delivered.order|cancelled.order/.test(m)) {
      const statusMatch = m.match(/\b(placed|confirmed|preparing|delivered|cancelled|out.for.delivery)\b/);
      if (!plan.some((s) => s.tool === 'search_recent_orders'))
        plan.push({ tool: 'search_recent_orders', params: { limit: 10, ...(statusMatch ? { status: statusMatch[1] } : {}) } });
    }

    if (/revenue.trend|day.by.day|daily.revenue|chart|earning.trend/.test(m)) {
      const daysMatch = m.match(/(\d+)\s*day/);
      plan.push({ tool: 'get_revenue_trend', params: { days: daysMatch ? parseInt(daysMatch[1]) : 14 } });
    }

    // Generic revenue / earnings query → show both dashboard + trend
    if (/\brevenue\b|earning|how.much.*made|how.much.*earn|total.sale|sales.total/.test(m) && !plan.some((s) => s.tool === 'get_revenue_trend')) {
      const daysMatch = m.match(/(\d+)\s*day/);
      plan.push({ tool: 'get_dashboard_summary', params: {} });
      plan.push({ tool: 'get_revenue_trend', params: { days: daysMatch ? parseInt(daysMatch[1]) : 30 } });
    }

    if (/coupon|discount|promo.code|voucher|offer.code/.test(m))
      plan.push({ tool: 'get_coupon_list', params: {} });

    if (/review|feedback|rating|complaint|suggestion|testimonial/.test(m))
      plan.push({ tool: 'get_feedback_list', params: { limit: 15 } });

    if (/analytic|report|performance|weekly|monthly/.test(m)) {
      const daysMatch = m.match(/(\d+)\s*day/);
      const days = daysMatch ? parseInt(daysMatch[1]) : m.includes('week') ? 7 : 30;
      plan.push({ tool: 'get_analytics_period', params: { days } });
    }

    // "summary" and "overview" map to dashboard — not analytics period (too heavy for casual check)
    if (/\bsummary\b|\boverview\b/.test(m) && !plan.some((s) => s.tool === 'get_analytics_period')) {
      if (!plan.some((s) => s.tool === 'get_dashboard_summary'))
        plan.push({ tool: 'get_dashboard_summary', params: {} });
    }

    if (/new.customer|just.joined|signup|registered|joined.this|recently.joined/.test(m)) {
      const daysMatch = m.match(/(\d+)\s*day/);
      plan.push({ tool: 'get_new_customers', params: { days: daysMatch ? parseInt(daysMatch[1]) : 7 } });
    }

    if (/best.customer|top.customer|vip|highest.spend|most.spent|big.spender/.test(m))
      plan.push({ tool: 'get_top_customers_online', params: { limit: 10 } });

    // Generic customer lookup — "find customer", "search customer", "customer info"
    if (/find.customer|search.customer|customer.info|customer.detail|look.up|lookup/.test(m)) {
      const phoneMatch = m.match(/\b(\d{10,12})\b/);
      const searchTerm = phoneMatch ? phoneMatch[1] : '';
      plan.push({ tool: 'search_customers', params: { searchTerm, limit: 10 } });
    }

    // Specific product search — "stock of X", "price of X", "details of X"
    const productMatch = m.match(/(?:stock|price|details?)(?:\s+(?:for|of|on))?\s+([a-z\s]{3,30})/);
    if (productMatch && !plan.some((s) => s.tool === 'search_products'))
      plan.push({ tool: 'search_products', params: { searchTerm: productMatch[1].trim() } });

    // Default: general overview
    if (plan.length === 0) {
      plan.push(
        { tool: 'get_dashboard_summary', params: {} },
        { tool: 'get_orders_by_status', params: {} },
        { tool: 'search_low_stock_products', params: {} },
      );
    }

    return plan;
  }

  // ─── Raw data fallback — used when synthesis Gemini call fails ───

  private formatRawDataFallback(
    contextBlocks: string[],
    failedTools: string[],
    message: string,
  ): string {
    if (contextBlocks.length === 0) {
      return `⚠️ **No data could be retrieved right now.**\n\nThe database queries returned no results for: *"${message}"*\n\nPlease check server connectivity or try a different question.`;
    }

    const sections = contextBlocks.map((block) => {
      // Extract a readable header from [RAG: tool_name (optional extra)]
      const headerMatch = block.match(/^\[RAG:\s*([^\]]+)\]/);
      const header = headerMatch ? headerMatch[1].trim() : 'Data';
      const body = block.replace(/^\[RAG:[^\]]+\]\n?/, '').trim();
      return `### ${header}\n${body}`;
    });

    let reply = `> ⚡ *AI synthesis unavailable — showing raw database results for: "${message}"*\n\n`;
    reply += sections.join('\n\n---\n\n');

    if (failedTools.length > 0) {
      reply += `\n\n---\n> ⚠️ *The following data sources could not be loaded: ${failedTools.join(', ')}*`;
    }

    return reply;
  }

  // ─── Main chat entry point ───

  async chat(message: string): Promise<{ reply: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        reply: `⚠️ **AI assistant not configured.**\n\nAdd \`GEMINI_API_KEY\` to the backend \`.env\` file and restart the server.`,
      };
    }

    if (!message?.trim()) {
      return { reply: `Please type a question and I'll look it up from the database.` };
    }

    const contextBlocks: string[] = [];
    const failedTools: string[] = [];

    try {
      // ── Step 1: Plan ──────────────────────────────────────────────────────────
      let plan: RagStep[] = [];
      let plannerUsed: 'gemini' | 'keyword' = 'gemini';

      const plannerBody = {
        contents: [{ parts: [{ text: this.buildPlannerPrompt(message) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      };

      const plannerData = await this.geminiRequest(apiKey, plannerBody, 'planner');

      if (plannerData) {
        try {
          let raw = this.extractText(plannerData).trim();
          if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
          }
          const parsed = JSON.parse(raw.trim());
          if (Array.isArray(parsed)) plan = parsed;
        } catch {
          this.logger.warn('Planner JSON parse failed — switching to keyword plan');
        }
      }

      // Planner failed or returned bad JSON → keyword fallback (zero Gemini dependency)
      if (!plan.length) {
        plannerUsed = 'keyword';
        plan = this.keywordFallbackPlan(message);
        this.logger.log(`Using keyword fallback plan for: "${message}"`);
      }

      // Planner returned empty array (greeting / off-topic) → use default context
      const finalPlan: RagStep[] = plan.length > 0 ? plan : [
        { tool: 'get_dashboard_summary', params: {} },
        { tool: 'get_orders_by_status', params: {} },
        { tool: 'search_low_stock_products', params: {} },
      ];

      this.logger.log(`Plan (${plannerUsed}): ${finalPlan.map((s) => s.tool).join(', ')}`);

      // ── Step 2: Retrieve ──────────────────────────────────────────────────────
      await Promise.all(
        finalPlan.map(async (step) => {
          try {
            await this.executeTool(step, contextBlocks);
          } catch (err) {
            this.logger.error(`Tool "${step.tool}" failed: ${(err as Error).message}`);
            failedTools.push(step.tool);
          }
        }),
      );

      // All tools failed → nothing useful to show
      if (contextBlocks.length === 0) {
        this.logger.error(`All tools failed for message: "${message}"`);
        return {
          reply: `⚠️ **Could not load data right now.**\n\nAll database queries failed${failedTools.length ? ` (${failedTools.join(', ')})` : ''}. Please check your server and database connection, then try again.`,
        };
      }

      // ── Step 3: Synthesise ────────────────────────────────────────────────────
      const retrievedText = contextBlocks.join('\n\n');

      const synthesisBody = {
        contents: [{ parts: [{ text: this.buildSynthesisPrompt(message, retrievedText) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
      };

      const synthesisData = await this.geminiRequest(apiKey, synthesisBody, 'synthesis');
      const aiReply = this.extractText(synthesisData);

      if (!aiReply) {
        // Synthesis unavailable — return raw data so user always gets something
        this.logger.warn(`Synthesis produced no text — returning raw data fallback`);
        return { reply: this.formatRawDataFallback(contextBlocks, failedTools, message) };
      }

      // Append a soft note if some tools failed but we still got partial data
      if (failedTools.length > 0) {
        return {
          reply: `${aiReply}\n\n> ⚠️ *Partial data — could not load: ${failedTools.join(', ')}*`,
        };
      }

      return { reply: aiReply };

    } catch (err) {
      // Outer safety net — should never be reached in normal operation
      this.logger.error(`Unexpected error in AdminChatbotService.chat: ${(err as Error).message}`, (err as Error).stack);

      // If we managed to fetch some data before the crash, return it raw
      if (contextBlocks.length > 0) {
        return { reply: this.formatRawDataFallback(contextBlocks, failedTools, message) };
      }

      return {
        reply: `⚠️ **Something went wrong on the server.**\n\nThe issue has been logged. Please try again in a moment.`,
      };
    }
  }

  // ─── Tool executor ────────────────────────────────────────────────────────────

  private async executeTool(step: RagStep, contextBlocks: string[]): Promise<void> {
    switch (step.tool) {

      case 'get_dashboard_summary': {
        const stats = await this.analyticsService.getDashboardStats();
        contextBlocks.push(`[RAG: get_dashboard_summary]\n${JSON.stringify(stats, null, 2)}`);
        break;
      }

      case 'search_low_stock_products': {
        const FALLBACK_THRESHOLD = 10;
        const items = await this.productRepository.getModel().aggregate([
          { $match: { isActive: true } },
          {
            $addFields: {
              totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] },
              effectiveThreshold: {
                $cond: {
                  if: { $and: [{ $eq: ['$trackStock', true] }, { $gt: ['$lowStockThreshold', 0] }] },
                  then: '$lowStockThreshold',
                  else: FALLBACK_THRESHOLD,
                },
              },
            },
          },
          { $match: { $expr: { $lte: ['$totalStock', '$effectiveThreshold'] } } },
          { $sort: { totalStock: 1 } },
          { $limit: 20 },
        ]).exec();

        const formatted = items.length > 0
          ? items.map((p: any) =>
              `- **${p.name}** (SKU: ${p.sku}) | Stock: **${p.totalStock}** | Threshold: ${p.lowStockThreshold || FALLBACK_THRESHOLD}`
            ).join('\n')
          : 'No low stock products found.';
        contextBlocks.push(`[RAG: search_low_stock_products]\n${formatted}`);
        break;
      }

      case 'search_products': {
        const term = String(step.params?.searchTerm ?? '');
        const items = await this.productRepository.searchByText(term);
        const formatted = items.slice(0, 10).map((p: any) => {
          const variantStock = p.variants?.map((v: any) => `${v.sku}: ${v.stock}`).join(', ') ?? '';
          return `- **${p.name}** (SKU: ${p.sku}) | Stock: **${p.stock}** ${variantStock ? `[Variants: ${variantStock}]` : ''} | Price: ₹${p.price} | Active: ${p.isActive}`;
        }).join('\n') || 'No matching products found.';
        contextBlocks.push(`[RAG: search_products ("${term}")]\n${formatted}`);
        break;
      }

      case 'get_login_audit_logs': {
        const [count, logs] = await Promise.all([
          this.auditLogRepository.getModel().countDocuments({ action: 'admin.login' }),
          this.auditLogRepository.getModel().find({ action: 'admin.login' }).sort({ createdAt: -1 }).limit(10).exec(),
        ]);
        const formattedLogs = logs.map((log: any) =>
          `- **${log.performedByName || log.performedBy}** | IP: ${log.ipAddress || 'N/A'} | ${log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : 'N/A'}`
        ).join('\n') || 'No login logs found.';
        contextBlocks.push(`[RAG: get_login_audit_logs]\nTotal Admin Logins: **${count}**\n\nRecent:\n${formattedLogs}`);
        break;
      }

      case 'search_abandoned_chats': {
        const limit = Number(step.params?.limit ?? 30);
        const cutoff = new Date(Date.now() - 60 * 60 * 1000);

        const abandonedCarts = await this.cartRepository.getModel().aggregate([
          { $match: { 'items.0': { $exists: true }, updatedAt: { $lt: cutoff } } },
          {
            $lookup: {
              from: 'users',
              localField: 'user',
              foreignField: '_id',
              pipeline: [{ $project: { name: 1, phone: 1, isBlocked: 1 } }],
              as: 'userInfo',
            },
          },
          { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
          { $match: { 'userInfo.isBlocked': { $ne: true } } },
          {
            $lookup: {
              from: 'orders',
              let: { userId: '$user', cartUpdatedAt: '$updatedAt' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$user', '$$userId'] },
                        { $gt: ['$createdAt', '$$cartUpdatedAt'] },
                        { $ne: ['$status', 'cancelled'] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
              ],
              as: 'ordersAfterCart',
            },
          },
          { $match: { ordersAfterCart: { $size: 0 } } },
          { $sort: { updatedAt: -1 } },
          { $limit: limit },
        ]).exec();

        const coveredPhones = new Set(abandonedCarts.map((c: any) => c.userInfo?.phone).filter(Boolean));

        const stuckSessions = await this.chatSessionRepository.getModel()
          .find({
            currentState: { $in: ['cart', 'coupon_prompt', 'coupon_input', 'checkout', 'address_input', 'payment_selection'] },
            isExpired: { $ne: true },
            lastMessageAt: { $lt: cutoff },
          })
          .sort({ lastMessageAt: -1 })
          .limit(20)
          .populate('user', 'name phone')
          .exec();

        const cartFormatted = abandonedCarts.map((cart: any) => {
          const name = cart.userInfo?.name || 'Unknown Customer';
          const phone = cart.userInfo?.phone || 'No Phone';
          const itemsList = cart.items.map((item: any) => `${item.name} (x${item.quantity})`).join(', ');
          const coupon = cart.couponCode ? ` | Coupon: ${cart.couponCode}` : '';
          const hoursAgo = Math.round((Date.now() - new Date(cart.updatedAt).getTime()) / 3600000);
          return `- 📱 **${name}** | Phone: **${phone}** | Cart: ₹${(cart.total || 0).toLocaleString('en-IN')} | [${itemsList}]${coupon} | ~${hoursAgo}h ago`;
        });

        const sessionFormatted = stuckSessions
          .filter((s: any) => !coveredPhones.has((s.user as any)?.phone ?? s.phone))
          .map((s: any) => {
            const name = (s.user as any)?.name || s.metadata?.contactName || 'Unknown';
            const minsAgo = Math.round((Date.now() - new Date(s.lastMessageAt ?? s.updatedAt).getTime()) / 60000);
            return `- 📱 **${name}** | Phone: **${s.phone}** | Stuck at: \`${s.currentState}\` | Silent ~${minsAgo} min`;
          });

        const all = [...cartFormatted, ...sessionFormatted];
        contextBlocks.push(
          `[RAG: search_abandoned_chats]\nCustomers with items in cart who did NOT order: **${all.length}**\n(60+ min inactive; excludes anyone who ordered after cart activity)\n\n${all.join('\n') || 'No abandoned carts found.'}`
        );
        break;
      }

      case 'get_top_selling_products': {
        const days = Number(step.params?.days ?? 30);
        const limit = Number(step.params?.limit ?? 8);
        const tAgo = new Date(Date.now() - days * 86400000);
        const [online, store] = await Promise.all([
          this.analyticsService.getProductMetrics(tAgo, new Date()),
          this.analyticsService.getTopSellingOverall(tAgo, new Date(), limit),
        ]);
        const fmtOnline = (online as any).topSellingProducts?.slice(0, limit).map((p: any) =>
          `- **${p.name}** | ${p.quantitySold} units | ₹${(p.revenue || 0).toLocaleString('en-IN')} (Online)`
        ).join('\n') || 'No online top sellers.';
        const fmtStore = store.slice(0, limit).map((p: any) =>
          `- **${p.name}** | ${p.quantitySold} units | ₹${(p.revenue || 0).toLocaleString('en-IN')} (Store)`
        ).join('\n') || 'No store top sellers.';
        contextBlocks.push(`[RAG: get_top_selling_products (Last ${days}d)]\nOnline:\n${fmtOnline}\n\nStore:\n${fmtStore}`);
        break;
      }

      case 'search_recent_orders': {
        const limit = Number(step.params?.limit ?? 10);
        const STATUS_MAP: Record<string, string> = {
          shipped: 'out_for_delivery', pending: 'placed', processing: 'preparing',
          dispatched: 'out_for_delivery', completed: 'delivered', done: 'delivered',
        };
        const rawStatus = step.params?.status as string | undefined;
        const status = rawStatus ? (STATUS_MAP[rawStatus.toLowerCase()] ?? rawStatus.toLowerCase()) : undefined;
        const filter: Record<string, unknown> = {};
        if (status) filter.status = status;
        const orders = await this.orderRepository.getModel()
          .find(filter).sort({ createdAt: -1 }).limit(limit).populate('user', 'name phone').exec();
        const formatted = orders.map((o: any) =>
          `- **#${o.orderNumber}** | ${o.user?.name ?? 'Guest'} (${o.user?.phone ?? ''}) | ₹${o.total} | \`${o.status}\` | ${o.paymentMethod} | ${o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : 'N/A'}`
        ).join('\n') || 'No orders found.';
        contextBlocks.push(`[RAG: search_recent_orders${status ? ` (${status})` : ''}]\n${formatted}`);
        break;
      }

      case 'search_customers': {
        const term = String(step.params?.searchTerm ?? '').trim();
        const limit = Number(step.params?.limit ?? 10);
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const customers = await this.userRepository.getModel()
          .find(escaped ? { $or: [{ name: { $regex: escaped, $options: 'i' } }, { phone: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }] } : {})
          .sort({ totalSpent: -1 }).limit(limit).exec();
        const formatted = customers.map((c: any) =>
          `- **${c.name || 'Unnamed'}** | Phone: ${c.phone || 'N/A'} | Orders: ${c.totalOrders} | Spent: ₹${(c.totalSpent || 0).toLocaleString('en-IN')} | ${c.isBlocked ? 'Blocked' : c.isActive ? 'Active' : 'Inactive'} | Joined: ${c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : 'N/A'}`
        ).join('\n') || 'No matching customers.';
        contextBlocks.push(`[RAG: search_customers${term ? ` ("${term}")` : ''}]\n${formatted}`);
        break;
      }

      case 'get_top_customers_online': {
        const limit = Number(step.params?.limit ?? 10);
        const customers = await this.userRepository.getModel()
          .find({ totalOrders: { $gt: 0 } }).sort({ totalSpent: -1 }).limit(limit).exec();
        const formatted = customers.map((c: any, i: number) =>
          `${i + 1}. **${c.name || 'Unnamed'}** (${c.phone || 'N/A'}) | ${c.totalOrders} orders | ₹${(c.totalSpent || 0).toLocaleString('en-IN')} | Last: ${c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('en-IN') : 'N/A'}`
        ).join('\n') || 'No data.';
        contextBlocks.push(`[RAG: get_top_customers_online (Top ${limit})]\n${formatted}`);
        break;
      }

      case 'get_customer_orders': {
        const phone = String(step.params?.phone ?? '').trim();
        const name = String(step.params?.name ?? '').trim();
        const limit = Number(step.params?.limit ?? 10);
        let user: any = null;

        if (phone) {
          user = await this.userRepository.findOneByPhone(phone).catch(() => null);
          if (!user) {
            const esc = phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            user = await this.userRepository.getModel().findOne({ phone: { $regex: esc, $options: 'i' } }).exec().catch(() => null);
          }
        }
        if (!user && name) {
          const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          user = await this.userRepository.getModel().findOne({ name: { $regex: esc, $options: 'i' } }).sort({ totalOrders: -1 }).exec().catch(() => null);
        }

        if (!user) {
          contextBlocks.push(`[RAG: get_customer_orders]\nNo customer found for ${phone ? `phone "${phone}"` : `name "${name}"`}.`);
          break;
        }

        const orders = await this.orderRepository.getModel()
          .find({ user: user._id }).sort({ createdAt: -1 }).limit(limit).exec();
        const formatted = orders.map((o: any) =>
          `- **#${o.orderNumber}** | ₹${o.total} | \`${o.status}\` | ${o.paymentMethod} (${o.paymentStatus}) | ${o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : 'N/A'}`
        ).join('\n') || 'No orders found.';
        contextBlocks.push(`[RAG: get_customer_orders — ${user.name || phone}]\n**${user.name || 'Unnamed'}** | Phone: ${user.phone} | Orders: ${user.totalOrders} | Spent: ₹${(user.totalSpent || 0).toLocaleString('en-IN')}\n\n${formatted}`);
        break;
      }

      case 'get_revenue_trend': {
        const days = Number(step.params?.days ?? 14);
        const trend = await this.analyticsService.getRevenueByDay(days);
        const formatted = trend.map((d: any) =>
          `- ${d.date} | ₹${(d.revenue || 0).toLocaleString('en-IN')} | ${d.orders} orders`
        ).join('\n') || 'No revenue data.';
        const totalRev = (trend as any[]).reduce((s, d) => s + (d.revenue || 0), 0);
        const totalOrd = (trend as any[]).reduce((s, d) => s + (d.orders || 0), 0);
        contextBlocks.push(`[RAG: get_revenue_trend (Last ${days}d)]\nTotal: ₹${totalRev.toLocaleString('en-IN')} | ${totalOrd} orders\n\n${formatted}`);
        break;
      }

      case 'get_orders_by_status': {
        const counts = await this.orderRepository.getOrdersByStatus();
        const formatted = Object.entries(counts).map(([s, n]) => `- \`${s}\`: **${n}** orders`).join('\n') || 'No data.';
        const total = Object.values(counts).reduce((s: number, n: any) => s + (n || 0), 0);
        contextBlocks.push(`[RAG: get_orders_by_status]\nAll-time Total: **${total}**\n\n${formatted}`);
        break;
      }

      case 'get_feedback_list': {
        const limit = Number(step.params?.limit ?? 15);
        const feedbacks = await this.feedbackRepository.getModel()
          .find({}).populate('user', 'name phone').populate('product', 'name')
          .sort({ createdAt: -1 }).limit(limit).lean().exec();
        const formatted = feedbacks.map((f: any) => {
          const stars = f.rating ? `⭐${f.rating}/5` : '';
          return `- **${f.user?.name || 'Anonymous'}** on **${f.product?.name || 'General'}** ${stars} | ${f.type} | ${f.status} | "${f.message?.slice(0, 100) || ''}" | ${f.createdAt ? new Date(f.createdAt).toLocaleDateString('en-IN') : 'N/A'}`;
        }).join('\n') || 'No feedback found.';
        contextBlocks.push(`[RAG: get_feedback_list]\n${formatted}`);
        break;
      }

      case 'get_coupon_list': {
        const coupons = await this.couponRepository.getModel().find({}).sort({ createdAt: -1 }).limit(20).exec();
        const now = new Date();
        const formatted = coupons.map((c: any) => {
          const notYetValid = new Date(c.validFrom) > now;
          const expired = new Date(c.validUntil) < now;
          const active = c.isActive && !expired && !notYetValid;
          const discount = c.discountType === 'percentage' ? `${c.discountValue}% off` : `₹${c.discountValue} off`;
          const usage = c.maxUsageCount ? `${c.usedCount || 0}/${c.maxUsageCount}` : `${c.usedCount || 0} used`;
          const status = active ? '✅ Active' : notYetValid ? '⏳ Upcoming' : expired ? '❌ Expired' : '⏸ Inactive';
          return `- **${c.code}** | ${discount} | ${usage} | ${status} | Min ₹${c.minOrderAmount || 0} | ${new Date(c.validFrom).toLocaleDateString('en-IN')} – ${new Date(c.validUntil).toLocaleDateString('en-IN')}`;
        }).join('\n') || 'No coupons.';
        contextBlocks.push(`[RAG: get_coupon_list]\n${formatted}`);
        break;
      }

      case 'get_analytics_period': {
        const days = Number(step.params?.days ?? 30);
        const end = new Date();
        const start = new Date(Date.now() - days * 86400000);
        const [orders, customers, products, chat, topSellers, topCustomers] = await Promise.all([
          this.analyticsService.getOrderMetrics(start, end),
          this.analyticsService.getCustomerMetrics(start, end),
          this.analyticsService.getProductMetrics(start, end),
          this.analyticsService.getChatMetrics(start, end),
          this.analyticsService.getTopSellingOverall(start, end, 5),
          // Query User model directly — getTopCustomersOverall only covers store sales, not online orders
          this.userRepository.getModel().find({ totalOrders: { $gt: 0 } }).sort({ totalSpent: -1 }).limit(5).lean().exec(),
        ]);
        const o = orders as any; const c = customers as any; const p = products as any; const m = chat as any;
        const sellers = topSellers.slice(0, 5).map((s: any, i: number) =>
          `  ${i + 1}. **${s.name}** — ${s.quantitySold} units, ₹${(s.revenue || 0).toLocaleString('en-IN')}`
        ).join('\n') || '  No data.';
        const topC = (topCustomers as any[]).slice(0, 5).map((tc: any, i: number) =>
          `  ${i + 1}. **${tc.name || 'Unknown'}** (${tc.phone || ''}) — ₹${(tc.totalSpent || 0).toLocaleString('en-IN')}, ${tc.totalOrders} orders`
        ).join('\n') || '  No data.';
        const summary = [
          `Period: Last ${days}d (${start.toLocaleDateString('en-IN')} – ${end.toLocaleDateString('en-IN')})`,
          `**Orders:** ${o.totalOrders || 0} total | ₹${(o.totalRevenue || 0).toLocaleString('en-IN')} | AOV ₹${Math.round(o.avgOrderValue || 0)}`,
          `**Status:** ${o.completedOrders || 0} delivered | ${o.pendingOrders || 0} pending | ${o.cancelledOrders || 0} cancelled`,
          `**Payment:** ${o.codOrders || 0} COD | ${o.prepaidOrders || 0} prepaid`,
          `**Customers:** ${c.totalCustomers || 0} total | +${c.newCustomers || 0} new | ${c.returningCustomers || 0} returning`,
          `**Inventory:** ${p.outOfStockProducts || 0} out of stock | ${p.lowStockProducts || 0} low stock`,
          `**WhatsApp:** ${m.totalSessions || 0} sessions | ${m.supportHandoffs || 0} handoffs`,
          `\n**Top Products:**\n${sellers}`,
          `**Top Customers:**\n${topC}`,
        ].join('\n');
        contextBlocks.push(`[RAG: get_analytics_period]\n${summary}`);
        break;
      }

      case 'get_new_customers': {
        const days = Number(step.params?.days ?? 7);
        const since = new Date(Date.now() - days * 86400000);
        const [count, customers] = await Promise.all([
          this.userRepository.getModel().countDocuments({ createdAt: { $gte: since } }),
          this.userRepository.getModel().find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20).exec(),
        ]);
        const formatted = customers.map((c: any) =>
          `- **${c.name || 'Unnamed'}** | ${c.phone || 'N/A'} | ${c.createdAt ? new Date(c.createdAt).toLocaleString('en-IN') : 'N/A'}`
        ).join('\n') || 'None.';
        contextBlocks.push(`[RAG: get_new_customers (Last ${days}d)]\nTotal New: **${count}**\n\n${formatted}`);
        break;
      }

      default:
        this.logger.warn(`Unknown tool requested by planner: "${step.tool}"`);
    }
  }

  // ─── Prompt builders ──────────────────────────────────────────────────────────

  private buildPlannerPrompt(message: string): string {
    return `You are the RAG Data Planner for the Naturelite E-Commerce Admin Dashboard.
Pick the minimum set of tools needed to answer the question accurately. Return ONLY a raw JSON array. No markdown, no prose.

Tools:
1. {"tool":"get_dashboard_summary","params":{}} — today/month orders, revenue, customer count
2. {"tool":"search_low_stock_products","params":{}} — products below stock threshold
3. {"tool":"search_products","params":{"searchTerm":"string"}} — specific product stock/price/details
4. {"tool":"get_login_audit_logs","params":{"limit":20}} — admin login count and trail
5. {"tool":"search_abandoned_chats","params":{"limit":30}} — customers who left halfway, didn't complete order, abandoned cart (names + phones + items)
6. {"tool":"get_top_selling_products","params":{"limit":8,"days":30}} — best sellers online & store
7. {"tool":"search_recent_orders","params":{"limit":10,"status":"string"}} — recent orders, status filter optional (placed/confirmed/preparing/out_for_delivery/delivered/cancelled)
8. {"tool":"search_customers","params":{"searchTerm":"string","limit":10}} — find customer by name/phone
9. {"tool":"get_top_customers_online","params":{"limit":10}} — highest spenders
10. {"tool":"get_customer_orders","params":{"phone":"string","name":"string","limit":10}} — order history for one customer (phone OR name)
11. {"tool":"get_revenue_trend","params":{"days":14}} — day-by-day revenue chart
12. {"tool":"get_orders_by_status","params":{}} — order count per status bucket
13. {"tool":"get_feedback_list","params":{"limit":15}} — product reviews and feedback
14. {"tool":"get_coupon_list","params":{}} — all coupons, usage, expiry
15. {"tool":"get_analytics_period","params":{"days":30}} — full analytics for N days
16. {"tool":"get_new_customers","params":{"days":7}} — customers who joined in last N days

Examples:
"low stock" → [{"tool":"search_low_stock_products","params":{}}]
"which products are running out" → [{"tool":"search_low_stock_products","params":{}}]
"show Priya's orders" → [{"tool":"get_customer_orders","params":{"name":"Priya","limit":10}}]
"orders for 9876543210" → [{"tool":"get_customer_orders","params":{"phone":"9876543210","limit":10}}]
"find customer Rahul" → [{"tool":"search_customers","params":{"searchTerm":"Rahul","limit":10}}]
"revenue last 7 days" → [{"tool":"get_revenue_trend","params":{"days":7}}]
"how much did we earn today" → [{"tool":"get_dashboard_summary","params":{}}]
"best selling products" → [{"tool":"get_top_selling_products","params":{"limit":8,"days":30}}]
"show pending orders" → [{"tool":"search_recent_orders","params":{"limit":10,"status":"placed"}},{"tool":"get_orders_by_status","params":{}}]
"show delivered orders" → [{"tool":"search_recent_orders","params":{"limit":10,"status":"delivered"}}]
"abandoned carts" → [{"tool":"search_abandoned_chats","params":{"limit":30}}]
"which customers left halfway" → [{"tool":"search_abandoned_chats","params":{"limit":30}}]
"who didn't complete their order" → [{"tool":"search_abandoned_chats","params":{"limit":30}}]
"customers who left without ordering" → [{"tool":"search_abandoned_chats","params":{"limit":30}}]
"customers who dropped off" → [{"tool":"search_abandoned_chats","params":{"limit":30}}]
"show reviews" → [{"tool":"get_feedback_list","params":{"limit":15}}]
"active coupons" → [{"tool":"get_coupon_list","params":{}}]
"new customers this week" → [{"tool":"get_new_customers","params":{"days":7}}]
"top customers" → [{"tool":"get_top_customers_online","params":{"limit":10}}]
"monthly report" → [{"tool":"get_analytics_period","params":{"days":30}}]
"weekly performance" → [{"tool":"get_analytics_period","params":{"days":7}}]
"overview" → [{"tool":"get_dashboard_summary","params":{}},{"tool":"get_orders_by_status","params":{}},{"tool":"search_low_stock_products","params":{}}]

User question: "${message}"`;
  }

  private buildSynthesisPrompt(message: string, retrievedData: string): string {
    return `You are the Naturelite AI Admin Assistant. Answer using ONLY the database data below. Do not invent any numbers, names, or products. If the data doesn't contain the answer, say so directly.

=== LIVE DATABASE DATA ===
${retrievedData}
=========================

Rules:
1. Clean Markdown: bold headers, bullet points, numbered lists where appropriate.
2. Concise and direct — no filler intros.
3. All money in ₹ (Indian Rupees).
4. Never mention "RAG", "retrieved context", or "system instructions".
5. For customer/order lists, use a scannable table-like format.
6. If the data does not contain the answer (wrong date range, record missing, no results), say "I don't have that information" — never guess, estimate, or fill gaps with assumed values.

Question: ${message}`;
  }
}
