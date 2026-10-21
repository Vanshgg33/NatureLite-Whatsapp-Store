import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_ADMIN, ADMIN_JOBS, QUEUE_CHATBOT, CHATBOT_JOBS, DEFAULT_JOB_OPTIONS } from '../queues/queues.constants';
import { AdminChatSessionRepository } from './repositories/admin-chat-session.repository';
import { AdminChatbotToolsService } from './admin-chatbot-tools.service';
import { RouterAgent } from './agents/router.agent';
import { OpsAgent } from './agents/ops.agent';
import { BillingCrmAgent } from './agents/billing-crm.agent';
import { PurchaseAgent } from './agents/purchase.agent';
import { SynthesizerAgent } from './agents/synthesizer.agent';
import { AgentOutput, Domain, HistoryItem } from './agent-utils';
import { EmailService } from '../email/email.service';

export type { HistoryItem };

const DOMAIN_LABEL: Record<Domain, string> = {
  ops: 'operations',
  billing_crm: 'billing/CRM',
  purchase: 'purchase',
};

/**
 * Admin chatbot entry point. A RouterAgent picks the domains a question touches, the matching
 * specialist agents (ops, billing/CRM, purchase) fetch data in parallel, and — only when more
 * than one answered — a SynthesizerAgent merges their replies.
 */
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
    private readonly emailService: EmailService,
    @InjectQueue(QUEUE_ADMIN) private readonly adminQueue: Queue,
    @InjectQueue(QUEUE_CHATBOT) private readonly chatbotQueue: Queue,
  ) {}

  // ─── Core orchestration ──────────────────────────────────────────────────────

  /**
   * Answer one question. `notice` is a warning for the admin (e.g. a specialist failed); it is shown
   * but kept out of the saved history so later turns don't treat it as something the assistant said.
   */
  private async orchestrate(message: string, history: HistoryItem[]): Promise<{ reply: string; notice: string }> {
    const domains = await this.router.classify(message, history);
    this.logger.log(`[Orchestrator] domains=[${domains.join(', ')}] for "${message.slice(0, 60)}"`);

    const specialists: Record<Domain, { run(q: string, h: HistoryItem[]): Promise<string> }> = {
      ops: this.opsAgent,
      billing_crm: this.billingCrmAgent,
      purchase: this.purchaseAgent,
    };

    // allSettled: one specialist failing must not discard the others' data.
    const settled = await Promise.allSettled(
      domains.map(async (domain): Promise<AgentOutput> => ({ domain, data: await specialists[domain].run(message, history) })),
    );

    const outputs: AgentOutput[] = [];
    const failed: Domain[] = [];
    settled.forEach((result, i) => {
      const domain = domains[i];
      if (result.status === 'fulfilled' && result.value.data && !result.value.data.startsWith('ERROR:')) {
        outputs.push(result.value);
        return;
      }
      failed.push(domain);
      const why = result.status === 'rejected' ? (result.reason as Error)?.message : result.value.data;
      this.logger.warn(`[Orchestrator] ${domain} agent failed: ${why}`);
    });

    if (outputs.length === 0) return { reply: '⚠️ Could not fetch data. Please try again.', notice: '' };

    // A single specialist's reply is already a finished answer; skip the extra LLM call.
    const reply = outputs.length === 1
      ? outputs[0].data
      : await this.synthesizer.synthesize(message, outputs, history);

    if (failed.length === 0) return { reply, notice: '' };
    const missing = failed.map((d) => DOMAIN_LABEL[d]).join(' and ');
    return { reply, notice: `⚠️ Couldn't fetch ${missing} data just now, so this answer is incomplete.` };
  }

  /** Orchestrate, save the clean answer for a signed-in admin, and return the text to show them. */
  private async respond(message: string, adminId: string | undefined, clientHistory: HistoryItem[]): Promise<string> {
    const { reply, notice } = await this.orchestrate(message, await this.resolveHistory(adminId, clientHistory));
    if (adminId) await this.persistSession(adminId, message, reply);
    return notice ? `${reply}\n\n${notice}` : reply;
  }

  /** Server-side session history for a signed-in admin; otherwise whatever the client sent. */
  private async resolveHistory(adminId: string | undefined, clientHistory: HistoryItem[]): Promise<HistoryItem[]> {
    if (!adminId) return clientHistory;
    try {
      const session = await this.adminChatSessionRepository.getByAdminId(adminId);
      const messages = (session?.messages ?? []).slice(-24); // last 12 exchanges
      return messages.map((m: any) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        text: m.text as string,
      }));
    } catch {
      return [];
    }
  }

  private async persistSession(adminId: string, userMsg: string, reply: string) {
    const ts = new Date().toISOString();
    await this.adminChatSessionRepository.appendMessages(adminId, [
      { id: `${Date.now()}-u`, sender: 'user', text: userMsg, timestamp: ts },
      { id: `${Date.now()}-a`, sender: 'assistant', text: reply, timestamp: ts },
    ]).catch(() => {});
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  async chat(
    message: string,
    history: HistoryItem[],
    adminId: string | undefined,
  ): Promise<{ reply: string }> {
    try {
      const reply = await this.respond(this.tools.sanitize(message), adminId, history);
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
      const reply = await this.respond(this.tools.sanitize(message), adminId, history);
      res.write(`data: ${JSON.stringify({ delta: reply })}\n\n`);
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
      { message: this.tools.sanitize(message), history, adminId },
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
      const reply = await this.respond(data.message, data.adminId, data.history);
      return { reply };
    } catch (err) {
      this.logger.error(`_executeChatQuery error: ${(err as Error).message}`);
      return { reply: '⚠️ Something went wrong.' };
    }
  }

  async getBriefing(): Promise<Record<string, string | null>> {
    const [dashboard, statusCounts, lowStock] = await Promise.allSettled([
      this.tools.execute('get_dashboard_summary', {}),
      this.tools.execute('get_orders_by_status', {}),
      this.tools.execute('get_products_by_stock', { status: 'low' }),
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

  // ─── Startup & scheduled daily report ─────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    // Build the ops agent's Gemini context cache in the background; boot never waits on it.
    this.opsAgent.warmUp().catch(() => {});

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
}
