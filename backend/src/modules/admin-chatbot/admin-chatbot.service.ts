import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Response } from 'express';
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

type RagStep = { tool: string; params?: Record<string, unknown> };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
export type HistoryItem = { role: 'user' | 'assistant'; text: string };

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash';
const MAX_CONTEXT_CHARS = 12_000;

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
    private readonly walletRepository: WalletRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly storeSaleRepository: StoreSaleRepository,
    private readonly reminderRepository: ReminderRepository,
    private readonly messageLogRepository: MessageLogRepository,
    private readonly adminChatSessionRepository: AdminChatSessionRepository,
    private readonly emailService: EmailService,
    @InjectModel(Subscription.name) private readonly subscriptionModel: Model<any>,
  ) {}

  // ─── Gemini helpers ───────────────────────────────────────────────────────────

  private async geminiRequest(
    apiKey: string,
    body: object,
    label: string,
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
      // Extract product-type qualifier: "oil items low on stock" → searchTerm = "oil"
      const typeMatch = m.match(/(?:which\s+)?([a-z]+(?:\s+[a-z]+)?)\s+(?:item|product|sku)s?\s+(?:(?:is|are)\s+)?(?:low|out|running)/i)
        ?? m.match(/low[\s-]+(?:stock|inventory)\s+(?:in|of|for)?\s*([a-z]+(?:\s+[a-z]+)?)/i)
        ?? m.match(/(?:check|show|list)\s+(?:low[\s-]+stock\s+)?([a-z]+(?:\s+[a-z]+)?)\s+(?:items?|products?)/i);
      const searchTerm = typeMatch ? typeMatch[1].replace(/\b(item|product|stock|low|in|of|for|the|all)\b/gi, '').trim() : '';
      plan.push({ tool: 'search_low_stock_products', params: searchTerm ? { searchTerm } : {} });
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
      return `⚠️ **No data could be retrieved right now.**\n\nQuery: *"${message}"*\n\nPlease check server connectivity or try a different question.`;

    const sections = contextBlocks.map((block) => {
      const header = block.match(/^\[RAG:\s*([^\]]+)\]/)?.[1]?.trim() ?? 'Data';
      const body = block.replace(/^\[RAG:[^\]]+\]\n?/, '').trim();
      return `### ${header}\n${body}`;
    });
    let reply = `> ⚡ *AI synthesis unavailable — raw database results for: "${message}"*\n\n${sections.join('\n\n---\n\n')}`;
    if (failedTools.length > 0)
      reply += `\n\n---\n> ⚠️ *Could not load: ${failedTools.join(', ')}*`;
    return reply;
  }

  // ─── Main chat entry point ────────────────────────────────────────────────────

  async chat(message: string, history: HistoryItem[] = [], adminId?: string): Promise<{ reply: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      return { reply: `⚠️ **AI assistant not configured.**\n\nAdd \`GEMINI_API_KEY\` to the backend \`.env\` file.` };

    const safeMessage = this.sanitizeMessage(message);
    if (!safeMessage) return { reply: 'Please type a question.' };

    const failedTools: string[] = [];

    try {
      // ── Plan ─────────────────────────────────────────────────────────────────
      let rawPlan: RagStep[] = [];
      let plannerUsed: 'gemini' | 'keyword' = 'gemini';

      const plannerData = await this.geminiRequest(
        apiKey,
        {
          contents: [{ parts: [{ text: this.buildPlannerPrompt(safeMessage, history) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        },
        'planner',
      );

      if (plannerData) {
        try {
          let raw = this.extractText(plannerData).trim();
          if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
          const parsed = JSON.parse(raw.trim());
          if (Array.isArray(parsed)) rawPlan = parsed;
        } catch {
          this.logger.warn('Planner JSON parse failed — keyword fallback');
        }
      }

      if (!rawPlan.length) {
        plannerUsed = 'keyword';
        rawPlan = this.keywordFallbackPlan(safeMessage);
      }

      const defaultPlan: RagStep[] = [
        { tool: 'get_dashboard_summary', params: {} },
        { tool: 'get_orders_by_status', params: {} },
        { tool: 'search_low_stock_products', params: {} },
      ];
      const finalPlan = this.enrichEmailConfirmation(
        this.deduplicatePlan(rawPlan.length > 0 ? rawPlan : defaultPlan),
        history,
      );
      this.logger.log(`Plan (${plannerUsed}): ${finalPlan.map((s) => s.tool).join(', ')}`);

      // ── Retrieve ──────────────────────────────────────────────────────────────
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

      const contextBlocks = toolResults
        .sort((a, b) => a.index - b.index)
        .map((r) => r.block)
        .filter((b): b is string => b !== null);

      if (contextBlocks.length === 0) {
        return { reply: `⚠️ **Could not load data.**\n\nAll queries failed (${failedTools.join(', ')}). Check DB connection.` };
      }

      // ── Synthesise ────────────────────────────────────────────────────────────
      const retrievedText = contextBlocks.join('\n\n').slice(0, MAX_CONTEXT_CHARS);
      const synthesisData = await this.geminiRequest(
        apiKey,
        {
          contents: [{ parts: [{ text: this.buildSynthesisPrompt(safeMessage, retrievedText, history) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
        },
        'synthesis',
      );
      const aiReply = this.extractText(synthesisData);

      if (!aiReply) return { reply: this.formatRawDataFallback(contextBlocks, failedTools, safeMessage) };

      const finalReply = failedTools.length > 0
        ? `${aiReply}\n\n> ⚠️ *Partial data — could not load: ${failedTools.join(', ')}*`
        : aiReply;

      // ── Persist messages ──────────────────────────────────────────────────────
      if (adminId) {
        const ts = new Date().toISOString();
        await this.adminChatSessionRepository.appendMessages(adminId, [
          { id: `${Date.now()}-u`, sender: 'user', text: safeMessage, timestamp: ts },
          { id: `${Date.now()}-a`, sender: 'assistant', text: finalReply, timestamp: ts },
        ]).catch(() => {});
      }

      return { reply: finalReply };

    } catch (err) {
      this.logger.error(`Unexpected error: ${(err as Error).message}`, (err as Error).stack);
      return { reply: `⚠️ **Something went wrong on the server.**\n\nPlease try again.` };
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

    const safeMessage = this.sanitizeMessage(message);
    const failedTools: string[] = [];

    try {
      // Plan + Retrieve (same as non-streaming chat)
      let rawPlan: RagStep[] = [];
      const plannerData = await this.geminiRequest(
        apiKey,
        {
          contents: [{ parts: [{ text: this.buildPlannerPrompt(safeMessage, history) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        },
        'planner-stream',
      );
      if (plannerData) {
        try {
          let raw = this.extractText(plannerData).trim();
          if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
          const parsed = JSON.parse(raw.trim());
          if (Array.isArray(parsed)) rawPlan = parsed;
        } catch { /* keyword fallback */ }
      }
      if (!rawPlan.length) rawPlan = this.keywordFallbackPlan(safeMessage);

      const finalPlan = this.enrichEmailConfirmation(
        this.deduplicatePlan(rawPlan.length > 0 ? rawPlan : [
          { tool: 'get_dashboard_summary', params: {} },
          { tool: 'get_orders_by_status', params: {} },
          { tool: 'search_low_stock_products', params: {} },
        ]),
        history,
      );

      const toolResults = await Promise.all(
        finalPlan.map(async (step, index) => {
          try { return { index, block: await this.executeTool(step) }; }
          catch { failedTools.push(step.tool); return { index, block: null }; }
        }),
      );
      const contextBlocks = toolResults.sort((a, b) => a.index - b.index).map((r) => r.block).filter((b): b is string => b !== null);

      if (contextBlocks.length === 0) {
        res.write(`data: ${JSON.stringify({ delta: '⚠️ Could not load data. Check database connection.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        return;
      }

      const retrievedText = contextBlocks.join('\n\n').slice(0, MAX_CONTEXT_CHARS);

      // Synthesise with regular generateContent (reliable in Node.js)
      const synthesisData = await this.geminiRequest(
        apiKey,
        {
          contents: [{ parts: [{ text: this.buildSynthesisPrompt(safeMessage, retrievedText, history) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
        },
        'synthesis-stream',
      );

      let fullReply = this.extractText(synthesisData);
      if (!fullReply) fullReply = this.formatRawDataFallback(contextBlocks, failedTools, safeMessage);

      if (failedTools.length > 0)
        fullReply += `\n\n> ⚠️ *Partial data — could not load: ${failedTools.join(', ')}*`;

      // Stream word-by-word so the frontend renders progressively
      const tokens = fullReply.split(/(\s+)/);
      for (const token of tokens) {
        if (token) {
          res.write(`data: ${JSON.stringify({ delta: token })}\n\n`);
          await this.sleep(10);
        }
      }
      res.write('data: [DONE]\n\n');

      // Persist
      if (adminId && fullReply) {
        const ts = new Date().toISOString();
        await this.adminChatSessionRepository.appendMessages(adminId, [
          { id: `${Date.now()}-u`, sender: 'user', text: safeMessage, timestamp: ts },
          { id: `${Date.now()}-a`, sender: 'assistant', text: fullReply, timestamp: ts },
        ]).catch(() => {});
      }

    } catch (err) {
      this.logger.error(`streamChat error: ${(err as Error).message}`);
      res.write(`data: ${JSON.stringify({ delta: '⚠️ Something went wrong. Please try again.' })}\n\n`);
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

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async scheduledDailyReport(): Promise<void> {
    const adminEmail = process.env.ADMIN_REPORT_EMAIL;
    if (!adminEmail) return;

    this.logger.log('Running scheduled daily report email');
    try {
      const briefing = await this.getBriefing();
      const html = `
        <!DOCTYPE html><html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:auto">
          <div style="background:#1E3D2B;padding:20px;text-align:center">
            <h1 style="color:#E8A838;margin:0;font-size:20px">🌿 Naturelite — Daily Briefing</h1>
            <p style="color:#aaa;font-size:12px;margin:4px 0 0">${new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
          </div>
          <div style="padding:24px">
            ${briefing.dashboard ? `<h3 style="color:#1E3D2B;border-bottom:2px solid #E8A838;padding-bottom:6px">📊 Dashboard Summary</h3><pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap">${briefing.dashboard}</pre>` : ''}
            ${briefing.orderStatus ? `<h3 style="color:#1E3D2B;border-bottom:2px solid #E8A838;padding-bottom:6px">📦 Order Status</h3><pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap">${briefing.orderStatus}</pre>` : ''}
            ${briefing.lowStock ? `<h3 style="color:#c0392b;border-bottom:2px solid #c0392b;padding-bottom:6px">⚠️ Low Stock Alert</h3><pre style="background:#fff5f5;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap">${briefing.lowStock}</pre>` : ''}
          </div>
          <div style="background:#f0f0f0;padding:12px;text-align:center;font-size:11px;color:#888">
            AI — Aditya Intelligence | Naturelite Admin
          </div>
        </body></html>
      `;
      await (this.emailService as any).send(adminEmail, `📊 Naturelite Daily Briefing — ${new Date().toLocaleDateString('en-IN')}`, html);
      this.logger.log(`Daily report sent to ${adminEmail}`);
    } catch (err) {
      this.logger.error(`Daily report failed: ${(err as Error).message}`);
    }
  }

  // ─── Tool executor ────────────────────────────────────────────────────────────

  async executeTool(step: RagStep): Promise<string | null> {
    switch (step.tool) {

      case 'get_dashboard_summary': {
        const stats = await this.analyticsService.getDashboardStats() as any;
        const recentLines = (stats.recentOrders ?? []).slice(0, 5).map((o: any) =>
          `- **#${o.orderNumber}** | ${o.user?.name ?? 'Guest'} | ₹${(o.total || 0).toLocaleString('en-IN')} | \`${o.status}\``
        ).join('\n');
        const formatted = [
          `**Today:** ${stats.todayOrders || 0} orders | ₹${(stats.todayRevenue || 0).toLocaleString('en-IN')} revenue`,
          `**This Month:** ${stats.monthOrders || 0} orders | ₹${(stats.monthRevenue || 0).toLocaleString('en-IN')} revenue`,
          `**Total Customers:** ${stats.totalCustomers || 0}`,
          `**Pending Fulfillment:** ${stats.pendingOrders || 0} orders`,
          recentLines ? `\n**Recent Orders:**\n${recentLines}` : '',
        ].filter(Boolean).join('\n');
        return `[RAG: get_dashboard_summary]\n${formatted}`;
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
        return `[RAG: ${label}]\n${formatted}`;
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
        const cutoff = new Date(Date.now() - 60 * 60 * 1000);
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
        const cartLines = abandonedCarts
          .filter((cart: any) => !productSearch || cart.items.some((i: any) => i.name?.toLowerCase().includes(productSearch)))
          .map((cart: any) => {
            const phone = cart.userInfo?.phone || 'No Phone';
            const name = cart.userInfo?.name || phone;
            const items = cart.items.map((i: any) => `${i.name} (x${i.quantity})`).join(', ');
            const hrs = Math.round((Date.now() - new Date(cart.updatedAt).getTime()) / 3_600_000);
            return `- 📱 **${name}** | ${phone} | ₹${(cart.total || 0).toLocaleString('en-IN')} | [${items}] | ~${hrs}h ago`;
          });
        // Sessions don't carry product data — skip them when productSearch is active
        const sessionLines = productSearch ? [] : stuckSessions
          .filter((s: any) => !coveredPhones.has((s.user as any)?.phone ?? s.phone))
          .map((s: any) => {
            const name = (s.user as any)?.name || s.metadata?.contactName || s.phone || 'Unknown';
            const mins = Math.round((Date.now() - new Date(s.lastMessageAt ?? s.updatedAt).getTime()) / 60_000);
            return `- 📱 **${name}** | ${s.phone} | Stuck at \`${s.currentState}\` | ~${mins} min`;
          });
        const all = [...cartLines, ...sessionLines];
        return `[RAG: search_abandoned_carts]\n**${all.length}** customers with items who did not order (60+ min inactive)\n\n${all.join('\n') || 'None found.'}`;
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
        return `[RAG: get_coupon_list${statusFilter ? ` (${statusFilter})` : ''}]\n${formatted}`;
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
          this.storeSaleRepository.getModel().find({ createdAt: { $gte: from, $lte: to }, $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }] })
            .populate('store', 'name code').sort({ createdAt: -1 }).limit(limit).exec(),
          this.storeSaleRepository.getModel().aggregate([
            { $match: { createdAt: { $gte: from, $lte: to }, $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }] } },
            { $group: { _id: null, totalRevenue: { $sum: '$total' }, count: { $sum: 1 }, walkIn: { $sum: { $cond: [{ $eq: ['$saleType', 'walk_in'] }, 1, 0] } }, delivery: { $sum: { $cond: [{ $eq: ['$saleType', 'delivery'] }, 1, 0] } } } },
          ]).exec(),
        ]);
        const agg = totalAgg[0] || { totalRevenue: 0, count: 0, walkIn: 0, delivery: 0 };
        const recentLines = sales.map((s: any) => {
          const store = (s.store as any)?.name || 'Unknown Store';
          return `- **#${s.saleNumber}** | ${store} | ${s.saleType} | ₹${s.total.toLocaleString('en-IN')} | ${s.customerName || 'Walk-in'} | ${s.paymentMethod} | ${new Date(s.createdAt).toLocaleDateString('en-IN')}`;
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

  private buildPlannerPrompt(message: string, history: HistoryItem[]): string {
    const historySection = history.length > 0
      ? `\nRecent conversation:\n${history.slice(-4).map((h) => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text.slice(0, 200)}`).join('\n')}\n`
      : '';

    return `You are the RAG Data Planner for the Naturelite E-Commerce Admin Dashboard.
Pick the minimum set of tools to answer accurately. Return ONLY a raw JSON array.
${historySection}
When the user mentions a date or date range (e.g. "last week", "May 2025", "Q1", "yesterday"), resolve it to ISO dates and set "from"/"to" params instead of "days".

Tools:
1. {"tool":"get_dashboard_summary","params":{}}
2. {"tool":"search_low_stock_products","params":{"searchTerm":"string"}} — pass searchTerm to filter by product type (e.g. "oil", "ghee", "seeds"); omit for all low-stock items
3. {"tool":"search_products","params":{"searchTerm":"string"}}
4. {"tool":"get_login_audit_logs","params":{"limit":20}}
5. {"tool":"search_abandoned_carts","params":{"limit":30,"productSearch":"string"}} — productSearch filters by product name in cart (e.g. "ghee", "oil")
6. {"tool":"get_top_selling_products","params":{"limit":8,"from":"ISO","to":"ISO","searchTerm":"string"}} — searchTerm filters by product name (e.g. "oil", "ghee")
7. {"tool":"search_recent_orders","params":{"limit":10,"status":"string","from":"ISO","to":"ISO","customerSearch":"string","paymentMethod":"string"}} — customerSearch filters by customer name or phone; paymentMethod filters by "cod" or "online"
8. {"tool":"search_orders_by_date_range","params":{"from":"ISO","to":"ISO","limit":20}}
9. {"tool":"search_customers","params":{"searchTerm":"string","limit":10}}
10. {"tool":"get_top_customers_online","params":{"limit":10,"minSpent":0}} — minSpent filters by minimum total spend in paise (₹1000 = 1000)
11. {"tool":"get_customer_orders","params":{"phone":"string","name":"string","limit":10}}
12. {"tool":"get_revenue_trend","params":{"from":"ISO","to":"ISO"}}
13. {"tool":"get_orders_by_status","params":{}}
14. {"tool":"get_feedback_list","params":{"limit":15,"minRating":1,"maxRating":5,"type":"review|complaint|suggestion","productName":"string"}} — filter reviews by rating range, type, or product name
15. {"tool":"get_coupon_list","params":{"status":"active|expired|upcoming|inactive"}} — omit status for all
16. {"tool":"get_analytics_period","params":{"from":"ISO","to":"ISO","days":30}}
17. {"tool":"get_new_customers","params":{"from":"ISO","to":"ISO","days":7}}
18. {"tool":"get_store_sales","params":{"from":"ISO","to":"ISO"}}
19. {"tool":"get_wallet_balances","params":{"limit":20}}
20. {"tool":"get_payment_failures","params":{"limit":20}}
21. {"tool":"get_subscription_data","params":{}}
22. {"tool":"get_whatsapp_queue","params":{}}
23. {"tool":"get_reminders","params":{}}
24. {"tool":"compare_periods","params":{"days":7}}
25. {"tool":"preview_email_report","params":{"to":"email@example.com","reportType":"string"}} — FIRST STEP: preview what will be sent and ask user to confirm. reportType: ims | inventory | low_stock | analytics | monthly | weekly | orders | revenue | dashboard | customers | feedback | coupons | store_sales | abandoned | payments
26. {"tool":"send_email_report","params":{"to":"email@example.com","reportType":"string"}} — SECOND STEP: only call after user confirms (said "yes", "send it", "confirm", "go ahead"). Never call without prior preview confirmation in history.

ACTION RULES:
- For any "send to email" or "email this to" request: ALWAYS call preview_email_report first, never send_email_report directly.
- Only call send_email_report when the conversation history shows the user confirmed a pending preview (said yes/confirm/go ahead/send it).
- Extract the email address exactly as written. Extract the report type from keywords: "IMS" → ims, "low stock" → low_stock, "analytics/monthly/weekly" → analytics/monthly/weekly, "orders" → orders, "revenue" → revenue, "dashboard/overview" → dashboard.

IMPORTANT: Always pass the most specific params possible. If the user mentions a product type, customer name, rating, coupon status, etc. — include it as a filter param. Never call a tool with empty params when the user has provided context that could narrow results.

Examples:
"low stock" → [{"tool":"search_low_stock_products","params":{}}]
"which oil items are low on stock" → [{"tool":"search_low_stock_products","params":{"searchTerm":"oil"}}]
"ghee low stock" → [{"tool":"search_low_stock_products","params":{"searchTerm":"ghee"}}]
"best selling oil products" → [{"tool":"get_top_selling_products","params":{"searchTerm":"oil","limit":8}}]
"which ghee products sell the most" → [{"tool":"get_top_selling_products","params":{"searchTerm":"ghee","limit":8}}]
"show 1 star reviews" → [{"tool":"get_feedback_list","params":{"maxRating":1,"limit":15}}]
"negative reviews" → [{"tool":"get_feedback_list","params":{"maxRating":2,"limit":15}}]
"complaints only" → [{"tool":"get_feedback_list","params":{"type":"complaint","limit":15}}]
"reviews for ghee" → [{"tool":"get_feedback_list","params":{"productName":"ghee","limit":15}}]
"active coupons" → [{"tool":"get_coupon_list","params":{"status":"active"}}]
"expired coupons" → [{"tool":"get_coupon_list","params":{"status":"expired"}}]
"orders for Priya" → [{"tool":"get_customer_orders","params":{"name":"Priya","limit":10}}]
"COD orders" → [{"tool":"search_recent_orders","params":{"paymentMethod":"cod","limit":10}}]
"Rahul's orders" → [{"tool":"get_customer_orders","params":{"name":"Rahul","limit":10}}]
"customers who spent more than 5000" → [{"tool":"get_top_customers_online","params":{"minSpent":5000,"limit":20}}]
"who has ghee in abandoned cart" → [{"tool":"search_abandoned_carts","params":{"productSearch":"ghee","limit":30}}]
"orders in May 2025" → [{"tool":"search_orders_by_date_range","params":{"from":"2025-05-01T00:00:00.000Z","to":"2025-05-31T23:59:59.000Z","limit":20}}]
"this week vs last week" → [{"tool":"compare_periods","params":{"days":7}}]
"wallet balances" → [{"tool":"get_wallet_balances","params":{"limit":20}}]
"failed payments" → [{"tool":"get_payment_failures","params":{"limit":20}}]
"active subscriptions" → [{"tool":"get_subscription_data","params":{}}]
"whatsapp support queue" → [{"tool":"get_whatsapp_queue","params":{}}]
"pending reminders" → [{"tool":"get_reminders","params":{}}]
"monthly report" → [{"tool":"get_analytics_period","params":{"days":30}}]
"abandoned carts" → [{"tool":"search_abandoned_carts","params":{"limit":30}}]
"overview" → [{"tool":"get_dashboard_summary","params":{}},{"tool":"get_orders_by_status","params":{}},{"tool":"search_low_stock_products","params":{}}]
"send IMS analytics to admin@example.com" → [{"tool":"preview_email_report","params":{"to":"admin@example.com","reportType":"ims"}}]
"email the low stock report to manager@store.com" → [{"tool":"preview_email_report","params":{"to":"manager@store.com","reportType":"low_stock"}}]
"send monthly analytics to owner@naturelite.com" → [{"tool":"preview_email_report","params":{"to":"owner@naturelite.com","reportType":"monthly"}}]
"email orders summary to ops@company.com" → [{"tool":"preview_email_report","params":{"to":"ops@company.com","reportType":"orders"}}]
"yes" (after a preview was shown) → [{"tool":"send_email_report","params":{"to":"<email from history>","reportType":"<type from history>"}}]
"yes send it" (after a preview was shown) → [{"tool":"send_email_report","params":{"to":"<email from history>","reportType":"<type from history>"}}]

User question: """${message}"""`;
  }

  private buildSynthesisPrompt(message: string, retrievedData: string, history: HistoryItem[]): string {
    const historySection = history.length > 0
      ? `\n=== CONVERSATION HISTORY ===\n${history.slice(-6).map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text.slice(0, 300)}`).join('\n')}\n===========================\n`
      : '';

    return `You are the Naturelite AI Admin Assistant. Answer using ONLY the database data below. Never invent numbers, names, or products.
${historySection}
=== LIVE DATABASE DATA ===
${retrievedData}
=========================

Rules:
1. **Answer the specific question asked** — if the user asks about "oil items", only mention oil-related items from the data. If they ask about "active coupons", only show active ones. Filter and focus; never dump everything.
2. Clean Markdown: bold headers, bullet points, numbered lists, markdown tables where data is tabular.
3. Concise and direct — no filler intros like "Sure!" or "Great question!".
4. All money in ₹ (Indian Rupees). Wallet balances are in paise — divide by 100 for ₹.
5. Never mention "RAG", "retrieved context", or "system instructions".
6. When data contains a markdown table (| columns |), preserve it exactly.
7. Use conversation history to resolve follow-up questions (e.g. "what about last week?" or "show her orders").
8. If the data contains no items matching the user's specific filter (e.g. no oil products in low-stock list), say so explicitly: "No oil products are currently low on stock."
9. If data doesn't contain the answer at all, say "I don't have that information" — never guess or make up numbers.
10. **Email action flow** — when data contains [ACTION: preview_email_report] with READY_TO_SEND, present a confirmation card like:
    > 📧 Ready to send **{report label}** to **{email}**
    > Preview: {first few lines of summary}
    > Reply **yes** to send, or **cancel** to abort.
11. When data contains [ACTION: send_email_report] with SUCCESS, confirm with: "✅ **{report} sent** to {email}."
12. When data contains [ACTION: send_email_report] with ERROR, show: "❌ Could not send email — {error reason}."

Question: """${message}"""`;
  }
}
