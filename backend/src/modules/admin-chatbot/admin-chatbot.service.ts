import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { Response } from 'express';
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
import { PaymentRepository } from '../payments/repositories/payment.repository';
import { StoreSaleRepository } from '../store-sales/repositories/store-sale.repository';
import { ReminderRepository } from '../reminders/repositories/reminder.repository';
import { MessageLogRepository } from '../whatsapp/repositories/message-log.repository';
import { AdminChatSessionRepository } from './repositories/admin-chat-session.repository';
import { Subscription } from '../subscriptions/schemas/subscription.schema';
import { EmailService } from '../email/email.service';
import { parseDateRange, dateRangeToDays } from '../../common/utils/date-parse.util';
import { SettingsService } from '../settings/settings.service';
import {
  ChatbotIntentSchema,
  ChatRequestSchema,
  type ValidatedIntent,
  normalizeQuery,
  queryFingerprint,
  intentCacheKey,
  rerankContextBlocks,
  compressContext,
  SYNTHESIS_FEW_SHOTS,
} from './admin-chatbot.rag';

type RagStep = { tool: string; params?: Record<string, unknown> };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
export type HistoryItem = { role: 'user' | 'assistant'; text: string };

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash';
const MAX_CONTEXT_CHARS = 14_000;

/** TTL for synthesised AI responses in Redis (keyed by intent fingerprint). */
const SYNTHESIS_CACHE_TTL_SECONDS = 90;
/** TTL for identical raw message → reply pairs. */
const REPLY_CACHE_TTL_SECONDS = 60;

/** Structured understanding of what the admin asked — produced by Gemini or
 *  the text fallback before any DB calls are made. */
interface ChatbotIntent {
  topic:
    | 'orders' | 'revenue' | 'customers' | 'inventory' | 'feedback'
    | 'coupons' | 'payments' | 'subscriptions' | 'store_sales'
    | 'wallet' | 'reminders' | 'whatsapp' | 'overview'
    | 'email' | 'login' | 'abandoned_carts' | 'top_products';
  timePreset?: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_30_days';
  from?: string;
  to?: string;
  filters?: {
    status?: string;
    paymentMethod?: 'cod' | 'prepaid';
    customerName?: string;
    customerPhone?: string;
    productName?: string;
    minRating?: number;
    maxRating?: number;
    feedbackType?: 'review' | 'complaint' | 'suggestion';
    couponStatus?: 'active' | 'expired' | 'upcoming' | 'inactive';
    minSpent?: number;
    outOfStock?: boolean;
    inStock?: boolean;
  };
  action?: 'list' | 'count' | 'summary' | 'trend' | 'compare' | 'search';
  emailTo?: string;
  emailReportType?: string;
  emailConfirm?: boolean;
}

class GeminiRateLimitError extends Error {
  constructor() {
    super('Gemini API rate limit reached');
    this.name = 'GeminiRateLimitError';
  }
}

@Injectable()
export class AdminChatbotService implements OnApplicationBootstrap {
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
    private readonly walletRepository: WalletRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly storeSaleRepository: StoreSaleRepository,
    private readonly reminderRepository: ReminderRepository,
    private readonly messageLogRepository: MessageLogRepository,
    private readonly adminChatSessionRepository: AdminChatSessionRepository,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    @InjectModel(Subscription.name) private readonly subscriptionModel: Model<any>,
    private readonly redisService: RedisService,
    @InjectQueue(QUEUE_ADMIN) private readonly adminQueue: Queue,
    @InjectQueue(QUEUE_CHATBOT) private readonly chatbotQueue: Queue,
  ) {}

  // ─── Gemini helpers ───────────────────────────────────────────────────────────

  private async geminiRequest(
    apiKey: string,
    body: object,
    label: string,
    throwOnRateLimit = false,
  ): Promise<GeminiResponse | null> {
    const url = `${GEMINI_BASE}:generateContent?key=${encodeURIComponent(apiKey)}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }) as any;
      } catch (networkErr) {
        this.logger.warn(`Gemini ${label} attempt ${attempt} — network: ${(networkErr as Error).message}`);
        if (attempt === 1) { await this.sleep(1000); continue; }
        return null;
      }
      if ((response as any).ok) return (response as any).json() as Promise<GeminiResponse>;
      const status = (response as any).status;
      const snippet = (await (response as any).text()).slice(0, 300);
      this.logger.warn(`Gemini ${label} attempt ${attempt} — HTTP ${status}: ${snippet}`);
      if (status === 401 || status === 403 || status === 400) return null;
      if ((status === 429 || status >= 500) && attempt === 1) {
        await this.sleep(status === 429 ? 3000 : 1500);
        continue;
      }
      // Rate limit persisted after retry — surface it as a typed error so callers
      // can show a specific message instead of the generic raw-data fallback.
      if (status === 429 && throwOnRateLimit) throw new GeminiRateLimitError();
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

  // ─── Sanitization & deduplication ────────────────────────────────────────────

  private sanitizeMessage(message: string): string {
    return message.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 500);
  }

  private deduplicatePlan(plan: RagStep[]): RagStep[] {
    const seen = new Set<string>();
    return plan.filter((s) => {
      if (seen.has(s.tool)) return false;
      seen.add(s.tool);
      return true;
    });
  }

  // ─── Email confirmation: extract params from prior preview in history ─────────

  private enrichEmailConfirmation(plan: RagStep[], history: HistoryItem[]): RagStep[] {
    return plan.map((step) => {
      if (step.tool !== 'send_email_report') return step;
      // Already has valid params
      if (step.params?.to && step.params?.reportType) return step;
      // Scan history (most recent assistant messages first) for a READY_TO_SEND preview
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        if (msg.role !== 'assistant') continue;
        const toMatch = msg.text.match(/\bto:\s*([^\s\n]+)/);
        const typeMatch = msg.text.match(/\breportType:\s*([^\s\n]+)/);
        if (toMatch && typeMatch && msg.text.includes('READY_TO_SEND')) {
          return { ...step, params: { to: toMatch[1], reportType: typeMatch[1] } };
        }
      }
      return step; // no preview found — will fail validation gracefully
    });
  }

  // ─── Date range helper ────────────────────────────────────────────────────────

  private resolveRange(params: Record<string, unknown> | undefined): { from: Date; to: Date } {
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

  // ─── Keyword fallback plan ────────────────────────────────────────────────────

  private keywordFallbackPlan(message: string): RagStep[] {
    const m = message.toLowerCase();
    const plan: RagStep[] = [];

    // Date range extraction for keyword fallback
    const range = parseDateRange(m);
    const dateParams = range
      ? { from: range.from.toISOString(), to: range.to.toISOString() }
      : {};

    if (/stock|inventory|low[\s-]stock|out[\s-]of[\s-]stock|running[\s-]out|restock/.test(m)) {
      const isOutOfStock = /out[\s-]of[\s-]stock|zero[\s-]stock|no[\s-]stock|completely[\s-]out/.test(m);
      // Extract product-type qualifier — strip all navigation/stop words before using as filter
      const STOP_WORDS = /\b(now|tell|which|show|me|are|is|the|all|items?|products?|skus?|stock|low|out|of|in|for|running|restock|inventory|give|list|check|find|get|what|how|many|currently|there|any)\b/gi;
      const typeMatch = m.match(/(?:which\s+)?([a-z]+(?:\s+[a-z]+)?)\s+(?:item|product|sku)s?\s+(?:(?:is|are)\s+)?(?:low|out|running)/i)
        ?? m.match(/low[\s-]+(?:stock|inventory)\s+(?:in|of|for)?\s*([a-z]+(?:\s+[a-z]+)?)/i)
        ?? m.match(/(?:check|show|list)\s+(?:low[\s-]+stock\s+)?([a-z]+(?:\s+[a-z]+)?)\s+(?:items?|products?)/i);
      const rawTerm = typeMatch ? typeMatch[1].replace(STOP_WORDS, '').replace(/\s+/g, ' ').trim() : '';
      // Only use as a filter if something meaningful (≥3 chars, looks like a product word) remains
      const searchTerm = rawTerm.length >= 3 ? rawTerm : '';
      if (isOutOfStock) {
        plan.push({ tool: 'search_out_of_stock_products', params: searchTerm ? { searchTerm } : {} });
      } else {
        plan.push({ tool: 'search_low_stock_products', params: searchTerm ? { searchTerm } : {} });
      }
    }

    if (/login|logged[\s-]in|audit|security|who[\s-]logged|access[\s-]log/.test(m))
      plan.push({ tool: 'get_login_audit_logs', params: { limit: 20 } });

    if (/abandon|left[\s-]without|didn[\W]t[\s-]order|stuck[\s-]in[\s-]checkout|dropped[\s-]off/.test(m))
      plan.push({ tool: 'search_abandoned_carts', params: { limit: 30 } });

    if (/top[\s-]sell|best[\s-]sell|popular|most[\s-]sold|trending/.test(m) && !plan.some((s) => s.tool === 'get_top_selling_products'))
      plan.push({ tool: 'get_top_selling_products', params: { limit: 8, ...dateParams } });

    if (/order[\s-]status|status[\s-]of[\s-]order|how[\s-]many[\s-]order|orders[\s-]by[\s-]status/.test(m))
      plan.push({ tool: 'get_orders_by_status', params: {} });

    if (/pending|awaiting|undelivered|unfulfilled/.test(m)) {
      plan.push({ tool: 'get_orders_by_status', params: {} });
      if (!plan.some((s) => s.tool === 'search_recent_orders'))
        plan.push({ tool: 'search_recent_orders', params: { limit: 10, status: 'placed' } });
    }

    if (/recent[\s-]order|latest[\s-]order|new[\s-]order|last[\s-]order|show[\s-]order|list[\s-]order|all[\s-]order|delivered[\s-]order|cancelled[\s-]order/.test(m)) {
      const statusMatch = m.match(/\b(placed|confirmed|preparing|delivered|cancelled|out[\s_-]for[\s_-]delivery)\b/);
      if (!plan.some((s) => s.tool === 'search_recent_orders'))
        plan.push({ tool: 'search_recent_orders', params: { limit: 10, ...dateParams, ...(statusMatch ? { status: statusMatch[1] } : {}) } });
    }

    if (/orders?\s+between|orders?\s+from|orders?\s+in\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|date[\s-]range/.test(m))
      plan.push({ tool: 'search_orders_by_date_range', params: { ...dateParams, limit: 20 } });

    if (/revenue[\s-]trend|day[\s-]by[\s-]day|daily[\s-]revenue|earning[\s-]trend/.test(m))
      plan.push({ tool: 'get_revenue_trend', params: { ...dateParams, days: dateParams.from ? undefined : 14 } });

    if (/\brevenue\b|earning|how[\s\S]{0,10}made|total[\s-]sale|sales[\s-]total/.test(m) && !plan.some((s) => s.tool === 'get_revenue_trend')) {
      plan.push({ tool: 'get_dashboard_summary', params: {} });
      plan.push({ tool: 'get_revenue_trend', params: { ...dateParams, days: dateParams.from ? undefined : 30 } });
    }

    if (/compare|vs\.?|versus|week[\s-]over[\s-]week|month[\s-]over[\s-]month|period/.test(m)) {
      const daysMatch = m.match(/(\d+)[\s-]day/);
      plan.push({ tool: 'compare_periods', params: { days: daysMatch ? parseInt(daysMatch[1]) : 7 } });
    }

    if (/coupon|discount|promo[\s-]code|voucher|offer[\s-]code/.test(m)) {
      const statusMatch = m.match(/\b(active|expired|upcoming|inactive)\b/);
      plan.push({ tool: 'get_coupon_list', params: statusMatch ? { status: statusMatch[1] } : {} });
    }

    if (/review|feedback|rating|complaint|suggestion|testimonial/.test(m)) {
      const feedbackParams: Record<string, unknown> = { limit: 15 };
      if (/1[\s-]star|one[\s-]star|worst|terrible/.test(m)) feedbackParams.maxRating = 1;
      else if (/2[\s-]star|two[\s-]star|bad|poor/.test(m)) feedbackParams.maxRating = 2;
      else if (/5[\s-]star|five[\s-]star|best|excellent/.test(m)) feedbackParams.minRating = 5;
      else if (/4[\s-]star|four[\s-]star|good/.test(m)) feedbackParams.minRating = 4;
      else if (/negative|low[\s-]rating/.test(m)) feedbackParams.maxRating = 2;
      else if (/positive|high[\s-]rating/.test(m)) feedbackParams.minRating = 4;
      if (/complaint/.test(m)) feedbackParams.type = 'complaint';
      else if (/suggestion/.test(m)) feedbackParams.type = 'suggestion';
      plan.push({ tool: 'get_feedback_list', params: feedbackParams });
    }

    if (/top[\s-]sell|best[\s-]sell|popular|most[\s-]sold|trending/.test(m)) {
      const prodTypeMatch = m.match(/(?:top[\s-]selling|best[\s-]selling|popular|most[\s-]sold)\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:product|item)/i)
        ?? m.match(/which\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:sell|product|item)/i);
      const searchTerm = prodTypeMatch ? prodTypeMatch[1].trim() : '';
      if (searchTerm && !plan.some((s) => s.tool === 'get_top_selling_products'))
        plan.push({ tool: 'get_top_selling_products', params: { limit: 8, searchTerm, ...dateParams } });
    }

    if (/analytic|report|performance|weekly|monthly/.test(m)) {
      const days = dateParams.from ? dateRangeToDays(parseDateRange(m)!) : (m.includes('week') ? 7 : 30);
      plan.push({ tool: 'get_analytics_period', params: { ...dateParams, days } });
    }

    if (/\bsummary\b|\boverview\b/.test(m) && !plan.some((s) => s.tool === 'get_analytics_period')) {
      if (!plan.some((s) => s.tool === 'get_dashboard_summary'))
        plan.push({ tool: 'get_dashboard_summary', params: {} });
    }

    if (/new[\s-]customer|just[\s-]joined|signup|registered|joined[\s-]this|recently[\s-]joined/.test(m)) {
      const daysMatch = m.match(/(\d+)\s*day/);
      plan.push({ tool: 'get_new_customers', params: { ...dateParams, days: daysMatch ? parseInt(daysMatch[1]) : 7 } });
    }

    if (/best[\s-]customer|top[\s-]customer|vip|highest[\s-]spend|most[\s-]spent|big[\s-]spender/.test(m))
      plan.push({ tool: 'get_top_customers_online', params: { limit: 10 } });

    if (/find[\s-]customer|search[\s-]customer|customer[\s-]info|customer[\s-]detail|look[\s-]up|lookup/.test(m)) {
      const phoneMatch = m.match(/\b(\d{10,12})\b/);
      plan.push({ tool: 'search_customers', params: { searchTerm: phoneMatch ? phoneMatch[1] : '', limit: 10 } });
    }

    if (/store[\s-]sale|walk[\s-]in|physical[\s-]store|store[\s-]revenue|offline/.test(m))
      plan.push({ tool: 'get_store_sales', params: { ...dateParams, days: dateParams.from ? undefined : 30 } });

    if (/wallet|credit|balance|unused[\s-]credit|wallet[\s-]balance/.test(m))
      plan.push({ tool: 'get_wallet_balances', params: { limit: 20 } });

    if (/payment[\s-]fail|failed[\s-]payment|pending[\s-]payment|unsuccessful[\s-]payment/.test(m))
      plan.push({ tool: 'get_payment_failures', params: { limit: 20 } });

    if (/subscription|recurring|repeat[\s-]order|schedule[\s-]order/.test(m))
      plan.push({ tool: 'get_subscription_data', params: {} });

    if (/whatsapp[\s-]queue|support[\s-]queue|pending[\s-]support|handed[\s-]off|support[\s-]session/.test(m))
      plan.push({ tool: 'get_whatsapp_queue', params: {} });

    if (/reminder|due[\s-]reminder|pending[\s-]reminder|upcoming[\s-]reminder/.test(m))
      plan.push({ tool: 'get_reminders', params: {} });

    const productMatch = m.match(/(?:stock|price|details?)(?:\s+(?:for|of|on))?\s+([a-z\s]{3,30})/);
    if (productMatch && !plan.some((s) => s.tool === 'search_products'))
      plan.push({ tool: 'search_products', params: { searchTerm: productMatch[1].trim() } });

    // Email action intent
    const emailMatch = m.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    const sendIntent = /\b(send|email|forward|mail|share)\b/.test(m);
    if (emailMatch && sendIntent) {
      const to = emailMatch[0];
      // Detect report type from message
      let reportType = 'dashboard';
      if (/\bims\b/.test(m)) reportType = 'ims';
      else if (/low[\s-]stock|inventory/.test(m)) reportType = 'low_stock';
      else if (/\banalytics\b/.test(m)) reportType = 'analytics';
      else if (/\bmonthly\b/.test(m)) reportType = 'monthly';
      else if (/\bweekly\b/.test(m)) reportType = 'weekly';
      else if (/\borders?\b/.test(m)) reportType = 'orders';
      else if (/\brevenue\b/.test(m)) reportType = 'revenue';
      else if (/\bcustomer\b/.test(m)) reportType = 'customers';
      else if (/\bfeedback\b|\breview\b/.test(m)) reportType = 'feedback';
      else if (/\bcoupon\b/.test(m)) reportType = 'coupons';
      else if (/store[\s-]sale/.test(m)) reportType = 'store_sales';
      else if (/abandon/.test(m)) reportType = 'abandoned';
      else if (/payment/.test(m)) reportType = 'payments';

      // Check if this is a confirmation ("yes send it") — look at prior context
      const isConfirmation = /^\s*(yes|yep|yeah|confirm|send it|go ahead|do it|proceed)\s*$/i.test(m);
      plan.push({
        tool: isConfirmation ? 'send_email_report' : 'preview_email_report',
        params: { to, reportType },
      });
      return plan;
    }

    // Confirmation of a pending email action (no email in message, just "yes")
    if (/^\s*(yes|yep|yeah|confirm|send it|go ahead|do it|proceed)\s*$/i.test(m)) {
      plan.push({ tool: 'send_email_report', params: {} }); // planner will fill from history
      return plan;
    }

    if (plan.length === 0) {
      plan.push(
        { tool: 'get_dashboard_summary', params: {} },
        { tool: 'get_orders_by_status', params: {} },
        { tool: 'search_low_stock_products', params: {} },
      );
    }

    return plan;
  }

  // ─── Raw data fallback ────────────────────────────────────────────────────────

  private formatRawDataFallback(contextBlocks: string[], failedTools: string[], message: string): string {
    if (contextBlocks.length === 0)
      return `⚠️ **No data could be retrieved right now.**\n\nPlease check server connectivity or try again.`;

    // When there's a single focused result, present it cleanly without the "synthesis unavailable" noise.
    if (contextBlocks.length === 1) {
      const body = contextBlocks[0].replace(/^\[RAG:[^\]]+\]\n?/, '').trim();
      const notice = failedTools.length > 0
        ? `\n\n> ⚠️ *Could not load: ${failedTools.join(', ')}*`
        : '';
      return `${body}${notice}`;
    }

    // Multiple blocks — show each section with a clean header (no underscores, no tool jargon).
    const sections = contextBlocks.map((block) => {
      const rawHeader = block.match(/^\[RAG:\s*([^\]]+)\]/)?.[1]?.trim() ?? 'Data';
      // Convert snake_case tool names to readable labels
      const header = rawHeader.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Search |^Get /, '');
      const body = block.replace(/^\[RAG:[^\]]+\]\n?/, '').trim();
      return `## ${header}\n${body}`;
    });

    let reply = sections.join('\n\n---\n\n');
    if (failedTools.length > 0)
      reply += `\n\n> ⚠️ *Could not load: ${failedTools.join(', ')}*`;
    return reply;
  }

  // ─── Input validation ─────────────────────────────────────────────────────────

  validateChatRequest(message: string, history: unknown): { message: string; history: HistoryItem[] } {
    const result = ChatRequestSchema.safeParse({ message, history });
    if (!result.success) {
      throw new Error(result.error.issues.map((i) => i.message).join('; '));
    }
    return result.data;
  }

  // ─── Query expansion (RAG concept) ───────────────────────────────────────────

  /**
   * Ask Gemini to expand/clarify a short or ambiguous query into a more precise
   * one before intent extraction.  Returns the original if Gemini is unavailable.
   * Cost: 1 cheap intent-class call (~50 tokens in, ~30 tokens out).
   */
  private async expandQuery(apiKey: string, query: string): Promise<string> {
    if (query.length > 80) return query; // already detailed enough
    try {
      const data = await this.geminiRequest(
        apiKey,
        {
          contents: [{
            parts: [{
              text: `You are an e-commerce analytics query optimizer. Expand this short admin query into a single clear question. Return ONLY the expanded query, nothing else.\n\nShort query: "${query}"\nExpanded query:`,
            }],
          }],
          generationConfig: { temperature: 0.0, maxOutputTokens: 80 },
        },
        'expand',
      );
      const expanded = this.extractText(data).trim().replace(/^["']|["']$/g, '');
      if (expanded && expanded.length > query.length) {
        this.logger.debug(`Query expanded: "${query}" → "${expanded}"`);
        return expanded;
      }
    } catch { /* fall through */ }
    return query;
  }

  // ─── Semantic reply cache ─────────────────────────────────────────────────────

  /**
   * Try to serve a cached AI reply for this intent.
   * Key: intent fingerprint (topic + filters + timePreset) — independent of exact wording.
   */
  private async getCachedReply(intent: ValidatedIntent): Promise<string | null> {
    const key = `${intentCacheKey(intent)}:reply`;
    return this.redisService.get(key);
  }

  private async setCachedReply(intent: ValidatedIntent, reply: string): Promise<void> {
    const key = `${intentCacheKey(intent)}:reply`;
    await this.redisService.set(key, reply, SYNTHESIS_CACHE_TTL_SECONDS);
  }

  // ─── Core RAG pipeline ────────────────────────────────────────────────────────

  /**
   * Full RAG pipeline: expand → cache check → Gemini plans tools →
   * execute (parallel) → re-rank → compress → synthesise → cache → persist.
   * Gemini decides which tools to call — no hardcoded topic→tool mapping.
   */
  async runRagPipeline(
    message: string,
    history: HistoryItem[],
    adminId: string | undefined,
    apiKey: string,
  ): Promise<{ reply: string; contextBlocks: string[]; failedTools: string[] }> {
    const failedTools: string[] = [];

    // ── 1. Normalise query + fingerprint ────────────────────────────────────────
    const normalized = normalizeQuery(message);
    const fingerprint = queryFingerprint(normalized);
    this.logger.debug(`Query fingerprint: ${fingerprint}`);

    // ── 1b. Expand short/ambiguous queries ──────────────────────────────────────
    const expandedMessage = await this.expandQuery(apiKey, message);

    // ── 2. Semantic reply cache check ───────────────────────────────────────────
    // Skip cache for email confirmation flows (must always hit live tools)
    const isEmailFlow = /\byes\b|\bconfirm\b|\bsend\s+it\b|\bgo\s+ahead\b/i.test(message) &&
      history.some((h) => h.role === 'assistant' && /preview_email_report|READY_TO_SEND/i.test(h.text));
    const replyCacheKey = `chatbot:reply:${fingerprint}`;
    if (!isEmailFlow) {
      const cachedReply = await this.redisService.get(replyCacheKey).catch(() => null);
      if (cachedReply) {
        this.logger.debug(`Reply cache HIT: ${fingerprint}`);
        if (adminId) {
          const ts = new Date().toISOString();
          await this.adminChatSessionRepository.appendMessages(adminId, [
            { id: `${Date.now()}-u`, sender: 'user', text: message, timestamp: ts },
            { id: `${Date.now()}-a`, sender: 'assistant', text: cachedReply, timestamp: ts },
          ]).catch(() => {});
        }
        return { reply: cachedReply, contextBlocks: [], failedTools: [] };
      }
    }

    // ── 3. Gemini plans which tools to call ─────────────────────────────────────
    let plan: RagStep[] = [];
    let planSource = 'gemini';

    const planData = await this.geminiRequest(
      apiKey,
      {
        contents: [{ parts: [{ text: this.buildPlannerPrompt(expandedMessage, history) }] }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 400, responseMimeType: 'application/json' },
      },
      'planner',
    );

    if (planData) {
      try {
        let raw = this.extractText(planData).trim();
        if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
        const parsed = JSON.parse(raw.trim());
        if (Array.isArray(parsed) && parsed.length > 0) plan = parsed;
      } catch {
        this.logger.warn('Planner JSON parse failed — keyword fallback');
      }
    }

    if (!plan.length) {
      planSource = 'keyword-fallback';
      plan = this.keywordFallbackPlan(message);
    }

    const finalPlan = this.deduplicatePlan(plan);
    this.logger.log(`Plan (${planSource}): ${finalPlan.map((s) => s.tool).join(', ')}`);

    const toolResults = await Promise.all(
      finalPlan.map(async (step, index) => {
        try {
          const block = await this.executeTool(step);
          return { index, block };
        } catch (err) {
          this.logger.error(`Tool "${step.tool}" failed: ${(err as Error).message}`);
          failedTools.push(step.tool);
          return { index, block: null };
        }
      }),
    );

    const rawBlocks = toolResults
      .sort((a, b) => a.index - b.index)
      .map((r) => r.block)
      .filter((b): b is string => b !== null);

    if (rawBlocks.length === 0) {
      return {
        reply: `⚠️ **Could not load data.**\n\nAll queries failed (${failedTools.join(', ')}). Check DB connection.`,
        contextBlocks: [],
        failedTools,
      };
    }

    // ── 5. Re-rank by relevance to the normalised query ─────────────────────────
    const rankedBlocks = rerankContextBlocks(rawBlocks, normalized);

    // ── 6. Compress context to fit budget ───────────────────────────────────────
    const compressedBlocks = compressContext(rankedBlocks, normalized, MAX_CONTEXT_CHARS);
    const retrievedText = compressedBlocks.join('\n\n').slice(0, MAX_CONTEXT_CHARS);

    // ── 7. Synthesise ────────────────────────────────────────────────────────────
    const synthesisData = await this.geminiRequest(
      apiKey,
      {
        contents: [{ parts: [{ text: this.buildSynthesisPrompt(message, retrievedText, history) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
      },
      'synthesis',
      true,
    );
    const aiReply = this.extractText(synthesisData);

    const rawFallback = this.formatRawDataFallback(rawBlocks, failedTools, message);
    const baseReply = aiReply || rawFallback;
    const finalReply = failedTools.length > 0
      ? `${baseReply}\n\n> ⚠️ *Partial data — could not load: ${failedTools.join(', ')}*`
      : baseReply;

    // ── 8. Cache synthesised reply (skip action tools like send_email) ───────────
    const ACTION_TOOLS = new Set(['send_email_report', 'preview_email_report']);
    const isActionPlan = finalPlan.some((s) => ACTION_TOOLS.has(s.tool));
    if (aiReply && !isActionPlan && !isEmailFlow) {
      await this.redisService.set(replyCacheKey, finalReply, SYNTHESIS_CACHE_TTL_SECONDS).catch(() => {});
    }

    // ── 9. Persist conversation history ──────────────────────────────────────────
    if (adminId) {
      const ts = new Date().toISOString();
      await this.adminChatSessionRepository.appendMessages(adminId, [
        { id: `${Date.now()}-u`, sender: 'user', text: message, timestamp: ts },
        { id: `${Date.now()}-a`, sender: 'assistant', text: finalReply, timestamp: ts },
      ]).catch(() => {});
    }

    return { reply: finalReply, contextBlocks: rawBlocks, failedTools };
  }

  // ─── Main chat entry point ────────────────────────────────────────────────────

  async chat(message: string, history: HistoryItem[] = [], adminId?: string): Promise<{ reply: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      return { reply: `⚠️ **AI assistant not configured.**\n\nAdd \`GEMINI_API_KEY\` to the backend \`.env\` file.` };

    // Validate input with Zod
    let safe: { message: string; history: HistoryItem[] };
    try {
      safe = this.validateChatRequest(message, history);
    } catch (e) {
      return { reply: `⚠️ ${(e as Error).message}` };
    }

    try {
      const { reply } = await this.runRagPipeline(safe.message, safe.history, adminId, apiKey);
      return { reply };
    } catch (err) {
      if (err instanceof GeminiRateLimitError) {
        return {
          reply:
            `> ⚠️ **Gemini API rate limit reached.**\n\n` +
            `The AI is temporarily unavailable. Please wait a minute and try again.\n\n` +
            `_Your data was retrieved — only the AI summary step failed._`,
        };
      }
      this.logger.error(`chat() error: ${(err as Error).message}`, (err as Error).stack);
      return { reply: `⚠️ **Something went wrong on the server.**\n\nPlease try again.` };
    }
  }

  // ─── BullMQ async chat (non-streaming) ───────────────────────────────────────

  /**
   * Queue a chat job for async processing. Returns a jobId the client can use to
   * poll `GET /admin/chatbot/result/:jobId` for the reply.
   * Rate-limited to 50 Gemini calls/min via the chatbot queue's limiter.
   */
  async enqueueChat(
    message: string,
    history: HistoryItem[],
    adminId: string | undefined,
  ): Promise<{ jobId: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    let safe: { message: string; history: HistoryItem[] };
    try {
      safe = this.validateChatRequest(message, history);
    } catch (e) {
      throw new Error(`Validation failed: ${(e as Error).message}`);
    }

    const job = await this.chatbotQueue.add(
      CHATBOT_JOBS.CHAT_QUERY,
      { message: safe.message, history: safe.history, adminId },
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

  /** Retrieve the result of an async chat job from Redis. */
  async getChatJobResult(jobId: string): Promise<{ status: 'pending' | 'done' | 'failed'; reply?: string }> {
    const job = await this.chatbotQueue.getJob(jobId);
    if (!job) return { status: 'failed', reply: 'Job not found.' };
    const state = await job.getState();
    if (state === 'completed') {
      const result = job.returnvalue as { reply: string } | undefined;
      return { status: 'done', reply: result?.reply ?? '(empty)' };
    }
    if (state === 'failed') return { status: 'failed', reply: job.failedReason ?? 'Unknown error' };
    return { status: 'pending' };
  }

  /** Called by the BullMQ processor to execute an async chat job. */
  async _executeChatQuery(data: { message: string; history: HistoryItem[]; adminId?: string }): Promise<{ reply: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { reply: '⚠️ GEMINI_API_KEY not configured.' };
    try {
      const { reply } = await this.runRagPipeline(data.message, data.history, data.adminId, apiKey);
      return { reply };
    } catch (err) {
      if (err instanceof GeminiRateLimitError) {
        return { reply: '> ⚠️ Gemini rate limit reached. Please retry in a minute.' };
      }
      throw err;
    }
  }

  // ─── Streaming synthesis ──────────────────────────────────────────────────────

  async streamChat(
    message: string,
    history: HistoryItem[],
    adminId: string | undefined,
    res: any,
  ): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ delta: '⚠️ GEMINI_API_KEY not configured.' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return;
    }

    // Validate input
    let safe: { message: string; history: HistoryItem[] };
    try {
      safe = this.validateChatRequest(message, history);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ delta: `⚠️ ${(e as Error).message}` })}\n\n`);
      res.write('data: [DONE]\n\n');
      return;
    }

    try {
      // Run full RAG pipeline (persistence skipped — we handle it after streaming)
      const { reply: fullReply, contextBlocks, failedTools } = await this.runRagPipeline(
        safe.message,
        safe.history,
        undefined, // skip persistence inside pipeline
        apiKey,
      );

      if (!fullReply || fullReply.startsWith('⚠️ **Could not load')) {
        res.write(`data: ${JSON.stringify({ delta: fullReply || '⚠️ Could not load data. Check database connection.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        return;
      }

      // Stream word-by-word
      const tokens = fullReply.split(/(\s+)/);
      for (const token of tokens) {
        if (token) {
          res.write(`data: ${JSON.stringify({ delta: token })}\n\n`);
          await this.sleep(10);
        }
      }
      res.write('data: [DONE]\n\n');

      // Persist after streaming completes
      if (adminId) {
        const ts = new Date().toISOString();
        await this.adminChatSessionRepository.appendMessages(adminId, [
          { id: `${Date.now()}-u`, sender: 'user', text: safe.message, timestamp: ts },
          { id: `${Date.now()}-a`, sender: 'assistant', text: fullReply, timestamp: ts },
        ]).catch(() => {});
      }

    } catch (err) {
      if (err instanceof GeminiRateLimitError) {
        const msg =
          '> ⚠️ **Gemini API rate limit reached.**\n\n' +
          'The AI is temporarily unavailable. Please wait a minute and try again.\n\n' +
          '_Your data was retrieved — only the AI summary step failed._';
        for (const token of msg.split(/(\s+)/)) {
          if (token) res.write(`data: ${JSON.stringify({ delta: token })}\n\n`);
        }
      } else {
        this.logger.error(`streamChat error: ${(err as Error).message}`);
        res.write(`data: ${JSON.stringify({ delta: '⚠️ Something went wrong. Please try again.' })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    }
  }

  // ─── Proactive briefing ───────────────────────────────────────────────────────

  async getBriefing(): Promise<Record<string, unknown>> {
    const [dashboard, statusCounts, lowStock] = await Promise.allSettled([
      this.executeTool({ tool: 'get_dashboard_summary', params: {} }),
      this.executeTool({ tool: 'get_orders_by_status', params: {} }),
      this.executeTool({ tool: 'search_low_stock_products', params: {} }),
    ]);

    const extract = (r: PromiseSettledResult<string | null>) =>
      r.status === 'fulfilled' && r.value ? r.value.replace(/^\[RAG:[^\]]+\]\n?/, '') : null;

    return {
      dashboard: extract(dashboard),
      orderStatus: extract(statusCounts),
      lowStock: extract(lowStock),
    };
  }

  // ─── Conversation persistence ─────────────────────────────────────────────────

  async getHistory(adminId: string) {
    const session = await this.adminChatSessionRepository.getByAdminId(adminId);
    return session?.messages ?? [];
  }

  async clearHistory(adminId: string): Promise<void> {
    await this.adminChatSessionRepository.clearByAdminId(adminId);
  }

  // ─── Scheduled daily report ───────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    const adminEmail = process.env.ADMIN_REPORT_EMAIL;
    if (adminEmail) {
      try {
        const repeatableJobs = await this.adminQueue.getRepeatableJobs();
        for (const job of repeatableJobs) {
          if (job.name === ADMIN_JOBS.DAILY_BRIEFING) {
            await this.adminQueue.removeRepeatableByKey(job.key);
          }
        }

        await this.adminQueue.add(
          ADMIN_JOBS.DAILY_BRIEFING,
          { adminEmail },
          {
            repeat: {
              pattern: '0 9 * * *', // Daily at 9:00 AM
              tz: 'Asia/Kolkata',
            },
            jobId: 'repeatable-daily-briefing',
          },
        );
        this.logger.log(`Repeatable daily briefing job scheduled for ${adminEmail} at 9 AM IST`);
      } catch (err) {
        this.logger.error(`Failed to schedule repeatable daily briefing: ${(err as Error).message}`);
      }
    }
  }

  async _executeDailyBriefing(data: { adminEmail: string }): Promise<void> {
    const { adminEmail } = data;
    this.logger.log(`Executing daily briefing for ${adminEmail}`);

    const briefing = await this.getBriefing();
    const html = `
      <!DOCTYPE html><html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:auto">
        <div style="background:#1E3D2B;padding:20px;text-align:center">
          <h1 style="color:#E8A838;margin:0;font-size:20px">Naturelite — Daily Briefing</h1>
          <p style="color:#aaa;font-size:12px;margin:4px 0 0">${new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        <div style="padding:24px">
          ${briefing.dashboard ? `<h3 style="color:#1E3D2B;border-bottom:2px solid #E8A838;padding-bottom:6px">Dashboard Summary</h3><pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap">${briefing.dashboard}</pre>` : ''}
          ${briefing.orderStatus ? `<h3 style="color:#1E3D2B;border-bottom:2px solid #E8A838;padding-bottom:6px">Order Status</h3><pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap">${briefing.orderStatus}</pre>` : ''}
          ${briefing.lowStock ? `<h3 style="color:#c0392b;border-bottom:2px solid #c0392b;padding-bottom:6px">Low Stock Alert</h3><pre style="background:#fff5f5;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap">${briefing.lowStock}</pre>` : ''}
        </div>
        <div style="background:#f0f0f0;padding:12px;text-align:center;font-size:11px;color:#888">
          AI — Aditya Intelligence | Naturelite Admin
        </div>
      </body></html>
    `;
    await this.emailService.sendAdminReport(
      adminEmail,
      `Naturelite Daily Briefing — ${new Date().toLocaleDateString('en-IN')}`,
      html,
    );
    this.logger.log(`Daily briefing sent to ${adminEmail}`);
  }

  // ─── Tool executor ────────────────────────────────────────────────────────────

  private toolCacheKey(step: RagStep): { key: string | null; ttl: number } {
    // Only cache read-only, non-action tools
    const UNCACHED = new Set(['preview_email_report', 'send_email_report']);
    if (UNCACHED.has(step.tool)) return { key: null, ttl: 0 };

    const TTL_MAP: Record<string, number> = {
      get_dashboard_summary: 120,
      get_orders_by_status: 120,
      search_low_stock_products: 300,
      search_out_of_stock_products: 300,
      search_in_stock_products: 300,
      search_products: 300,
      get_revenue_trend: 300,
      get_analytics_period: 600,
      get_top_selling_products: 600,
      get_top_customers_online: 600,
      get_new_customers: 300,
      get_store_sales: 300,
      get_payment_failures: 120,
      get_subscription_data: 300,
      get_whatsapp_queue: 60,
      get_reminders: 60,
      get_coupon_list: 300,
      get_feedback_list: 120,
      search_recent_orders: 120,
      search_orders_by_date_range: 180,
      search_customers: 180,
      get_customer_orders: 120,
      search_abandoned_carts: 180,
      get_wallet_balances: 120,
      get_login_audit_logs: 120,
      compare_periods: 300,
    };

    const ttl = TTL_MAP[step.tool] ?? 120;
    const paramHash = step.params && Object.keys(step.params).length
      ? `:${Buffer.from(JSON.stringify(step.params)).toString('base64url')}`
      : '';
    return { key: `chatbot:tool:${step.tool}${paramHash}`, ttl };
  }

  async executeTool(step: RagStep): Promise<string | null> {
    const { key, ttl } = this.toolCacheKey(step);
    if (key) {
      return this.redisService.cached<string | null>(key, ttl, () => this._runTool(step));
    }
    return this._runTool(step);
  }

  private async _runTool(step: RagStep): Promise<string | null> {
    switch (step.tool) {

      case 'get_dashboard_summary': {
        const stats = await this.analyticsService.getDashboardStats() as any;
        const recentLines = (stats.recentOrders ?? []).slice(0, 5).map((o: any) =>
          `- **#${o.orderNumber}** | ${o.user?.name ?? 'Guest'} | ₹${(o.total || 0).toLocaleString('en-IN')} | \`${o.status}\``
        ).join('\n');
        const formatted = [
          `**Today's Orders:** ${stats.todayOrders || 0} | ₹${(stats.todayRevenue || 0).toLocaleString('en-IN')} revenue (0 means no orders placed yet today, not the all-time total)`,
          `**This Month's Orders:** ${stats.monthOrders || 0} | ₹${(stats.monthRevenue || 0).toLocaleString('en-IN')} revenue`,
          `**Total Customers:** ${stats.totalCustomers || 0}`,
          `**Pending Fulfillment:** ${stats.pendingOrders || 0} orders`,
          recentLines ? `\n**5 Most Recent Orders:**\n${recentLines}` : '',
        ].filter(Boolean).join('\n');
        return `[RAG: get_dashboard_summary]\n${formatted}`;
      }

      case 'search_out_of_stock_products': {
        const searchTerm = String(step.params?.searchTerm ?? '').trim();
        const nameFilter = searchTerm
          ? { name: { $regex: searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          : {};
        const items = await this.productRepository.getModel().aggregate([
          { $match: { isActive: true, trackStock: { $ne: false }, ...nameFilter } },
          { $addFields: {
            totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] },
          }},
          { $match: { totalStock: { $lte: 0 } } },
          { $sort: { name: 1 } }, { $limit: 50 },
        ]).exec();
        const label = searchTerm ? `search_out_of_stock_products ("${searchTerm}")` : 'search_out_of_stock_products';
        const formatted = items.length > 0
          ? items.map((p: any) => `- **${p.name}** (SKU: ${p.sku || 'N/A'}) | Stock: **0** | Price: ₹${p.price || 0}`).join('\n')
          : `No out-of-stock products found${searchTerm ? ` matching "${searchTerm}"` : ''}.`;
        return `[RAG: ${label}]\n**${items.length}** products currently out of stock\n\n${formatted}`;
      }

      case 'search_in_stock_products': {
        const searchTerm = String(step.params?.searchTerm ?? '').trim();
        const nameFilter = searchTerm
          ? { name: { $regex: searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          : {};
        const items = await this.productRepository.getModel().aggregate([
          { $match: { isActive: true, ...nameFilter } },
          { $addFields: {
            totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] },
          }},
          { $match: { $or: [{ trackStock: false }, { totalStock: { $gt: 0 } }] } },
          { $sort: { name: 1 } }, { $limit: 30 },
        ]).exec();
        const label = searchTerm ? `search_in_stock_products ("${searchTerm}")` : 'search_in_stock_products';
        const formatted = items.length > 0
          ? items.map((p: any) => `- **${p.name}** (SKU: ${p.sku || 'N/A'}) | Stock: **${p.trackStock === false ? 'Available' : p.totalStock}** | Price: ₹${p.price || 0}`).join('\n')
          : `No in-stock products found${searchTerm ? ` matching "${searchTerm}"` : ''}.`;
        return `[RAG: ${label}]\n**${items.length}** products in stock${searchTerm ? ` matching "${searchTerm}"` : ''}\n\n${formatted}`;
      }

      case 'search_low_stock_products': {
        const THRESHOLD = 10;
        const searchTerm = String(step.params?.searchTerm ?? '').trim();
        const nameFilter = searchTerm
          ? { name: { $regex: searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          : {};
        const items = await this.productRepository.getModel().aggregate([
          { $match: { isActive: true, ...nameFilter } },
          { $addFields: {
            totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] },
            effectiveThreshold: { $cond: { if: { $and: [{ $eq: ['$trackStock', true] }, { $gt: ['$lowStockThreshold', 0] }] }, then: '$lowStockThreshold', else: THRESHOLD } },
          }},
          { $match: { $expr: { $lte: ['$totalStock', '$effectiveThreshold'] } } },
          { $sort: { totalStock: 1 } }, { $limit: 20 },
        ]).exec();
        const label = searchTerm ? `search_low_stock_products ("${searchTerm}")` : 'search_low_stock_products';
        const formatted = items.length > 0
          ? items.map((p: any) => `- **${p.name}** (SKU: ${p.sku}) | Stock: **${p.totalStock}** | Threshold: ${p.lowStockThreshold || THRESHOLD}`).join('\n')
          : `No low stock products found${searchTerm ? ` matching "${searchTerm}"` : ''}.`;
        const header = items.length > 0
          ? `**${items.length}** products low on stock${searchTerm ? ` matching "${searchTerm}"` : ''} (sorted by lowest stock):`
          : '';
        return `[RAG: ${label}]\n${header}${header ? '\n\n' : ''}${formatted}`;
      }

      case 'search_products': {
        const term = String(step.params?.searchTerm ?? '').trim();
        const items = await this.productRepository.searchByText(term);
        const formatted = items.slice(0, 10).map((p: any) => {
          const variants = p.variants?.map((v: any) => `${v.sku}: ${v.stock}`).join(', ') ?? '';
          return `- **${p.name}** (SKU: ${p.sku}) | Stock: **${p.stock}** ${variants ? `[Variants: ${variants}]` : ''} | Price: ₹${p.price} | Active: ${p.isActive}`;
        }).join('\n') || 'No matching products found.';
        return `[RAG: search_products ("${term}")]\n${formatted}`;
      }

      case 'get_login_audit_logs': {
        const [count, logs] = await Promise.all([
          this.auditLogRepository.getModel().countDocuments({ action: 'admin.login' }),
          this.auditLogRepository.getModel().find({ action: 'admin.login' }).sort({ createdAt: -1 }).limit(10).exec(),
        ]);
        const lines = logs.map((l: any) =>
          `- **${l.performedByName || l.performedBy}** | IP: ${l.ipAddress || 'N/A'} | ${l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN') : 'N/A'}`
        ).join('\n') || 'No login logs found.';
        return `[RAG: get_login_audit_logs]\nTotal Admin Logins: **${count}**\n\nRecent:\n${lines}`;
      }

      case 'search_abandoned_carts': {
        const limit = Number(step.params?.limit ?? 30);
        const whatsappSettings = await this.settingsService.getWhatsAppSettings();
        const delayMinutes = whatsappSettings.abandonedCartReminderDelayMinutes ?? 60;
        const cutoff = new Date(Date.now() - delayMinutes * 60 * 1000);
        const abandonedCarts = await this.cartRepository.getModel().aggregate([
          { $match: { 'items.0': { $exists: true }, updatedAt: { $lt: cutoff } } },
          { $lookup: { from: 'users', localField: 'user', foreignField: '_id', pipeline: [{ $project: { name: 1, phone: 1, isBlocked: 1 } }], as: 'userInfo' } },
          { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
          { $match: { 'userInfo.isBlocked': { $ne: true } } },
          { $lookup: { from: 'orders', let: { userId: '$user', cartUpdatedAt: '$updatedAt' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$user', '$$userId'] }, { $gt: ['$createdAt', '$$cartUpdatedAt'] }, { $ne: ['$status', 'cancelled'] }] } } }, { $limit: 1 }], as: 'ordersAfterCart' } },
          { $match: { ordersAfterCart: { $size: 0 } } },
          { $sort: { updatedAt: -1 } }, { $limit: limit },
        ]).exec();
        const coveredPhones = new Set(abandonedCarts.map((c: any) => c.userInfo?.phone).filter(Boolean));
        const stuckSessions = await this.chatSessionRepository.getModel()
          .find({ currentState: { $in: ['cart', 'coupon_prompt', 'coupon_input', 'checkout', 'address_input', 'payment_selection'] }, isExpired: { $ne: true }, lastMessageAt: { $lt: cutoff } })
          .sort({ lastMessageAt: -1 }).limit(20).populate('user', 'name phone').exec();
        const productSearch = String(step.params?.productSearch ?? '').trim().toLowerCase();

        // Collect all phones we need chat history for (parallel fetch)
        const cartPhones = abandonedCarts
          .filter((cart: any) => !productSearch || cart.items.some((i: any) => i.name?.toLowerCase().includes(productSearch)))
          .map((cart: any) => cart.userInfo?.phone as string | undefined)
          .filter((p): p is string => Boolean(p));
        const sessionPhones = productSearch ? [] : stuckSessions
          .filter((s: any) => !coveredPhones.has((s.user as any)?.phone ?? s.phone))
          .map((s: any) => (s.phone || (s.user as any)?.phone) as string | undefined)
          .filter((p): p is string => Boolean(p));
        const allPhones = [...new Set([...cartPhones, ...sessionPhones])];

        const chatSnippetMap = new Map<string, string>();
        if (allPhones.length > 0) {
          const results = await Promise.all(
            allPhones.map(async (phone) => {
              const msgs = await this.messageLogRepository.findByPhone(phone, 4);
              if (!msgs.length) return [phone, ''] as [string, string];
              const lines = [...msgs].reverse().map((m) => {
                const who = m.direction === 'inbound' ? 'Cust' : 'Store';
                const text = (m.content?.text || m.content?.caption || (m.content as any)?.buttonText || m.content?.templateName || '[media]').slice(0, 100);
                return `    ${who}: ${text}`;
              });
              return [phone, lines.join('\n')] as [string, string];
            }),
          );
          for (const [phone, snippet] of results) {
            if (snippet) chatSnippetMap.set(phone, snippet);
          }
        }

        const cartLines = abandonedCarts
          .filter((cart: any) => !productSearch || cart.items.some((i: any) => i.name?.toLowerCase().includes(productSearch)))
          .map((cart: any) => {
            const phone = cart.userInfo?.phone || 'No Phone';
            const name = cart.userInfo?.name || phone;
            const items = cart.items.map((i: any) => `${i.name} (x${i.quantity})`).join(', ');
            const hrs = Math.round((Date.now() - new Date(cart.updatedAt).getTime()) / 3_600_000);
            const snippet = chatSnippetMap.get(phone);
            const chatPart = snippet ? `\n  Last chat:\n${snippet}` : '';
            return `- 📱 **${name}** | ${phone} | ₹${(cart.total || 0).toLocaleString('en-IN')} | [${items}] | ~${hrs}h ago${chatPart}`;
          });
        // Sessions don't carry product data — skip them when productSearch is active
        const sessionLines = productSearch ? [] : stuckSessions
          .filter((s: any) => !coveredPhones.has((s.user as any)?.phone ?? s.phone))
          .map((s: any) => {
            const phone = s.phone || (s.user as any)?.phone || '';
            const name = (s.user as any)?.name || s.metadata?.contactName || phone || 'Unknown';
            const mins = Math.round((Date.now() - new Date(s.lastMessageAt ?? s.updatedAt).getTime()) / 60_000);
            const snippet = chatSnippetMap.get(phone);
            const chatPart = snippet ? `\n  Last chat:\n${snippet}` : '';
            return `- 📱 **${name}** | ${phone} | Stuck at \`${s.currentState}\` | ~${mins} min${chatPart}`;
          });
        const all = [...cartLines, ...sessionLines];
        return `[RAG: search_abandoned_carts]\n**${all.length}** customers with items who did not order (${delayMinutes}+ min inactive)\n\n${all.join('\n') || 'None found.'}`;
      }

      case 'get_top_selling_products': {
        const { from, to } = this.resolveRange(step.params);
        const limit = Number(step.params?.limit ?? 8);
        const searchTerm = String(step.params?.searchTerm ?? '').trim();
        const [online, store] = await Promise.all([
          this.analyticsService.getProductMetrics(from, to),
          this.analyticsService.getTopSellingOverall(from, to, limit * 3), // fetch extra to allow filtering
        ]);
        const nameFilter = (name: string) => !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());
        const fmtOnline = (online as any).topSellingProducts
          ?.filter((p: any) => nameFilter(p.name))
          .slice(0, limit)
          .map((p: any) => `- **${p.name}** | ${p.quantitySold} units | ₹${(p.revenue || 0).toLocaleString('en-IN')} (Online)`)
          .join('\n') || `No online top sellers${searchTerm ? ` matching "${searchTerm}"` : ''}.`;
        const fmtStore = store
          .filter((p: any) => nameFilter(p.name))
          .slice(0, limit)
          .map((p: any) => `- **${p.name}** | ${p.quantitySold} units | ₹${(p.revenue || 0).toLocaleString('en-IN')} (Store)`)
          .join('\n') || `No store top sellers${searchTerm ? ` matching "${searchTerm}"` : ''}.`;
        const label = searchTerm ? `get_top_selling_products ("${searchTerm}")` : 'get_top_selling_products';
        return `[RAG: ${label}]\nOnline:\n${fmtOnline}\n\nStore:\n${fmtStore}`;
      }

      case 'search_recent_orders': {
        const limit = Number(step.params?.limit ?? 10);
        const STATUS_MAP: Record<string, string> = { shipped: 'out_for_delivery', pending: 'placed', processing: 'preparing', dispatched: 'out_for_delivery', completed: 'delivered', done: 'delivered' };
        const rawStatus = step.params?.status as string | undefined;
        const status = rawStatus ? (STATUS_MAP[rawStatus.toLowerCase()] ?? rawStatus.toLowerCase()) : undefined;
        const customerSearch = String(step.params?.customerSearch ?? '').trim();
        const paymentMethod = String(step.params?.paymentMethod ?? '').trim().toLowerCase();

        const filter: Record<string, unknown> = {};
        if (status) filter.status = status;
        if (step.params?.from && step.params?.to) {
          const fromD = new Date(step.params.from as string);
          const toD = new Date(step.params.to as string);
          if (!isNaN(fromD.getTime()) && !isNaN(toD.getTime()))
            filter.createdAt = { $gte: fromD, $lte: toD };
        }
        if (paymentMethod) filter.paymentMethod = { $regex: paymentMethod, $options: 'i' };

        // If customer name/phone given, look up user first
        let userIdFilter: unknown[] | null = null;
        if (customerSearch) {
          const esc = customerSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const users = await this.userRepository.getModel()
            .find({ $or: [{ name: { $regex: esc, $options: 'i' } }, { phone: { $regex: esc, $options: 'i' } }] })
            .select('_id').limit(20).exec();
          userIdFilter = users.map((u: any) => u._id);
          if (userIdFilter.length) filter.user = { $in: userIdFilter };
          else return `[RAG: search_recent_orders]\nNo customer found matching "${customerSearch}".`;
        }

        const orders = await this.orderRepository.getModel().find(filter).sort({ createdAt: -1 }).limit(limit).populate('user', 'name phone').exec();
        const formatted = orders.map((o: any) =>
          `- **#${o.orderNumber}** | ${o.user?.name ?? 'Guest'} (${o.user?.phone ?? ''}) | ₹${o.total} | \`${o.status}\` | ${o.paymentMethod} | ${o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : 'N/A'}`
        ).join('\n') || 'No orders found.';
        const desc = [status, customerSearch ? `customer: ${customerSearch}` : '', paymentMethod].filter(Boolean).join(', ');
        return `[RAG: search_recent_orders${desc ? ` (${desc})` : ''}]\n${formatted}`;
      }

      case 'search_orders_by_date_range': {
        const limit = Number(step.params?.limit ?? 20);
        const { from, to } = this.resolveRange(step.params);
        const orders = await this.orderRepository.getModel()
          .find({ createdAt: { $gte: from, $lte: to } })
          .sort({ createdAt: -1 }).limit(limit).populate('user', 'name phone').exec();
        const totalRevenue = orders.reduce((s: number, o: any) => s + (o.total || 0), 0);
        const formatted = orders.map((o: any) =>
          `- **#${o.orderNumber}** | ${o.user?.name ?? 'Guest'} | ₹${o.total} | \`${o.status}\` | ${o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN') : 'N/A'}`
        ).join('\n') || 'No orders in this range.';
        return `[RAG: search_orders_by_date_range (${from.toLocaleDateString('en-IN')} – ${to.toLocaleDateString('en-IN')})]\n**${orders.length}** orders | Total: ₹${totalRevenue.toLocaleString('en-IN')}\n\n${formatted}`;
      }

      case 'search_customers': {
        const term = String(step.params?.searchTerm ?? '').trim();
        const limit = Number(step.params?.limit ?? 10);
        if (!term) return `[RAG: search_customers]\nNo search term provided — specify a name or phone number.`;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const customers = await this.userRepository.getModel()
          .find({ $or: [{ name: { $regex: escaped, $options: 'i' } }, { phone: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }] })
          .sort({ totalSpent: -1 }).limit(limit).exec();
        const formatted = customers.map((c: any) =>
          `- **${c.name || 'Unnamed'}** | ${c.phone || 'N/A'} | Orders: ${c.totalOrders} | Spent: ₹${(c.totalSpent || 0).toLocaleString('en-IN')} | ${c.isBlocked ? 'Blocked' : c.isActive ? 'Active' : 'Inactive'} | Joined: ${c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : 'N/A'}`
        ).join('\n') || 'No matching customers.';
        return `[RAG: search_customers ("${term}")]\n${formatted}`;
      }

      case 'get_top_customers_online': {
        const limit = Number(step.params?.limit ?? 10);
        const minSpent = step.params?.minSpent != null ? Number(step.params.minSpent) : 0;
        const customers = await this.userRepository.getModel()
          .find({ totalOrders: { $gt: 0 }, ...(minSpent > 0 ? { totalSpent: { $gte: minSpent } } : {}) })
          .sort({ totalSpent: -1 }).limit(limit).exec();
        const formatted = customers.map((c: any, i: number) =>
          `${i + 1}. **${c.name || 'Unnamed'}** (${c.phone || 'N/A'}) | ${c.totalOrders} orders | ₹${(c.totalSpent || 0).toLocaleString('en-IN')} | Last: ${c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('en-IN') : 'N/A'}`
        ).join('\n') || 'No data.';
        return `[RAG: get_top_customers_online (Top ${limit})]\n${formatted}`;
      }

      case 'get_customer_orders': {
        const phone = String(step.params?.phone ?? '').trim();
        const name = String(step.params?.name ?? '').trim();
        const limit = Number(step.params?.limit ?? 10);
        let user: any = null;
        if (phone) {
          user = await this.userRepository.findOneByPhone(phone).catch(() => null);
          if (!user) user = await this.userRepository.getModel().findOne({ phone: { $regex: phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }).exec().catch(() => null);
        }
        if (!user && name) {
          user = await this.userRepository.getModel().findOne({ name: { $regex: name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }).sort({ totalOrders: -1 }).exec().catch(() => null);
        }
        if (!user) return `[RAG: get_customer_orders]\nNo customer found for ${phone ? `phone "${phone}"` : `name "${name}"`}.`;
        const orders = await this.orderRepository.getModel().find({ user: user._id }).sort({ createdAt: -1 }).limit(limit).exec();
        const formatted = orders.map((o: any) =>
          `- **#${o.orderNumber}** | ₹${o.total} | \`${o.status}\` | ${o.paymentMethod} (${o.paymentStatus}) | ${o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : 'N/A'}`
        ).join('\n') || 'No orders found.';
        return `[RAG: get_customer_orders — ${user.name || phone}]\n**${user.name}** | ${user.phone} | Orders: ${user.totalOrders} | Spent: ₹${(user.totalSpent || 0).toLocaleString('en-IN')}\n\n${formatted}`;
      }

      case 'get_revenue_trend': {
        const { from, to } = this.resolveRange(step.params);
        const days = dateRangeToDays({ from, to });
        const trend = await this.analyticsService.getRevenueByDay(days);
        const formatted = trend.map((d: any) => `- ${d.date} | ₹${(d.revenue || 0).toLocaleString('en-IN')} | ${d.orders} orders`).join('\n') || 'No data.';
        const totalRev = trend.reduce((s: number, d: any) => s + (d.revenue || 0), 0);
        const totalOrd = trend.reduce((s: number, d: any) => s + (d.orders || 0), 0);
        return `[RAG: get_revenue_trend (${from.toLocaleDateString('en-IN')} – ${to.toLocaleDateString('en-IN')})]\nTotal: ₹${totalRev.toLocaleString('en-IN')} | ${totalOrd} orders\n\n${formatted}`;
      }

      case 'get_orders_by_status': {
        const counts = await this.orderRepository.getOrdersByStatus();
        const formatted = Object.entries(counts).map(([s, n]) => `- \`${s}\`: **${n}** orders`).join('\n') || 'No data.';
        const total = Object.values(counts).reduce((s: number, n: any) => s + (n || 0), 0);
        return `[RAG: get_orders_by_status]\nAll-time Total: **${total}**\n\n${formatted}`;
      }

      case 'get_feedback_list': {
        const limit = Number(step.params?.limit ?? 15);
        const minRating = step.params?.minRating != null ? Number(step.params.minRating) : undefined;
        const maxRating = step.params?.maxRating != null ? Number(step.params.maxRating) : undefined;
        const feedbackType = String(step.params?.type ?? '').trim().toLowerCase(); // review | complaint | suggestion
        const productName = String(step.params?.productName ?? '').trim();

        const filter: Record<string, unknown> = {};
        if (minRating != null || maxRating != null) {
          filter.rating = { ...(minRating != null ? { $gte: minRating } : {}), ...(maxRating != null ? { $lte: maxRating } : {}) };
        }
        if (feedbackType) filter.type = { $regex: feedbackType, $options: 'i' };

        const feedbacks = await this.feedbackRepository.getModel()
          .find(filter)
          .populate('user', 'name phone')
          .populate('product', 'name')
          .sort({ createdAt: -1 })
          .limit(productName ? limit * 3 : limit)
          .lean().exec();

        const filtered = productName
          ? feedbacks.filter((f: any) => f.product?.name?.toLowerCase().includes(productName.toLowerCase()))
          : feedbacks;

        const formatted = filtered.slice(0, limit).map((f: any) =>
          `- **${f.user?.name || 'Anonymous'}** on **${f.product?.name || 'General'}** ${f.rating ? `⭐${f.rating}/5` : ''} | ${f.type} | ${f.status} | "${f.message?.slice(0, 120) || ''}" | ${f.createdAt ? new Date(f.createdAt).toLocaleDateString('en-IN') : 'N/A'}`
        ).join('\n') || 'No feedback found matching the criteria.';

        const desc = [feedbackType, minRating != null ? `≥${minRating}★` : maxRating != null ? `≤${maxRating}★` : '', productName].filter(Boolean).join(', ');
        return `[RAG: get_feedback_list${desc ? ` (${desc})` : ''}]\nTotal shown: ${filtered.length}\n\n${formatted}`;
      }

      case 'get_coupon_list': {
        const statusFilter = String(step.params?.status ?? '').trim().toLowerCase(); // active | expired | upcoming | inactive
        const coupons = await this.couponRepository.getModel().find({}).sort({ createdAt: -1 }).limit(50).exec();
        const now = new Date();

        const rows = coupons.map((c: any) => {
          const notYetValid = new Date(c.validFrom) > now;
          const expired = new Date(c.validUntil) < now;
          const active = c.isActive && !expired && !notYetValid;
          const statusKey = active ? 'active' : notYetValid ? 'upcoming' : expired ? 'expired' : 'inactive';
          const discount = c.discountType === 'percentage' ? `${c.discountValue}% off` : `₹${c.discountValue} off`;
          const usage = c.maxUsageCount ? `${c.usedCount || 0}/${c.maxUsageCount}` : `${c.usedCount || 0} used`;
          const statusLabel = active ? '✅ Active' : notYetValid ? '⏳ Upcoming' : expired ? '❌ Expired' : '⏸ Inactive';
          return { statusKey, line: `- **${c.code}** | ${discount} | ${usage} | ${statusLabel} | Min ₹${c.minOrderAmount || 0} | ${new Date(c.validFrom).toLocaleDateString('en-IN')} – ${new Date(c.validUntil).toLocaleDateString('en-IN')}` };
        });

        const filtered = statusFilter ? rows.filter(r => r.statusKey === statusFilter) : rows;
        const formatted = filtered.map(r => r.line).join('\n') || `No ${statusFilter || ''} coupons found.`;
        const activeCnt = rows.filter(r => r.statusKey === 'active').length;
        const expiredCnt = rows.filter(r => r.statusKey === 'expired').length;
        const upcomingCnt = rows.filter(r => r.statusKey === 'upcoming').length;
        const summary = statusFilter
          ? `**${filtered.length}** ${statusFilter} coupons`
          : `**${rows.length}** coupons total — ✅ ${activeCnt} active | ⏳ ${upcomingCnt} upcoming | ❌ ${expiredCnt} expired`;
        return `[RAG: get_coupon_list${statusFilter ? ` (${statusFilter})` : ''}]\n${summary}\n\n${formatted}`;
      }

      case 'get_analytics_period': {
        const { from: start, to: end } = this.resolveRange(step.params);
        const [orders, customers, products, chat, topSellers, topCustomers] = await Promise.all([
          this.analyticsService.getOrderMetrics(start, end),
          this.analyticsService.getCustomerMetrics(start, end),
          this.analyticsService.getProductMetrics(start, end),
          this.analyticsService.getChatMetrics(start, end),
          this.analyticsService.getTopSellingOverall(start, end, 5),
          this.userRepository.getModel().find({ totalOrders: { $gt: 0 } }).sort({ totalSpent: -1 }).limit(5).lean().exec(),
        ]);
        const o = orders as any; const c = customers as any; const p = products as any; const m = chat as any;
        const sellers = topSellers.slice(0, 5).map((s: any, i: number) => `  ${i + 1}. **${s.name}** — ${s.quantitySold} units, ₹${(s.revenue || 0).toLocaleString('en-IN')}`).join('\n') || '  No data.';
        const topC = (topCustomers as any[]).slice(0, 5).map((tc: any, i: number) => `  ${i + 1}. **${tc.name || tc.phone || 'N/A'}** (${tc.phone || 'N/A'}) — ₹${(tc.totalSpent || 0).toLocaleString('en-IN')}, ${tc.totalOrders} orders`).join('\n') || '  No data.';
        const summary = [`Period: ${start.toLocaleDateString('en-IN')} – ${end.toLocaleDateString('en-IN')}`,
          `**Orders:** ${o.totalOrders || 0} total | ₹${(o.totalRevenue || 0).toLocaleString('en-IN')} | AOV ₹${Math.round(o.avgOrderValue || 0)}`,
          `**Status:** ${o.completedOrders || 0} delivered | ${o.pendingOrders || 0} pending | ${o.cancelledOrders || 0} cancelled`,
          `**Payment:** ${o.codOrders || 0} COD | ${o.prepaidOrders || 0} prepaid`,
          `**Customers:** ${c.totalCustomers || 0} total | +${c.newCustomers || 0} new | ${c.returningCustomers || 0} returning`,
          `**Inventory:** ${p.outOfStockProducts || 0} out of stock | ${p.lowStockProducts || 0} low stock`,
          `**WhatsApp:** ${m.totalSessions || 0} sessions | ${m.supportHandoffs || 0} handoffs`,
          `\n**Top Products:**\n${sellers}`, `**Top Customers:**\n${topC}`].join('\n');
        return `[RAG: get_analytics_period]\n${summary}`;
      }

      case 'get_new_customers': {
        const { from: since } = this.resolveRange(step.params);
        const [count, customers] = await Promise.all([
          this.userRepository.getModel().countDocuments({ createdAt: { $gte: since } }),
          this.userRepository.getModel().find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20).exec(),
        ]);
        const formatted = customers.map((c: any) => `- **${c.name || 'Unnamed'}** | ${c.phone || 'N/A'} | ${c.createdAt ? new Date(c.createdAt).toLocaleString('en-IN') : 'N/A'}`).join('\n') || 'None.';
        return `[RAG: get_new_customers]\nTotal New: **${count}**\n\n${formatted}`;
      }

      // ── NEW TOOLS ─────────────────────────────────────────────────────────────

      case 'get_store_sales': {
        const { from, to } = this.resolveRange(step.params);
        const limit = Number(step.params?.limit ?? 20);
        const [sales, totalAgg] = await Promise.all([
          this.storeSaleRepository.getModel().find({
            $and: [
              {
                $or: [
                  { dueDate: { $exists: true, $ne: null, $gte: from, $lte: to } },
                  { $or: [{ dueDate: { $exists: false } }, { dueDate: null }], createdAt: { $gte: from, $lte: to } },
                ]
              },
              {
                $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }]
              }
            ]
          }).populate('store', 'name code').sort({ createdAt: -1 }).limit(limit).exec(),
          this.storeSaleRepository.getModel().aggregate([
            {
              $addFields: {
                effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] },
              },
            },
            {
              $match: {
                effectiveDate: { $gte: from, $lte: to },
                $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }],
              },
            },
            { $group: { _id: null, totalRevenue: { $sum: '$total' }, count: { $sum: 1 }, walkIn: { $sum: { $cond: [{ $eq: ['$saleType', 'walk_in'] }, 1, 0] } }, delivery: { $sum: { $cond: [{ $eq: ['$saleType', 'delivery'] }, 1, 0] } } } },
          ]).exec(),
        ]);
        const agg = totalAgg[0] || { totalRevenue: 0, count: 0, walkIn: 0, delivery: 0 };
        const recentLines = sales.map((s: any) => {
          const store = (s.store as any)?.name || 'Unknown Store';
          const displayDate = s.dueDate || s.createdAt;
          return `- **#${s.saleNumber}** | ${store} | ${s.saleType} | ₹${s.total.toLocaleString('en-IN')} | ${s.customerName || 'Walk-in'} | ${s.paymentMethod} | ${new Date(displayDate).toLocaleDateString('en-IN')}`;
        }).join('\n');
        return `[RAG: get_store_sales (${from.toLocaleDateString('en-IN')} – ${to.toLocaleDateString('en-IN')})]\n**${agg.count}** sales | ₹${(agg.totalRevenue || 0).toLocaleString('en-IN')} revenue | Walk-in: ${agg.walkIn} | Delivery: ${agg.delivery}\n\n${recentLines || 'No store sales in this period.'}`;
      }

      case 'get_wallet_balances': {
        const limit = Number(step.params?.limit ?? 20);
        const wallets = await this.walletRepository.getModel()
          .find({ balance: { $gt: 0 } })
          .sort({ balance: -1 })
          .limit(limit)
          .populate('user', 'name phone')
          .exec();
        const totalCredits = wallets.reduce((s: number, w: any) => s + (w.balance || 0), 0);
        const formatted = wallets.map((w: any, i: number) => {
          const user = w.user as any;
          return `${i + 1}. **${user?.name || user?.phone || 'N/A'}** (${user?.phone || 'N/A'}) | Wallet: **₹${((w.balance || 0) / 100).toFixed(2)}**`;
        }).join('\n') || 'No customers with wallet balance.';
        return `[RAG: get_wallet_balances]\nCustomers with unused credits: **${wallets.length}** | Total outstanding: **₹${(totalCredits / 100).toFixed(2)}**\n\n${formatted}`;
      }

      case 'get_payment_failures': {
        const limit = Number(step.params?.limit ?? 20);
        const [failures, pending] = await Promise.all([
          this.paymentRepository.getModel()
            .find({ status: 'failed' }).sort({ createdAt: -1 }).limit(limit)
            .populate('user', 'name phone').populate('order', 'orderNumber total').exec(),
          this.paymentRepository.getModel()
            .find({ status: 'pending' }).sort({ createdAt: -1 }).limit(10)
            .populate('user', 'name phone').populate('order', 'orderNumber').exec(),
        ]);
        const failLines = failures.map((p: any) =>
          `- **${(p.user as any)?.name || (p.user as any)?.phone || 'N/A'}** (${(p.user as any)?.phone || 'N/A'}) | Order **#${(p.order as any)?.orderNumber || 'N/A'}** | ₹${p.amount.toLocaleString('en-IN')} | ${p.gateway} | ${p.failureReason || 'No reason'} | ${new Date(p.createdAt).toLocaleString('en-IN')}`
        ).join('\n') || 'No failed payments.';
        const pendingLines = pending.map((p: any) =>
          `- **${(p.user as any)?.name || (p.user as any)?.phone || 'N/A'}** | Order **#${(p.order as any)?.orderNumber || 'N/A'}** | ₹${p.amount.toLocaleString('en-IN')} | ${p.gateway} | ${new Date(p.createdAt).toLocaleString('en-IN')}`
        ).join('\n') || 'None.';
        return `[RAG: get_payment_failures]\n**Failed Payments (${failures.length}):**\n${failLines}\n\n**Pending Payments (${pending.length}):**\n${pendingLines}`;
      }

      case 'get_subscription_data': {
        const [active, paused, upcoming] = await Promise.all([
          this.subscriptionModel.find({ status: 'active' }).populate('user', 'name phone').sort({ nextDeliveryDate: 1 }).limit(30).exec(),
          this.subscriptionModel.find({ status: 'paused' }).populate('user', 'name phone').limit(10).exec(),
          this.subscriptionModel.find({ status: 'active', nextDeliveryDate: { $lte: new Date(Date.now() + 3 * 86_400_000) } }).populate('user', 'name phone').sort({ nextDeliveryDate: 1 }).exec(),
        ]);
        const activeLines = active.slice(0, 20).map((s: any) => {
          const user = s.user as any;
          const items = s.items.map((i: any) => `${i.name} x${i.quantity}`).join(', ');
          return `- **${user?.name || user?.phone || 'N/A'}** (${user?.phone || 'N/A'}) | ${s.frequency} | [${items}] | ₹${s.totalAmount}/delivery | Next: ${new Date(s.nextDeliveryDate).toLocaleDateString('en-IN')}`;
        }).join('\n') || 'None.';
        const upcomingLines = upcoming.map((s: any) => {
          const user = s.user as any;
          return `- **${user?.name || user?.phone || 'N/A'}** | Next: ${new Date(s.nextDeliveryDate).toLocaleDateString('en-IN')} | ₹${s.totalAmount}`;
        }).join('\n') || 'None.';
        return `[RAG: get_subscription_data]\n**Active:** ${active.length} | **Paused:** ${paused.length}\n\n**Active Subscriptions (first 20):**\n${activeLines}\n\n**Upcoming Deliveries (3 days):**\n${upcomingLines}`;
      }

      case 'get_whatsapp_queue': {
        const [supportSessions, recentActivity] = await Promise.all([
          this.chatSessionRepository.getModel()
            .find({ isHandedOffToSupport: true, isExpired: { $ne: true } })
            .sort({ supportHandoffAt: -1 }).limit(30)
            .populate('user', 'name phone').exec(),
          this.messageLogRepository.getModel()
            .find({ direction: 'inbound', createdAt: { $gte: new Date(Date.now() - 60 * 60_000) } })
            .sort({ createdAt: -1 }).limit(20).exec(),
        ]);
        const queueLines = supportSessions.map((s: any) => {
          const user = s.user as any;
          const waitMins = s.supportHandoffAt ? Math.round((Date.now() - new Date(s.supportHandoffAt).getTime()) / 60_000) : 0;
          return `- 📱 **${user?.name || s.metadata?.contactName || s.phone}** | ${s.phone} | Waiting: ${waitMins} min${s.supportAgentId ? ` | Agent: ${s.supportAgentId}` : ' | ⚠️ Unassigned'}`;
        }).join('\n') || 'No active support sessions.';
        const recentPhones = [...new Set(recentActivity.map((m: any) => m.phone))];
        return `[RAG: get_whatsapp_queue]\n**Support Queue: ${supportSessions.length} sessions**\n\n${queueLines}\n\n**Active in last hour:** ${recentPhones.length} unique numbers`;
      }

      case 'get_reminders': {
        const now = new Date();
        const soon = new Date(now.getTime() + 24 * 60 * 60_000);
        const [overdue, upcoming] = await Promise.all([
          this.reminderRepository.getModel()
            .find({ dueAt: { $lt: now }, isDismissed: false })
            .sort({ dueAt: 1 }).limit(20)
            .populate('sale', 'saleNumber customerName total')
            .populate('store', 'name code').exec(),
          this.reminderRepository.getModel()
            .find({ dueAt: { $gte: now, $lte: soon }, isDismissed: false })
            .sort({ dueAt: 1 }).limit(20)
            .populate('sale', 'saleNumber customerName total')
            .populate('store', 'name code').exec(),
        ]);
        const overdueLines = overdue.map((r: any) => {
          const store = (r.store as any)?.name || 'Unknown';
          const sale = r.sale as any;
          return `- ⚠️ **${store}** | Sale #${sale?.saleNumber || 'N/A'} | ${r.message} | Overdue since ${new Date(r.dueAt).toLocaleString('en-IN')}`;
        }).join('\n') || 'None overdue.';
        const upcomingLines = upcoming.map((r: any) => {
          const store = (r.store as any)?.name || 'Unknown';
          return `- 🔔 **${store}** | ${r.message} | Due: ${new Date(r.dueAt).toLocaleString('en-IN')}`;
        }).join('\n') || 'None in next 24h.';
        return `[RAG: get_reminders]\n**Overdue (${overdue.length}):**\n${overdueLines}\n\n**Upcoming 24h (${upcoming.length}):**\n${upcomingLines}`;
      }

      case 'compare_periods': {
        const days = Number(step.params?.days ?? 7);
        const now = new Date();
        const periodAEnd = now;
        const periodAStart = new Date(now.getTime() - days * 86_400_000);
        const periodBEnd = new Date(periodAStart.getTime());
        const periodBStart = new Date(periodBEnd.getTime() - days * 86_400_000);

        const [metricsA, metricsB, customersA, customersB] = await Promise.all([
          this.analyticsService.getOrderMetrics(periodAStart, periodAEnd),
          this.analyticsService.getOrderMetrics(periodBStart, periodBEnd),
          this.analyticsService.getCustomerMetrics(periodAStart, periodAEnd),
          this.analyticsService.getCustomerMetrics(periodBStart, periodBEnd),
        ]);

        const a = metricsA as any; const b = metricsB as any;
        const ca = customersA as any; const cb = customersB as any;

        const diff = (curr: number, prev: number) => {
          if (prev === 0) return curr > 0 ? '🆕 New' : '—';
          const pct = Math.round(((curr - prev) / prev) * 100);
          return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
        };

        // Use order metrics revenue (already scoped to correct date ranges)
        const revA = a.totalRevenue || 0;
        const revB = b.totalRevenue || 0;

        const lines = [
          `**Period A (current):** ${periodAStart.toLocaleDateString('en-IN')} – ${periodAEnd.toLocaleDateString('en-IN')}`,
          `**Period B (previous):** ${periodBStart.toLocaleDateString('en-IN')} – ${periodBEnd.toLocaleDateString('en-IN')}`,
          ``,
          `| Metric | Period A | Period B | Change |`,
          `|--------|----------|----------|--------|`,
          `| Orders | ${a.totalOrders || 0} | ${b.totalOrders || 0} | ${diff(a.totalOrders || 0, b.totalOrders || 0)} |`,
          `| Revenue | ₹${(revA || 0).toLocaleString('en-IN')} | ₹${(revB || 0).toLocaleString('en-IN')} | ${diff(revA || 0, revB || 0)} |`,
          `| AOV | ₹${Math.round(a.avgOrderValue || 0)} | ₹${Math.round(b.avgOrderValue || 0)} | ${diff(Math.round(a.avgOrderValue || 0), Math.round(b.avgOrderValue || 0))} |`,
          `| New Customers | ${ca.newCustomers || 0} | ${cb.newCustomers || 0} | ${diff(ca.newCustomers || 0, cb.newCustomers || 0)} |`,
          `| Delivered | ${a.completedOrders || 0} | ${b.completedOrders || 0} | ${diff(a.completedOrders || 0, b.completedOrders || 0)} |`,
          `| Cancelled | ${a.cancelledOrders || 0} | ${b.cancelledOrders || 0} | ${diff(a.cancelledOrders || 0, b.cancelledOrders || 0)} |`,
        ];
        return `[RAG: compare_periods (${days}d vs ${days}d)]\n${lines.join('\n')}`;
      }

      // ── ACTION TOOLS ──────────────────────────────────────────────────────────

      case 'preview_email_report': {
        const to = String(step.params?.to ?? '').trim();
        const reportType = String(step.params?.reportType ?? 'dashboard').trim().toLowerCase();
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
          return `[ACTION: preview_email_report]\nINVALID_EMAIL: "${to}" is not a valid email address.`;
        try {
          const preview = await this.buildReportPreview(reportType);
          return `[ACTION: preview_email_report]\nREADY_TO_SEND\nto: ${to}\nreportType: ${reportType}\nsubject: ${preview.subject}\npreview: ${preview.summary}`;
        } catch (err) {
          return `[ACTION: preview_email_report]\nERROR: Could not build report preview — ${(err as Error).message}`;
        }
      }

      case 'send_email_report': {
        const to = String(step.params?.to ?? '').trim();
        const reportType = String(step.params?.reportType ?? 'dashboard').trim().toLowerCase();
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
          return `[ACTION: send_email_report]\nERROR: Invalid email address "${to}".`;

        try {
          const report = await this.buildReportPreview(reportType);
          await this.emailService.sendAdminReport(to, report.subject, report.html);
          this.logger.log(`Admin report "${reportType}" sent to ${to}`);
          return `[ACTION: send_email_report]\nSUCCESS\nto: ${to}\nsubject: ${report.subject}`;
        } catch (err) {
          this.logger.error(`Failed to send report email: ${(err as Error).message}`);
          return `[ACTION: send_email_report]\nERROR: Failed to send email — ${(err as Error).message}`;
        }
      }

      default:
        this.logger.warn(`Unknown tool: "${step.tool}"`);
        return null;
    }
  }

  // ─── Email report builder ─────────────────────────────────────────────────────

  private async buildReportPreview(reportType: string): Promise<{ subject: string; summary: string; html: string }> {
    const REPORT_MAP: Record<string, { label: string; tools: RagStep[] }> = {
      ims:            { label: 'IMS Analytics',        tools: [{ tool: 'search_low_stock_products', params: {} }, { tool: 'get_analytics_period', params: { days: 30 } }] },
      inventory:      { label: 'Inventory Report',     tools: [{ tool: 'search_low_stock_products', params: {} }] },
      'low-stock':    { label: 'Low Stock Alert',      tools: [{ tool: 'search_low_stock_products', params: {} }] },
      low_stock:      { label: 'Low Stock Alert',      tools: [{ tool: 'search_low_stock_products', params: {} }] },
      analytics:      { label: 'Analytics Report',     tools: [{ tool: 'get_analytics_period', params: { days: 30 } }] },
      monthly:        { label: 'Monthly Analytics',    tools: [{ tool: 'get_analytics_period', params: { days: 30 } }] },
      weekly:         { label: 'Weekly Analytics',     tools: [{ tool: 'get_analytics_period', params: { days: 7 } }] },
      orders:         { label: 'Orders Summary',       tools: [{ tool: 'search_recent_orders', params: { limit: 20 } }, { tool: 'get_orders_by_status', params: {} }] },
      revenue:        { label: 'Revenue Report',       tools: [{ tool: 'get_revenue_trend', params: { days: 14 } }] },
      dashboard:      { label: 'Dashboard Summary',    tools: [{ tool: 'get_dashboard_summary', params: {} }, { tool: 'get_orders_by_status', params: {} }, { tool: 'search_low_stock_products', params: {} }] },
      customers:      { label: 'Customer Report',      tools: [{ tool: 'get_new_customers', params: { days: 7 } }, { tool: 'get_top_customers_online', params: { limit: 10 } }] },
      feedback:       { label: 'Feedback Report',      tools: [{ tool: 'get_feedback_list', params: { limit: 20 } }] },
      coupons:        { label: 'Coupon Report',        tools: [{ tool: 'get_coupon_list', params: {} }] },
      'store-sales':  { label: 'Store Sales Report',   tools: [{ tool: 'get_store_sales', params: { days: 30 } }] },
      store_sales:    { label: 'Store Sales Report',   tools: [{ tool: 'get_store_sales', params: { days: 30 } }] },
      abandoned:      { label: 'Abandoned Carts',      tools: [{ tool: 'search_abandoned_carts', params: { limit: 30 } }] },
      payments:       { label: 'Payment Failures',     tools: [{ tool: 'get_payment_failures', params: { limit: 20 } }] },
    };

    const config = REPORT_MAP[reportType] ?? REPORT_MAP['dashboard'];
    const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const subject = `📊 Naturelite — ${config.label} | ${date}`;

    // Run all tools for this report
    const blocks = await Promise.all(
      config.tools.map(async (t) => {
        try { return await this.executeTool(t); } catch { return null; }
      })
    );
    const dataBlocks = blocks.filter(Boolean) as string[];

    // Build plain-text summary (first 300 chars of first block)
    const firstBlock = dataBlocks[0]?.replace(/^\[RAG:[^\]]+\]\n?/, '').trim() ?? 'No data available.';
    const summary = firstBlock.slice(0, 280) + (firstBlock.length > 280 ? '...' : '');

    // Build HTML email
    const sectionsHtml = dataBlocks.map((block) => {
      const titleMatch = block.match(/^\[(?:RAG|ACTION):\s*([^\]]+)\]/);
      const title = titleMatch ? titleMatch[1].trim().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Data';
      const body = block.replace(/^\[(?:RAG|ACTION):[^\]]+\]\n?/, '').trim();

      // Convert markdown to simple HTML
      const bodyHtml = body
        .split('\n')
        .map(line => {
          if (line.startsWith('- ')) return `<li style="margin:4px 0;font-size:13px;color:#333">${line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')}</li>`;
          if (line.startsWith('**') && line.endsWith('**')) return `<p style="margin:6px 0;font-weight:bold;font-size:13px;color:#1E3D2B">${line.replace(/\*\*/g, '')}</p>`;
          if (line.trim() === '') return '<br/>';
          return `<p style="margin:4px 0;font-size:13px;color:#444">${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')}</p>`;
        })
        .join('');
      const listWrapped = bodyHtml.includes('<li') ? `<ul style="margin:8px 0;padding-left:18px">${bodyHtml}</ul>` : bodyHtml;

      return `
        <div style="margin-bottom:24px">
          <h3 style="margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #E8A838;color:#1E3D2B;font-size:15px">${title}</h3>
          ${listWrapped}
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
    <div style="background:#1E3D2B;padding:28px 32px;text-align:center">
      <h1 style="margin:0;color:#E8A838;font-size:22px;letter-spacing:-0.5px">🌿 Naturelite</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">${config.label}</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.45);font-size:11px">${date}</p>
    </div>
    <div style="padding:28px 32px">
      ${sectionsHtml}
    </div>
    <div style="background:#f0f0ea;padding:16px 32px;text-align:center;border-top:1px solid #e8e8e0">
      <p style="margin:0;font-size:11px;color:#888">Sent via AI — Aditya Intelligence · Naturelite Admin</p>
    </div>
  </div>
</body></html>`;

    return { subject, summary, html };
  }

  // ─── Prompt builders ──────────────────────────────────────────────────────────

  // ─── Intent extraction (new primary path) ────────────────────────────────────

  /** Lightweight Gemini prompt that extracts structured intent from a free-form
   *  admin query. Returns a small JSON object — not tool names — so understanding
   *  is always separated from tool selection. */
  private buildIntentPrompt(message: string, history: HistoryItem[]): string {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterdayStr = new Date(now.getTime() - 86_400_000).toISOString().split('T')[0];

    const historySection = history.length > 0
      ? `\nConversation so far:\n${history.slice(-3).map((h) => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text.slice(0, 120)}`).join('\n')}\n`
      : '';

    return `Extract the intent of this e-commerce admin query. Return ONLY valid JSON.

TODAY: ${todayStr}  YESTERDAY: ${yesterdayStr}
${historySection}
JSON schema (omit null fields):
{
  "topic": "orders|revenue|customers|inventory|feedback|coupons|payments|subscriptions|store_sales|wallet|reminders|whatsapp|overview|email|login|abandoned_carts|top_products",
  "timePreset": "today|yesterday|this_week|last_week|this_month|last_30_days",
  "from": "ISO date string",
  "to": "ISO date string",
  "filters": {
    "status": "placed|confirmed|preparing|out_for_delivery|delivered|cancelled",
    "paymentMethod": "cod|prepaid",
    "customerName": "name string",
    "customerPhone": "phone string",
    "productName": "product name string",
    "minRating": 1-5,
    "maxRating": 1-5,
    "feedbackType": "complaint|suggestion|review",
    "couponStatus": "active|expired|upcoming|inactive",
    "minSpent": number,
    "outOfStock": true,
    "inStock": true
  },
  NOTE on inventory filters:
  - "inStock": true → user wants products that ARE available (use for "which items are in stock / available")
  - "outOfStock": true → user wants products with zero stock
  - NEITHER flag (default) → user wants LOW STOCK products (running low, need restock)
  CRITICAL: "low in stock", "low stock", "running low", "need to restock" → OMIT both inStock and outOfStock
  "action": "list|count|summary|trend|compare|search",
  "emailTo": "email address",
  "emailReportType": "dashboard|orders|revenue|analytics|monthly|weekly|customers|feedback|coupons|store_sales|abandoned|payments|low_stock|ims",
  "emailConfirm": true
}

IMPORTANT RULE: Only set "timePreset" when the user EXPLICITLY mentions a time period ("today", "this week", etc.). If no time period is mentioned, OMIT timePreset entirely.

Examples:
"show orders" → {"topic":"orders","action":"list"}
"how many orders do I have" → {"topic":"orders","action":"count"}
"total orders" → {"topic":"orders","action":"count"}
"which orders came today" → {"topic":"orders","timePreset":"today","action":"list"}
"yesterday revenue" → {"topic":"revenue","timePreset":"yesterday","action":"trend"}
"revenue" → {"topic":"revenue","action":"trend"}
"how much money did I make" → {"topic":"revenue","action":"trend"}
"cancelled orders this week" → {"topic":"orders","timePreset":"this_week","filters":{"status":"cancelled"},"action":"list"}
"cancelled orders" → {"topic":"orders","filters":{"status":"cancelled"},"action":"list"}
"Rahul ki orders" → {"topic":"orders","filters":{"customerName":"Rahul"},"action":"list"}
"1 star reviews" → {"topic":"feedback","filters":{"maxRating":1},"action":"list"}
"complaints about ghee" → {"topic":"feedback","filters":{"feedbackType":"complaint","productName":"ghee"},"action":"list"}
"active coupons" → {"topic":"coupons","filters":{"couponStatus":"active"},"action":"list"}
"out of stock items" → {"topic":"inventory","filters":{"outOfStock":true},"action":"list"}
"low stock" → {"topic":"inventory","action":"list"}
"which oil products low in stock" → {"topic":"inventory","filters":{"productName":"oil"},"action":"list"}
"oil products running low" → {"topic":"inventory","filters":{"productName":"oil"},"action":"list"}
"ghee low stock" → {"topic":"inventory","filters":{"productName":"ghee"},"action":"list"}
"which ghee items are in stock" → {"topic":"inventory","filters":{"inStock":true,"productName":"ghee"},"action":"list"}
"what ghee is available" → {"topic":"inventory","filters":{"inStock":true,"productName":"ghee"},"action":"list"}
"show available oil products" → {"topic":"inventory","filters":{"inStock":true,"productName":"oil"},"action":"list"}
"compare this week vs last" → {"topic":"revenue","action":"compare"}
"customers" → {"topic":"customers","action":"list"}
"total customers" → {"topic":"customers","action":"count"}
"how many customers do I have" → {"topic":"customers","action":"count"}
"customers who spent over 5000" → {"topic":"customers","filters":{"minSpent":5000},"action":"list"}
"compare this month vs last month" → {"topic":"revenue","timePreset":"this_month","action":"compare"}
"compare this week vs last week" → {"topic":"revenue","timePreset":"this_week","action":"compare"}
"abandoned carts" → {"topic":"abandoned_carts","action":"list"}
"abandoned carts with ghee" → {"topic":"abandoned_carts","filters":{"productName":"ghee"},"action":"list"}
"best selling oil" → {"topic":"top_products","filters":{"productName":"oil"},"action":"list"}
"top products" → {"topic":"top_products","action":"list"}
"payments" → {"topic":"payments","action":"list"}
"failed payments" → {"topic":"payments","action":"list"}
"coupons" → {"topic":"coupons","action":"list"}
"subscriptions" → {"topic":"subscriptions","action":"list"}
"wallet" → {"topic":"wallet","action":"list"}
"reminders" → {"topic":"reminders","action":"list"}
"feedback" → {"topic":"feedback","action":"list"}
"store sales" → {"topic":"store_sales","action":"list"}
"send analytics to admin@store.com" → {"topic":"email","emailTo":"admin@store.com","emailReportType":"analytics"}
"yes" (after email preview) → {"topic":"email","emailConfirm":true}
"overview" → {"topic":"overview","action":"summary"}

Query: """${message}"""`;
  }

  /** Resolve timePreset or explicit from/to into ISO date strings. */
  private resolveIntentDates(intent: ChatbotIntent, now: Date): { from?: string; to?: string } {
    if (intent.from && intent.to) return { from: intent.from, to: intent.to };
    const t = now.toISOString().split('T')[0];
    switch (intent.timePreset) {
      case 'today':
        return { from: `${t}T00:00:00.000Z`, to: `${t}T23:59:59.000Z` };
      case 'yesterday': {
        const y = new Date(now.getTime() - 86_400_000).toISOString().split('T')[0];
        return { from: `${y}T00:00:00.000Z`, to: `${y}T23:59:59.000Z` };
      }
      case 'this_week': {
        const w = new Date(now.getTime() - 7 * 86_400_000).toISOString().split('T')[0];
        return { from: `${w}T00:00:00.000Z`, to: `${t}T23:59:59.000Z` };
      }
      case 'last_week': {
        const ws = new Date(now.getTime() - 14 * 86_400_000).toISOString().split('T')[0];
        const we = new Date(now.getTime() - 7 * 86_400_000).toISOString().split('T')[0];
        return { from: `${ws}T00:00:00.000Z`, to: `${we}T23:59:59.000Z` };
      }
      case 'this_month': {
        const ms = `${t.slice(0, 7)}-01T00:00:00.000Z`;
        return { from: ms, to: `${t}T23:59:59.000Z` };
      }
      case 'last_30_days': {
        const m = new Date(now.getTime() - 30 * 86_400_000).toISOString().split('T')[0];
        return { from: `${m}T00:00:00.000Z`, to: `${t}T23:59:59.000Z` };
      }
      default:
        return {};
    }
  }

  /** Maps a structured ChatbotIntent to the minimum set of DB tool calls.
   *  No regex on raw user text — all decisions are based on the AI-extracted intent. */
  private intentToTools(intent: ChatbotIntent, now: Date, history: HistoryItem[]): RagStep[] {
    const { from, to } = this.resolveIntentDates(intent, now);
    const f = intent.filters ?? {};

    switch (intent.topic) {
      case 'orders': {
        if (f.customerName) return [{ tool: 'get_customer_orders', params: { name: f.customerName, limit: 10 } }];
        if (f.customerPhone) return [{ tool: 'get_customer_orders', params: { phone: f.customerPhone, limit: 10 } }];
        const params: Record<string, unknown> = { limit: 20 };
        if (from) params.from = from;
        if (to) params.to = to;
        if (f.status) params.status = f.status;
        if (f.paymentMethod) params.paymentMethod = f.paymentMethod;
        // Always include all-time order counts so a narrow date range never shows "0 orders"
        return [
          { tool: 'get_orders_by_status', params: {} },
          { tool: 'search_recent_orders', params },
        ];
      }
      case 'revenue': {
        if (intent.action === 'compare') {
          // "compare this month vs last month" → 30 days; "this week vs last" → 7 days
          const compareDays = (intent.timePreset === 'this_month' || intent.timePreset === 'last_30_days') ? 30 : 7;
          return [{ tool: 'compare_periods', params: { days: compareDays } }];
        }
        // Default to last 30 days so "today only" queries don't silently return ₹0
        return [{ tool: 'get_revenue_trend', params: from ? { from, to } : { days: 30 } }];
      }
      case 'customers':
        if (f.customerName) return [{ tool: 'search_customers', params: { searchTerm: f.customerName, limit: 10 } }];
        if (f.customerPhone) return [{ tool: 'search_customers', params: { searchTerm: f.customerPhone, limit: 5 } }];
        if (f.minSpent) return [{ tool: 'get_top_customers_online', params: { minSpent: f.minSpent, limit: 20 } }];
        if (intent.action === 'count' || intent.action === 'summary')
          // "total customers" → dashboard has totalCustomers count + new customers breakdown
          return [{ tool: 'get_dashboard_summary', params: {} }, { tool: 'get_new_customers', params: { days: 30 } }];
        if (intent.action === 'list') return [{ tool: 'get_top_customers_online', params: { limit: 10 } }];
        return [{ tool: 'get_new_customers', params: from ? { from, to } : { days: 7 } }];
      case 'inventory':
        if (f.outOfStock) return [{ tool: 'search_out_of_stock_products', params: f.productName ? { searchTerm: f.productName } : {} }];
        if (f.inStock) return [{ tool: 'search_in_stock_products', params: f.productName ? { searchTerm: f.productName } : {} }];
        return [{ tool: 'search_low_stock_products', params: f.productName ? { searchTerm: f.productName } : {} }];
      case 'feedback': {
        const fp: Record<string, unknown> = { limit: 15 };
        if (f.minRating) fp.minRating = f.minRating;
        if (f.maxRating) fp.maxRating = f.maxRating;
        if (f.feedbackType) fp.type = f.feedbackType;
        if (f.productName) fp.productName = f.productName;
        return [{ tool: 'get_feedback_list', params: fp }];
      }
      case 'coupons':
        return [{ tool: 'get_coupon_list', params: f.couponStatus ? { status: f.couponStatus } : {} }];
      case 'payments':
        return [{ tool: 'get_payment_failures', params: { limit: 20 } }];
      case 'subscriptions':
        return [{ tool: 'get_subscription_data', params: {} }];
      case 'store_sales':
        return [{ tool: 'get_store_sales', params: from ? { from, to } : {} }];
      case 'wallet':
        return [{ tool: 'get_wallet_balances', params: { limit: 20 } }];
      case 'reminders':
        return [{ tool: 'get_reminders', params: {} }];
      case 'whatsapp':
        return [{ tool: 'get_whatsapp_queue', params: {} }];
      case 'login':
        return [{ tool: 'get_login_audit_logs', params: { limit: 20 } }];
      case 'abandoned_carts':
        return [{ tool: 'search_abandoned_carts', params: { limit: 30, ...(f.productName ? { productSearch: f.productName } : {}) } }];
      case 'top_products': {
        const tp: Record<string, unknown> = { limit: 8 };
        if (from) tp.from = from;
        if (to) tp.to = to;
        if (f.productName) tp.searchTerm = f.productName;
        return [{ tool: 'get_top_selling_products', params: tp }];
      }
      case 'email': {
        if (intent.emailConfirm) {
          const emailTo = this.extractEmailFromHistory(history);
          const reportType = this.extractReportTypeFromHistory(history);
          return [{ tool: 'send_email_report', params: { to: emailTo, reportType } }];
        }
        if (intent.emailTo)
          return [{ tool: 'preview_email_report', params: { to: intent.emailTo, reportType: intent.emailReportType || 'dashboard' } }];
        return [{ tool: 'get_dashboard_summary', params: {} }];
      }
      case 'overview':
      default:
        return [
          { tool: 'get_dashboard_summary', params: {} },
          { tool: 'get_orders_by_status', params: {} },
          { tool: 'search_recent_orders', params: { limit: 10 } },
          { tool: 'search_low_stock_products', params: {} },
        ];
    }
  }

  /** Simple text-based intent extraction used only when Gemini is unavailable.
   *  Matches clean topic keywords — never runs regex directly on raw user text
   *  to decide DB params. */
  private textToIntent(message: string): ChatbotIntent {
    const m = message.toLowerCase();

    // Time preset
    let timePreset: ChatbotIntent['timePreset'];
    if (/\btoday\b/.test(m)) timePreset = 'today';
    else if (/\byesterday\b/.test(m)) timePreset = 'yesterday';
    else if (/this\s+week/.test(m)) timePreset = 'this_week';
    else if (/last\s+week/.test(m)) timePreset = 'last_week';
    else if (/this\s+month/.test(m)) timePreset = 'this_month';
    else if (/last\s+30|last\s+month/.test(m)) timePreset = 'last_30_days';

    // Topic + filters
    if (/\border(s|ing|ed)?\b/.test(m) && !/coupon|feedback|subscription|revenue/.test(m)) {
      const filters: ChatbotIntent['filters'] = {};
      const statusM = m.match(/\b(placed|confirmed|preparing|delivered|cancelled|out.for.delivery)\b/);
      if (statusM) filters.status = statusM[1];
      if (/\bcod\b/.test(m)) filters.paymentMethod = 'cod';
      else if (/prepaid|online|upi/.test(m)) filters.paymentMethod = 'prepaid';
      return { topic: 'orders', timePreset, filters, action: 'list' };
    }
    if (/\brevenue|earning/.test(m)) {
      if (/compare|vs|versus/.test(m)) return { topic: 'revenue', action: 'compare' };
      return { topic: 'revenue', timePreset, action: 'trend' };
    }
    if (/out[\s-]of[\s-]stock|zero.stock/.test(m)) return { topic: 'inventory', filters: { outOfStock: true } };
    // "low in stock" / "low stock" must match BEFORE the generic "in stock" check
    if (/low[\s-]in[\s-]stock|low[\s-]stock|running[\s-]low|need[\s-]restock/.test(m)) {
      const prodM = m.match(/\b(ghee|oil|seeds?|spice|flour|atta|nuts?|dry.fruit)\b/i);
      return { topic: 'inventory', filters: { ...(prodM ? { productName: prodM[1] } : {}) } };
    }
    if (/\bin[\s-]stock\b|available|in.availability|has.stock|stocked/.test(m)) {
      const prodM = m.match(/\b(ghee|oil|seeds?|spice|flour|atta|nuts?|dry.fruit)\b/i);
      return { topic: 'inventory', filters: { inStock: true, ...(prodM ? { productName: prodM[1] } : {}) } };
    }
    if (/stock|inventory/.test(m)) return { topic: 'inventory' };
    if (/feedback|review|rating|complaint/.test(m)) {
      const filters: ChatbotIntent['filters'] = {};
      if (/1.star|terrible|worst/.test(m)) filters.maxRating = 1;
      else if (/2.star|bad|poor/.test(m)) filters.maxRating = 2;
      else if (/5.star|excellent/.test(m)) filters.minRating = 5;
      else if (/negative/.test(m)) filters.maxRating = 2;
      else if (/positive/.test(m)) filters.minRating = 4;
      if (/complaint/.test(m)) filters.feedbackType = 'complaint';
      else if (/suggestion/.test(m)) filters.feedbackType = 'suggestion';
      return { topic: 'feedback', filters, action: 'list' };
    }
    if (/coupon|promo.code/.test(m)) {
      const filters: ChatbotIntent['filters'] = {};
      const statusM = m.match(/\b(active|expired|upcoming|inactive)\b/);
      if (statusM) filters.couponStatus = statusM[1] as ChatbotIntent['filters']['couponStatus'];
      return { topic: 'coupons', filters, action: 'list' };
    }
    if (/payment.fail|failed.payment/.test(m)) return { topic: 'payments', action: 'list' };
    if (/subscription|recurring/.test(m)) return { topic: 'subscriptions', action: 'list' };
    if (/store.sale|walk.in|offline/.test(m)) return { topic: 'store_sales', timePreset, action: 'list' };
    if (/wallet|credit.balance/.test(m)) return { topic: 'wallet', action: 'list' };
    if (/reminder/.test(m)) return { topic: 'reminders', action: 'list' };
    if (/whatsapp.queue|support.queue/.test(m)) return { topic: 'whatsapp', action: 'list' };
    if (/abandon|left.without/.test(m)) return { topic: 'abandoned_carts', action: 'list' };
    if (/best.sell|top.sell|popular|most.sold/.test(m)) return { topic: 'top_products', timePreset, action: 'list' };
    if (/login|audit/.test(m)) return { topic: 'login', action: 'list' };
    if (/customer/.test(m)) return { topic: 'customers', action: 'list' };
    return { topic: 'overview', action: 'summary' };
  }

  private extractEmailFromHistory(history: HistoryItem[]): string {
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i].text.match(/\bto:\s*([^\s\n]+)/);
      if (m) return m[1];
    }
    return '';
  }

  private extractReportTypeFromHistory(history: HistoryItem[]): string {
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i].text.match(/\breportType:\s*([^\s\n]+)/);
      if (m) return m[1];
    }
    return 'dashboard';
  }

  /** Secondary AI planner: called when the primary planner returns an empty result.
   *  Uses a compact prompt so the AI understands the question and picks tools
   *  without needing all the detailed examples. Falls back to keyword regex only
   *  if Gemini itself fails (network error, rate-limit, etc.). */
  private async aiFallbackPlan(message: string): Promise<RagStep[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return this.keywordFallbackPlan(message);

    const today = new Date().toISOString().split('T')[0];

    const prompt = `You select database tools for NatureLite's e-commerce admin dashboard.

Today: ${today}
Question: "${message.slice(0, 300)}"

Read the question, understand what the admin wants, then pick 1-3 tools from this list. Return ONLY a JSON array.

Tools (use exact names, include relevant params):
get_dashboard_summary | search_out_of_stock_products(searchTerm?) | search_low_stock_products(searchTerm?) | search_products(searchTerm) |
get_login_audit_logs | search_abandoned_carts(limit,productSearch?) | get_top_selling_products(limit,from?,to?,searchTerm?) |
search_recent_orders(limit,status?,from?,to?,customerSearch?,paymentMethod?) | search_orders_by_date_range(from,to,limit) |
search_customers(searchTerm,limit) | get_top_customers_online(limit,minSpent?) | get_customer_orders(phone?,name?,limit) |
get_revenue_trend(from?,to?) | get_orders_by_status | get_feedback_list(limit,minRating?,maxRating?,type?,productName?) |
get_coupon_list(status?) | get_analytics_period(from?,to?,days?) | get_new_customers(from?,to?,days?) |
get_store_sales(from?,to?) | get_wallet_balances(limit) | get_payment_failures(limit) |
get_subscription_data | get_whatsapp_queue | get_reminders | compare_periods(days) |
preview_email_report(to,reportType) | send_email_report(to,reportType)

Example: [{"tool":"search_recent_orders","params":{"limit":10,"status":"placed"}}]
JSON array only:`;

    const data = await this.geminiRequest(
      apiKey,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 250, responseMimeType: 'application/json' },
      },
      'ai-fallback-planner',
    );

    if (data) {
      try {
        let raw = this.extractText(data).trim();
        if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
        const parsed = JSON.parse(raw.trim());
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.logger.log(`AI fallback plan: ${parsed.map((s: RagStep) => s.tool).join(', ')}`);
          return parsed;
        }
      } catch {
        this.logger.warn('AI fallback plan JSON parse failed — keyword fallback');
      }
    }

    return this.keywordFallbackPlan(message);
  }

  private buildPlannerPrompt(message: string, history: HistoryItem[]): string {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const todayStart = `${todayStr}T00:00:00.000Z`;
    const todayEnd = `${todayStr}T23:59:59.000Z`;
    const yesterdayStr = new Date(now.getTime() - 86_400_000).toISOString().split('T')[0];
    const weekAgoStr = new Date(now.getTime() - 7 * 86_400_000).toISOString().split('T')[0];
    const monthAgoStr = new Date(now.getTime() - 30 * 86_400_000).toISOString().split('T')[0];

    const historySection = history.length > 0
      ? `\n=== CONVERSATION HISTORY ===\n${history.slice(-4).map((h) => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text.slice(0, 200)}`).join('\n')}\n===========================\n`
      : '';

    return `You are the data planner for NatureLite's e-commerce admin dashboard.

TODAY: ${todayStr}  |  YESTERDAY: ${yesterdayStr}  |  7 DAYS AGO: ${weekAgoStr}  |  30 DAYS AGO: ${monthAgoStr}

── STEP 1: UNDERSTAND THE QUESTION ──────────────────────────────────────────────
Before selecting tools, identify:
• Data topic: orders / revenue / customers / inventory / coupons / feedback / payments / subscriptions / store-sales / wallet / reminders / whatsapp
• Time period: convert ALL relative dates to ISO ("today" → ${todayStart}–${todayEnd}, "yesterday" → ${yesterdayStr}T00:00:00.000Z–${yesterdayStr}T23:59:59.000Z, "this week" → ${weekAgoStr}T00:00:00.000Z–${todayEnd}, "last month" → ${monthAgoStr}T00:00:00.000Z–${todayEnd})
• Filters: customer name/phone, product name, status, payment method, rating range, coupon status
• Follow-up: use conversation history to resolve "that customer", "same period", "those orders"

── STEP 2: SELECT MINIMUM TOOLS ────────────────────────────────────────────────
Return ONLY a raw JSON array. Pick the fewest tools that directly answer the question. Never include tools for data the admin didn't ask about.
${historySection}
TOOLS:
1. {"tool":"get_dashboard_summary","params":{}}
2. {"tool":"search_out_of_stock_products","params":{"searchTerm":"string"}} — finds products with stock = 0 (completely out); use for "out of stock" queries
3. {"tool":"search_low_stock_products","params":{"searchTerm":"string"}} — finds products with stock ≤ threshold (running low); searchTerm narrows by product type ("oil", "ghee")
4. {"tool":"search_products","params":{"searchTerm":"string"}}
5. {"tool":"get_login_audit_logs","params":{"limit":20}}
6. {"tool":"search_abandoned_carts","params":{"limit":30,"productSearch":"string"}}
7. {"tool":"get_top_selling_products","params":{"limit":8,"from":"ISO","to":"ISO","searchTerm":"string"}}
8. {"tool":"search_recent_orders","params":{"limit":10,"status":"string","from":"ISO","to":"ISO","customerSearch":"string","paymentMethod":"string"}}
9. {"tool":"search_orders_by_date_range","params":{"from":"ISO","to":"ISO","limit":20}}
10. {"tool":"search_customers","params":{"searchTerm":"string","limit":10}}
11. {"tool":"get_top_customers_online","params":{"limit":10,"minSpent":0}}
12. {"tool":"get_customer_orders","params":{"phone":"string","name":"string","limit":10}}
13. {"tool":"get_revenue_trend","params":{"from":"ISO","to":"ISO"}}
14. {"tool":"get_orders_by_status","params":{}}
15. {"tool":"get_feedback_list","params":{"limit":15,"minRating":1,"maxRating":5,"type":"review|complaint|suggestion","productName":"string"}}
16. {"tool":"get_coupon_list","params":{"status":"active|expired|upcoming|inactive"}}
17. {"tool":"get_analytics_period","params":{"from":"ISO","to":"ISO","days":30}}
18. {"tool":"get_new_customers","params":{"from":"ISO","to":"ISO","days":7}}
19. {"tool":"get_store_sales","params":{"from":"ISO","to":"ISO"}}
20. {"tool":"get_wallet_balances","params":{"limit":20}}
21. {"tool":"get_payment_failures","params":{"limit":20}}
22. {"tool":"get_subscription_data","params":{}}
23. {"tool":"get_whatsapp_queue","params":{}}
24. {"tool":"get_reminders","params":{}}
25. {"tool":"compare_periods","params":{"days":7}}
26. {"tool":"preview_email_report","params":{"to":"email","reportType":"ims|low_stock|analytics|monthly|weekly|orders|revenue|dashboard|customers|feedback|coupons|store_sales|abandoned|payments"}} — ALWAYS preview first
27. {"tool":"send_email_report","params":{"to":"email","reportType":"string"}} — ONLY after user confirms in history

EMAIL RULE: preview_email_report first, send_email_report only when history shows user said yes/confirm/send it/go ahead.

TOOL SELECTION RULES:
• "how many orders" / "total orders" / "show orders" → ALWAYS include get_orders_by_status (all-time counts) + search_recent_orders
• "low in stock" / "running low" / "need restock" → search_low_stock_products (NOT search_in_stock_products)
• "in stock" / "available" / "which X is available" → search_in_stock_products
• "out of stock" / "zero stock" → search_out_of_stock_products
• "total customers" / "how many customers" → get_dashboard_summary (has totalCustomers field)
• "revenue" with no date → get_revenue_trend with days:30
• "compare X vs Y" weeks → compare_periods days:7; months → compare_periods days:30
• Specific customer name/phone → get_customer_orders; otherwise get_top_customers_online
• "payments" / "failed payments" → get_payment_failures
• For any date-relative query, resolve dates to ISO strings before passing as params

EXAMPLES:
"today's orders" → [{"tool":"get_orders_by_status","params":{}},{"tool":"search_recent_orders","params":{"from":"${todayStart}","to":"${todayEnd}","limit":20}}]
"how many orders do I have" → [{"tool":"get_orders_by_status","params":{}},{"tool":"search_recent_orders","params":{"limit":10}}]
"show orders" → [{"tool":"get_orders_by_status","params":{}},{"tool":"search_recent_orders","params":{"limit":10}}]
"yesterday revenue" → [{"tool":"get_revenue_trend","params":{"from":"${yesterdayStr}T00:00:00.000Z","to":"${yesterdayStr}T23:59:59.000Z"}}]
"this week's revenue" → [{"tool":"get_revenue_trend","params":{"from":"${weekAgoStr}T00:00:00.000Z","to":"${todayEnd}"}}]
"last 30 days analytics" → [{"tool":"get_analytics_period","params":{"from":"${monthAgoStr}T00:00:00.000Z","to":"${todayEnd}","days":30}}]
"orders in May 2025" → [{"tool":"search_orders_by_date_range","params":{"from":"2025-05-01T00:00:00.000Z","to":"2025-05-31T23:59:59.000Z","limit":20}}]
"this week vs last week" → [{"tool":"compare_periods","params":{"days":7}}]
"this month vs last month" → [{"tool":"compare_periods","params":{"days":30}}]
"which oil products low in stock" → [{"tool":"search_low_stock_products","params":{"searchTerm":"oil"}}]
"ghee low stock" → [{"tool":"search_low_stock_products","params":{"searchTerm":"ghee"}}]
"which ghee is available" → [{"tool":"search_in_stock_products","params":{"searchTerm":"ghee"}}]
"out of stock" → [{"tool":"search_out_of_stock_products","params":{}}]
"out of stock ghee" → [{"tool":"search_out_of_stock_products","params":{"searchTerm":"ghee"}}]
"low stock" → [{"tool":"search_low_stock_products","params":{}}]
"total customers" → [{"tool":"get_dashboard_summary","params":{}}]
"best selling oil" → [{"tool":"get_top_selling_products","params":{"searchTerm":"oil","limit":8}}]
"Rahul's orders" → [{"tool":"get_customer_orders","params":{"name":"Rahul","limit":10}}]
"COD orders today" → [{"tool":"search_recent_orders","params":{"paymentMethod":"cod","from":"${todayStart}","to":"${todayEnd}","limit":20}}]
"cancelled orders" → [{"tool":"get_orders_by_status","params":{}},{"tool":"search_recent_orders","params":{"status":"cancelled","limit":10}}]
"1 star reviews" → [{"tool":"get_feedback_list","params":{"maxRating":1,"limit":15}}]
"complaints about ghee" → [{"tool":"get_feedback_list","params":{"type":"complaint","productName":"ghee","limit":15}}]
"active coupons" → [{"tool":"get_coupon_list","params":{"status":"active"}}]
"who has ghee in abandoned cart" → [{"tool":"search_abandoned_carts","params":{"productSearch":"ghee","limit":30}}]
"customers who spent over 5000" → [{"tool":"get_top_customers_online","params":{"minSpent":5000,"limit":20}}]
"failed payments" → [{"tool":"get_payment_failures","params":{"limit":20}}]
"active subscriptions" → [{"tool":"get_subscription_data","params":{}}]
"whatsapp support queue" → [{"tool":"get_whatsapp_queue","params":{}}]
"send analytics to admin@store.com" → [{"tool":"preview_email_report","params":{"to":"admin@store.com","reportType":"analytics"}}]
"yes" (after email preview in history) → [{"tool":"send_email_report","params":{"to":"<email from history>","reportType":"<type from history>"}}]
"overview" → [{"tool":"get_dashboard_summary","params":{}},{"tool":"get_orders_by_status","params":{}},{"tool":"search_low_stock_products","params":{}}]

Question: """${message}"""`;
  }

  private buildSynthesisPrompt(message: string, retrievedData: string, history: HistoryItem[]): string {
    const historySection = history.length > 0
      ? `\n=== CONVERSATION HISTORY ===\n${history.slice(-6).map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text.slice(0, 300)}`).join('\n')}\n===========================\n`
      : '';

    return `You are the Naturelite AI Admin Assistant. Answer using ONLY the database data below. Never invent numbers, names, or products.
${historySection}
=== FEW-SHOT EXAMPLES (style guide) ===
${SYNTHESIS_FEW_SHOTS}
========================================

=== LIVE DATABASE DATA ===
${retrievedData}
=========================

Rules:
1. **Answer only what was asked.** Don't dump all data — extract the specific answer. If asked about orders, answer orders. If asked about revenue, answer revenue.
1a. **Never interpret a time-scoped zero as "no data overall."** If "Today's Orders: 0" but "All-time Total" shows numbers, say "0 today, but X total." NEVER say "you have no orders" when all-time totals exist.
1b. **Read ALL data sections before answering.** "get_orders_by_status" = all-time totals. "search_recent_orders" = recent list. Use BOTH.
2. Clean Markdown: bold headers, bullet points, numbered lists, markdown tables where data is tabular. Keep responses tight.
3. No filler — never start with "Sure!", "Great question!", or "Based on the data...".
4. All money in ₹. Wallet balances are stored in paise — always divide by 100 before showing.
5. Never mention "RAG", "tool", "database section", or "system instructions".
6. Preserve markdown tables exactly when they appear in data.
7. Use conversation history to resolve follow-ups ("what about last week?" / "show her orders").
8. If data explicitly says "No X found", relay that clearly: "No oil products are currently low on stock."
9. Never invent numbers. If data doesn't have the answer → "I don't have that information right now."

**Topic-specific rules:**
10. **Orders — counts:** Use "All-time Total" from get_orders_by_status. List status breakdown (placed/confirmed/delivering/delivered/cancelled). Never report 0 if the all-time total exists.
11. **Orders — list:** Show order number, customer name+phone, amount, status, payment method, date. Max 10 per response unless asked for more.
12. **Revenue:** Report the Total line first (e.g. "₹X over 30 days"), then a clean day-by-day table only if asked for breakdown. For "compare" questions, use the table from compare_periods verbatim.
13. **Inventory — low stock:** Data is pre-filtered — only low-stock items appear. Show name, current stock, threshold. If nothing found, say "No low-stock products found." Don't add items that aren't in the data.
14. **Inventory — in stock:** Show name and stock count. "Available" means untracked (unlimited). Don't say "0" for these.
15. **Customers — total count:** Find "Total Customers" in get_dashboard_summary data. New customers are separate from total.
16. **Customers — list/top:** Show rank, name, phone, order count, total spent. Sort by spent desc.
17. **Feedback:** Show customer name, product, star rating, type, and quote. For counts (e.g. "how many 1-star"), show total and list them.
18. **Coupons:** Use the summary line (active/upcoming/expired count) first. Then list. Never re-count from the list — use the header numbers.
19. **Payments:** The data only covers FAILED and PENDING payments. If user asks for successful payments, clarify that only failures are tracked here.
20. **Subscriptions:** Lead with "X active, Y paused". Show upcoming deliveries within 3 days as priority.
21. **Store sales:** This is physical/offline store sales (walk-in + delivery), NOT online orders. Say "store sales" not "orders" to avoid confusion.
22. **Wallet:** Amounts are in paise — divide by 100. Show as ₹X.XX. "Total outstanding: ₹X" = total unused credit.
23. **Reminders:** Show overdue first (⚠️), then upcoming (🔔). Overdue = past due date, needs action now.
24. **Abandoned carts:** These are customers who had items in cart but didn't order in 60+ min. Show name, phone, items, and idle time.
25. **Top products:** Show product name, units sold, revenue. Separate online vs store if both shown.
26. **Email action flow** — when data contains [ACTION: preview_email_report] with READY_TO_SEND:
    > 📧 Ready to send **{report label}** to **{email}**
    > Preview: {first few lines of summary}
    > Reply **yes** to send, or **cancel** to abort.
27. When data contains [ACTION: send_email_report] with SUCCESS → "✅ **{report} sent** to {email}."
28. When data contains [ACTION: send_email_report] with ERROR → "❌ Could not send email — {error reason}."

Question: """${message}"""`;
  }
}
