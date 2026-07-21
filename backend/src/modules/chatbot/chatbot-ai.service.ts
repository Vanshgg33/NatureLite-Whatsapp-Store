import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  FunctionCallingMode,
  type Part,
} from '@google/generative-ai';
import type { ChatSessionDocument } from './schemas/chat-session.schema';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { ProductsService } from '../products/products.service';
import { CategoriesService } from '../categories/categories.service';
import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { CouponsService } from '../coupons/coupons.service';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { ChatbotService } from './chatbot.service';

/**
 * How many real user WhatsApp messages to keep in history.
 * Each user message may generate multiple Content entries (tool call/response
 * pairs) so we count by actual text messages, not Content entries.
 */
const MAX_HISTORY_MESSAGES = 10;
/** Hard cap on raw Content entries — safety net against runaway tool chains. */
const MAX_HISTORY_ENTRIES = 60;
/** Safety cap on sequential tool calls per user message. */
const MAX_TOOL_ITERATIONS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Tool declarations — Gemini uses these to decide which function to call.
// Keep descriptions crisp: the model reads them verbatim to pick the right tool.
// ─────────────────────────────────────────────────────────────────────────────
const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_products',
    description:
      'Search products by keyword, category, or price. Call for ANY shopping / browsing intent, even vague ones like "something healthy".',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        query: { type: 'STRING' as any, description: 'Search keyword e.g. "moong dal", "cold pressed oil"' },
        categoryId: { type: 'STRING' as any, description: 'Category ID to filter (from get_categories)' },
        maxPrice: { type: 'NUMBER' as any, description: 'Max price in rupees' },
        minPrice: { type: 'NUMBER' as any, description: 'Min price in rupees' },
      },
    },
  },
  {
    name: 'get_categories',
    description:
      'Get all product categories. Call when user asks what we sell or wants to browse by category.',
    parameters: { type: 'OBJECT' as any, properties: {} },
  },
  {
    name: 'get_product_detail',
    description: 'Get full details of a product by its ID.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: { type: 'STRING' as any, description: 'Product _id' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'get_cart',
    description: 'Get current cart contents, totals, and applied coupons.',
    parameters: { type: 'OBJECT' as any, properties: {} },
  },
  {
    name: 'add_to_cart',
    description: 'Add a product to the cart.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: { type: 'STRING' as any, description: 'Product _id to add' },
        quantity: { type: 'NUMBER' as any, description: 'Units to add (min 1)' },
      },
      required: ['productId', 'quantity'],
    },
  },
  {
    name: 'remove_from_cart',
    description: 'Remove a product from the cart.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: { type: 'STRING' as any, description: 'Product _id to remove' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'update_cart_quantity',
    description: 'Change the quantity of a cart item.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        productId: { type: 'STRING' as any, description: 'Product _id' },
        quantity: { type: 'NUMBER' as any, description: 'New quantity' },
      },
      required: ['productId', 'quantity'],
    },
  },
  {
    name: 'get_orders',
    description: 'Get the user order history.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        limit: { type: 'NUMBER' as any, description: 'Max orders to return (default 5)' },
      },
    },
  },
  {
    name: 'track_order',
    description:
      'Get tracking info for a specific order or the latest order if no order number is given.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        orderNumber: { type: 'STRING' as any, description: 'Order number like ORD-001. Omit = latest.' },
      },
    },
  },
  {
    name: 'get_available_coupons',
    description: 'Get discount coupons applicable to the current cart.',
    parameters: { type: 'OBJECT' as any, properties: {} },
  },
  {
    name: 'apply_coupon',
    description: 'Apply a coupon code to the cart.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        code: { type: 'STRING' as any, description: 'Coupon code' },
      },
      required: ['code'],
    },
  },
  {
    name: 'get_account_info',
    description: "Get the user's profile: name, email, saved addresses.",
    parameters: { type: 'OBJECT' as any, properties: {} },
  },
  {
    name: 'get_wallet_balance',
    description: "Get the user's NatureLite wallet balance.",
    parameters: { type: 'OBJECT' as any, properties: {} },
  },
  {
    name: 'initiate_checkout',
    description:
      'Start checkout (address → payment). Call when user says "order", "buy", "checkout", "place order", or confirms they want to purchase.',
    parameters: { type: 'OBJECT' as any, properties: {} },
  },
  {
    name: 'request_human_support',
    description:
      'Hand off to a human agent. Call when user explicitly asks for a human, is clearly frustrated, or asks something the bot cannot resolve.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        reason: { type: 'STRING' as any, description: 'Why human support is needed' },
      },
    },
  },
];

@Injectable()
export class ChatbotAiService {
  private readonly logger = new Logger(ChatbotAiService.name);
  private readonly genai: GoogleGenerativeAI;

  // Per-user lock: prevents parallel Gemini calls for the same phone number.
  // Without this, rapid double-taps cause race conditions on session.save()
  // and waste tokens on duplicate requests.
  private readonly inFlight = new Map<string, true>();

  // Global concurrency semaphore: caps simultaneous Gemini requests across all users.
  // Gemini free-tier is 15 RPM; even paid tiers have burst limits.
  private activeAiCalls = 0;
  private readonly MAX_CONCURRENT_AI = 8;
  private readonly aiWaitQueue: Array<() => void> = [];

  // Category list is stable — cache it for 5 minutes to save DB round-trips.
  private categoryCache: { items: any[]; expiresAt: number } | null = null;
  private readonly CATEGORY_CACHE_TTL = 5 * 60 * 1_000;

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly cartService: CartService,
    private readonly ordersService: OrdersService,
    private readonly couponsService: CouponsService,
    private readonly usersService: UsersService,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => ChatbotService))
    private readonly chatbotService: ChatbotService,
  ) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set — AI chatbot layer is disabled.');
    }
    this.genai = new GoogleGenerativeAI(apiKey);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SYSTEM PROMPT
  // This is the single source of truth for how the AI behaves.
  // Edit this method to change tone, business rules, or what the AI can do.
  // The dynamic section at the top is rebuilt every turn with live user data.
  // ─────────────────────────────────────────────────────────────────────────
  private buildSystemPrompt(session: ChatSessionDocument): string {
    const userName = (session.metadata as Record<string, string>)?.contactName || 'Customer';
    const isRegistered = !!session.user;

    return `You are the WhatsApp shopping assistant for *NatureLite Foods* — a natural & chemical-free food store in Raipur, Chhattisgarh, India.

═══ CURRENT USER ═══
Name: ${userName}
Registered: ${isRegistered ? 'Yes' : 'No — remind them to share their name if they want to order'}

═══ BUSINESS FACTS ═══
• Products: dals, flours, spices, oils, grains, dry fruits, superfoods — all natural, no chemicals
• Store: Raipur, Chhattisgarh
• Delivery: Mon–Sat, to Raipur / Bhilai / Durg / Bilaspur only
• Free delivery on orders ₹300+. ₹40 delivery below ₹300.
• Payments: Cash on Delivery or UPI/Card (online)
• Returns: within 24 hours of delivery
• Catalogue: https://wa.me/c/918817200740
• Website: naturelitefoods.com
• Store map: https://maps.app.goo.gl/D8G3EQVRB5eckFcw7

═══ RESPONSE FORMAT (WhatsApp rules) ═══
• Keep every reply under 120 words. Short is better.
• Use *bold* for product names, prices, order numbers.
• Use _italic_ for secondary info or tips.
• Never use bullet points styled with "-" — use "•" instead.
• Be warm, friendly, conversational. No corporate language.
• Mix Hindi naturally (Ji, Namaste, Bilkul) but reply in the same language as the user.

═══ TOOL RULES (CRITICAL — follow exactly) ═══
• NEVER invent prices, stock, or order details. Always call a tool first.
• NEVER say "I will place your order" — call initiate_checkout() and let the system handle it.
• NEVER confirm payment — the payment flow handles that separately.
• For ANY product/shopping question → call search_products() first, then respond.
• For a catalog product tap → call get_product_detail(productId) first, then describe.
• When user wants to order / buy / checkout → call initiate_checkout() immediately.
• If user seems frustrated (repeated complaints or "useless bot") → call request_human_support().
• You may call multiple tools in sequence to gather all needed info before replying.

═══ CONVERSATION MEMORY ═══
You have the last 10 messages of this conversation in your context above (the chat history).
Use it actively:
• If the user already told you their name, address, or preferences — don't ask again.
• If a product was already searched or discussed — refer to it directly ("the *Moong Dal* we looked at").
• If "that one", "same", "again", "what's the price" — look back in history first before calling a tool.
• If the user is continuing a topic from earlier — stay in that context naturally.
• Never re-introduce yourself if you've already greeted them this session.

═══ WHAT YOU CAN ANSWER WITHOUT A TOOL ═══
• Delivery area, days, return policy, payment methods, store location, website URL — answer from memory above.
• General greetings and small talk.`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONCURRENCY HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /** Acquire a global AI concurrency slot; resolves immediately or waits in queue. */
  private acquireAiSlot(): Promise<() => void> {
    if (this.activeAiCalls < this.MAX_CONCURRENT_AI) {
      this.activeAiCalls++;
      return Promise.resolve(() => this.releaseAiSlot());
    }
    return new Promise((resolve) => {
      this.aiWaitQueue.push(() => {
        this.activeAiCalls++;
        resolve(() => this.releaseAiSlot());
      });
    });
  }

  private releaseAiSlot(): void {
    this.activeAiCalls--;
    if (this.aiWaitQueue.length) this.aiWaitQueue.shift()!();
  }

  /** Wrap a Gemini sendMessage promise with a hard 25-second timeout. */
  private geminiWithTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      p.finally(() => clearTimeout(timer)),
      new Promise<T>((_, rej) => {
        timer = setTimeout(() => rej(new Error('gemini_timeout')), 25_000);
      }),
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN ENTRY POINT
  // Called by ChatbotService for every message that is NOT a hardcoded
  // critical-path intercept (payment selection, checkout, address input).
  // ─────────────────────────────────────────────────────────────────────────
  async runAiTurn(
    phone: string,
    session: ChatSessionDocument,
    userInput: string,
  ): Promise<void> {
    if (!process.env.GEMINI_API_KEY) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'AI service is not configured. Type *menu* to see options.',
      });
      return;
    }

    // Per-user lock: drop duplicate if the same user's previous message is still processing.
    if (this.inFlight.has(phone)) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Still working on your last message — please wait a moment.',
      });
      return;
    }
    this.inFlight.set(phone, true);

    // Wait for a global concurrency slot (max MAX_CONCURRENT_AI simultaneous Gemini calls).
    const releaseSlot = await this.acquireAiSlot();

    try {
      const systemInstruction = this.buildSystemPrompt(session);

      // Build the history from the session (Gemini Content[] format)
      const history: Content[] = Array.isArray(session.conversationHistory)
        ? (session.conversationHistory as unknown as Content[])
        : [];

      const model = this.genai.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
        },
      });

      const chat = model.startChat({ history });

      // Working accumulator for this turn's contents (used to persist history)
      const turnAdditions: Content[] = [];

      // First send: user message
      let result = await this.geminiWithTimeout(chat.sendMessage(userInput || 'hi'));
      turnAdditions.push({ role: 'user', parts: [{ text: userInput || 'hi' }] });

      // Agentic loop: execute tool calls until Gemini returns plain text
      let textSent = false;
      let iterations = 0;
      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;

        const candidate = result.response.candidates?.[0];
        if (!candidate) break;

        const parts: Part[] = candidate.content.parts;
        const hasFunctionCall = parts.some((p) => 'functionCall' in p);

        // Record the model turn only after confirming a candidate exists
        turnAdditions.push({ role: 'model', parts });

        if (!hasFunctionCall) {
          // Gemini returned final text — send it
          const text = result.response.text().trim();
          if (text) {
            await this.whatsappService.sendTextMessage({ phone, message: text });
            textSent = true;
          }
          break;
        }

        // Execute every function call in this response
        const toolResponseParts: Part[] = [];
        for (const part of parts) {
          if (!('functionCall' in part)) continue;
          const { name, args } = (part as any).functionCall as {
            name: string;
            args: Record<string, unknown>;
          };

          this.logger.log(`[AI] tool → ${name}(${JSON.stringify(args)})`);

          // Special tools that exit the loop and hand off to hardcoded flows
          if (name === 'initiate_checkout') {
            await this.saveHistory(session, history, turnAdditions);
            await this.chatbotService.initiateCheckoutForAi(phone, session);
            return;
          }
          if (name === 'request_human_support') {
            await this.saveHistory(session, history, turnAdditions);
            await this.chatbotService.requestSupportForAi(phone, session);
            return;
          }

          const toolResult = await this.executeTool(name, args ?? {}, session);
          toolResponseParts.push({
            functionResponse: { name, response: toolResult },
          } as any);
        }

        // Feed tool results back to Gemini
        result = await this.geminiWithTimeout(chat.sendMessage(toolResponseParts));
        turnAdditions.push({ role: 'user', parts: toolResponseParts });
      }

      // Guard: only persist history if the model actually responded with a complete turn.
      // An unbalanced history (last entry = 'user') would corrupt the next Gemini call.
      const lastRole = turnAdditions.at(-1)?.role;
      if (lastRole === 'model') {
        await this.saveHistory(session, history, turnAdditions);
      }

      // Safety: if no text was ever sent (loop exhausted or empty candidate), notify the user.
      if (!textSent) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'Sorry, I couldn\'t process that. Type *menu* to start over or *support* to reach a human.',
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`AI turn failed for ${phone}: ${msg}`);
      const isRateLimit =
        msg.includes('429') ||
        msg.toLowerCase().includes('quota') ||
        msg.toLowerCase().includes('rate limit');
      const userMsg =
        msg === 'gemini_timeout'
          ? 'Taking a bit longer than usual — please try again in a moment.'
          : isRateLimit
          ? "I'm handling a lot of requests right now — please try again in 30 seconds."
          : 'Something went wrong on our end. Type *menu* to start over.';
      await this.whatsappService.sendTextMessage({ phone, message: userMsg });
    } finally {
      this.inFlight.delete(phone);
      releaseSlot();
    }
  }

  /**
   * Trim history to the last MAX_HISTORY_MESSAGES real user messages and persist.
   *
   * A "real user message" is a Content entry with role='user' that has at least
   * one text part (i.e. an actual WhatsApp message, not a function-response part).
   * We count those backwards so that tool call/response Content entries between
   * user messages are counted as part of their surrounding exchange, not as
   * separate messages. A hard entry cap (MAX_HISTORY_ENTRIES) acts as a safety net.
   */
  private async saveHistory(
    session: ChatSessionDocument,
    previousHistory: Content[],
    turnAdditions: Content[],
  ): Promise<void> {
    const combined = [...previousHistory, ...turnAdditions];

    // Trim: walk backwards counting real user text messages.
    let userMsgCount = 0;
    let startIdx = 0;
    for (let i = combined.length - 1; i >= 0; i--) {
      const c = combined[i];
      const isRealUserMsg =
        c.role === 'user' &&
        c.parts.some((p: any) => typeof p.text === 'string');
      if (isRealUserMsg) {
        userMsgCount++;
        if (userMsgCount >= MAX_HISTORY_MESSAGES) {
          startIdx = i;
          break;
        }
      }
    }

    let trimmed = combined.slice(startIdx);

    // Apply hard entry cap as a safety net (shouldn't fire in normal operation).
    if (trimmed.length > MAX_HISTORY_ENTRIES) {
      trimmed = trimmed.slice(trimmed.length - MAX_HISTORY_ENTRIES);
    }

    // Gemini requires the history to start with a 'user' turn.
    while (trimmed.length > 0 && trimmed[0].role !== 'user') {
      trimmed = trimmed.slice(1);
    }

    (session as any).conversationHistory = trimmed;
    // Mongoose doesn't auto-detect mutations on [Object] arrays — must mark explicitly.
    session.markModified('conversationHistory');
    await session.save();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL DISPATCHER
  // ─────────────────────────────────────────────────────────────────────────
  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    session: ChatSessionDocument,
  ): Promise<Record<string, unknown>> {
    try {
      switch (name) {
        case 'search_products':    return this.toolSearchProducts(args, session);
        case 'get_categories':     return this.toolGetCategories();
        case 'get_product_detail': return this.toolGetProductDetail(args.productId as string);
        case 'get_cart':           return this.toolGetCart(session);
        case 'add_to_cart':        return this.toolAddToCart(args.productId as string, Number(args.quantity), session);
        case 'remove_from_cart':   return this.toolRemoveFromCart(args.productId as string, session);
        case 'update_cart_quantity': return this.toolUpdateCartQuantity(args.productId as string, Number(args.quantity), session);
        case 'get_orders':         return this.toolGetOrders(Number(args.limit) || 5, session);
        case 'track_order':        return this.toolTrackOrder(args.orderNumber as string | undefined, session);
        case 'get_available_coupons': return this.toolGetAvailableCoupons(session);
        case 'apply_coupon':       return this.toolApplyCoupon(args.code as string, session);
        case 'get_account_info':   return this.toolGetAccountInfo(session);
        case 'get_wallet_balance': return this.toolGetWalletBalance(session);
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Tool execution failed';
      this.logger.warn(`Tool ${name} threw: ${msg}`);
      return { error: msg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOOL IMPLEMENTATIONS
  // ─────────────────────────────────────────────────────────────────────────

  private async toolSearchProducts(
    args: Record<string, unknown>,
    _session: ChatSessionDocument,
  ) {
    const query = (args.query as string) || '';
    const categoryId = args.categoryId as string | undefined;
    const maxPrice = args.maxPrice ? Number(args.maxPrice) : undefined;
    const minPrice = args.minPrice ? Number(args.minPrice) : undefined;

    let products: any[];

    if (categoryId) {
      products = await this.productsService.findByCategory(categoryId);
    } else if (query) {
      products = await this.productsService.searchProducts(query, 10);
    } else {
      // Broad browse — findAll returns PaginatedResult<Product> with an `items` array
      const page = await this.productsService.findAll({ limit: 10 } as any);
      products = (page as any).items ?? [];
    }

    // Price filter (post-fetch since services don't all support it natively)
    if (maxPrice !== undefined) {
      products = products.filter((p: any) => p.price <= maxPrice);
    }
    if (minPrice !== undefined) {
      products = products.filter((p: any) => p.price >= minPrice);
    }

    if (!products.length) {
      return { products: [], message: 'No products matched the search.' };
    }

    return {
      products: products.slice(0, 8).map((p: any) => ({
        id: p._id?.toString() ?? p.id,
        name: p.name,
        price: p.price,
        description: (p.description || '').slice(0, 80),
        category: (p.category as any)?.name ?? '',
        inStock: p.trackStock === false || (p.stock ?? 1) > 0,
      })),
      total: products.length,
    };
  }

  private async toolGetCategories() {
    const now = Date.now();
    if (this.categoryCache && now < this.categoryCache.expiresAt) {
      return { categories: this.categoryCache.items };
    }
    const result = await this.categoriesService.findAll({} as any);
    const cats: any[] = (result as any).items ?? [];
    const mapped = cats.map((c: any) => ({
      id: c._id?.toString() ?? c.id,
      name: c.name,
    }));
    this.categoryCache = { items: mapped, expiresAt: now + this.CATEGORY_CACHE_TTL };
    return { categories: mapped };
  }

  private async toolGetProductDetail(productId: string) {
    if (!productId) return { error: 'productId is required.' };
    const p = await this.productsService.findById(productId);
    return {
      id: p._id.toString(),
      name: p.name,
      price: p.price,
      description: (p.description || '').slice(0, 150),
      category: (p.category as any)?.name ?? '',
      inStock: p.trackStock === false || (p.stock ?? 1) > 0,
      stock: p.stock,
    };
  }

  private async toolGetCart(session: ChatSessionDocument) {
    if (!session.user) {
      return { empty: true, message: 'User is not registered. Ask them to share their name first.' };
    }
    const cart = await this.cartService.getCart(session.user.toString());
    if (!cart.items.length) return { empty: true, message: 'Cart is empty.' };
    return {
      items: cart.items.map((it: any) => ({
        productId: it.product.id,
        name: it.product.name,
        quantity: it.quantity,
        priceEach: it.price,
        lineTotal: it.total,
      })),
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      discount: cart.discount ?? 0,
      couponCode: cart.couponCode ?? null,
      total: cart.total,
      freeDelivery: cart.subtotal >= 300,
    };
  }

  private async toolAddToCart(productId: string, quantity: number, session: ChatSessionDocument) {
    if (!session.user) {
      return { success: false, error: 'User not registered. Ask them to share their name.' };
    }
    const qty = Math.max(1, Math.min(Math.floor(quantity || 1), 20));
    await this.cartService.addItem(session.user.toString(), { productId, quantity: qty });
    const cart = await this.cartService.getCart(session.user.toString());
    return {
      success: true,
      message: `Added ${qty} unit(s) to cart.`,
      cartTotal: cart.total,
      cartItemCount: cart.itemCount,
    };
  }

  private async toolRemoveFromCart(productId: string, session: ChatSessionDocument) {
    if (!session.user) return { success: false, error: 'User not registered.' };
    await this.cartService.removeItem(session.user.toString(), productId);
    return { success: true, message: 'Item removed from cart.' };
  }

  private async toolUpdateCartQuantity(productId: string, quantity: number, session: ChatSessionDocument) {
    if (!session.user) return { success: false, error: 'User not registered.' };
    const qty = Math.max(1, Math.floor(quantity || 1));
    await this.cartService.updateItemQuantity(session.user.toString(), productId, { quantity: qty });
    const cart = await this.cartService.getCart(session.user.toString());
    return { success: true, cartTotal: cart.total, cartItemCount: cart.itemCount };
  }

  private async toolGetOrders(limit: number, session: ChatSessionDocument) {
    if (!session.user) return { orders: [], message: 'User not registered.' };
    const orders = await this.ordersService.findUserOrders(
      session.user.toString(),
      Math.min(limit, 10),
    );
    if (!orders.length) return { orders: [], message: 'No orders placed yet.' };
    return {
      orders: orders.map((o: any) => ({
        id: o._id.toString(),
        orderNumber: o.orderNumber,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        total: o.total,
        date: new Date(o.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        }),
        items: (o.items as any[])
          .slice(0, 3)
          .map((i: any) => `${i.name} ×${i.quantity}`)
          .join(', '),
      })),
    };
  }

  private async toolTrackOrder(
    orderNumber: string | undefined,
    session: ChatSessionDocument,
  ) {
    if (!session.user) return { error: 'User not registered.' };

    let order: any;
    if (orderNumber) {
      order = await this.ordersService.findByOrderNumber(orderNumber).catch(() => null);
    }
    if (!order) {
      const recent = await this.ordersService.findUserOrders(session.user.toString(), 1);
      order = recent[0];
    }
    if (!order) return { error: 'No orders found.' };

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      total: order.total,
      items: (order.items as any[])
        .slice(0, 5)
        .map((i: any) => `${i.name} ×${i.quantity}`)
        .join(', '),
      courierName: order.courierName ?? null,
      awbNumber: order.awbNumber ?? null,
      trackingUrl: order.trackingUrl ?? null,
      expectedDelivery: order.expectedDeliveryDate
        ? new Date(order.expectedDeliveryDate).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short',
          })
        : null,
    };
  }

  private async toolGetAvailableCoupons(session: ChatSessionDocument) {
    if (!session.user) {
      return { coupons: [], message: 'User not registered.' };
    }
    try {
      const [active, cart] = await Promise.all([
        this.couponsService.getActiveCoupons(),
        this.cartService.getCart(session.user.toString()),
      ]);
      const userId = session.user.toString();
      // Validate all coupons in parallel — previously serial loop caused N sequential DB calls.
      const results = await Promise.allSettled(
        active.map((c) =>
          this.couponsService
            .validateCoupon({ code: c.code, orderAmount: cart.subtotal ?? 0, userId })
            .then((v) => ({ c, v })),
        ),
      );
      const applicable: Array<{ code: string; discount: number; description: string }> = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.v.valid && r.value.v.discountAmount > 0) {
          applicable.push({
            code: r.value.c.code,
            discount: r.value.v.discountAmount,
            description: r.value.c.description || '',
          });
        }
      }
      return { coupons: applicable.sort((a, b) => b.discount - a.discount) };
    } catch {
      return { coupons: [], message: 'Could not load coupons right now.' };
    }
  }

  private async toolApplyCoupon(code: string, session: ChatSessionDocument) {
    if (!session.user) return { success: false, error: 'User not registered.' };
    if (!code) return { success: false, error: 'No coupon code provided.' };
    try {
      const updated = await this.cartService.applyCoupon(
        session.user.toString(),
        code.toUpperCase().trim(),
      );
      return {
        success: true,
        discount: updated.discount,
        newTotal: updated.total,
        code: code.toUpperCase().trim(),
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Invalid coupon.',
      };
    }
  }

  private async toolGetAccountInfo(session: ChatSessionDocument) {
    if (!session.user) {
      return { registered: false, message: 'User not registered.' };
    }
    const user = await this.usersService.findById(session.user.toString());
    return {
      name: user.name || '',
      email: user.email || '',
      phone: user.phone,
      addressCount: user.addresses?.length ?? 0,
    };
  }

  private async toolGetWalletBalance(session: ChatSessionDocument) {
    if (!session.user) return { balance: 0, message: 'User not registered.' };
    try {
      const balance = await this.walletService.getBalance(session.user.toString());
      return { balance };
    } catch {
      return { balance: 0, message: 'Wallet not available.' };
    }
  }
}
