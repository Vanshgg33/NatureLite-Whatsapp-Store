import { Injectable, Logger, Inject, forwardRef, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { Types } from 'mongoose';
import { isOrderStatusPendingFulfillment } from '../../common/constants/order-status';
import { ChatSession, ChatSessionDocument, SessionState } from './schemas/chat-session.schema';
import { ChatSessionRepository } from './repositories/chat-session.repository';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { UsersService } from '../users/users.service';
import { ProductsService } from '../products/products.service';
import { CategoriesService } from '../categories/categories.service';
import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';
import { FeedbackService } from '../feedback/feedback.service';
import { StoresService } from '../stores/stores.service';
import { StoreStockService } from '../store-stock/store-stock.service';
import { CouponsService } from '../coupons/coupons.service';
import { UcmService } from '../ucm/ucm.service';
import { WhatsAppMessage } from '../whatsapp/dto/whatsapp.dto';
import { CHATBOT_FLOWS, FAQ_RESPONSES } from './chatbot.flows';
import {
  type ChatListPageKey,
  mergeChatContext,
} from './chat-session-context';
import { Category } from '../categories/schemas/category.schema';
import { Product } from '../products/schemas/product.schema';
import { bold, italic, firstName } from './copy/format';
import { WA, clip } from './wa-limits';
import { BTN, Btn, parseButton } from './buttons';
import { ChatbotAnalyticsService } from './analytics/chatbot-analytics.service';
import { ChatbotAiService } from './chatbot-ai.service';

const WHATSAPP_RECENT_ORDER_COOLDOWN_MS = 8000;
/** Max time a single message can hold the per-phone lock before it's forcefully released. */
const PHONE_LOCK_TIMEOUT_MS = 30_000;

/** Simple in-memory TTL cache to avoid repeated DB hits for hot data. */
class TtlCache<T> {
  private data: T | undefined;
  private expiresAt = 0;
  constructor(private readonly ttlMs: number) {}

  get(): T | undefined {
    if (Date.now() < this.expiresAt) return this.data;
    this.data = undefined;
    return undefined;
  }

  set(value: T): void {
    this.data = value;
    this.expiresAt = Date.now() + this.ttlMs;
  }

  invalidate(): void {
    this.data = undefined;
    this.expiresAt = 0;
  }
}

@Injectable()
export class ChatbotService implements OnModuleInit {
  private readonly logger = new Logger(ChatbotService.name);

  /**
   * Per-phone lock map to serialise concurrent messages from the same number.
   * Each entry holds a promise chain — new messages await the previous one before executing.
   */
  private readonly phoneLocks = new Map<string, Promise<void>>();

  /** Cache active categories for 2 minutes. */
  private readonly categoryCache = new TtlCache<Category[]>(2 * 60_000);
  /** Cache products-by-category for 2 minutes, keyed by categoryId. Max 200 entries. */
  private readonly productCache = new Map<string, TtlCache<Product[]>>();
  private readonly productCacheMaxSize = 200;
  private formatCurrency(amount: number): string {
    const rounded = Math.round((amount || 0) * 100) / 100;
    return `₹${Number.isFinite(rounded) ? rounded : 0}`;
  }

  private getListPage(session: ChatSessionDocument, key: ChatListPageKey): number {
    const v = session.context?.[key];
    return typeof v === 'number' && v >= 0 ? v : 0;
  }

  private async setListPage(
    session: ChatSessionDocument,
    key: ChatListPageKey,
    page: number,
  ): Promise<void> {
    session.context = mergeChatContext(session.context, { [key]: Math.max(0, page) });
    await this.saveSession(session);
  }

  private static readonly SESSION_TTL = 1800; // 30 min — matches chatbot session expiry
  private readonly sessKey = (phone: string) => `chatbot:sess:${phone}`;

  constructor(
    private readonly chatSessionRepository: ChatSessionRepository,
    @Inject(forwardRef(() => WhatsAppService))
    private whatsappService: WhatsAppService,
    private usersService: UsersService,
    private productsService: ProductsService,
    private categoriesService: CategoriesService,
    private cartService: CartService,
    private ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
    private readonly feedbackService: FeedbackService,
    private readonly analytics: ChatbotAnalyticsService,
    private readonly storesService: StoresService,
    private readonly storeStockService: StoreStockService,
    private readonly couponsService: CouponsService,
    private readonly ucmService: UcmService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => ChatbotAiService))
    private readonly chatbotAiService: ChatbotAiService,
  ) {
    // Loud boot-time warning if FRONTEND_URL is unset while Razorpay is wired
    // up. Without it, the chatbot prepaid flow falls back to a "sign in to
    // our website" message that most WhatsApp-only customers can't act on —
    // making the order silently unpayable. Surface it in deploy logs so ops
    // notices before customers do.
    if (this.paymentsService.isRazorpayConfigured() && !this.resolveFrontendBaseUrl()) {
      this.logger.error(
        'FRONTEND_URL is not set but Razorpay is configured — WhatsApp pay links cannot be generated. Set FRONTEND_URL on the backend service.',
      );
    }
  }

  async onModuleInit(): Promise<void> {
    // Warm Redis with the static welcome message so it survives server restarts.
    void this.redisService.set('chatbot:msg:welcome', this.buildWelcomeBody(), 24 * 3600);
  }

  // ─── AI Bridge Methods ────────────────────────────────────────────────────
  // Called by ChatbotAiService when tool calling hands off to hardcoded flows.

  async initiateCheckoutForAi(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please share your name first so I can look up your account, then type *checkout* again.',
      });
      return;
    }
    await this.transitionToState(session, 'checkout');
    await this.sendCheckoutOptions(phone, session);
  }

  async requestSupportForAi(phone: string, session: ChatSessionDocument): Promise<void> {
    const SUPPORT_HANDOFF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
    session.isHandedOffToSupport = true;
    session.supportHandoffAt = new Date();
    session.supportHandoffExpiresAt = new Date(Date.now() + SUPPORT_HANDOFF_TTL_MS);
    await session.save();
    await this.whatsappService.sendTextMessage({
      phone,
      message:
        `✅ ${bold('Support request received')}\n\n` +
        `You're now connected with our team — ${italic('the bot is paused for 2 hours')}.\n` +
        `We'll respond shortly. For urgent help call ${bold('8962021112')}.\n\n` +
        `_Type *menu* anytime to return to the bot._`,
    });
  }

  async reorderLastForAi(phone: string, session: ChatSessionDocument): Promise<void> {
    await this.startReorderFromLatestOrder(phone, session);
  }
  // ─────────────────────────────────────────────────────────────────────────

  private readonly catalogIdCache = new TtlCache<string>(60_000);
  private isCatalogBrowseEnabled(): boolean {
    return (process.env.CHATBOT_USE_CATALOG_MESSAGES || 'true').toLowerCase() !== 'false';
  }
  private async getActiveCatalogId(): Promise<string> {
    const cached = this.catalogIdCache.get();
    if (cached !== undefined) return cached;
    try {
      const state = await this.ucmService.getCatalogState();
      const id = state.syncMode === 'meta' && state.selectedCatalogId ? state.selectedCatalogId : '';
      this.catalogIdCache.set(id);
      return id;
    } catch (error) {
      this.logger.warn(
        `Failed to load UCM catalog state: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      this.catalogIdCache.set('');
      return '';
    }
  }
  private retailerIdForProduct(product: { sku?: string; metadata?: unknown; _id: { toString(): string } }): string {
    const meta = product.metadata as Record<string, unknown> | undefined;
    const remote = typeof meta?.remoteCatalogRetailerId === 'string' ? meta.remoteCatalogRetailerId.trim() : '';
    if (remote) return remote;
    if (product.sku) return product.sku;
    return product._id.toString();
  }

  /** Resolve the main store id once per process (the Raipur store). Cached so every
   *  product-list render doesn't round-trip to `stores.findMainStore`. */
  private mainStoreIdCached: string | null = null;
  private async getMainStoreId(): Promise<string> {
    if (this.mainStoreIdCached) return this.mainStoreIdCached;
    const store = await this.storesService.findMainStore();
    this.mainStoreIdCached = store._id.toString();
    return this.mainStoreIdCached;
  }

  /** Compute available stock at a store for a product (plain or variant-aware). */
  private resolveStoreAvailableStock(
    entry: {
      stock?: number;
      variantStocks?: Array<{ variantSku: string; stock: number }>;
    } | null | undefined,
    variantSku?: string,
  ): number {
    if (!entry) return 0;
    if (variantSku) {
      return entry.variantStocks?.find((v) => v.variantSku === variantSku)?.stock ?? 0;
    }
    return entry.stock ?? 0;
  }

  /**
   * Single source of truth for "can this customer order this product right now".
   * Returns POSITIVE_INFINITY for untracked products, otherwise the main-store
   * count (which is what `OrdersService` actually decrements). Use this from
   * every add-to-cart / buy-now / quantity-picker entry point so the customer
   * never gets a stock error after multiple screens.
   */
  private async getMainStoreAvailable(
    product: { _id: Types.ObjectId | string; trackStock?: boolean } | null | undefined,
    variantSku?: string,
  ): Promise<number> {
    if (!product) return 0;
    if (product.trackStock === false) return Number.POSITIVE_INFINITY;
    const mainStoreId = await this.getMainStoreId();
    const entry = await this.storeStockService.getStockForStoreProduct(
      mainStoreId,
      product._id.toString(),
    );
    return this.resolveStoreAvailableStock(entry, variantSku);
  }

  /** First origin in FRONTEND_URL (comma-separated supported in main.ts). */
  private resolveFrontendBaseUrl(): string {
    const raw = this.configService.get<string>('frontendUrl') ?? '';
    const first = raw.split(',')[0]?.trim() ?? '';
    return first.replace(/\/$/, '');
  }

  /** One checkout per inbound WhatsApp message id (dedupe retries / duplicate webhooks). */
  private whatsAppCheckoutIdempotencyKey(messageId: string): string | undefined {
    const trimmed = messageId?.trim();
    if (!trimmed) return undefined;
    return `wa:${crypto.createHash('sha256').update(trimmed, 'utf8').digest('hex')}`;
  }

  private formatOrderStatusForCustomer(order: { status: string; paymentMethod?: string; paymentStatus?: string; packedAt?: Date | null }): string {
    if (order.paymentMethod === 'prepaid' && order.paymentStatus === 'pending') {
      return 'Payment Pending';
    }
    switch (order.status) {
      case 'placed':     return 'Order Received';
      case 'confirmed':  return 'Confirmed';
      case 'preparing':  return order.packedAt ? 'Ready to Ship' : 'Preparing';
      case 'out_for_delivery': return 'Out for Delivery';
      case 'delivered':  return 'Delivered';
      case 'cancelled':  return 'Cancelled';
      case 'returned':   return 'Returned';
      case 'refunded':   return 'Refunded';
      default:           return order.status.replace(/_/g, ' ');
    }
  }

  private formatOrderListDate(dateValue?: Date | string | null): string {
    const date = dateValue ? new Date(dateValue) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private formatOrderItemsForList(items: Array<{ name: string; quantity: number }>): string {
    if (!items.length) return 'Order items';
    const preview = items
      .slice(0, 2)
      .map((it) => `${it.name} x${it.quantity}`)
      .join(', ');
    const more = items.length > 2 ? ` +${items.length - 2} more` : '';
    return `${preview}${more}`;
  }

  /** Preview up to 4 items for the tracking message. */
  private formatOrderItemsPreview(items: Array<{ name: string; quantity: number }>): string {
    const preview = items
      .slice(0, 4)
      .map((it) => `\u2022 ${it.name}  \u00D7${it.quantity}`)
      .join('\n');
    const more = items.length > 4 ? `\n_\u2026 and ${items.length - 4} more_` : '';
    return `${preview}${more}`;
  }

  /** Short date+time stamp (e.g. "Sat, 20 Apr · 2:14 PM") for tracking timeline. */
  private formatStepTimestamp(d?: Date | null): string {
    if (!d) return '';
    const date = new Date(d);
    const datePart = date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const timePart = date.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${datePart} \u00B7 ${timePart}`;
  }

  /**
   * Clean vertical tracker. Four collapsed stages (Placed → Preparing →
   * Out for Delivery → Delivered), past stages get a timestamp, current is
   * bolded, future stages are unadorned. No box-draw dividers — WhatsApp's
   * bubble already separates sections.
   */
  private buildOrderTrackingMessage(order: any): string {
    const statusLabel = this.formatOrderStatusForCustomer(order);

    if (order.status === 'cancelled') {
      const when = this.formatStepTimestamp(order.cancelledAt || order.updatedAt);
      const reasonLine = order.cancelReason ? `\nReason: _${order.cancelReason}_` : '';
      const itemsPreview = this.formatOrderItemsPreview(order.items as any[]);
      return (
        `\u274C  *Order #${order.orderNumber}*\n` +
        `Status \u00B7 *Cancelled*` +
        (when ? `\nWhen \u00B7 _${when}_` : '') +
        reasonLine +
        `\n\n` +
        `*Items (${order.items.length})*\n${itemsPreview}\n\n` +
        `*Total  ${this.formatCurrency(order.total)}*`
      );
    }

    // Four customer-visible stages. Admin states (placed/confirmed/preparing/packed)
    // are collapsed into stage 1-2 but with distinct labels and timestamps.
    type Stage = { label: string; at?: Date | null };
    const current = (() => {
      if (order.status === 'delivered') return 4;
      if (order.status === 'out_for_delivery') return 3;
      if (order.status === 'confirmed' || order.status === 'preparing') return 2;
      return 1; // placed
    })();

    const stage2Label = order.packedAt ? 'Packed · ready to ship' : 'Preparing';

    const stages: Stage[] = [
      { label: 'Order received', at: order.createdAt },
      { label: stage2Label, at: order.packedAt || null },
      { label: 'Out for delivery', at: order.outForDeliveryAt },
      { label: 'Delivered', at: order.deliveredAt },
    ];

    const timeline = stages
      .map((stage, i) => {
        const idx = i + 1;
        const done = idx < current;
        const isCurrent = idx === current;
        const glyph = done ? '\u2705' : isCurrent ? '\uD83D\uDFE0' : '\u26AA';
        const label = isCurrent ? `*${stage.label}*` : stage.label;
        const timestamp = stage.at
          ? `  \u00B7  _${this.formatStepTimestamp(stage.at)}_`
          : '';
        return `${glyph}  ${label}${timestamp}`;
      })
      .join('\n');

    const etaLine = order.expectedDeliveryDate
      ? `\uD83D\uDCC5 ETA \u00B7 *${new Date(order.expectedDeliveryDate).toLocaleDateString(
          'en-IN',
          { weekday: 'short', day: 'numeric', month: 'short' },
        )}*\n`
      : '';

    const courierLines: string[] = [];
    if (order.courierName) courierLines.push(`\uD83D\uDEF5 Courier \u00B7 *${order.courierName}*`);
    if (order.awbNumber) courierLines.push(`\uD83D\uDCE6 AWB \u00B7 *${order.awbNumber}*`);
    if (order.trackingUrl) courierLines.push(`\uD83D\uDD17 ${order.trackingUrl}`);
    const courierBlock = courierLines.length ? `\n${courierLines.join('\n')}\n` : '';

    const itemsPreview = this.formatOrderItemsPreview(order.items as any[]);

    const headerIcon =
      order.status === 'delivered'        ? '\u2705'
      : order.status === 'out_for_delivery' ? '\uD83D\uDE9A'
      : order.status === 'cancelled'        ? '\u274C'
      : order.status === 'returned' || order.status === 'refunded' ? '\u21A9\uFE0F'
      : '\uD83D\uDCE6';

    return (
      `${headerIcon}  *Order #${order.orderNumber}*\n` +
      `Status \u00B7 *${statusLabel}*\n` +
      etaLine +
      `\n${timeline}\n` +
      courierBlock +
      `\n*Items (${order.items.length})*\n${itemsPreview}\n\n` +
      `*Total  ${this.formatCurrency(order.total)}*`
    );
  }

  private async goBack(session: ChatSessionDocument, phone: string): Promise<void> {
    const prev = session.previousState;
    if (!prev) {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
      return;
    }
    await this.transitionToState(session, prev);
    switch (prev) {
      case 'browsing':
        await this.sendBrowseSurface(phone, session);
        break;
      case 'cart':
        await this.sendCartSummary(phone, session);
        break;
      case 'checkout':
        await this.sendCheckoutOptions(phone, session);
        break;
      case 'account':
        await this.sendAccountSummary(phone, session);
        break;
      case 'account_edit':
        await this.sendProfileEditOptions(phone, session);
        break;
      case 'account_addresses':
        await this.sendAddressList(phone, session);
        break;
      case 'wallet':
        await this.sendWalletSummary(phone, session);
        break;
      case 'order_tracking':
        await this.sendOrdersList(phone, session);
        break;
      default:
        await this.sendFlowResponse(phone, prev, session);
    }
  }

  async handleMessage(message: WhatsAppMessage): Promise<void> {
    // Serialise messages per phone to prevent concurrent state corruption.
    const phone = message.phone;
    const prev = this.phoneLocks.get(phone) ?? Promise.resolve();
    let unlock: () => void;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    this.phoneLocks.set(phone, gate);

    // Safety timeout: if the previous holder hangs, don't block all future messages forever.
    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, PHONE_LOCK_TIMEOUT_MS),
    );
    await Promise.race([prev, timeout]);

    try {
      await this.handleMessageUnsafe(message);
    } finally {
      unlock!();
      // Clean up if no one else queued behind us.
      if (this.phoneLocks.get(phone) === gate) {
        this.phoneLocks.delete(phone);
      }
    }
  }

  /**
   * Called by WaFlowService after the user completes address selection via WhatsApp Flow.
   * Updates the session state and sends the payment options message.
   */
  async triggerPaymentFromFlow(phone: string, addressIdx: number): Promise<void> {
    const session = await this.chatSessionRepository.findOneByPhone(phone);
    if (!session) {
      this.logger.warn(`triggerPaymentFromFlow: no session for ${phone}`);
      return;
    }
    session.context = mergeChatContext(session.context, { selectedAddressIndex: addressIdx });
    session.previousState = session.currentState;
    session.currentState = 'payment_selection';
    await session.save();
    await this.sendFlowResponse(phone, 'payment_selection', session);
  }

  private async handleMessageUnsafe(message: WhatsAppMessage): Promise<void> {
    try {
      if (message.messageId) {
        void this.whatsappService.markReadAndTyping(message.messageId, message.phone);
      }

      const session = await this.getOrCreateSession(message.phone);

      void this.updateSessionActivity(session._id.toString());

      const inputText = this.extractInputText(message);

      // Allow menu reset commands even during support handoff.
      if (this.isMenuCommand(inputText)) {
        if (session.isHandedOffToSupport) {
          session.isHandedOffToSupport = false;
          session.supportHandoffExpiresAt = undefined;
          await this.saveSession(session);
        }
        await this.transitionToState(session, 'main_menu');
        await this.sendFlowResponse(message.phone, 'main_menu', session);
        return;
      }

      // If handed off, check per-user TTL first so an admin who forgets to
      // release the user doesn't leave them stuck indefinitely. Once expired,
      // notify the user and resume bot flows on this message.
      if (session.isHandedOffToSupport) {
        // Allow user to self-release with "done"/"thanks"/"resolved" so they
        // don't have to wait 2 hours if the issue was resolved quickly.
        if (this.isSupportDoneCommand(inputText)) {
          session.isHandedOffToSupport = false;
          session.supportHandoffExpiresAt = undefined;
          await this.saveSession(session);
          await this.whatsappService.sendTextMessage({
            phone: message.phone,
            message: `${italic('Support session ended.')} Type *menu* to continue shopping.`,
          });
          return;
        }

        const expiresAt = session.supportHandoffExpiresAt
          ? new Date(session.supportHandoffExpiresAt).getTime()
          : 0;
        if (expiresAt > 0 && Date.now() >= expiresAt) {
          session.isHandedOffToSupport = false;
          session.supportHandoffExpiresAt = undefined;
          await this.saveSession(session);
          await this.whatsappService.sendTextMessage({
            phone: message.phone,
            message:
              `${italic('Support session ended.')} Type *menu* anytime to start over.`,
          });
          // Fall through to normal handling on this message.
        } else {
          return;
        }
      }

      await this.processInput(session, message, inputText);
    } catch (error) {
      this.logger.error('Error handling message', error);
      try {
        await this.whatsappService.sendTextMessage({
          phone: message.phone,
          message: 'Sorry, something went wrong. Please type "menu" to start over.',
        });
      } catch (sendErr) {
        this.logger.error('Failed to send error notification to user', sendErr);
      }
    }
  }

  private async processInput(
    session: ChatSessionDocument,
    message: WhatsAppMessage,
    inputText: string,
  ): Promise<void> {
    const currentState = session.currentState;
    const flow = CHATBOT_FLOWS[currentState];

    const buttonId = message.content.buttonId || message.content.listId;
    const transitionKey = buttonId || this.mapTextToTransitionKey(currentState, inputText);
    const normalizedInput = this.normalizeInput(inputText);

    // Catalog "send cart" → arrives as type=order with productItems[]. One product tap arrives
    // as interactive=product or product_list_reply (productItems often has length 1).
    const catalogItems = (message.content.productItems || []).filter((it) => it.productRetailerId);
    if (message.type === 'order' || catalogItems.length > 1) {
      if (catalogItems.length > 0) {
        await this.handleCatalogOrder(session, message.phone, catalogItems, message.messageId);
        return;
      }
    }

    if (message.content.productRetailerId) {
      const rawRetailerId = message.content.productRetailerId.split('::')[0];
      try {
        const product = await this.productsService.findByRetailerId(rawRetailerId);
        if (!product) {
          throw new Error(`No local product matched retailer_id ${rawRetailerId}`);
        }
        session.currentProductId = product._id.toString();
        await this.saveSession(session);
        await this.transitionToState(session, 'product_detail');
        await this.sendProductDetail(message.phone, product._id.toString(), session);
        return;
      } catch (error) {
        this.logger.warn(
          `catalog_product_lookup_failed for ${message.content.productRetailerId}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
        await this.whatsappService.sendInteractiveButtons({
          phone: message.phone,
          headerText: 'Item unavailable',
          bodyText: 'That catalog item is no longer available. Browse our latest products below.',
          buttons: [
            { id: BTN.BROWSE, title: '🛍 Browse' },
            { id: BTN.MENU, title: '🏠 Menu' },
          ],
        });
        return;
      }
    }

    if (buttonId) {
      this.analytics.track('chatbot.button_clicked', {
        state: currentState,
        buttonId,
        userId: session.user?.toString(),
      });
    }

    // Website quick-order: detect the pre-filled "confirm my order #XYZ" message
    // sent when a customer places an order via the website WA button. Look up the
    // order by number and show a confirmation so the customer isn't left with silence.
    if (!buttonId) {
      const orderNumMatch = inputText.match(/order\s+#([A-Z0-9-]+)/i);
      if (orderNumMatch) {
        const orderNumber = orderNumMatch[1];
        try {
          const order = await this.ordersService.findByOrderNumber(orderNumber);
          if (order) {
            const items = order.items as Array<{ name: string; quantity: number }>;
            const itemLines = items.slice(0, 4).map((it) => `• ${it.name} ×${it.quantity}`).join('\n');
            const more = items.length > 4 ? `\n_… and ${items.length - 4} more_` : '';
            await this.whatsappService.sendInteractiveButtons({
              phone: message.phone,
              headerText: `Order #${order.orderNumber} received ✅`,
              bodyText:
                `*${order.shippingAddress?.name || 'Hi'}*, your order has been placed!\n\n` +
                `${itemLines}${more}\n\n` +
                `*Total: ${this.formatCurrency(order.total)}* · Cash on Delivery\n` +
                `We'll confirm shortly. Track anytime by replying *orders*.`,
              buttons: [
                { id: BTN.BROWSE, title: '🛍 Shop more' },
              ],
            });
            // Link this phone to the order's user if not yet linked.
            if (!session.user && order.user) {
              const uid = typeof order.user === 'object' && '_id' in (order.user as object)
                ? (order.user as unknown as { _id: Types.ObjectId })._id
                : (order.user as unknown as Types.ObjectId);
              session.user = uid;
              await this.saveSession(session);
            }
            return;
          }
        } catch {
          // Order not found or lookup error — fall through to normal flow
        }
      }
    }

    // Global transition keys that are valid from any state (rendered after add-to-cart, remove,
    // out-of-stock recovery, etc.). These always route to a known state so the user never gets stuck.
    const globalKeys = new Set([
      'view_cart',
      'continue_shopping',
      'browse',
      'cart',
      'menu',
      'main_menu',
      'account',
      'orders',
      'reorder',
      BTN.CHANGE_ADDRESS,
      'support',
      'pay',
    ]);

    if (
      transitionKey === BTN.CHANGE_ADDRESS ||
      normalizedInput === 'change address'
    ) {
      await this.openAddressPickerFromPayment(message.phone, session);
      return;
    }

    // If a user taps an old or fabricated button/list id, do not mutate state; re-show current options.
    if (buttonId && !globalKeys.has(buttonId) && !this.isValidTransitionKeyForState(currentState, buttonId)) {
      await this.sendSafeFallbackForState(message.phone, session);
      return;
    }

    if (transitionKey === 'view_cart') {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(message.phone, session);
      return;
    }
    if (transitionKey === 'cart') {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(message.phone, session);
      return;
    }
    if (transitionKey === 'continue_shopping' || transitionKey === 'browse') {
      await this.transitionToState(session, 'browsing');
      await this.sendShopNowSurface(message.phone, session);
      return;
    }
    if (transitionKey === 'menu' || transitionKey === 'main_menu') {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(message.phone, 'main_menu', session);
      return;
    }
    if (transitionKey === 'account') {
      await this.transitionToState(session, 'account');
      await this.sendAccountSummary(message.phone, session);
      return;
    }
    if (transitionKey === 'orders') {
      session.context = mergeChatContext(session.context, { ordersPage: 0 });
      await this.saveSession(session);
      await this.transitionToState(session, 'order_tracking');
      await this.sendOrdersList(message.phone, session);
      return;
    }
    if (transitionKey === 'reorder') {
      await this.startReorderFromLatestOrder(message.phone, session);
      return;
    }
    if (transitionKey === 'pay') {
      // "pay" shortcut: re-issue a fresh pay link for the customer's most
      // recent unpaid prepaid order. If none exists, route to orders so they
      // can pick one. Without this, a customer whose 48h link expired had no
      // chatbot path to retry payment.
      if (!session.user) {
        await this.whatsappService.sendTextMessage({
          phone: message.phone,
          message: 'Please share your name to continue, then type *pay* again.',
        });
        return;
      }
      const recent = await this.ordersService.findUserOrders(session.user.toString(), 10);
      const target = recent.find(
        (o) =>
          o.paymentMethod === 'prepaid' &&
          o.paymentStatus !== 'paid' &&
          o.paymentStatus !== 'refunded' &&
          o.status !== 'cancelled' &&
          o.status !== 'refunded',
      );
      if (target) {
        await this.sendFreshPayLink(session, message.phone, target._id.toString());
      } else {
        await this.whatsappService.sendTextMessage({
          phone: message.phone,
          message: 'You have no pending online payments. Type *orders* to see your orders.',
        });
      }
      return;
    }
    // Post-delivery feedback: if a user has a recent delivered order with a pending
    // feedback request, interpret a plain rating reply (1-5) or "1 star", "5 stars",
    // "great", "loved it" as feedback. Runs only from main_menu to avoid hijacking
    // other flows' tickets input.
    if (
      !buttonId &&
      currentState === 'main_menu' &&
      session.user &&
      !this.isMenuCommand(inputText)
    ) {
      const handled = await this.tryHandleFeedbackReply(message.phone, session, inputText);
      if (handled) return;
    }

    // Dynamic button interception — buttons with embedded IDs (pay_<id>, order_<id>,
    // prod_<id>, etc.) must route to their hardcoded handlers regardless of AI.
    // The AI receives the button label text, not the ID, so it cannot reconstruct
    // the orderId / productId needed to perform the actual action.
    if (buttonId) {
      const dynBtn = parseButton(buttonId);

      // pay_<orderId> — generates a Razorpay payment link. Money-critical.
      if (dynBtn.kind === 'payOrder') {
        await this.sendFreshPayLink(session, message.phone, dynBtn.id);
        return;
      }
      // order_<id> / reorder_<id> — order detail and reorder flows need the embedded orderId.
      if (dynBtn.kind === 'order' || dynBtn.kind === 'reorder') {
        await this.handleOrderTracking(session, message.phone, transitionKey);
        return;
      }
      // prod_<id> — direct product detail.
      if (dynBtn.kind === 'product') {
        session.currentProductId = dynBtn.id;
        await this.transitionToState(session, 'product_detail');
        await this.sendProductDetail(message.phone, dynBtn.id, session);
        return;
      }
      // cat_<id> — browse a specific category.
      if (dynBtn.kind === 'category') {
        await this.handleBrowsing(session, message.phone, transitionKey);
        return;
      }
      // citem_<i> — cart item action card (sets manageCartItem on session).
      if (dynBtn.kind === 'cartItem') {
        await this.handleCart(session, message.phone, transitionKey);
        return;
      }
      // qty_<n> — add N of current product to cart.
      if (dynBtn.kind === 'addQty') {
        await this.handleProductDetail(session, message.phone, transitionKey);
        return;
      }
      // capply_<code> — apply a specific coupon suggested in the coupon flow.
      if (dynBtn.kind === 'applyCoupon') {
        await this.handleCouponPrompt(session, message.phone, transitionKey);
        return;
      }
    }

    // Static buttons that depend on session context set by the dynamic handlers above.
    if (transitionKey === BTN.CART_INC || transitionKey === BTN.CART_DEC || transitionKey === BTN.CART_RM) {
      await this.handleCart(session, message.phone, transitionKey);
      return;
    }
    if (transitionKey === BTN.REORDER_CURRENT) {
      await this.handleOrderTracking(session, message.phone, transitionKey);
      return;
    }

    // "Back" button is valid in many states but the switch routes them all to AI.
    // Intercept here so goBack() always fires regardless of current state.
    if (transitionKey === BTN.BACK || transitionKey === 'back') {
      await this.goBack(session, message.phone);
      return;
    }

    // Browsing pagination buttons must stay in the hardcoded handler —
    // AI cannot paginate WhatsApp interactive list UIs.
    if (
      currentState === 'browsing' &&
      (transitionKey === BTN.MORE_CATEGORIES || transitionKey === BTN.MORE_PRODUCTS)
    ) {
      await this.handleBrowsing(session, message.phone, transitionKey);
      return;
    }

    // product_detail "Add to cart" / "Pick qty" buttons: use hardcoded handler so
    // session.currentProductId is used directly instead of forcing AI to re-search.
    if (
      currentState === 'product_detail' &&
      (transitionKey === BTN.ADD_CART || transitionKey === BTN.PICK_QTY)
    ) {
      await this.handleProductDetail(session, message.phone, transitionKey);
      return;
    }

    // Unrecognized free text in any non-input, non-critical state → AI
    if (
      !buttonId &&
      inputText.length >= 2 &&
      !this.isMenuCommand(inputText) &&
      !this.isTextInputState(currentState) &&
      !this.isValidTransitionKeyForState(currentState, transitionKey)
    ) {
      await this.chatbotAiService.runAiTurn(message.phone, session, inputText, message.messageId);
      return;
    }

    switch (currentState) {
      // ── Critical hardcoded states ──────────────────────────────────────
      case 'checkout':
        await this.handleCheckout(session, message.phone, transitionKey);
        break;

      case 'address_input':
        await this.handleAddressInput(session, message.phone, inputText);
        break;

      case 'payment_selection':
        await this.handlePaymentSelection(session, message.phone, transitionKey, message);
        break;

      // ── All other states handled by AI ─────────────────────────────────
      default:
        await this.chatbotAiService.runAiTurn(message.phone, session, inputText, message.messageId);
    }
  }

  private async handleMainMenu(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    switch (input) {
      case 'browse':
        await this.transitionToState(session, 'browsing');
        // "Shop now" should land on the WhatsApp catalog surface directly when
        // available (the native "View items" experience). If catalog browsing
        // isn't configured, fall back to the legacy interactive lists.
        await this.sendShopNowSurface(phone, session);
        break;

      case 'cart':
        await this.transitionToState(session, 'cart');
        await this.sendCartSummary(phone, session);
        break;

      case 'orders':
        session.context = mergeChatContext(session.context, { ordersPage: 0 });
        await this.saveSession(session);
        await this.transitionToState(session, 'order_tracking');
        await this.sendOrdersList(phone, session);
        break;

      case 'reorder':
        await this.startReorderFromLatestOrder(phone, session);
        break;

      case 'help':
      case 'faq':
        await this.transitionToState(session, 'faq');
        await this.sendFlowResponse(phone, 'faq', session);
        break;

      case 'support':
        await this.transitionToState(session, 'support');
        await this.sendFlowResponse(phone, 'support', session);
        break;

      case 'account':
        await this.transitionToState(session, 'account');
        await this.sendAccountSummary(phone, session);
        break;

      default:
        await this.sendFlowResponse(phone, 'main_menu', session);
    }
  }

  /**
   * Main-menu "Shop now" entry point.
   *
   * Sends a cta_url button pointing to the WhatsApp catalog link
   * (wa.me/c/<number>) — tapping it opens the native WhatsApp catalogue
   * without requiring Meta catalog API approval. Falls back to the browse
   * surface if the business phone number isn't configured or the send fails.
   */
  private async sendShopNowSurface(phone: string, session: ChatSessionDocument): Promise<void> {
    const bizPhone = this.configService.get<string>('whatsapp.businessPhoneNumber') ?? '';
    if (bizPhone) {
      try {
        const catalogUrl = `https://wa.me/c/${bizPhone}`;
        const sent = await this.whatsappService.sendCatalogLinkMessage({
          phone,
          catalogUrl,
          bodyText: '🛍️ Tap the button below to browse our full catalogue directly in WhatsApp!',
          buttonLabel: 'View Catalogue',
        });
        if (sent) return;
      } catch (err) {
        this.logger.warn(
          `sendShopNowSurface: cta_url failed (${err instanceof Error ? err.message : 'unknown'}), falling back`,
        );
      }
    }
    await this.sendBrowseSurface(phone, session);
  }

  private async handleBrowsing(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    const btn = parseButton(input);

    if (btn.kind === 'static') {
      switch (btn.value) {
        case BTN.BACK:
          await this.goBack(session, phone);
          return;
        case BTN.MORE_CATEGORIES: {
          const nextPage = this.getListPage(session, 'categoryPage') + 1;
          await this.setListPage(session, 'categoryPage', nextPage);
          await this.sendCategoryList(phone, session);
          return;
        }
        case BTN.MORE_PRODUCTS:
          if (session.currentCategoryId) {
            const nextPage = this.getListPage(session, 'productPage') + 1;
            await this.setListPage(session, 'productPage', nextPage);
            await this.sendProductList(phone, session.currentCategoryId, session);
            return;
          }
          break;
      }
      await this.sendCategoryList(phone, session);
      return;
    }

    if (btn.kind === 'category') {
      session.currentCategoryId = btn.id;
      session.context = mergeChatContext(session.context, { productPage: 0 });
      await this.saveSession(session);
      await this.sendProductList(phone, btn.id, session);
      return;
    }

    if (btn.kind === 'product') {
      session.currentProductId = btn.id;
      await this.transitionToState(session, 'product_detail');
      await this.sendProductDetail(phone, btn.id, session);
      return;
    }

    await this.sendBrowseSurface(phone, session);
  }

  private async handleProductDetail(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (input === 'back') {
      await this.goBack(session, phone);
      return;
    }

    if (input === 'add_cart' && session.currentProductId) {
      const product = await this.productsService.findById(session.currentProductId);
      let mainStoreAvailable = Number.POSITIVE_INFINITY;
      if (product.trackStock !== false) {
        const mainStoreId = await this.getMainStoreId();
        const storeStock = await this.storeStockService.getStockForStoreProduct(
          mainStoreId,
          product._id.toString(),
        );
        mainStoreAvailable = this.resolveStoreAvailableStock(storeStock);
      }
      const isOutOfStock = product.trackStock !== false && mainStoreAvailable <= 0;

      if (isOutOfStock) {
        await this.whatsappService.sendInteractiveButtons({
          phone,
          headerText: 'Out of stock',
          bodyText: `"${product.name}" is unavailable right now. Browse other products?`,
          buttons: [
            { id: BTN.BROWSE, title: '\uD83D\uDECD Browse' },
            { id: BTN.BACK, title: '\u21A9 Back' },
          ],
        });
        return;
      }

      if (!session.user) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'Please register first to continue.',
        });
        return;
      }
    }

    if (input === 'add_cart' && session.currentProductId && session.user) {
      await this.addCurrentProductToCart(phone, session, 1);
      return;
    }

    // Quantity-picker list: open a list of quantity choices for the current product.
    if (input === BTN.PICK_QTY && session.currentProductId && session.user) {
      await this.sendQuantityPicker(phone, session);
      return;
    }

    // User tapped a quantity row (id: "qty_3") — add that many at once.
    const parsedBtn = parseButton(input);
    if (parsedBtn.kind === 'addQty' && session.currentProductId && session.user) {
      await this.addCurrentProductToCart(phone, session, parsedBtn.qty);
      return;
    }

    // Typed "+3" / "x2" / "add 5" → multi-qty shortcut for the current product.
    if (session.currentProductId && session.user) {
      const qtyMatch = input.trim().match(/^(?:\+|x\s*|add\s+)(\d{1,2})$/i);
      if (qtyMatch) {
        const n = Number.parseInt(qtyMatch[1], 10);
        if (Number.isFinite(n) && n > 0 && n <= 99) {
          await this.addCurrentProductToCart(phone, session, n);
          return;
        }
      }
    }

    await this.sendProductDetail(phone, session.currentProductId || '', session);
  }

  private async handleCart(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register first to use the cart.',
      });
      return;
    }

    if (input === 'checkout') {
      this.analytics.track('chatbot.checkout_started', {
        userId: session.user.toString(),
        source: 'cart',
      });

      // Auto-apply the best eligible coupon at checkout. The cart screen
      // already surfaces the suggested code and a "Change coupon" button, so
      // customers who don't want it can remove or swap from there.
      //   - cart already has a coupon applied → keep it, advance.
      //   - eligible coupon exists → apply silently, send a one-line
      //     confirmation, advance.
      //   - no eligible coupons → advance straight to address.
      const cart = await this.cartService.getCart(session.user.toString());
      if (!cart.couponCode) {
        const applicable = await this.findApplicableCoupons(session);
        const best = applicable[0];
        if (best) {
          try {
            const updated = await this.cartService.applyCoupon(session.user.toString(), best.code);
            this.analytics.track('chatbot.coupon_applied', {
              userId: session.user.toString(),
              code: best.code,
              discount: updated.discount,
              source: 'auto',
            });
            await this.whatsappService.sendTextMessage({
              phone,
              message:
                `🏷 ${bold(`${this.formatCurrency(updated.discount)} off`)} with ${bold(best.code)} applied.\n` +
                italic("Remove from cart if you don't want it."),
            });
          } catch (err) {
            // Auto-apply failed (e.g. cap hit since findApplicableCoupons
            // ran). Fall back to the manual prompt rather than silently
            // dropping the discount.
            this.logger.warn(
              `Auto-apply coupon ${best.code} failed: ${err instanceof Error ? err.message : 'unknown'}`,
            );
            session.context = mergeChatContext(session.context, { couponFlowTarget: 'checkout' });
            await this.saveSession(session);
            await this.transitionToState(session, 'coupon_prompt');
            await this.sendFlowResponse(phone, 'coupon_prompt', session);
            return;
          }
        }
      }

      await this.transitionToState(session, 'checkout');
      await this.sendCheckoutOptions(phone, session);
      return;
    }

    if (input === 'continue') {
      await this.transitionToState(session, 'browsing');
      await this.sendShopNowSurface(phone, session);
      return;
    }

    if (input === 'clear') {
      // Two-step confirmation — wiping the cart is destructive and the typed
      // shortcut is easy to trigger accidentally ("clear my doubts" etc).
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Clear cart?',
        bodyText: 'This removes everything in your cart. Are you sure?',
        buttons: [
          { id: 'clear_confirm', title: '🗑 Yes, clear' },
          { id: BTN.BACK, title: '↩ Keep cart' },
        ],
      });
      return;
    }

    if (input === 'clear_confirm') {
      await this.cartService.clearCart(session.user.toString());
      await this.transitionToState(session, 'cart');
      await this.sendEmptyCart(phone);
      return;
    }

    if (input === 'manage' || input === 'remove') {
      await this.transitionToState(session, 'browsing');
      await this.sendShopNowSurface(phone, session);
      return;
    }

    // Tap a cart-item row → show the +1 / -1 / Remove action card.
    const parsed = parseButton(input);
    if (parsed.kind === 'cartItem') {
      await this.sendCartItemActionCard(phone, session, parsed.idx);
      return;
    }

    // Per-item action buttons resolve the target item by stable identity
    // (productId + variantSku) so a concurrent cart mutation can't shift the
    // action onto a different item.
    if (input === BTN.CART_INC || input === BTN.CART_DEC || input === BTN.CART_RM) {
      const target = session.context.manageCartItem;
      if (!target?.productId) {
        await this.sendCartSummary(phone, session);
        return;
      }
      const cartNow = session.user
        ? await this.cartService.getCart(session.user.toString())
        : null;
      const idx = cartNow?.items.findIndex(
        (it) => it.product.id === target.productId && it.variantSku === target.variantSku,
      ) ?? -1;
      if (idx < 0) {
        await this.sendCartSummary(phone, session, italic('That item is no longer in your cart.'));
        return;
      }
      if (input === BTN.CART_RM) {
        await this.removeCartItemByIndex(phone, session, idx);
      } else {
        await this.adjustCartItemQuantity(phone, session, idx, input === BTN.CART_INC ? 1 : -1);
      }
      return;
    }

    // One-tap best-coupon apply from cart (no intermediate "Apply SAVE20" screen).
    if (input === BTN.COUPON_APPLY_BEST) {
      const applicable = await this.findApplicableCoupons(session);
      const best = applicable[0];
      session.context = mergeChatContext(session.context, { couponFlowTarget: 'cart' });
      await this.saveSession(session);
      if (!best) {
        await this.transitionToState(session, 'coupon_prompt');
        await this.sendAvailableCouponsList(phone, session);
        return;
      }
      await this.transitionToState(session, 'coupon_prompt');
      await this.applyCouponCode(phone, session, best.code, 'suggested');
      return;
    }

    // Cart-screen coupon button: jump into the coupon flow without going
    // through Checkout. Show the full available-codes list directly so the
    // customer can browse what's on offer; the auto-suggest screen is only
    // used after Checkout.
    if (input === BTN.COUPON_LIST) {
      session.context = mergeChatContext(session.context, { couponFlowTarget: 'cart' });
      await this.saveSession(session);
      await this.transitionToState(session, 'coupon_prompt');
      await this.sendAvailableCouponsList(phone, session);
      return;
    }

    // Typed shortcuts: "+<n> <name>", "-<n> <name>", "set <name> <n>",
    // "remove <name>", "delete <name>".
    const typed = await this.tryHandleCartTypedCommand(phone, session, input);
    if (typed) return;

    if (input === 'back') {
      await this.goBack(session, phone);
      return;
    }

    await this.sendCartSummary(phone, session);
  }

  /** Apply delta (+1 / -1) to item at index; if new qty <= 0, removes the item. */
  private async adjustCartItemQuantity(
    phone: string,
    session: ChatSessionDocument,
    idx: number,
    delta: number,
  ): Promise<void> {
    if (!session.user || !Number.isFinite(idx) || idx < 0) {
      await this.sendCartSummary(phone, session);
      return;
    }
    const cart = await this.cartService.getCart(session.user.toString());
    const previousCoupon = cart.couponCode;
    const item = cart.items[idx];
    if (!item) {
      await this.sendCartSummary(phone, session);
      return;
    }
    const nextQty = item.quantity + delta;
    if (nextQty <= 0) {
      await this.removeCartItemByIndex(phone, session, idx);
      return;
    }
    try {
      await this.cartService.updateItemQuantity(
        session.user.toString(),
        item.product.id,
        { quantity: nextQty },
        item.variantSku,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const notice = /stock/i.test(msg)
        ? `_Only ${item.quantity} in stock — cannot increase further._`
        : italic('Couldn\u2019t update the quantity. Please try again.');
      if (!/stock/i.test(msg)) {
        this.logger.warn(`Cart quantity update failed for ${session.user.toString()}: ${msg || 'unknown'}`);
      }
      await this.sendCartSummary(phone, session, notice);
      return;
    }
    const updated = await this.cartService.getCart(session.user.toString());
    const couponNotice = previousCoupon && !updated.couponCode
      ? `_Coupon ${previousCoupon} removed \u2014 cart no longer qualifies._`
      : undefined;
    await this.sendCartSummary(phone, session, couponNotice);
  }

  /** Remove item at idx; notifies if a coupon got invalidated; returns to cart summary. */
  private async removeCartItemByIndex(
    phone: string,
    session: ChatSessionDocument,
    idx: number,
  ): Promise<void> {
    if (!session.user || !Number.isFinite(idx) || idx < 0) {
      await this.sendCartSummary(phone, session);
      return;
    }
    const cart = await this.cartService.getCart(session.user.toString());
    const previousCoupon = cart.couponCode;
    const item = cart.items[idx];
    if (!item) {
      await this.sendCartSummary(phone, session);
      return;
    }
    try {
      await this.cartService.removeItem(
        session.user.toString(),
        item.product.id,
        item.variantSku,
      );
    } catch (e) {
      this.logger.warn(
        `Cart item removal failed for ${session.user.toString()}: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      await this.sendCartSummary(phone, session, italic('Couldn\u2019t remove that item. Please try again.'));
      return;
    }
    const updated = await this.cartService.getCart(session.user.toString());
    const notices: string[] = [];
    if (previousCoupon && !updated.couponCode) {
      notices.push(`_Coupon ${previousCoupon} removed \u2014 cart no longer qualifies._`);
    }
    notices.push(`\uD83D\uDDD1\uFE0F  *Removed* ${item.product.name}`);
    await this.sendCartSummary(phone, session, notices.join('\n'));
  }

  /** Parse free-text cart commands: set/+/-/remove/delete. Returns true if handled. */
  private async tryHandleCartTypedCommand(
    phone: string,
    session: ChatSessionDocument,
    rawInput: string,
  ): Promise<boolean> {
    if (!session.user) return false;
    const text = (rawInput || '').trim().toLowerCase();
    if (!text) return false;

    // set <name> <n>
    const setMatch = text.match(/^set\s+(.+?)\s+(\d{1,3})$/);
    // remove <name> / delete <name>
    const removeMatch = text.match(/^(?:remove|delete|rm|del)\s+(.+)$/);
    // +<n> <name> OR +<name>
    const incMatch = text.match(/^\+\s*(\d{0,3})\s*(.+)$/);
    // -<n> <name> OR -<name>
    const decMatch = text.match(/^-\s*(\d{0,3})\s*(.+)$/);

    let name = '';
    let explicitQty: number | null = null;
    let action: 'set' | 'remove' | 'inc' | 'dec' | null = null;

    if (setMatch) {
      name = setMatch[1];
      explicitQty = Number.parseInt(setMatch[2], 10);
      action = 'set';
    } else if (removeMatch) {
      name = removeMatch[1];
      action = 'remove';
    } else if (incMatch) {
      name = incMatch[2];
      explicitQty = incMatch[1] ? Number.parseInt(incMatch[1], 10) : 1;
      action = 'inc';
    } else if (decMatch) {
      name = decMatch[2];
      explicitQty = decMatch[1] ? Number.parseInt(decMatch[1], 10) : 1;
      action = 'dec';
    }

    if (!action || !name) return false;

    const cart = await this.cartService.getCart(session.user.toString());
    const idx = cart.items.findIndex((it) =>
      it.product.name.toLowerCase().includes(name.trim()),
    );
    if (idx < 0) {
      await this.sendCartSummary(phone, session, `_No cart item matches "${name.trim()}"._`);
      return true;
    }

    if (action === 'remove') {
      await this.removeCartItemByIndex(phone, session, idx);
      return true;
    }
    if (action === 'set' && Number.isFinite(explicitQty!) && explicitQty! > 0) {
      const current = cart.items[idx].quantity;
      await this.adjustCartItemQuantity(phone, session, idx, explicitQty! - current);
      return true;
    }
    if (action === 'inc') {
      await this.adjustCartItemQuantity(phone, session, idx, +(explicitQty || 1));
      return true;
    }
    if (action === 'dec') {
      await this.adjustCartItemQuantity(phone, session, idx, -(explicitQty || 1));
      return true;
    }
    return false;
  }

  private async handleCouponPrompt(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Registration needed',
        bodyText: 'Please share your name to create an account before checking out.',
        buttons: [
          { id: BTN.MENU, title: '🏠 Menu' },
          { id: BTN.BROWSE, title: '🛍 Browse' },
        ],
      });
      await this.transitionToState(session, 'main_menu');
      return;
    }

    const cart = await this.cartService.getCart(session.user.toString());
    if (cart.items.length === 0) {
      await this.sendEmptyCart(phone);
      await this.transitionToState(session, 'browsing');
      return;
    }

    // Back from coupon_prompt always lands on cart. Using previousState here
    // creates a coupon_prompt <-> checkout ping-pong when the user has already
    // advanced to the address screen and tapped Back.
    if (input === BTN.BACK) {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session);
      return;
    }

    // Apply the pre-suggested coupon with one tap.
    if (input === BTN.COUPON_APPLY_SUGGESTED) {
      const code = (session.context?.suggestedCoupon || '').toString();
      if (!code) {
        await this.sendCouponPromptScreen(phone, session);
        return;
      }
      await this.applyCouponCode(phone, session, code, 'suggested');
      return;
    }

    // Show the full list of applicable coupons.
    if (input === BTN.COUPON_LIST) {
      await this.sendAvailableCouponsList(phone, session);
      return;
    }

    // Parse a coupon-apply list row (e.g. "capply_SAVE50").
    const parsed = parseButton(input);
    if (parsed.kind === 'applyCoupon') {
      await this.applyCouponCode(phone, session, parsed.code, 'list');
      return;
    }

    // Legacy + new "enter custom code" paths both land in coupon_input.
    if (input === BTN.COUPON_YES || input === BTN.COUPON_CUSTOM) {
      await this.transitionToState(session, 'coupon_input');
      await this.sendFlowResponse(phone, 'coupon_input', session);
      return;
    }

    // Skip or decline → go straight to checkout.
    if (input === BTN.COUPON_NO || input === BTN.COUPON_SKIP) {
      await this.transitionToState(session, 'checkout');
      await this.sendCheckoutOptions(phone, session);
      return;
    }

    await this.sendCouponPromptScreen(phone, session);
  }

  /** Dynamic coupon prompt: if an eligible coupon exists, show a one-tap apply. */
  private async sendCouponPromptScreen(
    phone: string,
    session: ChatSessionDocument,
    notice?: string,
  ): Promise<void> {
    const applicable = await this.findApplicableCoupons(session);
    const suggestion = applicable[0] ?? null;

    if (suggestion) {
      session.context = mergeChatContext(session.context, { suggestedCoupon: suggestion.code });
      await this.saveSession(session);

      const applyTitle = clip(`\u2705 Apply ${suggestion.code}`, WA.BUTTON_TITLE);
      // Show "See all" when there's more than one choice; otherwise surface
      // the manual-code entry instead so the 3-button budget isn't wasted.
      const secondaryButton =
        applicable.length > 1
          ? { id: BTN.COUPON_LIST, title: `\uD83C\uDFF7 See all (${applicable.length})` }
          : { id: BTN.COUPON_CUSTOM, title: '\uD83C\uDFF7 Use another' };

      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Save on this order',
        bodyText:
          `${notice ? `${notice}\n\n` : ''}\uD83C\uDF81 ${bold(`${this.formatCurrency(suggestion.discount)} off`)} with ${bold(suggestion.code)} \u2014 we've lined it up for you.\n` +
          italic(suggestion.description || 'Applied to your cart total.'),
        buttons: [
          { id: BTN.COUPON_APPLY_SUGGESTED, title: applyTitle },
          secondaryButton,
          { id: BTN.COUPON_SKIP, title: 'Skip' },
        ],
      });
      return;
    }

    // No eligible suggestion. Only show the coupon step if live coupons exist;
    // otherwise skip it so customers don't see a dead promo-code prompt.
    session.context = mergeChatContext(session.context, { suggestedCoupon: undefined });
    await session.save();

    let active: Awaited<ReturnType<typeof this.couponsService.getActiveCoupons>> = [];
    try {
      active = await this.couponsService.getActiveCoupons();
    } catch {
      active = [];
    }

    if (active.length === 0) {
      await this.continueAfterCouponStep(phone, session);
      return;
    }

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: `${notice ? `${notice}\n\n` : ''}Got a promo code, or want to see what\u2019s available right now?`,
      buttons: [
        { id: BTN.COUPON_LIST, title: '\uD83C\uDFF7 See codes' },
        { id: BTN.COUPON_CUSTOM, title: '\uD83C\uDFF7 Enter code' },
        { id: BTN.COUPON_SKIP, title: 'Skip' },
      ],
    });
  }

  private async continueAfterCouponStep(
    phone: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    const target = session.context?.couponFlowTarget || 'checkout';
    if (target === 'cart') {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session);
      return;
    }

    await this.transitionToState(session, 'checkout');
    await this.sendCheckoutOptions(phone, session);
  }

  /**
   * Interactive list of coupons. Applicable ones go on top and apply on tap;
   * coupons that exist but don't fit the current cart are shown in a second
   * section with the reason why (e.g. "needs ₹500+") so customers can still
   * see what's on offer and adjust their cart.
   */
  private async sendAvailableCouponsList(
    phone: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    const applicable = await this.findApplicableCoupons(session);
    const applicableCodes = new Set(applicable.map((c) => c.code.toUpperCase()));

    let active: Awaited<ReturnType<typeof this.couponsService.getActiveCoupons>> = [];
    try {
      active = await this.couponsService.getActiveCoupons();
    } catch {
      active = [];
    }
    const nonApplicable = active.filter(
      (c) => !applicableCodes.has(c.code.toUpperCase()),
    );

    if (applicable.length === 0 && nonApplicable.length === 0) {
      await this.continueAfterCouponStep(phone, session);
      return;
    }

    const applicableRows = applicable.slice(0, WA.MAX_ROWS_PER_SECTION).map((c) => ({
      id: Btn.applyCoupon(c.code),
      title: clip(c.code, WA.LIST_ROW_TITLE),
      description: clip(
        `Save ${this.formatCurrency(c.discount)}${c.description ? ' \u00B7 ' + c.description : ''}`,
        WA.LIST_ROW_DESC,
      ),
    }));

    const nonApplicableRows = nonApplicable.slice(0, WA.MAX_ROWS_PER_SECTION).map((c) => {
      const pct = c.discountType === 'percentage'
        ? `${c.discountValue}% off`
        : `${this.formatCurrency(c.discountValue)} off`;
      const gate = c.minOrderAmount && c.minOrderAmount > 0
        ? ` \u00B7 needs ${this.formatCurrency(c.minOrderAmount)}+`
        : '';
      return {
        id: Btn.applyCoupon(c.code),
        title: clip(c.code, WA.LIST_ROW_TITLE),
        description: clip(`${pct}${gate}`, WA.LIST_ROW_DESC),
      };
    });

    const sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> = [];
    if (applicableRows.length) {
      sections.push({ title: 'Eligible now', rows: applicableRows });
    }
    if (nonApplicableRows.length) {
      sections.push({ title: 'Other coupons', rows: nonApplicableRows });
    }
    sections.push({
      title: 'Actions',
      rows: [
        { id: BTN.COUPON_CUSTOM, title: '🏷 Enter code', description: 'Type a promo code yourself' },
        { id: BTN.COUPON_SKIP, title: 'Skip', description: 'Continue without a coupon' },
        { id: BTN.BACK, title: '↩ Back', description: 'Return to previous screen' },
      ],
    });

    await this.whatsappService.sendInteractiveList({
      phone,
      headerText: 'Available coupons',
      bodyText:
        applicable.length > 0
          ? 'Tap a code to apply. Ineligible codes show the condition they need.'
          : 'No codes fit your current cart. Here\u2019s what\u2019s on offer:',
      buttonText: 'Choose coupon',
      sections,
    });
  }

  /** Apply a coupon code picked from the "Available coupons" list. */
  private async applyCouponCode(
    phone: string,
    session: ChatSessionDocument,
    code: string,
    source: 'suggested' | 'list' | 'manual',
  ): Promise<void> {
    if (!session.user) return;
    const userId = session.user.toString();

    // Webhook-retry dedupe: if 360dialog redelivers the same list tap, we'd
    // otherwise call applyCoupon twice — the second call may succeed or throw
    // a "already applied" error depending on timing. Short-circuit if this
    // exact code is already on the cart and advance to checkout.
    try {
      const existing = await this.cartService.getCart(userId);
      if (existing.couponCode && existing.couponCode.toUpperCase() === code.toUpperCase()) {
        const target = session.context?.couponFlowTarget || 'checkout';
        if (target === 'cart') {
          await this.transitionToState(session, 'cart');
          await this.sendCartSummary(phone, session);
          return;
        }
        await this.transitionToState(session, 'checkout');
        await this.sendCheckoutOptions(phone, session);
        return;
      }
    } catch {
      // fall through — a cart-fetch hiccup shouldn't block a coupon attempt
    }

    try {
      const updated = await this.cartService.applyCoupon(userId, code);
      this.analytics.track('chatbot.coupon_applied', {
        userId,
        code,
        discount: updated.discount,
        source,
      });
      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `\u2705 ${bold('Coupon applied')}\n` +
          `Code ${bold(code)} \u2014 saved ${bold(this.formatCurrency(updated.discount))}`,
      });
    } catch (err) {
      this.analytics.track('chatbot.coupon_failed', {
        userId,
        code,
        source,
        reason: err instanceof Error ? err.message : 'unknown',
      });
      const msg = err instanceof Error ? err.message : 'Please try again.';
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Couldn\u2019t apply coupon',
        bodyText: msg,
        buttons: [
          { id: BTN.COUPON_LIST, title: '\uD83C\uDFF7 See codes' },
          { id: BTN.COUPON_SKIP, title: 'Skip' },
          { id: BTN.BACK, title: '\u21A9 Back' },
        ],
      });
      return;
    }
    const target = session.context?.couponFlowTarget || 'checkout';
    if (target === 'cart') {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session);
      return;
    }
    await this.transitionToState(session, 'checkout');
    await this.sendCheckoutOptions(phone, session);
  }

  /**
   * Returns every currently-valid coupon for this customer's cart, each with
   * its actual resolved discount, sorted by biggest discount first. Uses the
   * real CouponsService — no hard-coded codes. Cart context is required so
   * the min-order-amount / percentage cap rules are applied correctly.
   */
  private async findApplicableCoupons(
    session: ChatSessionDocument,
  ): Promise<
    Array<{ code: string; discount: number; description: string }>
  > {
    if (!session.user) return [];
    const cart = await this.cartService.getCart(session.user.toString());
    if (!cart.subtotal || cart.subtotal <= 0) return [];

    let active: Awaited<ReturnType<typeof this.couponsService.getActiveCoupons>>;
    try {
      active = await this.couponsService.getActiveCoupons();
    } catch (err) {
      this.logger.warn(
        `getActiveCoupons failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return [];
    }

    const userId = session.user.toString();
    const results: Array<{ code: string; discount: number; description: string }> = [];

    for (const coupon of active) {
      // Skip the coupon already on the cart — no point suggesting the same one.
      if (cart.couponCode && cart.couponCode.toUpperCase() === coupon.code.toUpperCase()) {
        continue;
      }
      try {
        const validation = await this.couponsService.validateCoupon({
          code: coupon.code,
          orderAmount: cart.subtotal,
          userId,
        });
        if (validation.valid && validation.discountAmount > 0) {
          results.push({
            code: coupon.code,
            discount: validation.discountAmount,
            description: coupon.description || '',
          });
        }
      } catch {
        // Validation rejection (e.g. per-user cap). Silently skip this coupon —
        // we only want to surface ones the user can actually apply right now.
      }
    }

    results.sort((a, b) => b.discount - a.discount);
    return results;
  }

  /** Best single coupon for the suggested-coupon prompt, or null if none. */
  private async findSuggestedCoupon(
    session: ChatSessionDocument,
  ): Promise<{ code: string; discount: number; reason: string } | null> {
    const all = await this.findApplicableCoupons(session);
    const top = all[0];
    if (!top) return null;
    return {
      code: top.code,
      discount: top.discount,
      reason: top.description || 'Applied to your cart total.',
    };
  }

  private async handleCouponInput(
    session: ChatSessionDocument,
    phone: string,
    inputText: string,
    transitionKey: string,
  ): Promise<void> {
    if (!session.user) {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
      return;
    }

    // Back from coupon_input jumps straight to cart to avoid the
    // coupon <-> checkout ping-pong that previousState would create.
    if (transitionKey === 'back') {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session);
      return;
    }

    if (transitionKey === 'try_coupon_again') {
      await this.sendFlowResponse(phone, 'coupon_input', session);
      return;
    }

    if (transitionKey === 'skip_coupon') {
      await this.transitionToState(session, 'checkout');
      await this.sendCheckoutOptions(phone, session);
      return;
    }

    if (transitionKey === 'remove_coupon') {
      await this.cartService.removeCoupon(session.user.toString());
      await this.transitionToState(session, 'coupon_prompt');
      await this.sendCouponPromptScreen(phone, session, italic('Coupon removed from your cart.'));
      return;
    }

    const code = inputText.trim().toUpperCase();
    if (!code) {
      await this.sendFlowResponse(phone, 'coupon_input', session);
      return;
    }

    // Cross-state escape hatches: a customer who typed obvious navigation
    // words ("menu", "cart", "cod", "back", "browse"…) almost certainly
    // didn't mean them as a coupon code. Without this guard, the chatbot
    // would happily run "COD" or "MENU" through coupon validation and
    // surface a misleading "Invalid coupon" error, leaving the customer
    // stuck typing the same word repeatedly.
    const navWord = code.toLowerCase();
    const navMap: Record<string, () => Promise<void>> = {
      menu: async () => {
        await this.transitionToState(session, 'main_menu');
        await this.sendFlowResponse(phone, 'main_menu', session);
      },
      'main menu': async () => {
        await this.transitionToState(session, 'main_menu');
        await this.sendFlowResponse(phone, 'main_menu', session);
      },
      cart: async () => {
        await this.transitionToState(session, 'cart');
        await this.sendCartSummary(phone, session);
      },
      back: async () => {
        await this.transitionToState(session, 'cart');
        await this.sendCartSummary(phone, session);
      },
      browse: async () => {
        await this.transitionToState(session, 'browsing');
        await this.sendBrowseSurface(phone, session);
      },
      skip: async () => {
        await this.transitionToState(session, 'checkout');
        await this.sendCheckoutOptions(phone, session);
      },
      cod: async () => {
        await this.transitionToState(session, 'checkout');
        await this.sendCheckoutOptions(phone, session);
      },
      prepaid: async () => {
        await this.transitionToState(session, 'checkout');
        await this.sendCheckoutOptions(phone, session);
      },
      upi: async () => {
        await this.transitionToState(session, 'checkout');
        await this.sendCheckoutOptions(phone, session);
      },
      orders: async () => {
        await this.transitionToState(session, 'order_tracking');
        await this.sendFlowResponse(phone, 'order_tracking', session);
      },
      support: async () => {
        await this.transitionToState(session, 'support');
        await this.sendFlowResponse(phone, 'support', session);
      },
    };
    const navHandler = navMap[navWord];
    if (navHandler) {
      await navHandler();
      return;
    }

    try {
      await this.whatsappService.sendTextMessage({
        phone,
        message: italic('Applying coupon...'),
      });
      const updated = await this.cartService.applyCoupon(session.user.toString(), code);
      this.analytics.track('chatbot.coupon_applied', {
        userId: session.user.toString(),
        code,
        discount: updated.discount,
        source: 'manual',
      });
      await this.transitionToState(session, 'checkout');
      await this.sendCheckoutOptions(phone, session, {
        notice:
          `\u2705 ${bold('Coupon applied')}\n` +
          `Code ${bold(code)} \u2014 saved ${bold(this.formatCurrency(updated.discount))}\n` +
          `New total ${bold(this.formatCurrency(updated.total))}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      this.analytics.track('chatbot.coupon_failed', {
        userId: session.user.toString(),
        code,
        reason: msg,
        source: 'manual',
      });
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Invalid coupon',
        bodyText: msg || 'Please check the code and try again.',
        buttons: [
          { id: BTN.COUPON_TRY_AGAIN, title: 'Try again' },
          { id: BTN.COUPON_SKIP, title: 'Skip' },
        ],
      });
    }
  }

  private async handleCheckout(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    // Back from checkout always lands on cart. Using previousState would loop
    // back through coupon_prompt when the user arrived from the suggested-coupon
    // screen, trapping them in a cart -> coupon -> checkout -> coupon cycle.
    if (input === BTN.BACK) {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session);
      return;
    }

    if (input === BTN.ADD_NEW_ADDRESS) {
      await this.transitionToState(session, 'address_input');
      await this.sendFlowResponse(phone, 'address_input', session);
      return;
    }

    const btn = parseButton(input);
    if (btn.kind === 'address') {
      if (!Number.isInteger(btn.idx) || btn.idx < 0) {
        await this.sendCheckoutOptions(phone, session);
        return;
      }
      session.context = mergeChatContext(session.context, { selectedAddressIndex: btn.idx });
      await this.saveSession(session);
      this.analytics.track('chatbot.checkout_started', {
        userId: session.user?.toString(),
        addressIdx: btn.idx,
      });
      await this.transitionToState(session, 'payment_selection');
      await this.sendFlowResponse(phone, 'payment_selection', session);
      return;
    }

    await this.sendCheckoutOptions(phone, session);
  }

  /**
   * Parse a free-text Indian address. Accepts:
   *   - 4–5 clean lines (name / street / city, state / pincode / landmark)
   *   - Single-line comma-separated input
   *   - Missing commas ("Nagpur Maharashtra")
   *   - Pincode hidden inside another line
   *   - Extra whitespace / bullet characters
   *
   * Returns { ok: false, reason } with a human-friendly reason for each failure mode
   * so the caller can prompt the user with a specific fix, not a generic error.
   */
  private parseCustomerAddress(
    raw: string,
  ):
    | {
        ok: true;
        name: string;
        street: string;
        city: string;
        state: string;
        pincode: string;
        landmark?: string;
      }
    | { ok: false; reason: string } {
    const trimmed = (raw || '').trim();
    if (!trimmed) return { ok: false, reason: 'Address is empty' };

    // Known Indian states + UTs for recognition and to peel the state out of
    // the "City State" / "City, State" line even when the user forgets the
    // comma. Order matters: longer names listed first so e.g. "Andhra Pradesh"
    // wins over "Pradesh" in greedy regex matching.
    const STATES = [
      'Andaman and Nicobar Islands', 'Dadra and Nagar Haveli', 'Jammu and Kashmir',
      'Himachal Pradesh', 'Arunachal Pradesh', 'Madhya Pradesh', 'Uttar Pradesh',
      'Andhra Pradesh', 'West Bengal', 'Tamil Nadu', 'Daman and Diu',
      'Uttarakhand', 'Maharashtra', 'Chhattisgarh', 'Puducherry', 'Chandigarh',
      'Rajasthan', 'Karnataka', 'Telangana', 'Jharkhand', 'Meghalaya',
      'Nagaland', 'Gujarat', 'Haryana', 'Manipur', 'Mizoram',
      'Lakshadweep', 'Tripura', 'Sikkim', 'Kerala', 'Odisha',
      'Punjab', 'Assam', 'Bihar', 'Delhi', 'Ladakh', 'Goa',
    ];
    const STATE_RE = new RegExp(
      `\\b(${STATES.map((s) => s.replace(/\s+/g, '\\s+')).join('|')})\\b`,
      'i',
    );

    const canonicalState = (match: string): string => {
      const norm = match.replace(/\s+/g, ' ').trim().toLowerCase();
      const hit = STATES.find((s) => s.toLowerCase() === norm);
      return hit || match.replace(/\s+/g, ' ').trim();
    };

    // Split into lines; if the user typed it all on one line, fall back to commas.
    let lines = trimmed
      .split('\n')
      .map((l) => l.replace(/^[\u2022\-\*\s]+/, '').trim())
      .filter(Boolean);
    if (lines.length <= 2 && trimmed.includes(',')) {
      lines = trimmed
        .split(/[,\n]/)
        .map((l) => l.replace(/^[\u2022\-\*\s]+/, '').trim())
        .filter(Boolean);
    }

    if (lines.length < 3) {
      return {
        ok: false,
        reason: 'Need at least 4 lines (name, street, city/state, pincode)',
      };
    }

    // Extract pincode from anywhere in the input.
    const pincodeMatch = trimmed.match(/\b(\d{6})\b/);
    const pincode = pincodeMatch?.[1];
    if (!pincode) {
      return { ok: false, reason: 'Couldn\u2019t find a 6-digit pincode' };
    }

    // Drop any line that is just the pincode (so it doesn't get mistaken for
    // city/street) — but keep lines that contain the pincode plus other text.
    lines = lines.filter((l) => l.replace(/\s+/g, '') !== pincode);

    // Find which remaining line contains a state name.
    let stateLineIdx = -1;
    let state = '';
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(STATE_RE);
      if (m) {
        stateLineIdx = i;
        state = canonicalState(m[1]);
        break;
      }
    }
    if (!state) {
      return {
        ok: false,
        reason: 'Couldn\u2019t recognise the state. Please spell it fully (e.g. Maharashtra)',
      };
    }

    // City: the state line with the state text stripped, commas/dashes cleaned.
    const cityStateLine = lines[stateLineIdx];
    const cityRaw = cityStateLine
      .replace(STATE_RE, '')
      .replace(/[,\-\u2013\u2014]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cityRaw) {
      return { ok: false, reason: 'Couldn\u2019t read the city' };
    }

    // Name: first line that is NOT the state line (usually index 0).
    const nameIdx = stateLineIdx === 0 ? -1 : 0;
    if (nameIdx === -1) {
      return { ok: false, reason: 'Please put your name on the first line' };
    }
    const name = lines[nameIdx];

    // Street: everything between the name line and the state line.
    const streetParts = lines.slice(nameIdx + 1, stateLineIdx);
    const street = streetParts.join(', ').trim();
    if (!street) {
      return {
        ok: false,
        reason: 'Missing street / house number on line 2',
      };
    }

    // Landmark: anything after the state line that isn't just the pincode.
    const tailParts = lines
      .slice(stateLineIdx + 1)
      .filter((l) => l.replace(/\s+/g, '') !== pincode && !/^\d{6}$/.test(l.trim()));
    const landmark = tailParts.length > 0 ? tailParts.join(', ') : undefined;

    return {
      ok: true,
      name,
      street,
      city: cityRaw,
      state,
      pincode,
      landmark,
    };
  }

  private async handleAddressInput(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    const sendRetry = async (reason: string) => {
      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `${bold(reason)}\n\n` +
          `Send the address like this (one line each):\n\n` +
          `Full name\n` +
          `House / flat no, street\n` +
          `City, State\n` +
          `6-digit pincode\n` +
          `${italic('Landmark (optional)')}`,
      });
    };

    const parsed = this.parseCustomerAddress(input);
    if (parsed.ok !== true) {
      const reason = parsed.reason;
      await sendRetry(reason);
      return;
    }
    const { name, street, city, state, pincode, landmark } = parsed;

    // Coverage check — fall back to prefix list when env var is unpopulated.
    const serviceable = this.configService.get<string[]>('delivery.serviceablePincodes') ?? [];
    const SERVICEABLE_PREFIXES = ['492', '490', '491', '495'];
    const isServiceable =
      serviceable.length > 0
        ? serviceable.includes(pincode)
        : SERVICEABLE_PREFIXES.some((prefix) => pincode.startsWith(prefix));
    if (!isServiceable) {
      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `${bold('We don\u2019t deliver to ' + pincode + ' yet.')}\n\n` +
          'We currently deliver to *Raipur, Bhilai, Durg & Bilaspur* (Chhattisgarh).\n' +
          'Send a different address, or reply *support* to reach our team.',
      });
      return;
    }

    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register first to save an address.',
      });
      return;
    }

    try {
      await this.usersService.addAddress(session.user.toString(), {
        label: 'Delivery',
        street,
        city,
        state,
        pincode,
        landmark,
        isDefault: false,
      });
    } catch (err) {
      this.logger.warn(
        `Address save failed for ${session.user.toString()}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      await sendRetry('Couldn\u2019t save that address');
      return;
    }

    session.context = mergeChatContext(session.context, {
      newAddress: { name, street, city, state, pincode, landmark },
    });
    await session.save();

    await this.whatsappService.sendTextMessage({
      phone,
      message: `\u2705 ${bold('Address saved')}`,
    });

    // Navigate back depending on where the user came from.
    if (session.previousState === 'account_addresses') {
      await this.transitionToState(session, 'account_addresses');
      await this.sendAddressList(phone, session);
    } else {
      // Select the freshly-added address so the payment screen uses it.
      const user = await this.usersService.findById(session.user.toString());
      const newIdx = Math.max(0, user.addresses.length - 1);
      session.context = mergeChatContext(session.context, { selectedAddressIndex: newIdx });
      await this.saveSession(session);
      await this.transitionToState(session, 'payment_selection');
      await this.sendFlowResponse(phone, 'payment_selection', session);
    }
  }

  private async handlePaymentSelection(
    session: ChatSessionDocument,
    phone: string,
    input: string,
    message: WhatsAppMessage,
  ): Promise<void> {
    if (input === 'back') {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session);
      return;
    }

    if (input === BTN.CHANGE_ADDRESS) {
      await this.openAddressPickerFromPayment(phone, session);
      return;
    }

    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register to complete your order.',
      });
      return;
    }

    let cart = await this.cartService.getCart(session.user.toString());

    if (cart.items.length === 0) {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session, 'Your cart is empty. Browse products to get started.');
      return;
    }

    // Re-run coupon validation against the current cart subtotal *before* the
    // ₹0 guard. Without this, a coupon that has since become invalid
    // (expired, exceeded usage cap, or cart subtotal dropped below
    // minOrderAmount) still leaves a discount on `cart.total`, and the
    // customer gets the misleading "discount exceeds cart total" message
    // even though removing the coupon would resolve it.
    if (cart.couponCode) {
      try {
        await this.cartService.applyCoupon(session.user.toString(), cart.couponCode);
      } catch {
        await this.cartService.removeCoupon(session.user.toString());
        await this.whatsappService.sendTextMessage({
          phone,
          message: '_Coupon is no longer valid and was removed from your cart._',
        });
      }
      cart = await this.cartService.getCart(session.user.toString());
    }

    // After revalidation: if total is still <= 0 and a coupon is applied, the
    // coupon genuinely covers the whole cart — ask user to remove or top up.
    // If no coupon is applied, the cart subtotal itself is zero (e.g. all
    // items had price=0); send them to cart/support since "remove coupon"
    // wouldn't fix anything and the previous wording was misleading.
    if ((cart.total ?? 0) <= 0 && !cart.couponCode) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: "Cart can't be priced",
        bodyText:
          'Your cart total is ₹0. Some items may be unavailable — review your cart or reach out to support.',
        buttons: [
          { id: BTN.CART, title: '🛒 View cart' },
          { id: BTN.SUPPORT, title: '💬 Support' },
        ],
      });
      await this.transitionToState(session, 'cart');
      return;
    }

    if ((cart.total ?? 0) <= 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Cart total is ₹0',
        bodyText:
          'The discount exceeds your cart total. Remove the coupon or add more items to continue.',
        buttons: [
          { id: BTN.CART, title: '\uD83D\uDED2 View cart' },
          { id: BTN.BROWSE, title: '\uD83D\uDECD Add more' },
        ],
      });
      await this.transitionToState(session, 'cart');
      return;
    }

    const user = await this.usersService.findById(session.user.toString());
    const selectedIndex = session.context.selectedAddressIndex;
    const address =
      selectedIndex != null && user.addresses[selectedIndex]
        ? user.addresses[selectedIndex]
        : user.addresses.find((a) => a.isDefault) || user.addresses[0];

    if (!address) {
      await this.transitionToState(session, 'address_input');
      await this.sendFlowResponse(phone, 'address_input', session, 'Please add a delivery address first.');
      return;
    }

    if (input === 'another_yes') {
      session.context = mergeChatContext(session.context, { allowAnotherOrderOnce: true });
      await this.saveSession(session);
      await this.sendFlowResponse(phone, 'payment_selection', session, 'Got it. Please select a payment method to place another order.');
      return;
    }

    if (input === 'another_no') {
      if (session.context.allowAnotherOrderOnce) {
        session.context = mergeChatContext(session.context, { allowAnotherOrderOnce: false });
        await this.saveSession(session);
      }
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'No problem. Type *orders* to track, or *menu* to start over.',
      });
      return;
    }

    if (input !== 'cod' && input !== 'prepaid') {
      await this.sendFlowResponse(phone, 'payment_selection', session);
      return;
    }

    if (input === 'prepaid' && !this.paymentsService.isRazorpayConfigured()) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Online payment unavailable',
        bodyText: 'Choose Cash on delivery for now, or try again later.',
        buttons: [
          { id: BTN.COD, title: '\uD83D\uDCB5 Cash on Delivery' },
          { id: BTN.SUPPORT, title: '\uD83D\uDCAC Support' },
          { id: BTN.BACK, title: '\u21A9 Back' },
        ],
      });
      return;
    }

    const ctx = session.context;
    // Exclude cancelled orders so a customer who just cancelled (or whose order
    // was admin-cancelled) isn't blocked by the cooldown popup with no live order.
    const recent = await this.ordersService.findUserOrdersExcludingCancelled(session.user.toString(), 1);
    if (recent.length > 0 && !ctx.allowAnotherOrderOnce) {
      const createdRaw = recent[0].createdAt;
      const createdMs =
        createdRaw instanceof Date ? createdRaw.getTime() : new Date(createdRaw as string).getTime();
      if (Number.isFinite(createdMs) && Date.now() - createdMs < WHATSAPP_RECENT_ORDER_COOLDOWN_MS) {
        await this.whatsappService.sendInteractiveButtons({
          phone,
          headerText: 'Recent order detected',
          bodyText: 'You placed an order moments ago. Place another?',
          buttons: [
            { id: 'another_yes', title: 'Yes, place order' },
            { id: 'another_no', title: 'No' },
          ],
        });
        return;
      }
    }

    const paymentMethod = input === 'cod' ? 'cod' : 'prepaid';

    // Atomic lock against double-tap on the "UPI / Card" or "COD" button. The
    // recent-order cooldown above is a read-then-decide check, so two near-
    // simultaneous taps can both pass it before either order is committed.
    // The lock auto-expires after 60s so a crashed handler never strands the
    // session.
    const checkoutLockAcquired = await this.chatSessionRepository.tryAcquireCheckoutLock(
      session._id,
      60_000,
    );
    if (!checkoutLockAcquired) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: "_We're already placing your order — please wait a moment..._",
      });
      return;
    }

    let order;
    try {
      await this.whatsappService.sendTextMessage({
        phone,
        message: paymentMethod === 'cod' ? '_Placing your order..._' : '_Generating payment link..._',
      });
      // Consume the one-time override (only for this attempt).
      if (ctx.allowAnotherOrderOnce) {
        session.context = mergeChatContext(session.context, { allowAnotherOrderOnce: false });
        await this.saveSession(session);
      }
      // Re-validate coupon right before order creation — it may have expired, hit
      // its usage cap, or been deleted since the cart applied it.
      if (cart.couponCode) {
        try {
          await this.cartService.applyCoupon(session.user.toString(), cart.couponCode);
        } catch {
          await this.cartService.removeCoupon(session.user.toString());
          await this.whatsappService.sendTextMessage({
            phone,
            message: '_Coupon is no longer valid and was removed from your cart._',
          });
        }
      }
      // Refresh cart to pick up any coupon/total adjustments before creating the order.
      const finalCart = await this.cartService.getCart(session.user.toString());

      order = await this.ordersService.create(session.user.toString(), {
        cartId: finalCart.id,
        shippingAddress: {
          name: user.name || 'Customer',
          phone,
          street: address.street,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          landmark: address.landmark,
        },
        paymentMethod,
        idempotencyKey: this.whatsAppCheckoutIdempotencyKey(message.messageId),
        source: 'whatsapp',
      });
    } catch (err) {
      // Never let an order-creation failure drop the user into the generic outer
      // catch — that strands them with "type menu to start over" and no way to
      // retry. Surface a specific reason when we have one, a safe fallback otherwise.
      const msg = err instanceof Error ? err.message : '';
      const isExpected =
        err instanceof BadRequestException && /stock|pincode|empty|deliver/i.test(msg);

      if (!isExpected) {
        this.logger.error(
          `Order creation failed for ${session.user?.toString()}: ${msg || 'unknown'}`,
          err as Error,
        );
      }

      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Order failed',
        bodyText: isExpected
          ? msg
          : 'Couldn\u2019t place the order right now. Your cart is saved \u2014 try again or reach out to support.',
        buttons: [
          { id: BTN.CART, title: '\uD83D\uDED2 View cart' },
          { id: BTN.SUPPORT, title: '\uD83D\uDCAC Support' },
          { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' },
        ],
      });
      await this.transitionToState(session, 'cart');
      await this.chatSessionRepository.releaseCheckoutLock(session._id);
      return;
    }

    this.analytics.track('chatbot.order_completed', {
      userId: session.user.toString(),
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      total: order.total,
      paymentMethod,
    });

    try {
      const placedWhen = this.formatStepTimestamp(order.createdAt);
      const itemsPreview = this.formatOrderItemsPreview(order.items as any[]);
      const billingLines: string[] = [];
      if ((order as any).subtotal && (order as any).subtotal !== order.total) {
        billingLines.push(`Subtotal:  ${this.formatCurrency((order as any).subtotal)}`);
      }
      if ((order as any).discount > 0) {
        billingLines.push(`\uD83C\uDFF7 ${(order as any).couponCode || 'Discount'}:  \u2212${this.formatCurrency((order as any).discount)}`);
      }
      billingLines.push(bold(`Total:  ${this.formatCurrency(order.total)}`));

      const summary =
        `*#${order.orderNumber}*  \u00B7  _${placedWhen || 'Just now'}_\n\n` +
        `\uD83D\uDCE6 *Items (${order.items.length})*\n${itemsPreview}\n\n` +
        billingLines.join('\n');

      if (paymentMethod === 'cod') {
        await this.whatsappService.sendInteractiveButtons({
          phone,
          headerText: '\u2705 Order Confirmed',
          bodyText: `${summary}\n\nWe'll notify you when it ships. \uD83D\uDE9A`,
          footerText: 'Cash on delivery',
          buttons: [
            { id: BTN.BROWSE, title: '\uD83D\uDECD Keep shopping' },
          ],
        });
      } else {
        let payUrl = '';
        try {
          payUrl = await this.paymentsService.generateShortPayUrl(
            order._id.toString(),
            session.user.toString(),
          );
        } catch (signErr) {
          this.logger.warn('WhatsApp pay token failed', signErr);
          payUrl = '';
        }

        // When we have a link, offer the customer the link directly. When we
        // don't (token failure, missing FRONTEND_URL), tell them to reply *pay*
        // \u2014 that triggers `sendFreshPayLink` which retries link generation. The
        // old "sign in to our website" copy was a dead-end for chat-only
        // customers who never registered on the web.
        const body =
          `${summary}\n\n` +
          (payUrl
            ? `\uD83D\uDCB3 Complete your payment:\n${payUrl}`
            : `Reply *pay* to get your payment link, or contact support with order *${order.orderNumber}*.`);

        try {
          await this.whatsappService.sendInteractiveButtons({
            phone,
            headerText: '\u23F3 Payment Pending',
            bodyText: body,
            footerText: payUrl ? 'Link expires in 48 hours' : undefined,
            buttons: [
              { id: BTN.BROWSE, title: '\uD83D\uDECD Keep shopping' },
            ],
          });
        } catch (sendErr) {
          // The order is already saved \u2014 losing this confirmation message must
          // not strand the customer. Log + try a plain text fallback so they at
          // least know the order exists and can reply *pay* to retry.
          this.logger.error(
            `Order created (${order._id.toString()}) but post-order WhatsApp send failed: ${
              sendErr instanceof Error ? sendErr.message : 'unknown'
            }`,
          );
          try {
            await this.whatsappService.sendTextMessage({
              phone,
              message: `Order ${bold(order.orderNumber)} created. Reply *pay* to get your payment link.`,
            });
          } catch (fallbackErr) {
            this.logger.error(
              `Plain-text fallback also failed for ${order._id.toString()}: ${
                fallbackErr instanceof Error ? fallbackErr.message : 'unknown'
              }`,
            );
          }
        }
      }

      await this.transitionToState(session, 'main_menu');
    } finally {
      await this.chatSessionRepository.releaseCheckoutLock(session._id);
    }
  }

  private async openAddressPickerFromPayment(
    phone: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    // Safety: never let the "place another order" override linger after the
    // customer explicitly leaves payment to adjust delivery details.
    if (session.context.allowAnotherOrderOnce) {
      session.context = mergeChatContext(session.context, { allowAnotherOrderOnce: false });
      await this.saveSession(session);
    }

    if (!session.user) {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session, 'Please register to choose a delivery address.');
      return;
    }

    const cart = await this.cartService.getCart(session.user.toString());
    if (cart.items.length === 0) {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session, 'Your cart is empty. Browse products to get started.');
      return;
    }

    await this.transitionToState(session, 'checkout');
    // Force the address list — the auto-pick in sendCheckoutOptions would
    // otherwise bounce the customer right back to payment_selection.
    await this.sendCheckoutOptions(phone, session, { forceShowList: true });
  }

  /**
   * Re-issue a fresh WhatsApp pay link for an unpaid prepaid order. Triggered
   * by the "Pay now" button on the order-tracking screen and by the `pay`
   * text shortcut on the most recent unpaid order. Verifies ownership,
   * already-paid state, and that a frontend base URL + JWT_SECRET exist
   * before constructing the link.
   */
  private async sendFreshPayLink(
    session: ChatSessionDocument,
    phone: string,
    orderId: string,
  ): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register or log in to continue with payment.',
      });
      return;
    }

    let order;
    try {
      order = await this.ordersService.findById(orderId);
    } catch {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'That order is no longer available.',
      });
      return;
    }

    const orderUserId = this.getOrderUserId(order);
    if (!orderUserId || orderUserId !== session.user.toString()) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'You do not have access to this order.',
      });
      return;
    }
    if (order.status === 'cancelled') {
      await this.whatsappService.sendTextMessage({
        phone,
        message: `Order #${order.orderNumber} has been cancelled.`,
      });
      return;
    }
    if (order.status === 'refunded' || order.paymentStatus === 'refunded') {
      await this.whatsappService.sendTextMessage({
        phone,
        message: `Order #${order.orderNumber} has been refunded — no further payment is needed.`,
      });
      return;
    }
    if (order.paymentStatus === 'paid') {
      await this.whatsappService.sendTextMessage({
        phone,
        message: `Order #${order.orderNumber} is already paid. Thank you!`,
      });
      return;
    }
    if (order.paymentMethod !== 'prepaid') {
      await this.whatsappService.sendTextMessage({
        phone,
        message: `Order #${order.orderNumber} is Cash on Delivery — no online payment needed.`,
      });
      return;
    }

    let payUrl = '';
    try {
      payUrl = await this.paymentsService.generateShortPayUrl(
        order._id.toString(),
        session.user.toString(),
      );
    } catch (signErr) {
      this.logger.warn('Re-issue WhatsApp pay token failed', signErr);
    }

    if (!payUrl) {
      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `We couldn't generate a payment link right now. Please contact support to complete payment for #${order.orderNumber}.`,
      });
      return;
    }

    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: '💳 Complete payment',
      bodyText:
        `${bold(`#${order.orderNumber}`)}\n` +
        `Total ${bold(this.formatCurrency(order.total))}\n\n` +
        `Tap the link to pay securely:\n${payUrl}\n\n` +
        `${italic('Link expires in 48 hours.')}`,
      buttons: [
        { id: Btn.order(order._id.toString()), title: '📦 Apka last order' },
        { id: BTN.MENU, title: '🏠 Menu' },
      ],
    });
  }

  private async handleOrderTracking(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (input === 'back') {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
      return;
    }

    if (input === 'more_orders') {
      const nextPage = this.getListPage(session, 'ordersPage') + 1;
      await this.setListPage(session, 'ordersPage', nextPage);
      await this.sendOrdersList(phone, session);
      return;
    }

    const btn = parseButton(input);

    if (btn.kind === 'order') {
      const orderId = btn.id;
      let order;
      try {
        order = await this.ordersService.findById(orderId);
      } catch (err) {
        this.logger.warn(
          `Order findById failed for ${orderId}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'This order is no longer available.',
        });
        await this.sendOrdersList(phone, session);
        return;
      }
      const orderUserId = this.getOrderUserId(order);
      if (!session.user || !orderUserId || orderUserId !== session.user.toString()) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'You do not have access to this order.',
        });
        await this.sendOrdersList(phone, session);
        return;
      }

      const message = this.buildOrderTrackingMessage(order);

      // For an unpaid prepaid order, expose a "Pay now" action on the
      // tracking screen. Without this, a customer who dismissed (or whose
      // 48h pay link expired) had no chatbot path to retry payment and was
      // forced to log in on the web. WhatsApp interactive buttons cap at 3.
      const isUnpaidPrepaid =
        order.paymentMethod === 'prepaid' &&
        order.paymentStatus !== 'paid' &&
        order.status !== 'cancelled';
      const trackingButtons = isUnpaidPrepaid
        ? [
            { id: Btn.payOrder(orderId), title: '\uD83D\uDCB3 Pay now' },
            { id: BTN.REORDER_CURRENT, title: '\uD83D\uDD01 Reorder' },
            { id: BTN.BACK, title: '\u21A9 Back' },
          ]
        : [
            { id: BTN.REORDER_CURRENT, title: '\uD83D\uDD01 Reorder' },
            { id: BTN.SUPPORT, title: '\uD83D\uDCAC Help' },
            { id: BTN.BACK, title: '\u21A9 Back' },
          ];

      // Persist the selected order id so "Reorder" works even when providers
      // (e.g. 360dialog fallbacks) don't echo back dynamic button ids.
      session.pendingOrderId = orderId;
      await this.saveSession(session);

      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText: message,
        buttons: trackingButtons,
      });
      return;
    }

    if (btn.kind === 'payOrder') {
      await this.sendFreshPayLink(session, phone, btn.id);
      return;
    }

    if (input === BTN.REORDER_CURRENT && session.pendingOrderId) {
      const orderId = session.pendingOrderId;
      let order;
      try {
        order = await this.ordersService.findById(orderId);
      } catch (err) {
        this.logger.warn(
          `Order findById (reorder) failed for ${orderId}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'This order is no longer available for reorder.',
        });
        await this.sendOrdersList(phone, session);
        return;
      }
      const reorderOrderUserId = this.getOrderUserId(order);
      if (!session.user || !reorderOrderUserId || reorderOrderUserId !== session.user.toString()) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'You do not have access to this order.',
        });
        await this.sendOrdersList(phone, session);
        return;
      }
      session.pendingOrderId = orderId;
      await this.transitionToState(session, 'reorder');
      await this.sendFlowResponse(phone, 'reorder', session);
      return;
    }

    if (btn.kind === 'reorder') {
      // Backward compatibility: older messages embed reorder_<orderId>.
      const orderId = btn.id;
      session.pendingOrderId = orderId;
      await this.saveSession(session);
      await this.transitionToState(session, 'reorder');
      await this.sendFlowResponse(phone, 'reorder', session);
      return;
    }

    await this.sendOrdersList(phone, session);
  }

  private async handleReorder(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (input === 'cancel' || input === 'back') {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
      return;
    }

    if (input === 'confirm' && session.pendingOrderId && session.user) {
      // IMPORTANT: do NOT use ordersService.reorder here — that creates a brand
      // new order directly, reusing the old address and payment method without
      // letting the customer review anything. For the WhatsApp flow we want
      // reorder to ADD the items to the cart so the customer can still apply
      // coupons, pick a different address, and choose how to pay.
      const userId = session.user.toString();
      const pendingOrderId = session.pendingOrderId;

      let originalOrder;
      try {
        originalOrder = await this.ordersService.findById(pendingOrderId);
      } catch (err) {
        this.logger.warn(
          `Reorder: original order ${pendingOrderId} not found (${err instanceof Error ? err.message : 'unknown'})`,
        );
        await this.whatsappService.sendInteractiveButtons({
          phone,
          headerText: 'Reorder failed',
          bodyText: 'Couldn\u2019t find that order. Try another one.',
          buttons: [
            { id: BTN.ORDERS, title: '\uD83D\uDCE6 My orders' },
            { id: BTN.BROWSE, title: '\uD83D\uDECD Browse' },
            { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' },
          ],
        });
        session.pendingOrderId = undefined;
        await this.transitionToState(session, 'main_menu');
        return;
      }

      // Guard against cross-user replay — only the owner can reorder.
      const orderUserId = this.getOrderUserId(originalOrder);
      if (!orderUserId || orderUserId !== userId) {
        session.pendingOrderId = undefined;
        await this.transitionToState(session, 'main_menu');
        await this.sendFlowResponse(phone, 'main_menu', session, 'You don\u2019t have access to that order.');
        return;
      }

      if (!originalOrder.items || originalOrder.items.length === 0) {
        await this.whatsappService.sendInteractiveButtons({
          phone,
          headerText: 'Reorder unavailable',
          bodyText: 'That order has no items to reorder.',
          buttons: [
            { id: BTN.ORDERS, title: '\uD83D\uDCE6 My orders' },
            { id: BTN.BROWSE, title: '\uD83D\uDECD Browse' },
          ],
        });
        session.pendingOrderId = undefined;
        await this.transitionToState(session, 'main_menu');
        return;
      }

      // Replace whatever is in the cart with the reorder items so totals line
      // up. Existing cart items would otherwise pile on top of the reorder.
      try {
        await this.cartService.clearCart(userId);
      } catch (err) {
        this.logger.warn(
          `Reorder: clearCart failed for ${userId}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }

      const skipped: string[] = [];
      let addedCount = 0;
      for (const item of originalOrder.items) {
        try {
          await this.cartService.addItem(userId, {
            productId: item.product.toString(),
            quantity: item.quantity,
            variantSku: item.variantSku,
          });
          addedCount += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          this.logger.warn(
            `Reorder: could not add ${item.name}: ${msg || 'unknown'}`,
          );
          skipped.push(item.name);
        }
      }

      session.pendingOrderId = undefined;
      await this.saveSession(session);

      if (addedCount === 0) {
        await this.whatsappService.sendInteractiveButtons({
          phone,
          headerText: 'Reorder unavailable',
          bodyText:
            `None of the items from ${bold(`#${originalOrder.orderNumber}`)} are available right now.`,
          buttons: [
            { id: BTN.BROWSE, title: '\uD83D\uDECD Browse' },
            { id: BTN.ORDERS, title: '\uD83D\uDCE6 My orders' },
            { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' },
          ],
        });
        await this.transitionToState(session, 'main_menu');
        return;
      }

      if (skipped.length > 0) {
        const skippedList = skipped.slice(0, 3).join(', ');
        const extra = skipped.length > 3 ? ` +${skipped.length - 3} more` : '';
        await this.whatsappService.sendTextMessage({
          phone,
          message:
            `${italic('Some items couldn\u2019t be added')}\n` +
            `\u2022 ${skippedList}${extra}`,
        });
      }

      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `\u2705 ${bold('Added to cart')}\n` +
          `${addedCount} item${addedCount === 1 ? '' : 's'} from ${bold(`#${originalOrder.orderNumber}`)} are ready for checkout.`,
      });

      this.analytics.track('chatbot.reorder_applied', {
        userId,
        orderId: pendingOrderId,
        addedCount,
        skippedCount: skipped.length,
      });

      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session);
      return;
    }

    if (input === 'modify' && session.pendingOrderId) {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session);
      return;
    }

    await this.sendFlowResponse(phone, 'reorder', session);
  }

  private async startReorderFromLatestOrder(
    phone: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    if (!session.user) {
      await this.sendFlowResponse(phone, 'main_menu', session, 'Please register first, then you can reorder from your recent orders.');
      return;
    }

    const recent = await this.ordersService.findUserOrders(session.user.toString(), 1);
    const latest = recent[0];
    if (!latest) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'No orders yet',
        bodyText: 'You do not have any previous orders to reorder.',
        buttons: [
          { id: BTN.BROWSE, title: '\uD83D\uDECD Shop Now' },
          { id: BTN.ORDERS, title: '\uD83D\uDCE6 My orders' },
        ],
      });
      return;
    }

    session.pendingOrderId = latest._id.toString();
    await this.transitionToState(session, 'reorder');
    await this.sendFlowResponse(phone, 'reorder', session);
  }

  private async handleFaq(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    // "Back to FAQ" from a FAQ answer re-shows the FAQ topic list.
    // "Back" on the top-level FAQ list goes to the main menu.
    if (input === 'faq_list') {
      await this.sendFlowResponse(phone, 'faq', session);
      return;
    }

    if (input === 'back') {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
      return;
    }

    if (input === 'support') {
      await this.transitionToState(session, 'support');
      await this.sendFlowResponse(phone, 'support', session);
      return;
    }

    const faqResponse = FAQ_RESPONSES[input];
    if (faqResponse) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText: faqResponse,
        buttons: [
          { id: 'faq_list', title: '\u21A9 Back to FAQ' },
          { id: 'support', title: '\uD83D\uDC64 Talk to Support' },
          { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' },
        ],
      });
      return;
    }

    await this.sendFlowResponse(phone, 'faq', session);
  }

  private async handleSupport(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (this.isMenuCommand(input)) {
      session.isHandedOffToSupport = false;
      session.supportHandoffExpiresAt = undefined;
      await this.saveSession(session);
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
      return;
    }

    const SUPPORT_HANDOFF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
    session.isHandedOffToSupport = true;
    session.supportHandoffAt = new Date();
    session.supportHandoffExpiresAt = new Date(Date.now() + SUPPORT_HANDOFF_TTL_MS);
    await session.save();

    await this.whatsappService.sendTextMessage({
      phone,
      message:
        `\u2705 ${bold('Message received')}\n\n` +
        `You\u2019re now connected with our support team \u2014 ${italic('the bot is paused for 2 hours')}.\n` +
        `We\u2019ll respond shortly. For urgent help call ${bold('8962021112')}.\n\n` +
        `_Type *menu* anytime to exit support and resume the bot._`,
    });
  }

  // ─── Account Handlers ───────────────────────────────────────────────

  private async handleAccount(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (input === 'back') {
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
      return;
    }

    if (input === 'edit_profile') {
      await this.transitionToState(session, 'account_edit');
      await this.sendProfileEditOptions(phone, session);
      return;
    }

    if (input === 'addresses') {
      await this.transitionToState(session, 'account_addresses');
      await this.sendAddressList(phone, session);
      return;
    }

    if (input === 'wallet') {
      await this.transitionToState(session, 'wallet');
      await this.sendWalletSummary(phone, session);
      return;
    }

    await this.sendAccountSummary(phone, session);
  }

  private async handleAccountEdit(
    session: ChatSessionDocument,
    phone: string,
    inputText: string,
    transitionKey: string,
  ): Promise<void> {
    if (transitionKey === 'back') {
      session.context = mergeChatContext(session.context, { editingField: undefined });
      await this.saveSession(session);
      await this.transitionToState(session, 'account');
      await this.sendAccountSummary(phone, session);
      return;
    }

    // User tapped "Change Name" or "Change Email" — enter input mode.
    if (transitionKey === 'edit_name') {
      session.context = mergeChatContext(session.context, { editingField: 'name' });
      await this.saveSession(session);
      await this.whatsappService.sendTextMessage({
        phone,
        message: `${bold('Enter your new name:')}\n\n${italic('Type *back* to cancel.')}`,
      });
      return;
    }

    if (transitionKey === 'edit_email') {
      session.context = mergeChatContext(session.context, { editingField: 'email' });
      await this.saveSession(session);
      await this.whatsappService.sendTextMessage({
        phone,
        message: `${bold('Enter your new email:')}\n\n${italic('Type *back* to cancel.')}`,
      });
      return;
    }

    // User sent free-text while editing a field.
    const editingField = session.context.editingField;
    if (editingField && session.user) {
      const value = inputText.trim();

      // Let "back" / "cancel" escape edit mode so users aren't trapped when
      // the prompt is a plain text message with no buttons.
      if (/^(back|cancel|menu)$/i.test(value)) {
        session.context = mergeChatContext(session.context, { editingField: undefined });
        await this.saveSession(session);
        await this.sendProfileEditOptions(phone, session);
        return;
      }

      if (!value) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: `Please enter a valid ${editingField}, or type *back* to cancel.`,
        });
        return;
      }

      if (editingField === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'That doesn\'t look like a valid email. Please type your email again, or tap Back.',
        });
        return;
      }

      try {
        await this.usersService.update(session.user.toString(), { [editingField]: value });
      } catch (err) {
        this.logger.warn(
          `Profile update failed for ${session.user.toString()} (${editingField}): ${err instanceof Error ? err.message : 'unknown'}`,
        );
        const msg = err instanceof Error ? err.message : '';
        const looksLikeDup = /duplicate|exists|unique/i.test(msg);
        await this.whatsappService.sendTextMessage({
          phone,
          message: looksLikeDup
            ? `That ${editingField} is already in use. Please try another.`
            : `Couldn't update your ${editingField}. Please try again or tap Back.`,
        });
        return;
      }
      session.context = mergeChatContext(session.context, { editingField: undefined });
      await this.saveSession(session);

      await this.whatsappService.sendTextMessage({
        phone,
        message: `*${editingField === 'name' ? 'Name' : 'Email'} Updated* \u2713`,
      });
      await this.sendProfileEditOptions(phone, session);
      return;
    }

    await this.sendProfileEditOptions(phone, session);
  }

  private async handleAccountAddresses(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (input === 'back') {
      await this.transitionToState(session, 'account');
      await this.sendAccountSummary(phone, session);
      return;
    }

    if (input === 'add_address') {
      const flowId = this.configService.get<string>('whatsapp.flowId');
      const provider = this.configService.get<string>('whatsapp.provider');
      if (flowId && provider === 'meta') {
        await this.whatsappService.sendWhatsAppFlow({
          phone,
          flowId,
          flowToken: this.encodeFlowToken(phone, 'account'),
          flowMode: this.configService.get<'draft' | 'published'>('whatsapp.flowMode') ?? 'draft',
          headerText: 'Add Address',
          bodyText: 'Fill in your new delivery address.',
          ctaLabel: 'Add Address',
        });
        // Session stays in 'account_addresses' — flow endpoint transitions it after save.
        return;
      }
      await this.transitionToState(session, 'address_input');
      await this.sendFlowResponse(phone, 'address_input', session);
      return;
    }

    if (input.startsWith('addr_')) {
      const idx = Number.parseInt(input.replace('addr_', ''), 10);
      if (!Number.isFinite(idx) || idx < 0) {
        await this.sendAddressList(phone, session);
        return;
      }

      if (!session.user) {
        await this.sendAddressList(phone, session);
        return;
      }

      const user = await this.usersService.findById(session.user.toString());
      const address = user.addresses[idx];
      if (!address) {
        await this.whatsappService.sendTextMessage({ phone, message: 'Address not found.' });
        await this.sendAddressList(phone, session);
        return;
      }

      session.context = mergeChatContext(session.context, { editingAddressIndex: idx });
      await this.saveSession(session);
      await this.transitionToState(session, 'account_address_edit');

      const defaultTag = address.isDefault ? '  \u2605 Default' : '';
      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText:
          `*${address.label}*${defaultTag}\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          `${address.street}\n` +
          `${address.city}, ${address.state} ${address.pincode}` +
          (address.landmark ? `\n_Landmark: ${address.landmark}_` : ''),
        buttons: [
          { id: 'set_default', title: 'Set as default' },
          { id: 'delete_address', title: 'Delete' },
          { id: 'back', title: 'Back' },
        ],
      });
      return;
    }

    await this.sendAddressList(phone, session);
  }

  private async handleAccountAddressEdit(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (input === 'back') {
      await this.transitionToState(session, 'account_addresses');
      await this.sendAddressList(phone, session);
      return;
    }

    if (!session.user) {
      await this.transitionToState(session, 'account');
      await this.sendAccountSummary(phone, session);
      return;
    }

    const idx = session.context.editingAddressIndex;
    if (idx == null || idx < 0) {
      await this.transitionToState(session, 'account_addresses');
      await this.sendAddressList(phone, session);
      return;
    }

    if (input === 'set_default') {
      try {
        await this.usersService.updateAddress(session.user.toString(), idx, { isDefault: true });
        await this.whatsappService.sendTextMessage({
          phone,
          message: '*Default Address Updated* \u2713',
        });
      } catch {
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'Could not update address. Please try again.',
        });
      }
      await this.transitionToState(session, 'account_addresses');
      await this.sendAddressList(phone, session);
      return;
    }

    if (input === 'delete_address') {
      try {
        await this.usersService.removeAddress(session.user.toString(), idx);
        await this.whatsappService.sendTextMessage({
          phone,
          message: '*Address Deleted* \u2713',
        });
      } catch {
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'Could not delete address. Please try again.',
        });
      }
      await this.transitionToState(session, 'account_addresses');
      await this.sendAddressList(phone, session);
      return;
    }

    await this.sendFlowResponse(phone, 'account_address_edit', session);
  }

  private async handleWallet(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (input === 'back') {
      await this.transitionToState(session, 'account');
      await this.sendAccountSummary(phone, session);
      return;
    }

    if (input === 'wallet_history') {
      if (!session.user) {
        await this.whatsappService.sendTextMessage({ phone, message: 'Please register first.' });
        return;
      }

      const { transactions } = await this.walletService.getRecentTransactions(
        session.user.toString(),
        5,
      );

      if (transactions.length === 0) {
        await this.whatsappService.sendInteractiveButtons({
          phone,
          bodyText:
            `*Transactions*\n` +
            `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
            `No transactions yet. Your history will appear here.`,
          buttons: [{ id: 'back', title: 'Back' }],
        });
        return;
      }

      const lines = transactions.map((tx) => {
        const sign = tx.type === 'credit' ? '+' : '\u2212';
        const amount = this.formatCurrency(tx.amount / 100);
        const date = tx.createdAt
          ? new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
          : '';
        return `${sign}${amount}  \u00B7  ${tx.reason}${date ? `  \u00B7  ${date}` : ''}`;
      });

      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText:
          `*Recent Transactions*\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          lines.join('\n'),
        buttons: [{ id: 'back', title: 'Back' }],
      });
      return;
    }

    await this.sendWalletSummary(phone, session);
  }

  // ─── Account Senders ──────────────────────────────────────────────

  private async sendAccountSummary(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register first to view your account.',
      });
      return;
    }

    const user = await this.usersService.findById(session.user.toString());

    let walletLine = '';
    try {
      const balancePaise = await this.walletService.getBalance(session.user.toString());
      walletLine = `\nWallet      ${this.formatCurrency(balancePaise / 100)}`;
    } catch {
      // Wallet may not exist yet — skip.
    }

    const addressCount = user.addresses.length;

    const body =
      `*My Account*\n` +
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
      `Name         ${user.name || '_Not set_'}\n` +
      `Phone        ${user.phone || phone}\n` +
      `Email         ${user.email || '_Not set_'}\n` +
      `Addresses  ${addressCount} saved` +
      walletLine +
      `\n\n` +
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n` +
      `Orders  *${user.totalOrders || 0}*  \u00B7  Spent  *${this.formatCurrency(user.totalSpent || 0)}*\n\n` +
      `_Type *edit profile* to update your name or email._`;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: body,
      buttons: [
        { id: 'orders', title: 'My orders' },
        { id: 'addresses', title: 'My addresses' },
        { id: 'wallet', title: 'Wallet' },
      ],
    });
  }

  private async sendProfileEditOptions(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) return;

    const user = await this.usersService.findById(session.user.toString());

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText:
        `*Edit Profile*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Name   ${user.name || '_Not set_'}\n` +
        `Email   ${user.email || '_Not set_'}\n\n` +
        `What would you like to update?`,
      buttons: [
        { id: 'edit_name', title: 'Change name' },
        { id: 'edit_email', title: 'Change email' },
        { id: 'back', title: 'Back' },
      ],
    });
  }

  private async sendAddressList(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register first to manage addresses.',
      });
      return;
    }

    const user = await this.usersService.findById(session.user.toString());

    if (user.addresses.length === 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText:
          `*My addresses*\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          `No saved addresses yet. Add your first one.`,
        buttons: [
          { id: 'add_address', title: 'Add address' },
          { id: 'back', title: 'Back' },
        ],
      });
      return;
    }

    const rows = user.addresses.slice(0, 8).map((addr, idx) => ({
      id: `addr_${idx}`,
      title: `${addr.isDefault ? '\u2605 ' : ''}${addr.label}`.slice(0, 24),
      description: `${addr.street}, ${addr.city} ${addr.pincode}`.slice(0, 72),
    }));

    rows.push({ id: 'add_address', title: 'Add new address', description: 'Add a new delivery address' });

    await this.whatsappService.sendInteractiveList({
      phone,
      bodyText:
        `*My addresses* (${user.addresses.length})\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Tap an address to manage it.`,
      buttonText: 'View Addresses',
      sections: [{ title: 'Saved addresses', rows }],
    });
  }

  private async sendWalletSummary(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register first to view your wallet.',
      });
      return;
    }

    let balancePaise = 0;
    try {
      balancePaise = await this.walletService.getBalance(session.user.toString());
    } catch {
      // Wallet may not exist yet.
    }

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText:
        `*My Wallet*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Balance  *${this.formatCurrency(balancePaise / 100)}*\n\n` +
        `_Automatically applied at checkout._`,
      buttons: [
        { id: 'wallet_history', title: 'Transactions' },
        { id: 'back', title: 'Back' },
      ],
    });
  }

  // ─── Original Senders (Category/Product) ──────────────────────────

  /**
   * Browse entry point. Prefers Meta catalog message when UCM is configured;
   * falls back to a capped multi-product list / legacy category list when the
   * catalog ID is missing or the env flag disables it. Catalog ID and stock
   * are resolved at send time so live config changes are picked up.
   */
  private async sendBrowseSurface(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!this.isCatalogBrowseEnabled()) {
      await this.sendCategoryList(phone, session);
      return;
    }

    const catalogId = await this.getActiveCatalogId();
    if (!catalogId) {
      this.logger.warn('Catalog browse requested but UCM has no selectedCatalogId / syncMode!=meta — falling back to interactive list');
      await this.sendCategoryList(phone, session);
      return;
    }

    let catalogSent: string | null = null;
    try {
      catalogSent = await this.whatsappService.sendCatalogMessage({
        phone,
        bodyText: 'Browse our store and add items from the full catalogue.',
        footerText: 'Tap View items to continue.',
        thumbnailProductRetailerId: await this.findCatalogThumbnailRetailerId(),
      });
    } catch (error) {
      this.logger.warn(
        `sendCatalogMessage threw (${error instanceof Error ? error.message : 'unknown'}); falling back to product list`,
      );
    }

    if (!catalogSent) {
      this.logger.warn('sendCatalogMessage returned null; falling back to product list');
      try {
        await this.sendCatalogProductList(phone, session, catalogId);
      } catch (fallbackError) {
        this.logger.warn(
          `sendCatalogProductList failed (${fallbackError instanceof Error ? fallbackError.message : 'unknown'}); falling back to interactive list`,
        );
        await this.sendCategoryList(phone, session);
      }
    }
  }

  private async findCatalogThumbnailRetailerId(): Promise<string | undefined> {
    const categories = await this.getActiveCategories();
    const mainStoreId = await this.getMainStoreId();
    for (const cat of categories) {
      const products = await this.getProductsByCategory(cat._id.toString());
      for (const product of products) {
        if (product.isActive === false) continue;
        // Only use products confirmed to exist in the FB catalog (UCM-synced).
        // SKU / ObjectId fallbacks are not guaranteed to be valid catalog retailer IDs
        // and cause WhatsApp to reject the catalog_message with 131009.
        const meta = product.metadata as Record<string, unknown> | undefined;
        const remoteId = typeof meta?.remoteCatalogRetailerId === 'string' ? meta.remoteCatalogRetailerId.trim() : '';
        if (!remoteId) continue;

        if (product.trackStock === false) return remoteId;

        const stock = await this.storeStockService.getStockForStoreProduct(
          mainStoreId,
          product._id.toString(),
        );
        if (this.resolveStoreAvailableStock(stock) > 0) {
          return remoteId;
        }
      }
    }

    return undefined;
  }

  /**
   * Render the merchant's Meta catalog inside WhatsApp as one product_list
   * message. Sections = categories. Caps at 30 product items / 10 sections
   * to respect WhatsApp interactive limits. Only items that the main store
   * can fulfil are surfaced.
   */
  private async sendCatalogProductList(
    phone: string,
    session: ChatSessionDocument,
    catalogId: string,
  ): Promise<void> {
    const MAX_SECTIONS = 10;
    const MAX_ITEMS_TOTAL = 30;

    const categories = await this.getActiveCategories();
    if (categories.length === 0) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'No products are available right now. Please try again later.',
      });
      return;
    }

    const mainStoreId = await this.getMainStoreId();
    const sections: Array<{ title: string; productRetailerIds: string[] }> = [];
    const truncatedCategories: string[] = [];
    let itemsRemaining = MAX_ITEMS_TOTAL;
    let categoriesSkipped = Math.max(0, categories.length - MAX_SECTIONS);

    for (const cat of categories.slice(0, MAX_SECTIONS)) {
      if (itemsRemaining <= 0) {
        categoriesSkipped += 1;
        continue;
      }
      let products: Product[] = [];
      try {
        products = await this.getProductsByCategory(cat._id.toString());
      } catch (error) {
        this.logger.warn(
          `catalog browse: findByCategory failed for ${cat._id.toString()}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
        continue;
      }
      if (products.length === 0) continue;

      const trackedIds = products.filter((p) => p.trackStock !== false).map((p) => p._id.toString());
      let stockMap: Map<string, unknown> = new Map();
      if (trackedIds.length) {
        try {
          stockMap = await this.storeStockService.getStockMapForStoreProducts(mainStoreId, trackedIds);
        } catch (error) {
          this.logger.warn(
            `catalog browse: stock lookup failed for category ${cat._id.toString()}: ${error instanceof Error ? error.message : 'unknown'} — skipping category`,
          );
          continue;
        }
      }

      const fulfillable = products.filter((p) => {
        if (p.isActive === false) return false;
        if (p.trackStock === false) return true;
        return this.resolveStoreAvailableStock(stockMap.get(p._id.toString())) > 0;
      });
      if (fulfillable.length === 0) continue;

      const productRetailerIds: string[] = [];
      for (const p of fulfillable) {
        if (productRetailerIds.length >= itemsRemaining) break;
        // Only send products whose retailer_id is confirmed in the FB catalog.
        const meta = p.metadata as Record<string, unknown> | undefined;
        const remoteId = typeof meta?.remoteCatalogRetailerId === 'string' ? meta.remoteCatalogRetailerId.trim() : '';
        if (!remoteId) continue;
        productRetailerIds.push(remoteId);
      }
      if (productRetailerIds.length === 0) continue;

      sections.push({ title: clip(cat.name, 24), productRetailerIds });
      itemsRemaining -= productRetailerIds.length;

      // Track which categories had to drop products so we can prompt the
      // customer to drill in by typing the category name.
      if (productRetailerIds.length < fulfillable.length) {
        truncatedCategories.push(cat.name);
      }
    }

    if (sections.length === 0) {
      // No UCM-synced products available — throw so the caller falls back to
      // the interactive category list rather than showing "Out of stock" for
      // products that may simply not be in the FB catalog yet.
      throw new Error('No UCM-synced products available for product_list');
    }

    const sent = await this.whatsappService.sendProductListMessage({
      phone,
      catalogId,
      headerText: 'Browse our store',
      bodyText: 'Tap any item to add it to your cart, then send the cart to place your order.',
      sections,
    });
    if (!sent) {
      throw new Error('sendProductListMessage returned null');
    }

    // WhatsApp's product_list message caps at 30 items / 10 sections. When
    // we hit that ceiling, point the customer at typed search so they can
    // still reach the rest of the catalogue.
    if (truncatedCategories.length > 0 || categoriesSkipped > 0) {
      const examples = truncatedCategories.slice(0, 3).join(', ');
      const hint = examples
        ? `Type a category (e.g. *${examples}*) or product name to see more.`
        : 'Type a category or product name to see more.';
      await this.whatsappService.sendTextMessage({ phone, message: hint });
    }
  }

  /**
   * Customer tapped "Send" on the WhatsApp catalog basket. We get a single
   * webhook with all product_items[] and quantities. Replace the local cart
   * (their basket on WhatsApp is the new source of truth) and jump straight
   * to the coupon/checkout flow. Items that can't be resolved or are out of
   * stock are reported back so the customer knows what was dropped.
   */
  private async handleCatalogOrder(
    session: ChatSessionDocument,
    phone: string,
    items: Array<{ productRetailerId: string; quantity?: number; itemPrice?: number; currency?: string }>,
    messageId?: string,
  ): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please share your name to start ordering, then resend your cart.',
      });
      return;
    }

    // Idempotency: 360dialog/Meta can redeliver the same `order` webhook on
    // network blips. Without this guard the second delivery would clear the
    // cart again (wiping any coupon the user applied between deliveries) and
    // re-add items, confusing the customer.
    if (messageId && session.context?.lastCatalogOrderMessageId === messageId) {
      this.logger.log(`catalog order: skipping duplicate delivery for message ${messageId}`);
      return;
    }

    const userId = session.user.toString();

    // Preserve any coupon the customer applied between catalog visits — the
    // basket replaces items but the customer's intent to use the code shouldn't
    // silently vanish. Re-applied below after items land; revalidation will
    // drop it if the new cart no longer qualifies.
    let preservedCouponCode: string | undefined;
    try {
      const existing = await this.cartService.getCart(userId);
      preservedCouponCode = existing.couponCode;
    } catch {
      preservedCouponCode = undefined;
    }

    try {
      await this.cartService.clearCart(userId);
    } catch (error) {
      this.logger.error(
        `catalog order: clearCart failed for ${userId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Cart unavailable',
        bodyText: "Couldn't prepare your cart just now. Send it again in a moment.",
        buttons: [{ id: BTN.MENU, title: '🏠 Menu' }],
      });
      return;
    }

    const failures: Array<{ retailerId: string; reason: string }> = [];
    let addedCount = 0;

    for (const item of items) {
      const retailerId = (item.productRetailerId || '').trim();
      if (!retailerId) continue;
      const qty = Math.max(1, Math.min(Math.floor(item.quantity || 1), 99));

      const product = await this.productsService.findByRetailerId(retailerId).catch(() => null);
      if (!product) {
        failures.push({ retailerId, reason: 'no longer available' });
        continue;
      }

      // Determine which variant sku this retailer_id maps to (if any).
      // findByRetailerId returns the parent product; we re-derive the matched
      // variant sku here so addItem gets the correct price and stock.
      let matchedVariantSku: string | undefined;
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        let vDash = retailerId.indexOf('-');
        while (vDash > 0) {
          const candidateSku = retailerId.slice(vDash + 1);
          if (product.variants.some((v) => String(v.sku) === candidateSku)) {
            matchedVariantSku = candidateSku;
            break;
          }
          vDash = retailerId.indexOf('-', vDash + 1);
        }
      }

      // Prefer the price the customer actually saw on WhatsApp's catalog
      // (Meta echoes it back as item_price in the order webhook). Falls
      // through to the local product/variant price if Meta omitted it.
      // Currency is INR-only for this store; ignore mismatched currencies
      // rather than trusting a foreign-denominated number.
      const rawCatalogPrice = (!item.currency || item.currency.toUpperCase() === 'INR')
        ? item.itemPrice
        : undefined;

      // Guard against the propagation race where Meta's catalog hasn't yet
      // picked up a price update we pushed locally. If Meta echoes a price
      // that's >10% below our current DB price, the customer is seeing stale
      // data — reject the line rather than honour a price that costs us
      // margin without the merchant noticing. Allow Meta-side ↑ overrides
      // (rare; means our DB lags Meta) since charging less is safer.
      let catalogPrice = rawCatalogPrice;
      if (typeof rawCatalogPrice === 'number' && rawCatalogPrice > 0) {
        const matchedVariant = matchedVariantSku
          ? product.variants.find((v) => String(v.sku) === matchedVariantSku)
          : undefined;
        const dbPrice = matchedVariant ? matchedVariant.price : product.price;
        if (dbPrice > 0 && rawCatalogPrice < dbPrice * 0.9) {
          this.logger.warn(
            `catalog_price_mismatch product=${product._id.toString()} variant=${matchedVariantSku ?? 'none'} catalog=${rawCatalogPrice} db=${dbPrice}`,
          );
          this.analytics.track('chatbot.catalog_price_mismatch', {
            userId,
            productId: product._id.toString(),
            variantSku: matchedVariantSku,
            catalogPrice: rawCatalogPrice,
            dbPrice,
          });
          failures.push({
            retailerId: product.name || retailerId,
            reason: 'price changed — please refresh and add again',
          });
          continue;
        }
      }

      try {
        await this.cartService.addItem(
          userId,
          {
            productId: product._id.toString(),
            quantity: qty,
            ...(matchedVariantSku ? { variantSku: matchedVariantSku } : {}),
          },
          { unitPriceOverride: catalogPrice },
        );
        addedCount += 1;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'add to cart failed';
        let reason: string;
        if (/price unavailable/i.test(msg)) {
          reason = 'price unavailable — please contact support';
        } else if (/stock/i.test(msg)) {
          reason = msg;
        } else {
          reason = 'could not be added';
        }
        failures.push({ retailerId: product.name || retailerId, reason });
      }
    }

    if (messageId) {
      session.context = mergeChatContext(session.context, { lastCatalogOrderMessageId: messageId });
      await this.saveSession(session);
    }

    // Re-apply the preserved coupon. If the new cart no longer qualifies
    // (e.g. minOrderAmount), tell the customer instead of silently dropping.
    if (addedCount > 0 && preservedCouponCode) {
      try {
        await this.cartService.applyCoupon(userId, preservedCouponCode);
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'no longer valid';
        await this.whatsappService.sendTextMessage({
          phone,
          message: `Coupon ${preservedCouponCode} couldn't be re-applied — ${reason}.`,
        });
      }
    }

    this.analytics.track('chatbot.catalog_order_received', {
      userId,
      itemsRequested: items.length,
      itemsAdded: addedCount,
      itemsFailed: failures.length,
    });

    if (addedCount === 0) {
      const detail = failures.slice(0, 5).map((f) => `• ${f.retailerId}: ${f.reason}`).join('\n');
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Cart unavailable',
        bodyText: `Couldn't add any of those items right now.${detail ? `\n\n${detail}` : ''}`,
        buttons: [{ id: BTN.BROWSE, title: '🛍 Browse again' }],
      });
      await this.transitionToState(session, 'main_menu');
      return;
    }

    if (failures.length > 0) {
      const detail = failures.slice(0, 5).map((f) => `• ${f.retailerId}: ${f.reason}`).join('\n');
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session, `Some items couldn't be added:\n${detail}\n\nReview your cart below before checking out.`);
      return;
    }

    await this.transitionToState(session, 'coupon_prompt');
    await this.sendFlowResponse(phone, 'coupon_prompt', session);
  }

  /** Categories: L1 in-memory (TtlCache) → L2 Redis → MongoDB. TTL 2 min each layer. */
  private async getActiveCategories(): Promise<Category[]> {
    const l1 = this.categoryCache.get();
    if (l1) return l1;
    const result = await this.redisService.cached<Category[]>(
      'chatbot:cache:categories',
      120,
      () => this.categoriesService.findActiveCategories() as Promise<Category[]>,
    );
    this.categoryCache.set(result);
    return result;
  }

  /** Products: L1 in-memory (TtlCache per category) → L2 Redis → MongoDB. TTL 2 min each layer. */
  private async getProductsByCategory(categoryId: string): Promise<Product[]> {
    let entry = this.productCache.get(categoryId);
    if (entry) {
      const l1 = entry.get();
      if (l1) return l1;
    }
    const result = await this.redisService.cached<Product[]>(
      `chatbot:cache:products:${categoryId}`,
      120,
      () => this.productsService.findByCategory(categoryId) as Promise<Product[]>,
    );
    if (!entry) {
      if (this.productCache.size >= this.productCacheMaxSize) {
        const firstKey = this.productCache.keys().next().value;
        if (firstKey !== undefined) this.productCache.delete(firstKey);
      }
      entry = new TtlCache<Product[]>(2 * 60_000);
      this.productCache.set(categoryId, entry);
    }
    entry.set(result);
    return result;
  }

  private async sendCategoryList(phone: string, session: ChatSessionDocument): Promise<void> {
    const categories = await this.getActiveCategories();

    if (categories.length === 0) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'No categories available at the moment.',
      });
      return;
    }

    let page = this.getListPage(session, 'categoryPage');
    const pageSize = 9;
    let start = page * pageSize;

    if (start >= categories.length && categories.length > 0) {
      page = 0;
      start = 0;
      await this.setListPage(session, 'categoryPage', 0);
    }

    const slice = categories.slice(start, start + pageSize);
    const hasMore = start + pageSize < categories.length;

    const rows = slice.map((cat) => ({
      id: Btn.category(cat._id.toString()),
      title: clip(cat.name, WA.LIST_ROW_TITLE),
      description: clip(cat.description, WA.LIST_ROW_DESC),
    }));

    if (hasMore) {
      rows.push({
        id: BTN.MORE_CATEGORIES,
        title: 'View more',
        description: `Showing ${start + 1}\u2013${start + slice.length} of ${categories.length}`,
      });
    }

    await this.whatsappService.sendInteractiveList({
      phone,
      headerText: 'Shop by category',
      bodyText: 'Pick a category to explore our collection.',
      footerText: page > 0 ? `Page ${page + 1}` : undefined,
      buttonText: 'View categories',
      sections: [{ title: 'Categories', rows }],
    });
  }

  private async sendProductList(
    phone: string,
    categoryId: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    let products: Product[];
    try {
      products = await this.getProductsByCategory(categoryId);
    } catch (err) {
      this.logger.warn(
        `findByCategory failed for ${categoryId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      this.productCache.delete(categoryId);
      void this.redisService.del(`chatbot:cache:products:${categoryId}`);
      session.currentCategoryId = undefined;
      await this.saveSession(session);
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'That category is no longer available. Showing all categories.',
      });
      await this.sendCategoryList(phone, session);
      return;
    }

    if (products.length === 0) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'No products in this category.',
      });
      return;
    }

    // Filter the catalog down to what the Raipur (main) store can actually
    // fulfil. Untracked products (trackStock=false) are always shown —
    // inventory is unlimited for those. Tracked products must have positive
    // main-store stock (a StoreStock row with stock > 0). Products the admin
    // hasn't set up at the main store yet are hidden from the WhatsApp channel.
    const mainStoreId = await this.getMainStoreId();
    const trackedProductIds = products
      .filter((p) => p.trackStock !== false)
      .map((p) => p._id.toString());
    const stockMap = await this.storeStockService.getStockMapForStoreProducts(
      mainStoreId,
      trackedProductIds,
    );

    const fulfillableProducts = products.filter((prod) => {
      if (prod.trackStock === false) return true;
      const entry = stockMap.get(prod._id.toString());
      return this.resolveStoreAvailableStock(entry) > 0;
    });

    if (fulfillableProducts.length === 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Out of stock',
        bodyText: 'Nothing in this category is in stock right now.',
        buttons: [
          { id: BTN.BROWSE, title: '\uD83D\uDECD Other categories' },
          { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' },
        ],
      });
      return;
    }

    let page = this.getListPage(session, 'productPage');
    // Smaller page size since every product is now sent as its own image card.
    const pageSize = 5;
    let start = page * pageSize;

    // Reset to first page if current page is beyond available data.
    if (start >= fulfillableProducts.length && fulfillableProducts.length > 0) {
      page = 0;
      start = 0;
      await this.setListPage(session, 'productPage', 0);
    }

    const slice = fulfillableProducts.slice(start, start + pageSize);
    const hasMore = start + pageSize < fulfillableProducts.length;

    // Send each product's photo + a short caption so the customer can see what
    // they're buying. WhatsApp interactive lists don't support inline images,
    // so we emit a media message per product before the picker list. Products
    // without an image fall back to a text bubble with the same info.
    for (const prod of slice) {
      const priceLine = prod.compareAtPrice
        ? `~${this.formatCurrency(prod.compareAtPrice)}~  ${bold(this.formatCurrency(prod.price))}`
        : bold(this.formatCurrency(prod.price));
      const caption =
        `${bold(prod.name)}\n` +
        `${priceLine}\n` +
        `\uD83D\uDFE2 In stock`;
      try {
        if (prod.images?.[0]) {
          await this.whatsappService.sendMediaMessage({
            phone,
            mediaType: 'image',
            mediaUrl: prod.images[0],
            caption,
          });
        } else {
          await this.whatsappService.sendTextMessage({ phone, message: caption });
        }
      } catch (err) {
        this.logger.warn(
          `sendMedia failed for product ${prod._id.toString()}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    const rows = slice.map((prod) => ({
      id: Btn.product(prod._id.toString()),
      title: clip(prod.name, WA.LIST_ROW_TITLE),
      description: clip(this.formatCurrency(prod.price), WA.LIST_ROW_DESC),
    }));

    if (hasMore) {
      rows.push({
        id: BTN.MORE_PRODUCTS,
        title: 'View more',
        description: `Showing ${start + 1}\u2013${start + slice.length} of ${fulfillableProducts.length}`,
      });
    }

    await this.whatsappService.sendInteractiveList({
      phone,
      headerText: 'Products',
      bodyText: 'Tap any product above to add to cart or adjust quantity.',
      footerText: page > 0 ? `Page ${page + 1}` : undefined,
      buttonText: 'Add / view details',
      sections: [{ title: 'Products', rows }],
    });
  }

  private async sendProductDetail(
    phone: string,
    productId: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    let product;
    try {
      product = await this.productsService.findById(productId);
    } catch (err) {
      // Product may have been deleted since the list was rendered.
      this.logger.warn(
        `findById product failed for ${productId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      session.currentProductId = undefined;
      await this.saveSession(session);
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Product unavailable',
        bodyText: 'This product is no longer available.',
        buttons: [
          { id: BTN.BROWSE, title: '\uD83D\uDECD Browse' },
          { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' },
        ],
      });
      return;
    }

    // Stock badge uses the main-store (Raipur) inventory, not the product's
    // global stock field. Untracked products are always "Available".
    let storeAvailable = 0;
    if (product.trackStock !== false) {
      const mainStoreId = await this.getMainStoreId();
      const storeStock = await this.storeStockService.getStockForStoreProduct(
        mainStoreId,
        product._id.toString(),
      );
      storeAvailable = this.resolveStoreAvailableStock(storeStock);
    }
    const inStock = product.trackStock === false || storeAvailable > 0;
    const stockBadge = product.trackStock === false
      ? '\uD83D\uDFE2 Available'
      : inStock
        ? '\uD83D\uDFE2 In stock'
        : '\uD83D\uDD34 Out of stock';

    const priceDisplay = product.compareAtPrice
      ? `~${this.formatCurrency(product.compareAtPrice)}~  ${bold(this.formatCurrency(product.price))}`
      : bold(this.formatCurrency(product.price));

    const savings = product.compareAtPrice && product.compareAtPrice > product.price
      ? `  \u00B7  Save ${this.formatCurrency(product.compareAtPrice - product.price)}`
      : '';

    const caption =
      `${bold(product.name)}\n` +
      `${priceDisplay}${savings}\n` +
      `${stockBadge}\n\n` +
      `${(product.description || '').toString().slice(0, 600)}`;

    if (product.images?.[0]) {
      await this.whatsappService.sendMediaMessage({
        phone,
        mediaType: 'image',
        mediaUrl: product.images[0],
        caption,
      });
    }

    this.analytics.track('chatbot.product_viewed', {
      userId: session.user?.toString(),
      productId,
      price: product.price,
    });

    // When out of stock, don't dangle Add/Buy buttons that lead to a dead-end
    // \u2014 surface a recovery action immediately instead of letting the customer
    // discover it 3 screens later at order placement.
    if (!inStock) {
      const followUpBody = product.images?.[0]
        ? `${stockBadge} \u00B7 "${product.name}" is unavailable right now.`
        : `${caption}\n\n${stockBadge} \u00B7 unavailable right now.`;
      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText: followUpBody,
        buttons: [
          { id: BTN.BROWSE, title: '\uD83D\uDECD Browse' },
          { id: BTN.BACK, title: '\u21A9 Back' },
        ],
      });
      return;
    }

    const followUpBody = product.images?.[0]
      ? 'Ready to add?'
      : `${caption}\n\nReady to add?`;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: followUpBody,
      buttons: [
        { id: BTN.ADD_CART, title: '\uD83D\uDED2 Add to cart' },
        { id: BTN.PICK_QTY, title: '\uD83D\uDD22 Pick qty' },
        { id: BTN.BACK, title: '\u21A9 Back' },
      ],
    });
  }

  private async sendCartSummary(phone: string, session: ChatSessionDocument, notice?: string): Promise<void> {
    if (!session.user) {
      await this.sendEmptyCart(phone);
      return;
    }

    const cart = await this.cartService.getCart(session.user.toString());

    if (cart.items.length === 0) {
      await this.sendEmptyCart(phone);
      return;
    }

    const itemList = cart.items
      .map((item, idx) =>
        `${idx + 1}. *${item.product.name}*  ×${item.quantity}  —  ${this.formatCurrency(item.total)}`,
      )
      .join('\n');

    const breakdown: string[] = [`Subtotal:  ${this.formatCurrency(cart.subtotal)}`];
    if (cart.discount > 0) {
      breakdown.push(
        `🏷 ${cart.couponCode || 'Discount'}:  −${this.formatCurrency(cart.discount)}`,
      );
    }
    breakdown.push(bold(`You pay:  ${this.formatCurrency(cart.total)}`));

    const FREE_SHIP_THRESHOLD = 300;
    const shippingLine =
      cart.subtotal >= FREE_SHIP_THRESHOLD
        ? '\n🎉 Free delivery included'
        : `\n${italic(`Add ${this.formatCurrency(FREE_SHIP_THRESHOLD - cart.subtotal)} more to unlock free delivery`)}`;

    // Coupon nudge on the cart screen so customers can discover savings
    // before committing to checkout. Only shown when no coupon is yet
    // applied \u2014 once one is applied the discount line in `breakdown` already
    // surfaces it. Falls back silently on any failure (cart UX must work
    // even if the coupons module is degraded).
    let couponHint = '';
    let couponButton: { id: string; title: string } | null = null;
    if (!cart.couponCode) {
      try {
        const applicable = await this.findApplicableCoupons(session);
        const best = applicable[0];
        if (best) {
          couponHint =
            `\n\n\uD83D\uDCA1 ${bold(`${this.formatCurrency(best.discount)} off available`)} with ${bold(best.code)} \u2014 tap \uD83C\uDFF7 to apply`;
          couponButton = {
            id: BTN.COUPON_APPLY_BEST,
            title: clip(`\uD83C\uDFF7 Apply ${best.code}`, WA.BUTTON_TITLE),
          };
        } else {
          // No coupon currently fits the cart \u2014 but if one is gated by
          // minOrderAmount and the customer is close (within 30% of cart
          // subtotal), surface an "almost there" upsell.
          const active = await this.couponsService.getActiveCoupons();
          const gapWindow = Math.max(50, cart.subtotal * 0.3);
          let nearest: { code: string; gap: number; saving: number } | null = null;
          for (const c of active) {
            const gap = (c.minOrderAmount || 0) - cart.subtotal;
            if (gap <= 0 || gap > gapWindow) continue;
            // Estimate savings if they hit the threshold; for percentage
            // coupons assume they reach exactly the minOrderAmount.
            const projectedSubtotal = (c.minOrderAmount || 0);
            const saving = c.discountType === 'percentage'
              ? Math.min(
                  c.maxDiscount ?? Number.POSITIVE_INFINITY,
                  (projectedSubtotal * Math.min(Math.max(0, c.discountValue), 100)) / 100,
                )
              : Math.max(0, c.discountValue);
            if (!nearest || gap < nearest.gap) {
              nearest = { code: c.code, gap, saving };
            }
          }
          if (nearest) {
            couponHint =
              `\n\n\uD83D\uDCA1 ${italic(`Add ${this.formatCurrency(nearest.gap)} more to unlock ${this.formatCurrency(nearest.saving)} off with ${nearest.code}`)}`;
          }
          if (active.length > 0) {
            couponButton = { id: BTN.COUPON_LIST, title: '\uD83C\uDFF7 Coupons' };
          }
        }
      } catch (error) {
        this.logger.warn(
          `cart coupon hint failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    } else {
      // Already-applied coupon: give a one-tap path to swap or remove it.
      couponButton = { id: BTN.COUPON_LIST, title: '\uD83C\uDFF7 Change coupon' };
    }

    const header = `\uD83D\uDED2 Your cart \u00B7 ${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}`;
    const body = `${notice ? `${notice}\n\n` : ''}${itemList}\n\n${breakdown.join('\n')}${shippingLine}${couponHint}`;

    // 3-button budget on WhatsApp interactive messages: Checkout + Add more are
    // always present; the third slot is the highest-value contextual action
    // \u2014 coupons when relevant, otherwise the familiar "Menu" entry.
    const thirdButton = couponButton ?? { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' };

    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: clip(header, WA.HEADER),
      bodyText: body,
      buttons: [
        { id: BTN.CHECKOUT, title: '\u2705 Checkout' },
        { id: BTN.KEEP_SHOPPING, title: '\u2795 Add more' },
        thirdButton,
      ],
    });
  }

  /** Interactive list of cart items so the customer can tap one to adjust
   *  qty / remove without typing. Replaces the older "type 'remove ghee'"
   *  shortcut as the primary edit path; the typed parser still works. */
  private async sendCartItemPicker(
    phone: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    if (!session.user) {
      await this.sendEmptyCart(phone);
      return;
    }
    const cart = await this.cartService.getCart(session.user.toString());
    if (cart.items.length === 0) {
      await this.sendEmptyCart(phone);
      return;
    }

    const rows = cart.items.slice(0, WA.MAX_ROWS_PER_SECTION).map((item, idx) => ({
      id: Btn.cartItem(idx),
      title: clip(`${item.product.name} ×${item.quantity}`, WA.LIST_ROW_TITLE),
      description: clip(this.formatCurrency(item.total), WA.LIST_ROW_DESC),
    }));

    await this.whatsappService.sendInteractiveList({
      phone,
      headerText: 'Edit cart',
      bodyText: 'Tap an item to adjust quantity or remove.',
      buttonText: 'Pick item',
      sections: [
        { title: 'Items', rows },
        {
          title: 'Done',
          rows: [{ id: BTN.BACK, title: '↩ Back to cart' }],
        },
      ],
    });
  }

  /** 3-button card for a single cart item: +1 / −1 / Remove. The handler at
   *  `BTN.CART_INC/DEC/RM` reads the stashed index and applies the action. */
  private async sendCartItemActionCard(
    phone: string,
    session: ChatSessionDocument,
    idx: number,
  ): Promise<void> {
    if (!session.user) return;
    const cart = await this.cartService.getCart(session.user.toString());
    const item = cart.items[idx];
    if (!item) {
      await this.sendCartSummary(phone, session);
      return;
    }
    session.context = mergeChatContext(session.context, {
      manageCartItem: { productId: item.product.id, variantSku: item.variantSku },
    });
    await session.save();
    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: clip(item.product.name, WA.HEADER),
      bodyText: `×${item.quantity} · ${this.formatCurrency(item.total)}`,
      buttons: [
        { id: BTN.CART_INC, title: '➕ +1' },
        { id: BTN.CART_DEC, title: '➖ −1' },
        { id: BTN.CART_RM, title: '🗑 Remove' },
      ],
    });
  }

  /** Empty cart with high-intent recovery CTAs. */
  /**
   * Add N units of the session's current product to the cart and render the
   * "Added to cart" confirmation. Centralised so the Add-1 button, the qty
   * picker rows, and typed "+N" commands share the same error surface.
   */
  private async addCurrentProductToCart(
    phone: string,
    session: ChatSessionDocument,
    quantity: number,
  ): Promise<void> {
    if (!session.user || !session.currentProductId) return;
    const qty = Math.max(1, Math.min(Math.floor(quantity), 99));
    const productId = session.currentProductId;

    let product;
    try {
      product = await this.productsService.findById(productId);
    } catch (err) {
      this.logger.warn(
        `Cart add: product ${productId} lookup failed (${err instanceof Error ? err.message : 'unknown'})`,
      );
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'This product is no longer available.',
      });
      await this.sendBrowseSurface(phone, session);
      return;
    }

    // Main-store stock is the only source that survives to order placement
    // (`OrdersService.decrementStock` only touches StoreStock at the main
    // store). cartService.addItem checks the aggregate Product.stock, which
    // can pass even when the main store is empty — the failure then surfaces
    // 4 screens later at order placement. Gate it here, once.
    const available = await this.getMainStoreAvailable(product);
    if (available <= 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Out of stock',
        bodyText: `"${product.name}" is unavailable right now.`,
        buttons: [
          { id: BTN.BROWSE, title: '🛍 Browse' },
          { id: BTN.BACK, title: '↩ Back' },
        ],
      });
      return;
    }
    if (qty > available) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: `Only ${available} in stock — try a smaller quantity.`,
      });
      await this.sendProductDetail(phone, productId, session);
      return;
    }

    try {
      await this.cartService.addItem(session.user.toString(), {
        productId,
        quantity: qty,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const stockIssue = /stock/i.test(msg);
      if (!stockIssue) {
        this.logger.warn(
          `Cart addItem failed for ${session.user.toString()} / ${productId}: ${msg || 'unknown'}`,
        );
      }
      await this.whatsappService.sendTextMessage({
        phone,
        message: stockIssue
          ? msg || 'Not enough stock available for this item.'
          : italic('Couldn\u2019t add this item to your cart. Please try again.'),
      });
      await this.sendProductDetail(phone, productId, session);
      return;
    }

    const cart = await this.cartService.getCart(session.user.toString());
    this.analytics.track('chatbot.item_added_to_cart', {
      userId: session.user.toString(),
      productId,
      quantity: qty,
      cartCount: cart.itemCount,
      cartTotal: cart.total,
    });

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText:
        `\u2713 Added \u00B7 ${bold(`${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}`)} \u00B7 ${this.formatCurrency(cart.total)}`,
      buttons: [
        { id: BTN.CHECKOUT, title: '\u2705 Checkout' },
        { id: BTN.KEEP_SHOPPING, title: '\u2795 Add more' },
      ],
    });
  }

  /** Interactive list letting the customer pick how many units to add. */
  private async sendQuantityPicker(
    phone: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    if (!session.currentProductId) return;

    let product;
    try {
      product = await this.productsService.findById(session.currentProductId);
    } catch {
      await this.sendProductDetail(phone, session.currentProductId, session);
      return;
    }

    const available = await this.getMainStoreAvailable(product);
    if (available <= 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Out of stock',
        bodyText: `"${product.name}" is unavailable right now.`,
        buttons: [
          { id: BTN.BROWSE, title: '\uD83D\uDECD Browse' },
          { id: BTN.BACK, title: '\u21A9 Back' },
        ],
      });
      return;
    }
    const cap = Number.isFinite(available) ? available : Number.POSITIVE_INFINITY;
    const QTY_CHOICES = [1, 2, 3, 5, 10].filter((n) => n <= cap);
    if (QTY_CHOICES.length === 0) QTY_CHOICES.push(1);
    const rows = QTY_CHOICES.map((n) => ({
      id: Btn.addQty(n),
      title: clip(`\u00D7${n}   ${this.formatCurrency(product.price * n)}`, WA.LIST_ROW_TITLE),
      description: clip(
        n === 1
          ? 'Add 1 to cart'
          : `Add ${n} units \u00B7 ${this.formatCurrency(product.price)} each`,
        WA.LIST_ROW_DESC,
      ),
    }));
    rows.push({
      id: BTN.BACK,
      title: 'Back',
      description: 'Return to product',
    });

    await this.whatsappService.sendInteractiveList({
      phone,
      headerText: clip(product.name, WA.HEADER),
      bodyText: 'How many would you like to add?',
      buttonText: 'Pick quantity',
      sections: [{ title: 'Quantity', rows }],
    });
  }

  private async sendPaymentSelectionScreen(
    phone: string,
    session: ChatSessionDocument,
    notice?: string,
  ): Promise<void> {
    if (!session.user) return;

    try {
      const [cart, user] = await Promise.all([
        this.cartService.getCart(session.user.toString()),
        this.usersService.findById(session.user.toString()),
      ]);

      const selectedIndex = session.context.selectedAddressIndex;
      const address =
        selectedIndex != null && user.addresses[selectedIndex]
          ? user.addresses[selectedIndex]
          : user.addresses.find((a) => a.isDefault) || user.addresses[0];

      // Bill summary — cap items at 4 to stay within 1024-char body limit.
      const itemLines = cart.items
        .slice(0, 4)
        .map((item) => `• ${item.product.name} ×${item.quantity} — ${this.formatCurrency(item.total)}`)
        .join('\n');
      const more = cart.items.length > 4 ? `\n_… and ${cart.items.length - 4} more_` : '';

      const billingLines: string[] = [`Subtotal: ${this.formatCurrency(cart.subtotal)}`];
      if (cart.discount > 0) {
        billingLines.push(`🏷 ${cart.couponCode || 'Discount'}: −${this.formatCurrency(cart.discount)}`);
      }
      const FREE_SHIP_THRESHOLD = 300;
      billingLines.push(
        cart.subtotal >= FREE_SHIP_THRESHOLD
          ? `🎉 Free delivery included`
          : `🚚 Delivery: ₹40`,
      );
      billingLines.push(bold(`You pay: ${this.formatCurrency(cart.total)}`));

      const addressLine = address
        ? `📍 ${address.street}, ${address.city} — ${address.pincode}`
        : '';

      const body =
        `${notice ? `${notice}\n\n` : ''}` +
        `🧾 *Order Summary*\n${itemLines}${more}\n\n` +
        `${billingLines.join('\n')}` +
        `${addressLine ? `\n\n${addressLine}` : ''}\n\n` +
        `How would you like to pay?`;

      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Payment',
        bodyText: body,
        footerText: 'Secure · Razorpay',
        buttons: [
          { id: BTN.COD, title: '💵 Cash on Delivery' },
          { id: BTN.PREPAID, title: '💳 UPI / Card' },
          { id: BTN.CHANGE_ADDRESS, title: '📍 Change address' },
        ],
      });
    } catch (err) {
      this.logger.warn(`sendPaymentSelectionScreen failed: ${err instanceof Error ? err.message : 'unknown'}`);
      // Fallback to static screen so the user isn't left stuck.
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Payment',
        bodyText: `${notice ? `${notice}\n\n` : ''}How would you like to pay?`,
        footerText: 'Secure · Razorpay',
        buttons: [
          { id: BTN.COD, title: '💵 Cash on Delivery' },
          { id: BTN.PREPAID, title: '💳 UPI / Card' },
          { id: BTN.CHANGE_ADDRESS, title: '📍 Change address' },
        ],
      });
    }
  }

  private async sendOrderBillSummary(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) return;
    try {
      const cart = await this.cartService.getCart(session.user.toString());
      if (cart.items.length === 0) return;

      const itemLines = cart.items
        .map((item) => `• ${item.product.name}  ×${item.quantity}  —  ${this.formatCurrency(item.total)}`)
        .join('\n');

      const lines: string[] = [`Subtotal:  ${this.formatCurrency(cart.subtotal)}`];
      if (cart.discount > 0) {
        lines.push(`🏷 ${cart.couponCode || 'Discount'}:  −${this.formatCurrency(cart.discount)}`);
      }
      lines.push(bold(`You pay:  ${this.formatCurrency(cart.total)}`));

      const FREE_SHIP_THRESHOLD = 300;
      const shippingLine = cart.subtotal >= FREE_SHIP_THRESHOLD
        ? '\n🎉 Free delivery included'
        : `\n${italic(`Add ${this.formatCurrency(FREE_SHIP_THRESHOLD - cart.subtotal)} more to unlock free delivery`)}`;

      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `🧾 *Order Summary*\n\n` +
          `${itemLines}\n\n` +
          `${lines.join('\n')}` +
          shippingLine,
      });
    } catch (err) {
      this.logger.warn(`sendOrderBillSummary failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  private async sendEmptyCart(phone: string): Promise<void> {
    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: '\uD83D\uDED2 Your cart',
      bodyText:
        `Your cart's empty \uD83E\uDEB9\n\n` +
        `Start browsing to find something you'll love.`,
      buttons: [
        { id: BTN.BROWSE, title: '\uD83D\uDECD Browse' },
        { id: BTN.ORDERS, title: '\uD83D\uDCE6 My orders' },
      ],
    });
  }

  private encodeFlowToken(phone: string, context: 'checkout' | 'account'): string {
    return Buffer.from(JSON.stringify({ phone, context })).toString('base64url');
  }

  private async sendCheckoutOptions(
    phone: string,
    session: ChatSessionDocument,
    options: { forceShowList?: boolean; notice?: string } = {},
  ): Promise<void> {
    const { notice } = options;

    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register to checkout.',
      });
      return;
    }

    const user = await this.usersService.findById(session.user.toString());

    // For Meta Cloud API with a Flow configured, use WhatsApp Flows UI.
    const flowId = this.configService.get<string>('whatsapp.flowId');
    const provider = this.configService.get<string>('whatsapp.provider');
    if (flowId && provider === 'meta') {
      await this.whatsappService.sendWhatsAppFlow({
        phone,
        flowId,
        flowToken: this.encodeFlowToken(phone, 'checkout'),
        flowMode: this.configService.get<'draft' | 'published'>('whatsapp.flowMode') ?? 'draft',
        headerText: 'Deliver to',
        bodyText: notice
          ? `${notice}\n\nChoose where you'd like your order delivered.`
          : "Choose where you'd like your order delivered.",
        footerText: 'NatureLite Foods',
        ctaLabel: 'Select Address',
      });
      // Session stays in 'checkout' \u2014 flow endpoint transitions it to 'payment_selection'.
      return;
    }

    // 360Dialog fallback: interactive list (existing behaviour).
    if (user.addresses.length === 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Deliver to',
        bodyText: `${notice ? `${notice}\n\n` : ''}Add a delivery address to continue.`,
        buttons: [
          { id: BTN.ADD_NEW_ADDRESS, title: '\u2795 Add address' },
          { id: BTN.BACK, title: '\u21A9 Back' },
        ],
      });
      return;
    }

    // Express checkout: single saved address \u2014 skip the list, show a quick confirm card
    // so the user goes from cart to payment in one tap instead of two interactions.
    if (!options.forceShowList && user.addresses.length === 1) {
      const addr = user.addresses[0];
      const addrLabel = addr.label || 'Home';
      const addrSummary = [addr.street, addr.city, addr.pincode].filter(Boolean).join(', ');
      session.context = mergeChatContext(session.context, { selectedAddressIndex: 0 });
      await this.saveSession(session);
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Deliver to',
        bodyText:
          `${notice ? `${notice}\n\n` : ''}\uD83D\uDCCD *${addrLabel}*\n_${addrSummary}_\n\nConfirm to proceed to payment.`,
        buttons: [
          { id: Btn.address(0), title: '\u2705 Confirm address' },
          { id: BTN.ADD_NEW_ADDRESS, title: '\u270F\uFE0F Change address' },
        ],
      });
      return;
    }

    const savedRows = user.addresses.slice(0, 8).map((addr, i) => {
      const label = (addr.label || `Address ${i + 1}`).slice(0, WA.LIST_ROW_TITLE);
      const title = addr.isDefault ? clip(`${label} \u2605`, WA.LIST_ROW_TITLE) : label;
      const desc = [addr.street, addr.city, addr.pincode].filter(Boolean).join(', ');
      return {
        id: Btn.address(i),
        title,
        description: clip(desc, WA.LIST_ROW_DESC),
      };
    });

    const sections = [
      { title: 'Saved addresses', rows: savedRows },
      {
        title: 'Other',
        rows: [{ id: BTN.ADD_NEW_ADDRESS, title: '\u2795 Add new address' }],
      },
    ];

    await this.whatsappService.sendInteractiveList({
      phone,
      headerText: 'Deliver to',
      bodyText: `${notice ? `${notice}\n\n` : ''}Pick an address or add a new one.`,
      buttonText: 'Choose address',
      sections,
    });
  }

  private async sendOrdersList(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register to view your orders.',
      });
      return;
    }

    // Fetch more orders than a single page so we can detect "has more".
    const pageSize = 9;
    const fetchLimit = 50;
    const allOrders = await this.ordersService.findUserOrders(session.user.toString(), fetchLimit);

    if (allOrders.length === 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'My orders',
        bodyText: 'No orders yet. Start shopping to place your first order.',
        buttons: [
          { id: BTN.BROWSE, title: '\uD83D\uDECD Start shopping' },
          { id: BTN.BACK, title: '\uD83C\uDFE0 Menu' },
        ],
      });
      return;
    }

    let page = this.getListPage(session, 'ordersPage');
    let start = page * pageSize;

    // Reset if beyond available data.
    if (start >= allOrders.length) {
      page = 0;
      start = 0;
      await this.setListPage(session, 'ordersPage', 0);
    }

    const slice = allOrders.slice(start, start + pageSize);
    const hasMore = start + pageSize < allOrders.length;

    const rows = slice.map((order) => {
      const statusLabel = this.formatOrderStatusForCustomer(order);
      const itemsPreview = this.formatOrderItemsForList(order.items);
      const dateShort = this.formatOrderListDate(order.createdAt);
      const totalStr = (order as any).total != null ? this.formatCurrency((order as any).total) : '';
      return {
        id: Btn.order(order._id.toString()),
        title: clip([dateShort, totalStr].filter(Boolean).join('  ·  '), WA.LIST_ROW_TITLE),
        description: clip(`${statusLabel}  ·  ${itemsPreview}`, WA.LIST_ROW_DESC),
      };
    });

    if (hasMore) {
      rows.push({
        id: BTN.MORE_ORDERS,
        title: 'View more',
        description: `Showing ${start + 1}\u2013${start + slice.length} of ${allOrders.length}`,
      });
    }

    await this.whatsappService.sendInteractiveList({
      phone,
      headerText: 'My orders',
      bodyText: 'Select an order to view details or reorder.',
      footerText: page > 0 ? `Page ${page + 1}` : undefined,
      buttonText: 'View orders',
      sections: [{ title: 'Recent orders', rows }],
    });
  }

  private async sendFlowResponse(
    phone: string,
    state: SessionState,
    session: ChatSessionDocument,
    notice?: string,
  ): Promise<void> {
    // Main menu renders dynamically (personalized greeting + live cart count).
    if (state === 'main_menu') {
      await this.sendMainMenu(phone, session, notice);
      return;
    }

    // Payment selection renders dynamically to show live address + bill summary.
    if (state === 'payment_selection') {
      await this.sendPaymentSelectionScreen(phone, session, notice);
      return;
    }

    // Coupon prompt renders dynamically to support auto-suggestion.
    if (state === 'coupon_prompt') {
      await this.sendCouponPromptScreen(phone, session, notice);
      return;
    }

    const flow = CHATBOT_FLOWS[state];
    const action = flow.action;

    switch (action.type) {
      case 'text':
        if (action.content) {
          await this.whatsappService.sendTextMessage({
            phone,
            message: `${notice ? `${notice}\n\n` : ''}${action.content}`,
          });
        }
        break;

      case 'buttons':
        if (action.buttons) {
          await this.whatsappService.sendInteractiveButtons({
            phone,
            headerText: clip(action.header, WA.HEADER) || undefined,
            bodyText: `${notice ? `${notice}\n\n` : ''}${action.content}`,
            footerText: clip(action.footer, WA.FOOTER) || undefined,
            buttons: action.buttons.slice(0, WA.MAX_BUTTONS),
          });
        }
        break;

      case 'list':
        if (action.sections) {
          await this.whatsappService.sendInteractiveList({
            phone,
            headerText: clip(action.header, WA.HEADER) || undefined,
            bodyText: `${notice ? `${notice}\n\n` : ''}${action.content}`,
            footerText: clip(action.footer, WA.FOOTER) || undefined,
            buttonText: clip(action.buttonText || 'Select', WA.LIST_BUTTON),
            sections: action.sections,
          });
        }
        break;

      case 'template':
        if (action.templateName) {
          await this.whatsappService.sendTemplateMessage({
            phone,
            templateName: action.templateName,
            bodyParams: action.templateParams,
          });
        }
        break;
    }
  }

  /**
   * Personalised main menu: uses contactName and live cart count.
   * Called internally by sendFlowResponse whenever state === 'main_menu'.
   */
  private buildWelcomeBody(): string {
    return (
      `\uD83C\uDF3F *Namaste! Welcome to Nature Lite Foods* \uD83D\uDE4F\n\n` +
      `\u0906\u092A\u0915\u093E \u0938\u094D\u0935\u093E\u0917\u0924 \u0939\u0948 \u2014 *You\u2019re in the right place.*\n\n` +
      `We bring your kitchen the *purest, chemical-free* staples \u2014 made the *old way*, by hand, for your family\u2019s health. \uD83C\uDFBA\n\n` +
      `\uD83D\uDCCB *Our Menu \u2192* https://wa.me/c/918817200740\n\n` +
      `\uD83D\uDE9A *Free home delivery* on orders above \u20B9300\n` +
      `_(Below \u20B9300 \u2014 \u20B940 delivery charge applies)_\n\n` +
      `\uD83C\uDF10 naturelitefoods.com\n` +
      `\uD83D\uDCCD Store \u2192 https://maps.app.goo.gl/D8G3EQVRB5eckFcw7\n\n` +
      `\uD83D\uDCAC *Questions?* Message or call us directly on this number.\n\n` +
      `\uD83D\uDCCB *Order now \u2192* https://wa.me/c/918817200740\n\n` +
      `_\u201CThe old way is the right way \u2014 From Farm to Table\u201D_ \uD83C\uDF31`
    );
  }

  private async sendMainMenu(
    phone: string,
    session: ChatSessionDocument,
    notice?: string,
  ): Promise<void> {
    const welcomeImageUrl = this.configService.get<string>('chatbot.welcomeImageUrl') || '';
    const staticBody = (await this.redisService.get('chatbot:msg:welcome')) || this.buildWelcomeBody();
    const body = notice ? `${notice}\n\n${staticBody}` : staticBody;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      ...(welcomeImageUrl ? { headerImageUrl: welcomeImageUrl } : { headerText: 'Nature Lite Foods' }),
      bodyText: body,
      footerText: 'naturelitefoods.com',
      buttons: [
        { id: BTN.SUPPORT, title: '\uD83D\uDCAC Talk to Us' },
      ],
    });
  }

  /** Save a session to MongoDB and refresh the Redis cache. */
  private async saveSession(session: ChatSessionDocument): Promise<void> {
    await session.save();
    void this.redisService.setJson(
      this.sessKey(session.phone),
      session.toObject(),
      ChatbotService.SESSION_TTL,
    );
  }

  private async getOrCreateSession(phone: string): Promise<ChatSessionDocument> {
    const cached = await this.redisService.getJson<Record<string, unknown>>(this.sessKey(phone));
    if (cached) {
      try {
        return this.chatSessionRepository.hydrate(cached);
      } catch {
        // fall through to MongoDB on hydration failure
      }
    }

    const user = await this.usersService.findOrCreateByPhone(phone);
    let session: ChatSessionDocument;
    try {
      session = await this.chatSessionRepository.upsertNewByPhone({
        phone,
        userId: user._id,
      });
    } catch (err) {
      const isDupKey = err instanceof Error && (err as { code?: number }).code === 11000;
      if (isDupKey) {
        const existing = await this.chatSessionRepository.findOneByPhone(phone);
        if (existing) {
          session = existing;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    // Revive expired sessions: reset to main_menu so the user doesn't land in stale state.
    if (session.isExpired) {
      session.isExpired = false;
      session.currentState = 'main_menu';
      session.previousState = undefined;
      session.context = {};
      session.currentCategoryId = undefined;
      session.currentProductId = undefined;
      session.pendingOrderId = undefined;
      session.awaitingInputFor = undefined;
      session.isHandedOffToSupport = false;
      session.supportHandoffExpiresAt = undefined;
      await this.saveSession(session);
    } else {
      // Prime the cache for next message
      void this.redisService.setJson(
        this.sessKey(phone),
        session.toObject(),
        ChatbotService.SESSION_TTL,
      );
    }

    return session;
  }

  private async transitionToState(
    session: ChatSessionDocument,
    newState: SessionState,
  ): Promise<void> {
    session.previousState = session.currentState;
    session.currentState = newState;
    await this.saveSession(session);
  }

  private async updateSessionActivity(sessionId: string): Promise<void> {
    await this.chatSessionRepository.updateActivity(new Types.ObjectId(sessionId));
  }

  private extractInputText(message: WhatsAppMessage): string {
    return (
      message.content.text ||
      message.content.buttonText ||
      message.content.listTitle ||
      ''
    ).trim();
  }

  private normalizeInput(input: string): string {
    return input.toLowerCase().trim();
  }

  /**
   * Map common free-text replies (e.g. "browse products", "1", "my cart") to the
   * transition key the current state expects. Needed when 360dialog rejects
   * interactive buttons and falls back to numbered text — users then reply with
   * the label or number instead of a button id.
   */
  private mapTextToTransitionKey(state: SessionState, raw: string): string {
    const normalized = this.normalizeInput(raw);
    if (!normalized) return normalized;

    const aliases: Record<SessionState, Record<string, string>> = {
      main_menu: {
        '1': 'browse', 'browse': 'browse', 'browse products': 'browse', 'shop': 'browse', 'products': 'browse',
        '2': 'cart', 'cart': 'cart', 'my cart': 'cart', 'view cart': 'cart',
        '3': 'orders', 'orders': 'orders', 'my orders': 'orders', 'order': 'orders', 'track': 'orders',
        '4': 'reorder', 'reorder': 'reorder', 'order again': 'reorder',
        '5': 'support', 'support': 'support', 'agent': 'support', 'human': 'support',
        '6': 'account', 'account': 'account', 'my account': 'account', 'profile': 'account',
        '7': 'faq', 'help': 'faq', 'faq': 'faq', 'help & faq': 'faq', 'help and faq': 'faq',
        pay: 'pay', 'pay now': 'pay', 'complete payment': 'pay',
      },
      browsing: { back: 'back', more: 'more_products', next: 'more_products' },
      product_detail: {
        '1': 'add_cart', 'add': 'add_cart', 'add to cart': 'add_cart', '+': 'add_cart', 'buy': 'add_cart',
        '2': 'pick_qty', 'qty': 'pick_qty', 'pick qty': 'pick_qty', 'quantity': 'pick_qty',
        '3': 'back', 'back': 'back',
      },
      cart: {
        '1': 'checkout', 'checkout': 'checkout', 'pay': 'checkout', 'order': 'checkout',
        '2': 'remove', 'remove': 'remove',
        '3': 'clear', 'clear': 'clear', 'empty': 'clear',
        continue: 'continue', 'continue shopping': 'continue',
        coupon: 'coupon_list', coupons: 'coupon_list', 'apply coupon': 'coupon_list',
        promo: 'coupon_list', 'promo code': 'coupon_list',
        back: 'back',
      },
      coupon_prompt: {
        '1': 'coupon_yes', yes: 'coupon_yes', y: 'coupon_yes',
        apply: 'coupon_apply_suggested',
        '2': 'coupon_no', no: 'coupon_no', n: 'coupon_no', skip: 'coupon_no',
        'see all': 'coupon_list', 'see codes': 'coupon_list', list: 'coupon_list',
        coupons: 'coupon_list',
        'enter code': 'coupon_custom', enter: 'coupon_custom', code: 'coupon_custom',
        back: 'back',
      },
      coupon_input: {
        skip: 'skip_coupon', 'skip coupon': 'skip_coupon',
        'try again': 'try_coupon_again', retry: 'try_coupon_again',
        remove: 'remove_coupon', 'remove coupon': 'remove_coupon',
        back: 'back',
      },
      checkout: {
        '1': 'new_address', 'new address': 'new_address', 'add address': 'new_address',
        back: 'back',
      },
      address_input: { back: 'back' },
      payment_selection: {
        '1': 'cod', cod: 'cod', cash: 'cod', 'cash on delivery': 'cod',
        '2': 'prepaid', prepaid: 'prepaid', online: 'prepaid', pay: 'prepaid', upi: 'prepaid',
        change_address: 'change_address', 'change address': 'change_address',
        yes: 'another_yes', no: 'another_no',
        back: 'back',
      },
      order_tracking: {
        back: 'back', more: 'more_orders',
      },
      reorder: {
        '1': 'confirm', confirm: 'confirm', yes: 'confirm',
        '2': 'modify', modify: 'modify', edit: 'modify',
        '3': 'cancel', cancel: 'cancel', no: 'cancel',
        back: 'back',
      },
      faq: { back: 'back', support: 'support', agent: 'support' },
      support: { menu: 'menu' },
      account: {
        '1': 'orders', orders: 'orders', 'my orders': 'orders', 'previous orders': 'orders',
        '2': 'addresses', addresses: 'addresses', address: 'addresses',
        '3': 'wallet', wallet: 'wallet',
        edit: 'edit_profile', profile: 'edit_profile', 'edit profile': 'edit_profile',
        back: 'back',
      },
      account_edit: {
        '1': 'edit_name', name: 'edit_name', 'change name': 'edit_name',
        '2': 'edit_email', email: 'edit_email', 'change email': 'edit_email',
        back: 'back',
      },
      account_addresses: {
        '1': 'add_address', add: 'add_address', 'add address': 'add_address',
        back: 'back',
      },
      account_address_edit: {
        '1': 'set_default', default: 'set_default', 'set default': 'set_default',
        '2': 'delete_address', delete: 'delete_address', remove: 'delete_address',
        back: 'back',
      },
      wallet: {
        '1': 'wallet_history', history: 'wallet_history', transactions: 'wallet_history',
        back: 'back',
      },
    };

    const table = aliases[state];
    if (table && table[normalized]) return table[normalized];
    return normalized;
  }

  private getOrderUserId(order: { user: Types.ObjectId }): string | null {
    const raw = order.user as Types.ObjectId | { _id: Types.ObjectId };
    if (raw instanceof Types.ObjectId) return raw.toString();
    if (raw && raw._id instanceof Types.ObjectId) return raw._id.toString();
    return null;
  }

  private isValidTransitionKeyForState(state: SessionState, key: string): boolean {
    // Static buttons/list rows from flow config (when applicable)
    const flow = CHATBOT_FLOWS[state];
    const action = flow.action;
    const staticIds: string[] = [];
    if (action.type === 'buttons' && action.buttons) {
      staticIds.push(...action.buttons.map((b) => b.id));
    }
    if (action.type === 'list' && action.sections) {
      for (const section of action.sections) {
        staticIds.push(...section.rows.map((r) => r.id));
      }
    }
    if (staticIds.includes(key)) return true;

    // Dynamic ids based on state-specific rendering
    switch (state) {
      case 'browsing':
        return (
          key === 'back' ||
          key === 'more_categories' ||
          key === 'more_products' ||
          key.startsWith('cat_') ||
          key.startsWith('prod_')
        );
      case 'cart':
        return (
          key === 'checkout' ||
          key === 'manage' ||
          key === 'remove' ||
          key === 'clear' ||
          key === 'clear_confirm' ||
          key === 'back' ||
          key === 'continue' ||
          key === 'continue_shopping' ||
          key === BTN.COUPON_APPLY_BEST ||
          key === 'coupon_list' ||
          key === BTN.CART_INC ||
          key === BTN.CART_DEC ||
          key === BTN.CART_RM ||
          key.startsWith('citem_')
        );
      case 'coupon_prompt':
        return (
          key === 'coupon_yes' ||
          key === 'coupon_no' ||
          key === 'coupon_apply_suggested' ||
          key === 'coupon_custom' ||
          key === 'coupon_list' ||
          key === 'skip_coupon' ||
          key === 'back' ||
          key.startsWith('capply_')
        );
      case 'coupon_input':
        return (
          key === 'skip_coupon' ||
          key === 'remove_coupon' ||
          key === 'try_coupon_again' ||
          key === 'back'
        );
      case 'checkout':
        return key === 'new_address' || key === 'back' || key.startsWith('address_');
      case 'payment_selection':
        return (
          key === 'cod' ||
          key === 'prepaid' ||
          key === 'change_address' ||
          key === 'back' ||
          key === 'another_yes' ||
          key === 'another_no'
        );
      case 'order_tracking':
        return key === 'back' || key === 'more_orders' || key === 'browse' || key === BTN.REORDER_CURRENT || key.startsWith('order_') || key.startsWith('reorder_') || key.startsWith('pay_');
      case 'reorder':
        return key === 'confirm' || key === 'modify' || key === 'cancel' || key === 'back';
      case 'faq':
        return (
          key === 'back' ||
          key === 'support' ||
          key === 'faq_list' ||
          key.startsWith('faq_')
        );
      case 'support':
        return key === 'menu';
      case 'product_detail':
        return (
          key === 'add_cart' ||
          key === 'pick_qty' ||
          key === 'back' ||
          key.startsWith('qty_')
        );
      case 'address_input':
        return key === 'back' || key === 'submit';
      case 'main_menu':
        return key === 'browse' || key === 'cart' || key === 'orders' || key === 'reorder' || key === 'account' || key === 'help' || key === 'faq' || key === 'support';
      case 'account':
        return key === 'edit_profile' || key === 'addresses' || key === 'wallet' || key === 'orders' || key === 'back';
      case 'account_edit':
        return key === 'edit_name' || key === 'edit_email' || key === 'back';
      case 'account_addresses':
        return key === 'add_address' || key === 'back' || key.startsWith('addr_');
      case 'account_address_edit':
        return key === 'set_default' || key === 'delete_address' || key === 'back';
      case 'wallet':
        return key === 'wallet_history' || key === 'back';
    }
  }

  private async sendSafeFallbackForState(phone: string, session: ChatSessionDocument): Promise<void> {
    // Always re-show the current state options (no crashes, no silent failures).
    switch (session.currentState) {
      case 'browsing':
        await this.sendBrowseSurface(phone, session);
        return;
      case 'cart':
        await this.sendCartSummary(phone, session);
        return;
      case 'checkout':
        await this.sendCheckoutOptions(phone, session);
        return;
      case 'account':
        await this.sendAccountSummary(phone, session);
        return;
      case 'account_edit':
        await this.sendProfileEditOptions(phone, session);
        return;
      case 'account_addresses':
        await this.sendAddressList(phone, session);
        return;
      case 'wallet':
        await this.sendWalletSummary(phone, session);
        return;
      case 'order_tracking':
        await this.sendOrdersList(phone, session);
        return;
      default:
        await this.sendFlowResponse(phone, session.currentState, session);
    }
  }

  private isMenuCommand(input: string): boolean {
    const normalized = this.normalizeInput(input);
    return ['menu', 'start', 'hi', 'hello', 'hey', '/start', '/menu'].includes(normalized);
  }

  private isSupportDoneCommand(input: string): boolean {
    const normalized = this.normalizeInput(input);
    return [
      'done', 'thanks', 'thank you', 'thankyou', 'thx', 'resolved', 'solved',
      'theek hai', 'theek h', 'shukriya', 'ok thanks', 'ok thank you',
    ].includes(normalized);
  }

  /** States where the user is actively typing free text (address, coupon, name/email) — do not intercept. */
  private isTextInputState(state: SessionState): boolean {
    return state === 'address_input' || state === 'coupon_input' || state === 'account_edit';
  }

  /**
   * Parse a rating from free text. Matches "1".."5", "1 star", "5 stars", and simple
   * sentiment words. Returns null if the text clearly isn't a rating.
   */
  private parseRatingFromText(input: string): number | null {
    const normalized = this.normalizeInput(input);
    if (!normalized) return null;

    const numMatch = normalized.match(/^([1-5])(?:\s*(?:star|stars|\u2b50)?)?$/);
    if (numMatch) return Number.parseInt(numMatch[1], 10);

    const sentimentMap: Record<string, number> = {
      excellent: 5, amazing: 5, loved: 5, 'loved it': 5, great: 5, awesome: 5, perfect: 5,
      good: 4, nice: 4, liked: 4, 'liked it': 4,
      okay: 3, ok: 3, average: 3, fine: 3, 'so so': 3,
      poor: 2, bad: 2, disappointed: 2,
      terrible: 1, awful: 1, worst: 1, horrible: 1,
    };
    if (sentimentMap[normalized] !== undefined) return sentimentMap[normalized];

    return null;
  }

  /**
   * If the user has a recently delivered order with a pending feedback request,
   * accept a rating/comment reply and save it as feedback. Returns true if handled.
   */
  private async tryHandleFeedbackReply(
    phone: string,
    session: ChatSessionDocument,
    inputText: string,
  ): Promise<boolean> {
    if (!session.user) return false;

    // Find the most recent delivered order where we asked for feedback but they haven't replied.
    const recent = await this.ordersService.findUserOrders(session.user.toString(), 5);
    const target = recent.find(
      (o) =>
        o.status === 'delivered' &&
        (o as { feedbackRequestedAt?: Date }).feedbackRequestedAt,
    );
    if (!target) return false;

    const rating = this.parseRatingFromText(inputText);
    const trimmed = inputText.trim();
    // Only capture as feedback if it's an explicit numeric rating, OR a very short
    // message (≤ 40 chars) that doesn't contain shopping/order intent keywords.
    // Long messages and anything mentioning products/orders fall through to AI.
    const SHOPPING_KEYWORDS = /\b(order|ghee|dal|flour|oil|spice|grain|want|buy|add|cart|price|kg|ltr|litre|gram|packet|bottle|deliver|checkout)\b/i;
    const looksLikeFeedback =
      rating !== null ||
      (trimmed.length >= 3 && trimmed.length <= 40 && !SHOPPING_KEYWORDS.test(trimmed));
    if (!looksLikeFeedback) return false;

    try {
      await this.feedbackService.create(session.user.toString(), {
        type: 'order_feedback',
        orderId: target._id.toString(),
        rating: rating ?? undefined,
        message: trimmed.slice(0, 500),
      });
    } catch (err) {
      this.logger.warn('chatbot_feedback_save_failed', err);
      return false;
    }

    const thanks =
      rating && rating >= 4
        ? `Thanks for the ${rating}\u2605 rating! We appreciate it.`
        : rating
          ? `Thanks for your feedback (${rating}\u2605). We'll look into it.`
          : `Thanks for your feedback. We'll review it.`;
    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: `${thanks}\n\nAnything else we can help with?`,
      buttons: [
        { id: 'browse', title: '🛍 Browse' },
        { id: 'orders', title: 'My orders' },
        { id: 'menu', title: 'Menu' },
      ],
    });
    return true;
  }

  private async sendFallbackMenu(phone: string, _session: ChatSessionDocument): Promise<void> {
    const body =
      `👋 Here's everything in one place!\n\n` +
      `📋 *Browse Catalogue*\nhttps://wa.me/c/918817200740\n\n` +
      `🌐 *Shop on Website*\nhttps://naturelitefoods.com\n\n` +
      `📍 *Find Our Store*\nhttps://maps.app.goo.gl/D8G3EQVRB5eckFcw7`;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: body,
      buttons: [
        { id: 'menu', title: '🏠 Main Menu' },
        { id: 'reorder', title: '🔄 Reorder' },
        { id: 'orders', title: '📦 My Orders' },
      ],
    });
  }

  async getSession(phone: string): Promise<ChatSession | null> {
    return this.chatSessionRepository.findOneByPhone(phone);
  }

  async resetSession(phone: string): Promise<void> {
    await this.chatSessionRepository.updateOneByPhone(phone, {
      currentState: 'main_menu',
      context: {},
      isHandedOffToSupport: false,
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions(): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.chatSessionRepository.updateManyExpired(twentyFourHoursAgo);

    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} chat sessions`);
    }

    // Auto-clear support handoffs older than 6 hours so users aren't stuck in a
    // muted state if the team forgets to reset them. They'll get the main menu
    // back on their next message.
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const handoffResult = await this.chatSessionRepository.autoClearStaleHandoffs(sixHoursAgo);
    if (handoffResult.modifiedCount > 0) {
      this.logger.log(`Cleared ${handoffResult.modifiedCount} stale support handoffs`);
    }

    // Purge stale product cache entries to prevent unbounded growth.
    for (const [key, entry] of this.productCache) {
      if (entry.get() === undefined) this.productCache.delete(key);
    }
  }
}
