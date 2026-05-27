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

  async chat(message: string): Promise<{ reply: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        reply: `⚠️ **Gemini API Key is not configured!**\n\nPlease add your \`GEMINI_API_KEY\` in your backend \`.env\` file and restart the server to enable this AI assistant.`,
      };
    }

    try {
      // Step 1: Query Planner
      const plannerPrompt = `You are the Retrieval-Augmented Generation (RAG) Data Planner for the Naturelite E-Commerce Admin Dashboard.
Based on the user's question, determine which data retrieval tools should be invoked to fetch factual database context to answer accurately without hallucinating.

Return ONLY a valid JSON array of objects representing the plan. No markdown, no code fences, no extra text. Just a raw JSON array.
If no tools are relevant (e.g. greeting), return an empty array: []

Available Tools:
1. {"tool": "get_dashboard_summary", "params": {}} - Today/month orders, revenue, active customers, general business overview.
2. {"tool": "search_low_stock_products", "params": {}} - Products running low or out of stock.
3. {"tool": "search_products", "params": {"searchTerm": "string"}} - Stock, price, details of specific products by name/SKU.
4. {"tool": "get_login_audit_logs", "params": {"limit": number}} - Admin login count and recent login audit trail.
5. {"tool": "search_abandoned_chats", "params": {"limit": number}} - Customers who added items to cart but didn't complete the order. Returns name, phone number, cart total, and items. Best for: "who left without ordering", "abandoned carts", "customers stuck in checkout", "who had items in cart".
6. {"tool": "get_top_selling_products", "params": {"limit": number, "days": number}} - Best-selling products online and in store.
7. {"tool": "search_recent_orders", "params": {"limit": number, "status": "string"}} - Recent orders, optionally filtered by status (placed/confirmed/preparing/out_for_delivery/delivered/cancelled).
8. {"tool": "search_customers", "params": {"searchTerm": "string", "limit": number}} - Find customers by name or phone number.
9. {"tool": "get_top_customers_online", "params": {"limit": number}} - Top customers by total online order spending.
10. {"tool": "get_customer_orders", "params": {"phone": "string", "name": "string", "limit": number}} - All orders placed by a specific customer. Provide "phone" if known, OR "name" if only the name is known (not both required).
11. {"tool": "get_revenue_trend", "params": {"days": number}} - Day-by-day revenue and order count for last N days.
12. {"tool": "get_orders_by_status", "params": {}} - Count of orders grouped by each status (placed, confirmed, preparing, delivered, cancelled, etc).
13. {"tool": "get_feedback_list", "params": {"limit": number}} - Recent product reviews and customer feedback with ratings.
14. {"tool": "get_coupon_list", "params": {}} - All active coupons, discount type, usage count, expiry.
15. {"tool": "get_analytics_period", "params": {"days": number}} - Full analytics report for last N days: orders, revenue, customers, chat metrics.
16. {"tool": "get_new_customers", "params": {"days": number}} - Customers who joined in the last N days.

Examples:
Question: "which products low on stock"
Reply: [{"tool": "search_low_stock_products", "params": {}}]

Question: "show me customer Priya"
Reply: [{"tool": "search_customers", "params": {"searchTerm": "Priya", "limit": 5}}]

Question: "what are orders for 9876543210"
Reply: [{"tool": "get_customer_orders", "params": {"phone": "9876543210", "limit": 10}}]

Question: "show Priya's orders"
Reply: [{"tool": "get_customer_orders", "params": {"name": "Priya", "limit": 10}}]

Question: "revenue trend last 7 days"
Reply: [{"tool": "get_revenue_trend", "params": {"days": 7}}]

Question: "how many orders in each status"
Reply: [{"tool": "get_orders_by_status", "params": {}}]

Question: "show me all reviews"
Reply: [{"tool": "get_feedback_list", "params": {"limit": 20}}]

Question: "what coupons do we have"
Reply: [{"tool": "get_coupon_list", "params": {}}]

Question: "weekly analytics"
Reply: [{"tool": "get_analytics_period", "params": {"days": 7}}]

Question: "new customers this week"
Reply: [{"tool": "get_new_customers", "params": {"days": 7}}]

Question: "who are our best customers"
Reply: [{"tool": "get_top_customers_online", "params": {"limit": 10}}]

Question: "give me an overview"
Reply: [{"tool": "get_dashboard_summary", "params": {}}, {"tool": "get_orders_by_status", "params": {}}, {"tool": "search_low_stock_products", "params": {}}]

User Question: "${message}"`;

      const plannerResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: plannerPrompt }] }],
            generationConfig: {
              temperature: 0.1,
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
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(?:json)?\n?/i, '');
          cleanText = cleanText.replace(/\n?```$/i, '');
        }
        plan = JSON.parse(cleanText.trim());
      } catch (err) {
        this.logger.warn(`Failed to parse RAG Plan JSON. Defaulting to general stats.`);
        plan = [
          { tool: 'get_dashboard_summary', params: {} },
          { tool: 'search_low_stock_products', params: {} },
          { tool: 'get_top_selling_products', params: { limit: 5, days: 30 } },
        ];
      }

      // Step 2: RAG Retrieval Stage
      const contextBlocks: string[] = [];

      const finalPlan = plan.length > 0 ? plan : [
        { tool: 'get_dashboard_summary', params: {} },
        { tool: 'get_orders_by_status', params: {} },
        { tool: 'search_low_stock_products', params: {} },
      ];

      await Promise.all(
        finalPlan.map(async (step) => {
          try {
            switch (step.tool) {

              case 'get_dashboard_summary': {
                const stats = await this.analyticsService.getDashboardStats().catch(() => ({}));
                contextBlocks.push(`[RAG: get_dashboard_summary]\n${JSON.stringify(stats, null, 2)}`);
                break;
              }

              case 'search_low_stock_products': {
                const items = await this.productRepository.findLowStock().catch(() => []);
                const formatted = items.slice(0, 15).map((p: any) =>
                  `- **${p.name}** (SKU: ${p.sku}) | Stock: **${p.stock}** | Low Stock Threshold: ${p.lowStockThreshold}`
                ).join('\n');
                contextBlocks.push(`[RAG: search_low_stock_products]\n${formatted || 'No low stock products currently.'}`);
                break;
              }

              case 'search_products': {
                const term = step.params?.searchTerm || '';
                const items = await this.productRepository.searchByText(term).catch(() => []);
                const formatted = items.slice(0, 10).map((p: any) => {
                  const variantStock = p.variants?.map((v: any) => `${v.sku}: ${v.stock}`).join(', ') ?? '';
                  return `- **${p.name}** (SKU: ${p.sku}) | Stock: **${p.stock}** ${variantStock ? `[Variants: ${variantStock}]` : ''} | Price: ₹${p.price} | Active: ${p.isActive}`;
                }).join('\n');
                contextBlocks.push(`[RAG: search_products (Term: "${term}")]\n${formatted || 'No matching products found.'}`);
                break;
              }

              case 'get_login_audit_logs': {
                const count = await this.auditLogRepository.getModel().countDocuments({ action: 'admin.login' }).catch(() => 0);
                const logs = await this.auditLogRepository.getModel().find({ action: 'admin.login' }).sort({ createdAt: -1 }).limit(10).exec().catch(() => []);
                const formattedLogs = logs.map((log: any) =>
                  `- Admin: **${log.performedByName || log.performedBy}** | IP: ${log.ipAddress || 'N/A'} | Time: ${log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : 'N/A'}`
                ).join('\n');
                contextBlocks.push(`[RAG: get_login_audit_logs]\n- Total Admin Logins: **${count}**\n- Recent Entries:\n${formattedLogs || 'No login audit logs found.'}`);
                break;
              }

              case 'search_abandoned_chats': {
                const limit = step.params?.limit || 30;
                // 60-minute threshold: carts active within the last hour are likely still shopping
                const cutoff = new Date(Date.now() - 60 * 60 * 1000);

                // Single aggregation that:
                // 1. Only carts with items, not touched in 60+ min (excludes active shoppers)
                // 2. Joins orders to exclude customers who placed an order after their last cart activity
                // 3. Joins user for name + phone
                const abandonedCarts = await this.cartRepository.getModel().aggregate([
                  {
                    $match: {
                      'items.0': { $exists: true },
                      updatedAt: { $lt: cutoff },
                    },
                  },
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
                  // Exclude blocked users
                  { $match: { 'userInfo.isBlocked': { $ne: true } } },
                  {
                    // Check if user placed a non-cancelled order AFTER cart was last updated
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
                  // Only keep carts where no order was placed after the cart was last updated
                  { $match: { ordersAfterCart: { $size: 0 } } },
                  { $sort: { updatedAt: -1 } },
                  { $limit: limit },
                ]).exec().catch(() => []);

                // Secondary: active sessions stuck in checkout with no cart found
                // (users currently in the flow but no cart record yet)
                const sessionCutoff = new Date(Date.now() - 60 * 60 * 1000);
                const coveredPhones = new Set(
                  abandonedCarts.map((c: any) => c.userInfo?.phone).filter(Boolean)
                );
                const stuckSessions = await this.chatSessionRepository.getModel()
                  .find({
                    currentState: { $in: ['cart', 'coupon_prompt', 'coupon_input', 'checkout', 'address_input', 'payment_selection'] },
                    isExpired: { $ne: true },
                    lastMessageAt: { $lt: sessionCutoff },
                  })
                  .sort({ lastMessageAt: -1 })
                  .limit(20)
                  .populate('user', 'name phone')
                  .exec()
                  .catch(() => []);

                const cartFormatted = abandonedCarts.map((cart: any) => {
                  const name = cart.userInfo?.name || 'Unknown Customer';
                  const phone = cart.userInfo?.phone || 'No Phone';
                  const itemsList = cart.items.map((item: any) => `${item.name} (x${item.quantity})`).join(', ');
                  const lastActive = cart.updatedAt ? new Date(cart.updatedAt).toLocaleString('en-IN') : 'N/A';
                  const coupon = cart.couponCode ? ` | Coupon: ${cart.couponCode}` : '';
                  const hoursAgo = Math.round((Date.now() - new Date(cart.updatedAt).getTime()) / 3600000);
                  return `- 📱 **${name}** | Phone: **${phone}** | Cart: ₹${(cart.total || 0).toLocaleString('en-IN')} | Items: [${itemsList}]${coupon} | Abandoned ~${hoursAgo}h ago`;
                });

                const sessionFormatted = stuckSessions
                  .filter((s: any) => {
                    const phone = (s.user as any)?.phone || s.phone;
                    return !coveredPhones.has(phone);
                  })
                  .map((session: any) => {
                    const name = (session.user as any)?.name || session.metadata?.contactName || 'Unknown';
                    const phone = session.phone;
                    const minsAgo = Math.round((Date.now() - new Date(session.lastMessageAt || session.updatedAt).getTime()) / 60000);
                    return `- 📱 **${name}** | Phone: **${phone}** | Stuck at: \`${session.currentState}\` | Silent for ~${minsAgo} min`;
                  });

                const allFormatted = [...cartFormatted, ...sessionFormatted];

                contextBlocks.push(
                  `[RAG: search_abandoned_chats]\nCustomers who had items in cart but did NOT complete an order: **${allFormatted.length}**\n(Threshold: inactive for 60+ minutes, orders placed after cart activity are excluded)\n\n${allFormatted.join('\n') || 'No abandoned carts found.'}`
                );
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
                  `- **${p.name}** | Units Sold: **${p.quantitySold}** | Revenue: ₹${(p.revenue || 0).toLocaleString('en-IN')} (Online)`
                ).join('\n') || 'No online top sellers.';
                const formattedStore = store.slice(0, limit).map((p: any) =>
                  `- **${p.name}** | Units Sold: **${p.quantitySold}** | Revenue: ₹${(p.revenue || 0).toLocaleString('en-IN')} (Store)`
                ).join('\n') || 'No store top sellers.';
                contextBlocks.push(`[RAG: get_top_selling_products (Last ${days} days)]\n* Online:\n${formattedOnline}\n\n* Store Walk-in:\n${formattedStore}`);
                break;
              }

              case 'search_recent_orders': {
                const limit = step.params?.limit || 10;
                // Normalize legacy/alias status values the planner might send
                const STATUS_MAP: Record<string, string> = {
                  shipped: 'out_for_delivery',
                  pending: 'placed',
                  processing: 'preparing',
                  dispatched: 'out_for_delivery',
                  completed: 'delivered',
                  done: 'delivered',
                };
                const rawStatus = step.params?.status as string | undefined;
                const status = rawStatus ? (STATUS_MAP[rawStatus.toLowerCase()] ?? rawStatus.toLowerCase()) : undefined;
                const filter: any = {};
                if (status) filter.status = status;
                const orders = await this.orderRepository.getModel()
                  .find(filter)
                  .sort({ createdAt: -1 })
                  .limit(limit)
                  .populate('user', 'name phone')
                  .exec()
                  .catch(() => []);
                const formatted = orders.map((o: any) =>
                  `- Order **#${o.orderNumber}** | Customer: **${o.user?.name ?? 'Guest'}** (${o.user?.phone ?? ''}) | Total: ₹${o.total} | Status: \`${o.status}\` | Payment: ${o.paymentMethod} | Date: ${o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : 'N/A'}`
                ).join('\n');
                contextBlocks.push(`[RAG: search_recent_orders${status ? ` (status: ${status})` : ''}]\n${formatted || 'No orders found.'}`);
                break;
              }

              case 'search_customers': {
                const term = (step.params?.searchTerm || '').trim();
                const limit = step.params?.limit || 10;
                // Escape special regex chars to prevent injection / query errors
                const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const customers = await this.userRepository.getModel()
                  .find(escapedTerm ? {
                    $or: [
                      { name: { $regex: escapedTerm, $options: 'i' } },
                      { phone: { $regex: escapedTerm, $options: 'i' } },
                      { email: { $regex: escapedTerm, $options: 'i' } },
                    ],
                  } : {})
                  .sort({ totalSpent: -1 })
                  .limit(limit)
                  .exec()
                  .catch(() => []);
                const formatted = customers.map((c: any) =>
                  `- **${c.name || 'Unnamed'}** | Phone: ${c.phone || 'N/A'} | Email: ${c.email || 'N/A'} | Total Orders: ${c.totalOrders} | Total Spent: ₹${(c.totalSpent || 0).toLocaleString('en-IN')} | Status: ${c.isBlocked ? 'Blocked' : c.isActive ? 'Active' : 'Inactive'} | Joined: ${c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : 'N/A'}`
                ).join('\n');
                contextBlocks.push(`[RAG: search_customers${term ? ` (search: "${term}")` : ''}]\n${formatted || 'No matching customers found.'}`);
                break;
              }

              case 'get_top_customers_online': {
                const limit = step.params?.limit || 10;
                const customers = await this.userRepository.getModel()
                  .find({ totalOrders: { $gt: 0 } })
                  .sort({ totalSpent: -1 })
                  .limit(limit)
                  .exec()
                  .catch(() => []);
                const formatted = customers.map((c: any, i: number) =>
                  `${i + 1}. **${c.name || 'Unnamed'}** (${c.phone || 'N/A'}) | Orders: ${c.totalOrders} | Total Spent: ₹${(c.totalSpent || 0).toLocaleString('en-IN')} | Last Order: ${c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('en-IN') : 'N/A'}`
                ).join('\n');
                contextBlocks.push(`[RAG: get_top_customers_online (Top ${limit})]\n${formatted || 'No customer spending data found.'}`);
                break;
              }

              case 'get_customer_orders': {
                const phone = (step.params?.phone || '').trim();
                const name = (step.params?.name || '').trim();
                const limit = step.params?.limit || 10;
                let user: any = null;

                if (phone) {
                  // Exact match first, then partial (handles +91 prefix differences)
                  user = await this.userRepository.findOneByPhone(phone).catch(() => null);
                  if (!user) {
                    const escapedPhone = phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    user = await this.userRepository.getModel()
                      .findOne({ phone: { $regex: escapedPhone, $options: 'i' } })
                      .exec()
                      .catch(() => null);
                  }
                }

                // Fallback: look up by name if phone lookup failed or no phone provided
                if (!user && name) {
                  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  user = await this.userRepository.getModel()
                    .findOne({ name: { $regex: escapedName, $options: 'i' } })
                    .sort({ totalOrders: -1 })
                    .exec()
                    .catch(() => null);
                }

                if (!user) {
                  contextBlocks.push(`[RAG: get_customer_orders]\nNo customer found with ${phone ? `phone: ${phone}` : `name: ${name}`}. Try using search_customers first to find the correct phone number.`);
                  break;
                }
                const orders = await this.orderRepository.getModel()
                  .find({ user: user._id })
                  .sort({ createdAt: -1 })
                  .limit(limit)
                  .exec()
                  .catch(() => []);
                const formatted = orders.map((o: any) =>
                  `- Order **#${o.orderNumber}** | Total: ₹${o.total} | Status: \`${o.status}\` | Payment: ${o.paymentMethod} (${o.paymentStatus}) | Date: ${o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : 'N/A'}`
                ).join('\n');
                contextBlocks.push(`[RAG: get_customer_orders for ${user.name || phone}]\nCustomer: **${user.name || 'Unnamed'}** | Phone: ${user.phone} | Total Orders: ${user.totalOrders} | Total Spent: ₹${(user.totalSpent || 0).toLocaleString('en-IN')}\n\nOrder History:\n${formatted || 'No orders found.'}`);
                break;
              }

              case 'get_revenue_trend': {
                const days = step.params?.days || 14;
                const trend = await this.analyticsService.getRevenueByDay(days).catch(() => []);
                const formatted = trend.map((d: any) =>
                  `- ${d.date} | Revenue: ₹${(d.revenue || 0).toLocaleString('en-IN')} | Orders: ${d.orders}`
                ).join('\n');
                const totalRev = (trend as any[]).reduce((s: number, d: any) => s + (d.revenue || 0), 0);
                const totalOrds = (trend as any[]).reduce((s: number, d: any) => s + (d.orders || 0), 0);
                contextBlocks.push(`[RAG: get_revenue_trend (Last ${days} days)]\nTotal Revenue: ₹${totalRev.toLocaleString('en-IN')} | Total Orders: ${totalOrds}\n\nDay-by-Day:\n${formatted || 'No revenue data.'}`);
                break;
              }

              case 'get_orders_by_status': {
                const statusCounts = await this.orderRepository.getOrdersByStatus().catch(() => ({}));
                const formatted = Object.entries(statusCounts).map(([status, count]) =>
                  `- \`${status}\`: **${count}** orders`
                ).join('\n');
                const total = Object.values(statusCounts).reduce((s: number, c: any) => s + (c || 0), 0);
                contextBlocks.push(`[RAG: get_orders_by_status]\nTotal Orders All Time: **${total}**\n\nBreakdown:\n${formatted || 'No order data.'}`);
                break;
              }

              case 'get_feedback_list': {
                const limit = step.params?.limit || 15;
                const feedbacks = await this.feedbackRepository.getModel()
                  .find({})
                  .populate('user', 'name phone')
                  .populate('product', 'name')
                  .sort({ createdAt: -1 })
                  .limit(limit)
                  .lean()
                  .exec()
                  .catch(() => []);
                const formatted = feedbacks.map((f: any) => {
                  const stars = f.rating ? `⭐ ${f.rating}/5` : '';
                  const customer = f.user?.name || 'Anonymous';
                  const product = f.product?.name || 'General';
                  return `- **${customer}** on **${product}** ${stars} | Type: ${f.type} | Status: ${f.status} | "${f.message?.slice(0, 100) || 'No message'}" | Date: ${f.createdAt ? new Date(f.createdAt).toLocaleDateString('en-IN') : 'N/A'}`;
                }).join('\n');
                contextBlocks.push(`[RAG: get_feedback_list]\n${formatted || 'No feedback found.'}`);
                break;
              }

              case 'get_coupon_list': {
                const coupons = await this.couponRepository.getModel()
                  .find({})
                  .sort({ createdAt: -1 })
                  .limit(20)
                  .exec()
                  .catch(() => []);
                const now = new Date();
                const formatted = coupons.map((c: any) => {
                  const isExpired = c.validUntil && new Date(c.validUntil) < now;
                  const isActive = c.isActive && !isExpired;
                  const discount = c.discountType === 'percentage' ? `${c.discountValue}% off` : `₹${c.discountValue} off`;
                  const usage = c.maxUsageCount ? `${c.usedCount || 0}/${c.maxUsageCount} used` : `${c.usedCount || 0} used (unlimited)`;
                  return `- **${c.code}** | ${discount} | ${usage} | Status: ${isActive ? '✅ Active' : isExpired ? '❌ Expired' : '⏸ Inactive'} | Min Order: ₹${c.minOrderAmount || 0} | Valid Until: ${c.validUntil ? new Date(c.validUntil).toLocaleDateString('en-IN') : 'No expiry'}`;
                }).join('\n');
                contextBlocks.push(`[RAG: get_coupon_list]\n${formatted || 'No coupons found.'}`);
                break;
              }

              case 'get_analytics_period': {
                const days = step.params?.days || 30;
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - days);
                const [orders, customers, products, chat, topSellers, topCustomers] = await Promise.all([
                  this.analyticsService.getOrderMetrics(startDate, endDate).catch(() => ({})),
                  this.analyticsService.getCustomerMetrics(startDate, endDate).catch(() => ({})),
                  this.analyticsService.getProductMetrics(startDate, endDate).catch(() => ({})),
                  this.analyticsService.getChatMetrics(startDate, endDate).catch(() => ({})),
                  this.analyticsService.getTopSellingOverall(startDate, endDate, 5).catch(() => []),
                  this.analyticsService.getTopCustomersOverall(5).catch(() => []),
                ]);
                const o = orders as any;
                const c = customers as any;
                const p = products as any;
                const m = chat as any;
                const topSellersFormatted = topSellers.slice(0, 5).map((ps: any, i: number) =>
                  `  ${i + 1}. **${ps.name}** — ${ps.quantitySold} units sold, ₹${(ps.revenue || 0).toLocaleString('en-IN')}`
                ).join('\n') || '  No sales data for this period.';
                const topCustomersFormatted = topCustomers.slice(0, 5).map((tc: any, i: number) =>
                  `  ${i + 1}. **${tc.customerName || 'Unknown'}** (${tc._id || ''}) — ₹${(tc.totalSpent || 0).toLocaleString('en-IN')}, ${tc.totalOrders} orders`
                ).join('\n') || '  No customer data for this period.';
                const summary = [
                  `Period: Last ${days} days (${startDate.toLocaleDateString('en-IN')} – ${endDate.toLocaleDateString('en-IN')})`,
                  ``,
                  `**Orders:** ${o.totalOrders || 0} total | ₹${(o.totalRevenue || 0).toLocaleString('en-IN')} revenue | AOV: ₹${Math.round(o.avgOrderValue || 0)}`,
                  `**Order Status:** ${o.completedOrders || 0} delivered | ${o.pendingOrders || 0} pending | ${o.cancelledOrders || 0} cancelled`,
                  `**Payment Mix:** ${o.codOrders || 0} COD | ${o.prepaidOrders || 0} prepaid`,
                  `**Customers:** ${c.totalCustomers || 0} total | +${c.newCustomers || 0} new | ${c.returningCustomers || 0} returning | ${c.activeCustomers || 0} active`,
                  `**Inventory:** ${p.totalProducts || 0} products | ${p.activeProducts || 0} active | ${p.outOfStockProducts || 0} out of stock | ${p.lowStockProducts || 0} low stock`,
                  `**WhatsApp Chat:** ${m.totalSessions || 0} sessions | ${m.totalMessages || 0} messages | ${m.supportHandoffs || 0} support handoffs`,
                  ``,
                  `**Top Selling Products (period):**`,
                  topSellersFormatted,
                  ``,
                  `**Top Customers (all time):**`,
                  topCustomersFormatted,
                ].join('\n');
                contextBlocks.push(`[RAG: get_analytics_period]\n${summary}`);
                break;
              }

              case 'get_new_customers': {
                const days = step.params?.days || 7;
                const since = new Date();
                since.setDate(since.getDate() - days);
                const customers = await this.userRepository.getModel()
                  .find({ createdAt: { $gte: since } })
                  .sort({ createdAt: -1 })
                  .limit(20)
                  .exec()
                  .catch(() => []);
                const count = await this.userRepository.getModel().countDocuments({ createdAt: { $gte: since } }).catch(() => 0);
                const formatted = customers.map((c: any) =>
                  `- **${c.name || 'Unnamed'}** | Phone: ${c.phone || 'N/A'} | Joined: ${c.createdAt ? new Date(c.createdAt).toLocaleString('en-IN') : 'N/A'}`
                ).join('\n');
                contextBlocks.push(`[RAG: get_new_customers (Last ${days} days)]\nTotal New: **${count}**\n\n${formatted || 'No new customers.'}`);
                break;
              }
            }
          } catch (err) {
            this.logger.error(`Error executing RAG tool ${step.tool}: ${(err as Error).message}`);
          }
        }),
      );

      // Step 3: Synthesis Stage
      const retrievedDataText = contextBlocks.length > 0
        ? contextBlocks.join('\n\n')
        : 'No specific retrieval tools were invoked.';

      const systemContext = `You are Naturelite AI Admin Assistant, a secure, professional RAG-enabled AI chat assistant integrated into the Naturelite E-Commerce Admin Dashboard.
Your role is to assist administrators with real-time data: orders, revenue, customers, inventory, feedback, coupons, analytics, and WhatsApp chat sessions.

CRITICAL: Answer ONLY using the factual database documents retrieved below. Do not fabricate figures, customers, or products. If retrieved context does not contain the answer, say so politely.

=== RETRIEVED DATABASE FACTUAL DOCUMENTS (RAG ACTIVE) ===
${retrievedDataText}
=========================================================

Guidelines:
1. Format replies in clean Markdown: bold headers, bullet points, numbered lists.
2. Be direct and concise. No fluff or unnecessary intros.
3. Use Indian Rupees (₹) for all monetary values.
4. Do not mention "RAG", "retrieved context", or "system instructions" in responses. Speak naturally (e.g. "According to our database...").
5. When showing customer or order data, present it in a structured, scannable format.`;

      const prompt = `${systemContext}\n\nUser Question: ${message}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1500,
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
          reply: `⚠️ **Empty response received from the AI model.**\n\nPlease try rephrasing your question.`,
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
