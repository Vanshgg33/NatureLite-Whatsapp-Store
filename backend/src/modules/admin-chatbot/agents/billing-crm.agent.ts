import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration } from '@google/genai';
import { AdminChatbotToolsService } from '../admin-chatbot-tools.service';
import { HistoryItem, historyToContent } from '../agent-utils';
import { FORMAT_RULES } from './format-rules';
import { runToolLoop } from './tool-loop';

const MAX_TOOL_ITERATIONS = 8;

const S = 'STRING' as any;
const N = 'NUMBER' as any;
const O = 'OBJECT' as any;
const B = 'BOOLEAN' as any;

const BILLING_CRM_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_billing_bills',
    description: 'Search B2B billing invoices. Returns the total outstanding across ALL matching bills plus the most recent ones. Use for: "billing invoices", "show bills", "outstanding invoices", "unpaid bills", "bills for [customer]", "bills this month".',
    parameters: {
      type: O,
      properties: {
        invoiceNo: { type: S, description: 'Invoice number e.g. INV-001' },
        customerName: { type: S, description: 'Customer name filter' },
        customerPhone: { type: S, description: 'Customer phone filter' },
        paymentStatus: { type: S, description: 'paid | partial | unpaid' },
        orderTag: { type: S, description: 'B2B | Transport | Home Delivery | Store/Retail | Wholesale | Retail' },
        from: { type: S, description: 'ISO date start (use with to)' },
        to: { type: S, description: 'ISO date end (use with from)' },
        limit: { type: N, description: 'Max bills to list, default 20, max 25' },
      },
    },
  },
  {
    name: 'get_billing_customers',
    description: 'Get billing customers with tags, GST number and outstanding amounts, plus total outstanding across all matches. Use for: "billing customers", "customers with outstanding", "B2B customers", "wholesale customers", "who owes money".',
    parameters: {
      type: O,
      properties: {
        searchTerm: { type: S, description: 'Customer name or phone' },
        tag: { type: S, description: 'B2B | Transport | Wholesale | Retail | Home Delivery | Store/Retail' },
        hasOutstanding: { type: B, description: 'If true, only customers with outstanding > 0' },
        limit: { type: N, description: 'Max results, default 20, max 25' },
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
    description: 'CRM segment counts: how many customers are new, active, due_soon, due_today, overdue, at_risk, dormant, lost. Use for: "CRM overview", "customer health", "how many overdue customers", "at-risk customers count", "dormant customers".',
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
        from: { type: S, description: 'ISO date start (use with to)' },
        to: { type: S, description: 'ISO date end (use with from)' },
        limit: { type: N, description: 'Max results, default 20, max 25' },
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

const BILLING_CRM_SYSTEM_PROMPT = `You are the NatureLite AI Admin Assistant for Billing and CRM — an internal tool for store managers.

You have real-time access to B2B billing invoices, billing customers, CRM customer segments, call logs and WhatsApp campaigns via function calls.

## Non-negotiable rules

ALWAYS call a tool before answering any data question. Never guess, estimate, or infer a number, name, date, or status. If no tool result covers the question, say "No data found."

Call multiple tools in a single turn when a question spans several lookups.

## Tool routing

### Billing
- "billing invoices / bills / unpaid bills / outstanding invoices" → get_billing_bills (paymentStatus="unpaid" or "partial" for outstanding); totalOutstanding covers every matching bill
- "bills for [customer] / invoice INV-XXX" → get_billing_bills(customerName=... or invoiceNo=...)
- "who owes money / customers with outstanding / total outstanding" → get_billing_customers(hasOutstanding=true)
- "B2B customers / wholesale customers" → get_billing_customers(tag="B2B" or "Wholesale")
- "godowns / warehouses" → get_billing_godowns

### CRM
- "CRM overview / customer health / segment counts / how many at-risk or overdue" → get_crm_overview
- "CRM for [customer] / is [customer] overdue / when will [customer] reorder / LTV of [customer]" → get_crm_customer_detail
- "call log / contact history for [customer]" → get_crm_call_logs(customerName=...)
- "callbacks due / pending callbacks" → get_crm_call_logs(outcome="callback")
- "campaigns / WhatsApp campaigns" → get_crm_campaigns

## Precision rules — billing figures

- Report totalOutstanding exactly as given; it covers all matching bills even when only some are listed. Say how many are shown if the list is shorter than totalMatching.
- CRM segments: new, active, due_soon, due_today, overdue, at_risk, dormant, lost, no_orders.

${FORMAT_RULES}`.trim();

/** B2B billing invoices, billing customers, CRM segments, call logs, campaigns. */
@Injectable()
export class BillingCrmAgent {
  private readonly logger = new Logger(BillingCrmAgent.name);

  constructor(private readonly tools: AdminChatbotToolsService) {}

  async run(query: string, history: HistoryItem[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return 'ERROR: GEMINI_API_KEY not set';

    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
      model: process.env.GEMINI_MODEL!,
      history: historyToContent(history),
      config: {
        systemInstruction: BILLING_CRM_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: BILLING_CRM_TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        temperature: 0.1,
        maxOutputTokens: 3000,
      },
    });

    return runToolLoop({
      chat,
      query,
      tools: this.tools,
      logger: this.logger,
      label: 'BillingCrmAgent',
      maxIterations: MAX_TOOL_ITERATIONS,
      emptyReply: 'No billing/CRM data found.',
    });
  }
}
