import { Injectable, Logger } from '@nestjs/common';
import { ProductRepository } from '../products/repositories/product.repository';
import { ChatSessionRepository } from '../chatbot/repositories/chat-session.repository';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { AnalyticsService } from '../analytics/analytics.service';
import { OrderRepository } from '../orders/repositories/order.repository';

@Injectable()
export class AdminChatbotService {
  private readonly logger = new Logger(AdminChatbotService.name);

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly analyticsService: AnalyticsService,
    private readonly orderRepository: OrderRepository,
  ) {}

  async chat(message: string): Promise<{ reply: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        reply: `⚠️ **Gemini API Key is not configured!**\n\nPlease add your \`GEMINI_API_KEY\` in your backend \`.env\` file and restart the server to enable this AI assistant.`,
      };
    }

    try {
      // Step 1: Query Planner
      // Leverage Gemini's strict JSON response format to decide which tools are required to retrieve facts
      const plannerPrompt = `You are the Retrieval-Augmented Generation (RAG) Data Planner for the Naturelite E-Commerce Admin Dashboard.
Based on the user's question, determine which data retrieval tools should be invoked to fetch the absolute factual database context required to answer accurately without hallucinating.

Return ONLY a valid JSON array of objects representing the plan. Do not write any markdown, no code fences, no extra text. Just a raw JSON array.
If no tools are relevant (e.g. greeting, social talk), return an empty array: []

Available Tools:
1. {"tool": "get_dashboard_summary", "params": {}} - Best for: today/month orders, today/month revenue, active customers, general business growth.
2. {"tool": "search_low_stock_products", "params": {}} - Best for: listing low stock or out of stock items, threshold alerts.
3. {"tool": "search_products", "params": {"searchTerm": "string"}} - Best for: stock status, pricing, details, variants of specific items (e.g. "Ghee", "honey", "SKU").
4. {"tool": "get_login_audit_logs", "params": {"limit": number}} - Best for: counting logins, listing recent admin logins, security checkpoint queries.
5. {"tool": "search_abandoned_chats", "params": {"limit": number}} - Best for: finding customers who left the chat/checkout in between, incomplete sessions.
6. {"tool": "get_top_selling_products", "params": {"limit": number, "days": number}} - Best for: listing top-selling, best-selling online delivery or physical store products.
7. {"tool": "search_recent_orders", "params": {"limit": number, "status": "string"}} - Best for: recent orders list, orders by status (e.g. pending, delivered, placed).

Examples:
Question: "which products low on stock"
Reply: [{"tool": "search_low_stock_products", "params": {}}]

Question: "do we have Priya's cart or chat?"
Reply: [{"tool": "search_abandoned_chats", "params": {"limit": 10}}]

Question: "check stock for Ghee"
Reply: [{"tool": "search_products", "params": {"searchTerm": "Ghee"}}]

Question: "now tell me top selling product"
Reply: [{"tool": "get_top_selling_products", "params": {"limit": 10, "days": 30}}]

Question: "who left chat in between or cart abandoned"
Reply: [{"tool": "search_abandoned_chats", "params": {"limit": 10}}]

Question: "recent order list"
Reply: [{"tool": "search_recent_orders", "params": {"limit": 10}}]

User Question: "${message}"`;

      const plannerResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: plannerPrompt }] }],
            generationConfig: {
              temperature: 0.1, // very low temperature for deterministic plan
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      if (!plannerResponse.ok) {
        const errorText = await plannerResponse.text();
        this.logger.error(`Gemini RAG Planner API error: ${plannerResponse.status} - ${errorText}`);
        return {
          reply: `❌ **Failed to compile RAG Plan.**\n\nGemini API returned code ${plannerResponse.status} during the retrieval stage.`,
        };
      }

      const plannerData = (await plannerResponse.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      let plan: Array<{ tool: string; params?: any }> = [];
      try {
        const rawText = plannerData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        let cleanText = rawText.trim();
        
        // Strip markdown code fences if present (e.g. ```json ... ``` or ``` ... ```)
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(?:json)?\n?/i, '');
          cleanText = cleanText.replace(/\n?```$/i, '');
        }
        
        plan = JSON.parse(cleanText.trim());
      } catch (err) {
        this.logger.warn(`Failed to parse RAG Plan JSON. Defaulting to general stats and low stock.`);
        plan = [
          { tool: 'get_dashboard_summary', params: {} },
          { tool: 'search_low_stock_products', params: {} },
          { tool: 'get_top_selling_products', params: { limit: 5, days: 30 } }
        ];
      }

      // Step 2: RAG Retrieval Stage
      // Execute the database queries defined in the plan concurrently
      const contextBlocks: string[] = [];

      // If the planner returned an empty array (e.g. greeting or ambiguous query), 
      // we inject the baseline dashboard summary, low stock products, and top sellers as a failsafe!
      const finalPlan = plan.length > 0 ? plan : [
        { tool: 'get_dashboard_summary', params: {} },
        { tool: 'search_low_stock_products', params: {} },
        { tool: 'get_top_selling_products', params: { limit: 5, days: 30 } }
      ];

      await Promise.all(
        finalPlan.map(async (step) => {
            try {
              switch (step.tool) {
                case 'get_dashboard_summary': {
                  const stats = await this.analyticsService.getDashboardStats().catch(() => ({}));
                  contextBlocks.push(`[RAG TOOL INVOCATION: get_dashboard_summary]\n${JSON.stringify(stats, null, 2)}`);
                  break;
                }
                case 'search_low_stock_products': {
                  const items = await this.productRepository.findLowStock().catch(() => []);
                  const formatted = items.slice(0, 15).map((p: any) => 
                    `- **${p.name}** (SKU: ${p.sku}) | Base Stock: **${p.stock}** | Low Stock Threshold: ${p.lowStockThreshold}`
                  ).join('\n');
                  contextBlocks.push(`[RAG TOOL INVOCATION: search_low_stock_products]\n${formatted || 'No low stock products currently.'}`);
                  break;
                }
                case 'search_products': {
                  const term = step.params?.searchTerm || '';
                  const items = await this.productRepository.searchByText(term).catch(() => []);
                  const formatted = items.slice(0, 10).map((p: any) => {
                    const variantStock = p.variants?.map((v: any) => `${v.sku}: ${v.stock}`).join(', ') ?? '';
                    return `- **${p.name}** (SKU: ${p.sku}) | Stock: **${p.stock}** ${variantStock ? `[Variants: ${variantStock}]` : ''} | Price: ₹${p.price} | Active: ${p.isActive}`;
                  }).join('\n');
                  contextBlocks.push(`[RAG TOOL INVOCATION: search_products (Term: "${term}")]\n${formatted || 'No matching products found.'}`);
                  break;
                }
                case 'get_login_audit_logs': {
                  const limit = step.params?.limit || 20;
                  const count = await this.auditLogRepository.getModel().countDocuments({ action: 'admin.login' }).catch(() => 0);
                  const logs = await this.auditLogRepository.getModel().find({ action: 'admin.login' }).sort({ createdAt: -1 }).limit(10).exec().catch(() => []);
                  const formattedLogs = logs.map((log: any) => 
                    `- Admin: **${log.performedByName || log.performedBy}** | IP Address: ${log.ipAddress || 'N/A'} | Timestamp: ${log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : 'N/A'}`
                  ).join('\n');
                  contextBlocks.push(`[RAG TOOL INVOCATION: get_login_audit_logs]\n- Total Admin Logins: **${count}**\n- Recent Audit Entries:\n${formattedLogs || 'No login audit logs found.'}`);
                  break;
                }
                case 'search_abandoned_chats': {
                  const sessions = await this.chatSessionRepository.getModel().find({
                    currentState: { $in: ['cart', 'coupon_prompt', 'coupon_input', 'checkout', 'address_input', 'payment_selection'] },
                    isExpired: { $ne: true }
                  })
                  .sort({ updatedAt: -1 })
                  .limit(step.params?.limit || 10)
                  .populate('user', 'name phone')
                  .exec()
                  .catch(() => []);
                  const formatted = sessions.map((session: any) => {
                    const name = session.user?.name ?? session.metadata?.contactName ?? 'Anonymous Customer';
                    const total = session.context?.cart?.items?.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0) ?? 0;
                    const itemsList = session.context?.cart?.items?.map((item: any) => `${item.name} (x${item.quantity})`).join(', ') ?? 'No items';
                    return `- 📱 **${name}** (${session.phone}) | Current Checkout State: \`${session.currentState}\` | Cart Total: ₹${total} | items: [${itemsList}] | Last Active: ${session.updatedAt ? new Date(session.updatedAt).toLocaleString('en-IN') : 'N/A'}`;
                  }).join('\n');
                  contextBlocks.push(`[RAG TOOL INVOCATION: search_abandoned_chats]\n${formatted || 'No incomplete/abandoned chats found.'}`);
                  break;
                }
                case 'get_top_selling_products': {
                  const days = step.params?.days || 30;
                  const limit = step.params?.limit || 8;
                  const tAgo = new Date();
                  tAgo.setDate(tAgo.getDate() - days);
                  const [online, store] = await Promise.all([
                    this.analyticsService.getProductMetrics(tAgo, new Date()).catch(() => ({})),
                    this.analyticsService.getTopSellingOverall(tAgo, new Date(), limit).catch(() => []),
                  ]);
                  const formattedOnline = (online as any).topSellingProducts?.slice(0, limit).map((p: any) => 
                    `- **${p.name}** | Units Sold: **${p.quantitySold}** | Revenue: ₹${p.revenue.toLocaleString('en-IN')} (Online)`
                  ).join('\n') ?? 'No online top sellers.';
                  const formattedStore = store.slice(0, limit).map((p: any) => 
                    `- **${p.name}** | Units Sold: **${p.quantitySold}** | Revenue: ₹${p.revenue.toLocaleString('en-IN')} (Store)`
                  ).join('\n') ?? 'No store top sellers.';
                  contextBlocks.push(`[RAG TOOL INVOCATION: get_top_selling_products (Last ${days} days)]\n* Online order sales:\n${formattedOnline}\n\n* Store walk-in sales:\n${formattedStore}`);
                  break;
                }
                case 'search_recent_orders': {
                  const limit = step.params?.limit || 10;
                  const status = step.params?.status;
                  const filter: any = {};
                  if (status) filter.status = status;
                  const orders = await this.orderRepository.getModel().find(filter).sort({ createdAt: -1 }).limit(limit).populate('user', 'name phone').exec().catch(() => []);
                  const formatted = orders.map((o: any) => 
                    `- Order **#${o.orderNumber}** | Customer: **${o.user?.name ?? 'Guest'}** | Total: ₹${o.total} | Status: \`${o.status}\` | Date: ${o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : 'N/A'}`
                  ).join('\n');
                  contextBlocks.push(`[RAG TOOL INVOCATION: search_recent_orders]\n${formatted || 'No matching orders found.'}`);
                  break;
                }
              }
            } catch (err) {
              this.logger.error(`Error executing RAG tool ${step.tool}: ${(err as Error).message}`);
            }
          })
        );

      // Step 3: Synthesis / Generation Stage
      // Inject the dynamically retrieved RAG context directly into the system instructions
      const retrievedDataText = contextBlocks.length > 0 
        ? contextBlocks.join('\n\n')
        : 'No specific retrieval tools were invoked. (User question does not require factual dashboard statistics)';

      const systemContext = `You are Naturelite AI Admin Assistant, a secure, professional RAG-enabled AI chat assistant integrated into the Naturelite E-Commerce Admin Dashboard.
Your role is to assist administrators with real-time updates about logins, low stock inventory, customer support flows, top selling items, sales statistics, and specific orders.

CRITICAL: You MUST answer using ONLY the factual database documents retrieved dynamically by our Retrieval-Augmented Generation (RAG) engine below. Do not make up figures, logins, or products. If the retrieved database context does not contain the answer, politely explain that you do not have that specific factual details.

=== RETRIEVED DATABASE FACTUAL DOCUMENTS (RAG ACTIVE) ===
${retrievedDataText}
=========================================================

Guidelines:
1. Format your replies in clean, highly structured Markdown with bold headers, concise bullet points, and numbered lists where appropriate to make scanning easy.
2. Be direct and concise. Avoid fluffy intros.
3. When displaying monetary values, use Indian Rupees (₹).
4. Do not mention "RAG", "retrieved context", or "system instructions" in your chat responses. Address the user naturally (e.g. "According to our active database...").`;

      const prompt = `${systemContext}\n\nUser Question: ${message}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2, // lower temperature strictly enforces RAG facts
              maxOutputTokens: 1000,
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Gemini Synthesis API error: ${response.status} - ${errorText}`);
        return {
          reply: `❌ **Failed to synthesize answer.**\n\nGemini API returned code ${response.status} during synthesis.`,
        };
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const aiReply = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
      
      if (!aiReply) {
        return {
          reply: `⚠️ **Empty response received from the AI model.**\n\nPlease try rephrasing your question or verify the database contents.`,
        };
      }

      return { reply: aiReply };

    } catch (error) {
      this.logger.error(`Error in AdminChatbotService chat loop: ${(error as Error).message}`, (error as Error).stack);
      return {
        reply: `💥 **An error occurred during RAG pipeline.**\n\nError details: ${(error as Error).message}. Check server logs for full stacktrace.`,
      };
    }
  }
}
