import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration } from '@google/genai';
import { AdminChatbotToolsService } from '../admin-chatbot-tools.service';
import { HistoryItem, historyToContent } from '../agent-utils';
import { FORMAT_RULES } from './format-rules';
import { runToolLoop } from './tool-loop';

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
        stage: { type: S, description: 'Where the request is in the pipeline: NEEDS_PO | AWAITING_APPROVAL | AWAITING_DELIVERY | PARTLY_RECEIVED | READY_TO_CLOSE | CLOSED | CANCELLED' },
        department: { type: S, description: 'FLOUR_MILL | OIL_PRESS | PACKING | STORE | OTHER' },
        priority: { type: S, description: 'NORMAL | URGENT' },
        from: { type: S, description: 'ISO date start (use with to)' },
        to: { type: S, description: 'ISO date end (use with from)' },
        limit: { type: N, description: 'Max results, default 20, max 25' },
      },
    },
  },
  {
    name: 'get_purchase_request_detail',
    description: 'Get full detail of one purchase request including all line items, PO summary, who raised/approved/received it, and recent timeline.',
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
    description: 'List raw materials that can be procured, with unit of measure, category and last purchase rate.',
    parameters: {
      type: O,
      properties: {
        searchTerm: { type: S, description: 'Material name filter' },
      },
    },
  },
];

const PURCHASE_SYSTEM_PROMPT = `You are the NatureLite AI Admin Assistant for Purchase and Procurement — an internal tool for store managers.

You have real-time access to purchase requests, the PO pipeline, vendors and procurable materials via function calls.

## Non-negotiable rules

ALWAYS call a tool before answering any data question. Never guess, estimate, or infer a number, name, date, or status. If no tool result covers the question, say "No data found."

Call multiple tools in a single turn when a question spans several lookups.

## Tool routing

- "purchase requests / pending PRs / what needs procurement" → get_purchase_requests (no filter lists everything recent; use stage="NEEDS_PO" for requests still waiting for a PO)
- "waiting for approval" → get_purchase_requests(stage="AWAITING_APPROVAL")
- "waiting for delivery / not received yet" → get_purchase_requests(stage="AWAITING_DELIVERY")
- "urgent requisitions" → get_purchase_requests(priority="URGENT")
- "approved PRs / approved POs" → get_purchase_requests(status="APPROVED")
- "[department] requests" → get_purchase_requests(department=FLOUR_MILL | OIL_PRESS | PACKING | STORE | OTHER)
- "PR detail / full PR for [reqNo]" → get_purchase_request_detail(reqNo=...)
- "vendors / supplier list / who do we buy from" → get_purchase_vendors
- "materials / what raw materials can we procure / last rate for [material]" → get_purchase_materials

${FORMAT_RULES}`.trim();

/** Purchase requests, PO pipeline, vendors and procurable materials. */
@Injectable()
export class PurchaseAgent {
  private readonly logger = new Logger(PurchaseAgent.name);

  constructor(private readonly tools: AdminChatbotToolsService) {}

  async run(query: string, history: HistoryItem[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return 'ERROR: GEMINI_API_KEY not set';

    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
      model: process.env.GEMINI_MODEL!,
      history: historyToContent(history),
      config: {
        systemInstruction: PURCHASE_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: PURCHASE_TOOL_DECLARATIONS }],
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
      label: 'PurchaseAgent',
      maxIterations: MAX_TOOL_ITERATIONS,
      emptyReply: 'No purchase data found.',
    });
  }
}
