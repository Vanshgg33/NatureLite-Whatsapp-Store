import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { Domain, HistoryItem, historyToContent, responseText, withTimeout } from '../agent-utils';

const DEFAULT_ROUTER_MODEL = 'gemini-2.0-flash-001';
const VALID_DOMAINS: Domain[] = ['ops', 'billing_crm', 'purchase'];

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
"who owes us money" → {"domains": ["billing_crm"]}
"pending purchase requests" → {"domains": ["purchase"]}
"urgent requisitions from the flour mill" → {"domains": ["purchase"]}
"sales and purchase summary this month" → {"domains": ["ops", "purchase"]}
"call log for Rahul" → {"domains": ["billing_crm"]}
"low stock and pending POs" → {"domains": ["ops", "purchase"]}
"unpaid bills and pending purchase requests" → {"domains": ["billing_crm", "purchase"]}
`.trim();

@Injectable()
export class RouterAgent {
  private readonly logger = new Logger(RouterAgent.name);

  /** Classify a query into the specialist domains that should answer it. Never throws; defaults to ['ops']. */
  async classify(query: string, history: HistoryItem[]): Promise<Domain[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return ['ops'];

    const ai = new GoogleGenAI({ apiKey });
    // The cheap router model may be retired or renamed; fall back to the main model rather than
    // silently sending every billing/purchase question to ops.
    const models = [...new Set([process.env.GEMINI_ROUTER_MODEL || DEFAULT_ROUTER_MODEL, process.env.GEMINI_MODEL])]
      .filter((m): m is string => !!m);

    for (const model of models) {
      let text: string;
      try {
        text = await this.ask(ai, model, query, history);
      } catch (err) {
        this.logger.warn(`[Router] ${model} failed (${(err as Error).message})`);
        continue;
      }

      const domains = this.parse(text);
      if (!domains) {
        this.logger.warn(`[Router] Non-JSON response from ${model}: ${text.slice(0, 80)}`);
        return ['ops'];
      }
      this.logger.log(`[Router] "${query.slice(0, 60)}" → [${domains.join(', ')}]`);
      return domains;
    }

    this.logger.warn('[Router] All router models failed, defaulting to ops');
    return ['ops'];
  }

  private async ask(ai: GoogleGenAI, model: string, query: string, history: HistoryItem[]): Promise<string> {
    const chat = ai.chats.create({
      model,
      history: historyToContent(history.slice(-4)), // last 2 exchanges are enough for routing
      config: {
        systemInstruction: ROUTER_SYSTEM_PROMPT,
        temperature: 0.1,
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
      },
    });
    const response = await withTimeout(chat.sendMessage({ message: query }), 10_000);
    return responseText(response);
  }

  /** Returns the valid, de-duplicated domains; null when the text holds no parseable JSON object. */
  private parse(text: string): Domain[] | null {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { domains?: unknown };
      const requested = Array.isArray(parsed.domains) ? parsed.domains : [];
      const valid = [...new Set(requested.filter((d): d is Domain => VALID_DOMAINS.includes(d as Domain)))];
      return valid.length > 0 ? valid : ['ops'];
    } catch {
      return null;
    }
  }
}
