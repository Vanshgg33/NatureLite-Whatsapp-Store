import { Injectable, Logger, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
export class ChatbotService {
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
    await session.save();
  }

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
  ) {}

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

  /** Customer-facing status line (preparing + packed reads as ready to dispatch). */
  private formatOrderStatusForCustomer(order: { status: string; packedAt?: Date | null }): string {
    if (order.status === 'preparing' && order.packedAt) {
      return 'Ready for delivery';
    }
    if (order.status === 'placed' || order.status === 'confirmed' || order.status === 'preparing') {
      return 'Preparing';
    }
    return order.status.replace(/_/g, ' ');
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

    // Four customer-visible stages. "Confirmed" + "Preparing" + "Packed" all
    // read as "Preparing" to customers; admin-facing states are collapsed.
    type Stage = { label: string; at?: Date | null };
    const current = (() => {
      if (order.status === 'delivered') return 4;
      if (order.status === 'out_for_delivery') return 3;
      if (
        order.status === 'placed' ||
        order.status === 'confirmed' ||
        order.status === 'preparing'
      ) {
        return 2;
      }
      return 1;
    })();

    const stages: Stage[] = [
      { label: 'Order placed', at: order.createdAt },
      {
        label: 'Preparing',
        at: order.packedAt || null,
      },
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
      order.status === 'delivered'
        ? '\u2705'
        : order.status === 'out_for_delivery'
          ? '\uD83D\uDEF5'
          : '\uD83D\uDED2';

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
        await this.sendCategoryList(phone, session);
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

  private async handleMessageUnsafe(message: WhatsAppMessage): Promise<void> {
    try {
      const session = await this.getOrCreateSession(message.phone);

      await this.updateSessionActivity(session._id.toString());

      const inputText = this.extractInputText(message);

      // Allow menu reset commands even during support handoff.
      if (this.isMenuCommand(inputText)) {
        if (session.isHandedOffToSupport) {
          session.isHandedOffToSupport = false;
          await session.save();
        }
        await this.transitionToState(session, 'main_menu');
        await this.sendFlowResponse(message.phone, 'main_menu', session);
        return;
      }

      // If handed off, do not process normal bot flows.
      if (session.isHandedOffToSupport) {
        return;
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

    if (buttonId) {
      this.analytics.track('chatbot.button_clicked', {
        state: currentState,
        buttonId,
        userId: session.user?.toString(),
      });
    }

    // Global transition keys that are valid from any state (rendered after add-to-cart, remove,
    // out-of-stock recovery, etc.). These always route to a known state so the user never gets stuck.
    const globalKeys = new Set([
      'view_cart',
      'continue_shopping',
      'browse',
      'menu',
      'main_menu',
      'account',
      'orders',
      'support',
    ]);

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
    if (transitionKey === 'continue_shopping' || transitionKey === 'browse') {
      await this.transitionToState(session, 'browsing');
      await this.sendCategoryList(message.phone, session);
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
      await session.save();
      await this.transitionToState(session, 'order_tracking');
      await this.sendOrdersList(message.phone, session);
      return;
    }
    // Post-delivery feedback: if a user has a recent delivered order with a pending
    // feedback request, interpret a plain rating reply (1-5) or "1 star", "5 stars",
    // "great", "loved it" as feedback. Runs only from main_menu to avoid hijacking
    // other flows' typed input.
    if (
      !buttonId &&
      currentState === 'main_menu' &&
      session.user &&
      !this.isMenuCommand(inputText)
    ) {
      const handled = await this.tryHandleFeedbackReply(message.phone, session, inputText);
      if (handled) return;
    }

    // Free-text product search: if the user typed non-button text that wasn't
    // recognised as a navigation alias, and it's not a menu-command, treat it as
    // a search query from states where that makes sense.
    if (
      !buttonId &&
      inputText.length >= 3 &&
      !this.isMenuCommand(inputText) &&
      this.isSearchCapableState(currentState) &&
      !this.isValidTransitionKeyForState(currentState, transitionKey)
    ) {
      const handled = await this.tryProductSearch(message.phone, session, inputText);
      if (handled) return;
    }

    if (transitionKey === 'support') {
      await this.transitionToState(session, 'support');
      await this.sendFlowResponse(message.phone, 'support', session);
      return;
    }

    switch (currentState) {
      case 'main_menu':
        await this.handleMainMenu(session, message.phone, transitionKey);
        break;

      case 'browsing':
        await this.handleBrowsing(session, message.phone, transitionKey);
        break;

      case 'product_detail':
        await this.handleProductDetail(session, message.phone, transitionKey);
        break;

      case 'cart':
        await this.handleCart(session, message.phone, transitionKey);
        break;

      case 'coupon_prompt':
        await this.handleCouponPrompt(session, message.phone, transitionKey);
        break;

      case 'coupon_input':
        await this.handleCouponInput(session, message.phone, inputText, transitionKey);
        break;

      case 'checkout':
        await this.handleCheckout(session, message.phone, transitionKey);
        break;

      case 'address_input':
        await this.handleAddressInput(session, message.phone, inputText);
        break;

      case 'payment_selection':
        await this.handlePaymentSelection(session, message.phone, transitionKey, message);
        break;

      case 'order_tracking':
        await this.handleOrderTracking(session, message.phone, transitionKey);
        break;

      case 'reorder':
        await this.handleReorder(session, message.phone, transitionKey);
        break;

      case 'faq':
        await this.handleFaq(session, message.phone, transitionKey);
        break;

      case 'support':
        await this.handleSupport(session, message.phone, inputText);
        break;

      case 'account':
        await this.handleAccount(session, message.phone, transitionKey);
        break;

      case 'account_edit':
        await this.handleAccountEdit(session, message.phone, inputText, transitionKey);
        break;

      case 'account_addresses':
        await this.handleAccountAddresses(session, message.phone, transitionKey);
        break;

      case 'account_address_edit':
        await this.handleAccountAddressEdit(session, message.phone, transitionKey);
        break;

      case 'wallet':
        await this.handleWallet(session, message.phone, transitionKey);
        break;

      default:
        await this.transitionToState(session, 'main_menu');
        await this.sendFlowResponse(message.phone, 'main_menu', session);
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
        await this.sendCategoryList(phone, session);
        break;

      case 'cart':
        await this.transitionToState(session, 'cart');
        await this.sendCartSummary(phone, session);
        break;

      case 'orders':
        session.context = mergeChatContext(session.context, { ordersPage: 0 });
        await session.save();
        await this.transitionToState(session, 'order_tracking');
        await this.sendOrdersList(phone, session);
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
      await session.save();
      await this.sendProductList(phone, btn.id, session);
      return;
    }

    if (btn.kind === 'product') {
      session.currentProductId = btn.id;
      await this.transitionToState(session, 'product_detail');
      await this.sendProductDetail(phone, btn.id, session);
      return;
    }

    await this.sendCategoryList(phone, session);
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

    if ((input === 'add_cart' || input === 'buy_now') && session.currentProductId) {
      const product = await this.productsService.findById(session.currentProductId);
      // Stock is enforced against the main (Raipur) store, same as browse/detail.
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
          bodyText: `"${product.name}" is currently unavailable.\n\nWould you like to browse other products?`,
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
      const product = await this.productsService.findById(session.currentProductId);
      try {
        await this.cartService.addItem(session.user.toString(), {
          productId: session.currentProductId,
          quantity: 1,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        const stockIssue = /stock/i.test(msg);
        if (!stockIssue) {
          this.logger.warn(
            `Cart addItem failed for ${session.user.toString()} / ${session.currentProductId}: ${msg || 'unknown'}`,
          );
        }
        await this.whatsappService.sendTextMessage({
          phone,
          message: stockIssue
            ? 'Not enough stock available for this item.'
            : italic('Couldn\u2019t add this item to your cart. Please try again.'),
        });
        await this.sendProductDetail(phone, session.currentProductId, session);
        return;
      }

      const cart = await this.cartService.getCart(session.user.toString());
      this.analytics.track('chatbot.item_added_to_cart', {
        userId: session.user.toString(),
        productId: session.currentProductId,
        cartCount: cart.itemCount,
        cartTotal: cart.total,
      });
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: '\u2705 Added to cart',
        bodyText:
          `\uD83D\uDCE6 ${product.name}\n` +
          `\uD83D\uDED2 ${bold(`${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}`)} \u00B7 ${this.formatCurrency(cart.total)}`,
        buttons: [
          { id: BTN.VIEW_CART, title: '\uD83D\uDED2 View Cart' },
          { id: BTN.KEEP_SHOPPING, title: '\u2795 Keep Shopping' },
          { id: BTN.CHECKOUT, title: '\u2705 Checkout' },
        ],
      });
      return;
    }

    if (input === 'buy_now' && session.currentProductId && session.user) {
      try {
        await this.cartService.clearCart(session.user.toString());
        await this.cartService.addItem(session.user.toString(), {
          productId: session.currentProductId,
          quantity: 1,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        const stockIssue = /stock/i.test(msg);
        if (!stockIssue) {
          this.logger.warn(
            `Buy-now failed for ${session.user.toString()} / ${session.currentProductId}: ${msg || 'unknown'}`,
          );
          await this.whatsappService.sendTextMessage({
            phone,
            message: italic('Couldn\u2019t start checkout right now. Please try again.'),
          });
          await this.sendProductDetail(phone, session.currentProductId, session);
          return;
        }
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'Not enough stock available for this item.',
        });
        await this.sendProductDetail(phone, session.currentProductId, session);
        return;
      }

      await this.transitionToState(session, 'coupon_prompt');
      await this.sendFlowResponse(phone, 'coupon_prompt', session);
      return;
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

      // Skip the coupon prompt when it has nothing to show (already-applied coupon
      // OR no eligible suggestion). Users who want to type a code can still land
      // on coupon_input from the address screen's "Got a code?" hint in the future.
      const cart = await this.cartService.getCart(session.user.toString());
      const suggestion = await this.findSuggestedCoupon(session);
      const hasUsefulPrompt = !cart.couponCode && !!suggestion;

      if (!hasUsefulPrompt) {
        await this.transitionToState(session, 'checkout');
        await this.sendCheckoutOptions(phone, session);
        return;
      }

      await this.transitionToState(session, 'coupon_prompt');
      await this.sendFlowResponse(phone, 'coupon_prompt', session);
      return;
    }

    if (input === 'continue') {
      await this.transitionToState(session, 'browsing');
      await this.sendCategoryList(phone, session);
      return;
    }

    if (input === 'clear') {
      await this.cartService.clearCart(session.user.toString());
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Cart cleared successfully.',
      });
      await this.transitionToState(session, 'browsing');
      await this.sendCategoryList(phone, session);
      return;
    }

    if (input === 'manage' || input === 'remove') {
      await this.sendManageCartList(phone, session);
      return;
    }

    const btn = parseButton(input);
    if (btn.kind === 'manageItem') {
      if (!Number.isFinite(btn.idx) || btn.idx < 0) {
        await this.sendManageCartList(phone, session);
        return;
      }
      await this.sendCartItemManage(phone, session, btn.idx);
      return;
    }
    if (btn.kind === 'incItem') {
      await this.adjustCartItemQuantity(phone, session, btn.idx, +1);
      return;
    }
    if (btn.kind === 'decItem') {
      await this.adjustCartItemQuantity(phone, session, btn.idx, -1);
      return;
    }
    if (btn.kind === 'delItem') {
      await this.removeCartItemByIndex(phone, session, btn.idx);
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
      if (/stock/i.test(msg)) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: `_Only ${item.quantity} in stock — cannot increase further._`,
        });
      } else {
        this.logger.warn(
          `Cart quantity update failed for ${session.user.toString()}: ${msg || 'unknown'}`,
        );
        await this.whatsappService.sendTextMessage({
          phone,
          message: italic('Couldn\u2019t update the quantity. Please try again.'),
        });
      }
      await this.sendCartItemManage(phone, session, idx);
      return;
    }
    // Re-render the item panel with new quantity (same index still valid — no list reorder).
    await this.sendCartItemManage(phone, session, idx);
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
      await this.whatsappService.sendTextMessage({
        phone,
        message: italic('Couldn\u2019t remove that item. Please try again.'),
      });
      await this.sendCartSummary(phone, session);
      return;
    }
    const updated = await this.cartService.getCart(session.user.toString());
    if (previousCoupon && !updated.couponCode) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: '_Coupon removed \u2014 cart was updated._',
      });
    }
    await this.whatsappService.sendTextMessage({
      phone,
      message: `\uD83D\uDDD1\uFE0F  *Removed* ${item.product.name}`,
    });
    await this.sendCartSummary(phone, session);
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
      await this.whatsappService.sendTextMessage({
        phone,
        message: `_No cart item matches "${name.trim()}"._`,
      });
      await this.sendCartSummary(phone, session);
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
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register first to checkout.',
      });
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
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
  ): Promise<void> {
    const applicable = await this.findApplicableCoupons(session);
    const suggestion = applicable[0] ?? null;

    if (suggestion) {
      session.context = mergeChatContext(session.context, { suggestedCoupon: suggestion.code });
      await session.save();

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
          `\uD83C\uDF81 ${bold(`${this.formatCurrency(suggestion.discount)} off`)} with ${bold(suggestion.code)} \u2014 we've lined it up for you.\n` +
          italic(suggestion.description || 'Applied to your cart total.'),
        buttons: [
          { id: BTN.COUPON_APPLY_SUGGESTED, title: applyTitle },
          secondaryButton,
          { id: BTN.COUPON_SKIP, title: 'Skip' },
        ],
      });
      return;
    }

    // No eligible suggestion — short, no-friction prompt.
    session.context = mergeChatContext(session.context, { suggestedCoupon: undefined });
    await session.save();
    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: 'Got a promo code? Enter it now, or continue to payment.',
      buttons: [
        { id: BTN.COUPON_CUSTOM, title: '\uD83C\uDFF7 Enter code' },
        { id: BTN.COUPON_SKIP, title: 'Skip' },
        { id: BTN.BACK, title: '\u21A9 Back' },
      ],
    });
  }

  /**
   * Interactive list of every coupon applicable to the customer's cart right now.
   * Each row applies its code on tap.
   */
  private async sendAvailableCouponsList(
    phone: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    const applicable = await this.findApplicableCoupons(session);

    if (applicable.length === 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'No coupons available',
        bodyText: 'No promo codes apply to your cart right now. You can type a code to try it.',
        buttons: [
          { id: BTN.COUPON_CUSTOM, title: '\uD83C\uDFF7 Enter code' },
          { id: BTN.COUPON_SKIP, title: 'Skip' },
          { id: BTN.BACK, title: '\u21A9 Back' },
        ],
      });
      return;
    }

    const rows = applicable.slice(0, WA.MAX_ROWS_PER_SECTION - 1).map((c) => ({
      id: Btn.applyCoupon(c.code),
      title: clip(c.code, WA.LIST_ROW_TITLE),
      description: clip(
        `Save ${this.formatCurrency(c.discount)}${c.description ? ' \u00B7 ' + c.description : ''}`,
        WA.LIST_ROW_DESC,
      ),
    }));
    rows.push({
      id: BTN.COUPON_SKIP,
      title: 'Skip',
      description: 'Continue without a coupon',
    });

    await this.whatsappService.sendInteractiveList({
      phone,
      headerText: 'Available coupons',
      bodyText: 'Tap a code to apply it to your cart.',
      footerText: applicable.length > WA.MAX_ROWS_PER_SECTION - 1
        ? `Showing top ${WA.MAX_ROWS_PER_SECTION - 1} of ${applicable.length}`
        : undefined,
      buttonText: 'Choose coupon',
      sections: [{ title: 'Eligible codes', rows }],
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
    try {
      const updated = await this.cartService.applyCoupon(session.user.toString(), code);
      this.analytics.track('chatbot.coupon_applied', {
        userId: session.user.toString(),
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
        userId: session.user.toString(),
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
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Coupon removed from your cart.',
      });
      await this.transitionToState(session, 'coupon_prompt');
      await this.sendFlowResponse(phone, 'coupon_prompt', session);
      return;
    }

    const code = inputText.trim().toUpperCase();
    if (!code) {
      await this.sendFlowResponse(phone, 'coupon_input', session);
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
      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `\u2705 ${bold('Coupon applied')}\n` +
          `Code ${bold(code)} \u2014 saved ${bold(this.formatCurrency(updated.discount))}\n` +
          `New total ${bold(this.formatCurrency(updated.total))}`,
      });
      await this.transitionToState(session, 'checkout');
      await this.sendCheckoutOptions(phone, session);
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
      await session.save();
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
      await session.save();
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
      // Safety: never let the "place another order" override linger.
      if (session.context.allowAnotherOrderOnce) {
        session.context = mergeChatContext(session.context, { allowAnotherOrderOnce: false });
        await session.save();
      }
      await this.transitionToState(session, 'checkout');
      await this.sendCheckoutOptions(phone, session);
      return;
    }

    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register to complete your order.',
      });
      return;
    }

    const cart = await this.cartService.getCart(session.user.toString());

    if (cart.items.length === 0) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Your cart is empty. Browse products to get started.',
      });
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
      return;
    }

    const user = await this.usersService.findById(session.user.toString());
    const selectedIndex = session.context.selectedAddressIndex;
    const address =
      selectedIndex != null && user.addresses[selectedIndex]
        ? user.addresses[selectedIndex]
        : user.addresses.find((a) => a.isDefault) || user.addresses[0];

    if (!address) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please add a delivery address first.',
      });
      await this.transitionToState(session, 'address_input');
      await this.sendFlowResponse(phone, 'address_input', session);
      return;
    }

    if (input === 'another_yes') {
      session.context = mergeChatContext(session.context, { allowAnotherOrderOnce: true });
      await session.save();
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Got it. Please select a payment method to place another order.',
      });
      await this.sendFlowResponse(phone, 'payment_selection', session);
      return;
    }

    if (input === 'another_no') {
      if (session.context.allowAnotherOrderOnce) {
        session.context = mergeChatContext(session.context, { allowAnotherOrderOnce: false });
        await session.save();
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
      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `${bold('Online payment unavailable')}\n\n` +
          `Tap ${bold('Back')} to select Cash on Delivery, or try again later.`,
      });
      await this.sendFlowResponse(phone, 'payment_selection', session);
      return;
    }

    const ctx = session.context;
    const recent = await this.ordersService.findUserOrders(session.user.toString(), 1);
    if (recent.length > 0 && !ctx.allowAnotherOrderOnce) {
      const createdRaw = recent[0].createdAt;
      const createdMs =
        createdRaw instanceof Date ? createdRaw.getTime() : new Date(createdRaw as string).getTime();
      if (Number.isFinite(createdMs) && Date.now() - createdMs < WHATSAPP_RECENT_ORDER_COOLDOWN_MS) {
        await this.whatsappService.sendInteractiveButtons({
          phone,
          headerText: 'Recent order detected',
          bodyText: 'You placed an order just moments ago. Would you like to place another?',
          buttons: [
            { id: 'another_yes', title: 'Yes, place order' },
            { id: 'another_no', title: 'No' },
          ],
        });
        return;
      }
    }

    const paymentMethod = input === 'cod' ? 'cod' : 'prepaid';

    let order;
    try {
      await this.whatsappService.sendTextMessage({
        phone,
        message: '_Placing your order..._',
      });
      // Consume the one-time override (only for this attempt).
      if (ctx.allowAnotherOrderOnce) {
        session.context = mergeChatContext(session.context, { allowAnotherOrderOnce: false });
        await session.save();
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
          : 'We couldn\u2019t place your order right now. Your cart is saved \u2014 please try again or contact support.',
        buttons: [
          { id: BTN.CART, title: '\uD83D\uDED2 View Cart' },
          { id: BTN.SUPPORT, title: '\uD83D\uDC64 Support' },
          { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' },
        ],
      });
      await this.transitionToState(session, 'cart');
      return;
    }

    this.analytics.track('chatbot.order_completed', {
      userId: session.user.toString(),
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      total: order.total,
      paymentMethod,
    });

    if (paymentMethod === 'cod') {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: '\u2705 Order confirmed',
        bodyText:
          `${bold(`#${order.orderNumber}`)}\n` +
          `Total ${bold(this.formatCurrency(order.total))}\n` +
          `Status ${bold(this.formatOrderStatusForCustomer(order))}\n\n` +
          `We'll ping you when it ships \uD83D\uDCE6`,
        footerText: 'Cash on delivery',
        buttons: [
          { id: Btn.order(order._id.toString()), title: '\uD83D\uDCE6 Track Order' },
          { id: BTN.BROWSE, title: '\uD83D\uDECD Keep Shopping' },
          { id: BTN.MENU, title: '\uD83C\uDFE0 Main Menu' },
        ],
      });
    } else {
      let payUrl = '';
      try {
        const payToken = this.paymentsService.signWhatsAppPayToken(
          order._id.toString(),
          session.user.toString(),
        );
        const base = this.resolveFrontendBaseUrl();
        if (base) {
          payUrl = `${base}/pay/${encodeURIComponent(order._id.toString())}?t=${encodeURIComponent(payToken)}`;
        }
      } catch (signErr) {
        this.logger.warn('WhatsApp pay token failed', signErr);
        payUrl = '';
      }

      const body =
        `${bold(`#${order.orderNumber}`)}\n` +
        `Total ${bold(this.formatCurrency(order.total))}\n` +
        `Status ${bold(this.formatOrderStatusForCustomer(order))}\n\n` +
        (payUrl
          ? `Complete your payment securely:\n${payUrl}\n\n${italic('Link expires in 48 hours.')}`
          : `Sign in to our website and pay for order ${bold(order.orderNumber)} from your account.`);

      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: '\u2705 Order created',
        bodyText: body,
        buttons: [
          { id: Btn.order(order._id.toString()), title: '\uD83D\uDCE6 Track Order' },
          { id: BTN.BROWSE, title: '\uD83D\uDECD Keep Shopping' },
          { id: BTN.MENU, title: '\uD83C\uDFE0 Main Menu' },
        ],
      });
    }

    await this.transitionToState(session, 'main_menu');
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
      if (session.user) {
        const orderUserId = this.getOrderUserId(order);
        if (orderUserId && orderUserId !== session.user.toString()) {
          await this.whatsappService.sendTextMessage({
            phone,
            message: 'You do not have access to this order.',
          });
          await this.sendOrdersList(phone, session);
          return;
        }
      }
      if (session.user && !this.getOrderUserId(order)) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: '\u274C You do not have access to this order.',
        });
        await this.sendOrdersList(phone, session);
        return;
      }

      const message = this.buildOrderTrackingMessage(order);

      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText: message,
        buttons: [
          { id: Btn.reorder(orderId), title: '\uD83D\uDD01 Reorder' },
          { id: BTN.SUPPORT, title: '\uD83D\uDC64 Help' },
          { id: BTN.BACK, title: '\u21A9 Back' },
        ],
      });
      return;
    }

    if (btn.kind === 'reorder') {
      const orderId = btn.id;
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
      if (session.user) {
        const orderUserId = this.getOrderUserId(order);
        if (orderUserId && orderUserId !== session.user.toString()) {
          await this.whatsappService.sendTextMessage({
            phone,
            message: 'You do not have access to this order.',
          });
          await this.sendOrdersList(phone, session);
          return;
        }
      }
      if (session.user && !this.getOrderUserId(order)) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: '❌ You do not have access to this order.',
        });
        await this.sendOrdersList(phone, session);
        return;
      }
      session.pendingOrderId = orderId;
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
      try {
        await this.ordersService.reorder(session.user.toString(), {
          orderId: session.pendingOrderId,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        const outOfStock = /stock|insufficient/i.test(msg);
        if (!outOfStock) {
          this.logger.warn(
            `Reorder failed for ${session.user.toString()} / ${session.pendingOrderId}: ${msg || 'unknown'}`,
          );
        }
        await this.whatsappService.sendInteractiveButtons({
          phone,
          headerText: outOfStock ? 'Reorder unavailable' : 'Reorder failed',
          bodyText: outOfStock
            ? 'Some items are currently out of stock.'
            : 'We couldn\u2019t reorder right now. Please try another order or contact support.',
          buttons: [
            { id: BTN.ORDERS, title: '\uD83D\uDCE6 My Orders' },
            { id: BTN.BROWSE, title: '\uD83D\uDECD Browse' },
            { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' },
          ],
        });
        await this.transitionToState(session, 'main_menu');
        return;
      }

      await this.whatsappService.sendTextMessage({
        phone,
        message: '*Added to Cart* \u2713\n\nItems from your previous order are ready for checkout.',
      });

      await this.transitionToState(session, 'checkout');
      await this.sendCheckoutOptions(phone, session);
      return;
    }

    if (input === 'modify' && session.pendingOrderId) {
      await this.transitionToState(session, 'cart');
      await this.sendCartSummary(phone, session);
      return;
    }

    await this.sendFlowResponse(phone, 'reorder', session);
  }

  private async handleFaq(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
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
          { id: 'back', title: 'Back to FAQ' },
          { id: 'support', title: 'Talk to Support' },
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
      await session.save();
      await this.transitionToState(session, 'main_menu');
      await this.sendFlowResponse(phone, 'main_menu', session);
      return;
    }

    session.isHandedOffToSupport = true;
    session.supportHandoffAt = new Date();
    await session.save();

    await this.whatsappService.sendTextMessage({
      phone,
      message:
        `*Message Received* \u2713\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Our support team will respond shortly.\n\n` +
        `_Type *menu* anytime to return._`,
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
      await session.save();
      await this.transitionToState(session, 'account');
      await this.sendAccountSummary(phone, session);
      return;
    }

    // User tapped "Change Name" or "Change Email" — enter input mode.
    if (transitionKey === 'edit_name') {
      session.context = mergeChatContext(session.context, { editingField: 'name' });
      await session.save();
      await this.whatsappService.sendTextMessage({
        phone,
        message: '*Enter your new name:*',
      });
      return;
    }

    if (transitionKey === 'edit_email') {
      session.context = mergeChatContext(session.context, { editingField: 'email' });
      await session.save();
      await this.whatsappService.sendTextMessage({
        phone,
        message: '*Enter your new email address:*',
      });
      return;
    }

    // User sent free-text while editing a field.
    const editingField = session.context.editingField;
    if (editingField && session.user) {
      const value = inputText.trim();
      if (!value) {
        await this.whatsappService.sendTextMessage({
          phone,
          message: `Please enter a valid ${editingField}.`,
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
      await session.save();

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
      await session.save();
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
          { id: 'set_default', title: 'Set as Default' },
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
        { id: 'orders', title: 'My Orders' },
        { id: 'addresses', title: 'My Addresses' },
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
        { id: 'edit_name', title: 'Change Name' },
        { id: 'edit_email', title: 'Change Email' },
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
          `*My Addresses*\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          `No saved addresses yet. Add your first one.`,
        buttons: [
          { id: 'add_address', title: 'Add Address' },
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

    rows.push({ id: 'add_address', title: 'Add New Address', description: 'Add a new delivery address' });

    await this.whatsappService.sendInteractiveList({
      phone,
      bodyText:
        `*My Addresses* (${user.addresses.length})\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Tap an address to manage it.`,
      buttonText: 'View Addresses',
      sections: [{ title: 'Saved Addresses', rows }],
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

  private async sendCategoryList(phone: string, session: ChatSessionDocument): Promise<void> {
    let categories = this.categoryCache.get();
    if (!categories) {
      categories = await this.categoriesService.findActiveCategories();
      this.categoryCache.set(categories);
    }

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
    let productCacheEntry = this.productCache.get(categoryId);
    if (!productCacheEntry) {
      // Evict oldest entries if cache is full.
      if (this.productCache.size >= this.productCacheMaxSize) {
        const firstKey = this.productCache.keys().next().value;
        if (firstKey !== undefined) this.productCache.delete(firstKey);
      }
      productCacheEntry = new TtlCache<Product[]>(2 * 60_000);
      this.productCache.set(categoryId, productCacheEntry);
    }
    let products = productCacheEntry.get();
    if (!products) {
      try {
        products = await this.productsService.findByCategory(categoryId);
        productCacheEntry.set(products);
      } catch (err) {
        // Category id may be stale (deleted while user was browsing).
        this.logger.warn(
          `findByCategory failed for ${categoryId}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
        this.productCache.delete(categoryId);
        session.currentCategoryId = undefined;
        await session.save();
        await this.whatsappService.sendTextMessage({
          phone,
          message: 'That category is no longer available. Showing all categories.',
        });
        await this.sendCategoryList(phone, session);
        return;
      }
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
        headerText: 'No stock',
        bodyText: 'No products in this category are in stock at our store right now.',
        buttons: [
          { id: BTN.BROWSE, title: '\uD83D\uDECD Other categories' },
          { id: BTN.MENU, title: '\uD83C\uDFE0 Menu' },
        ],
      });
      return;
    }

    let page = this.getListPage(session, 'productPage');
    const pageSize = 9;
    let start = page * pageSize;

    // Reset to first page if current page is beyond available data.
    if (start >= fulfillableProducts.length && fulfillableProducts.length > 0) {
      page = 0;
      start = 0;
      await this.setListPage(session, 'productPage', 0);
    }

    const slice = fulfillableProducts.slice(start, start + pageSize);
    const hasMore = start + pageSize < fulfillableProducts.length;

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
      bodyText: 'Pick a product to see details and add to cart.',
      footerText: page > 0 ? `Page ${page + 1}` : undefined,
      buttonText: 'View products',
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
      await session.save();
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

    if (product.images[0]) {
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

    const followUpBody = product.images[0]
      ? `${bold(product.name)} \u00B7 ${this.formatCurrency(product.price)} \u00B7 ${stockBadge}\n\nReady to add?`
      : `${caption}\n\nReady to add?`;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: followUpBody,
      buttons: [
        { id: BTN.ADD_CART, title: '\uD83D\uDED2 Add to Cart' },
        { id: BTN.BUY_NOW, title: '\u26A1 Buy Now' },
        { id: BTN.BACK, title: '\u21A9 More products' },
      ],
    });
  }

  private async sendCartSummary(phone: string, session: ChatSessionDocument): Promise<void> {
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
        `${idx + 1}. ${item.product.name}  \u00D7${item.quantity}  \u2014  ${this.formatCurrency(item.total)}`,
      )
      .join('\n');

    const breakdown: string[] = [`Subtotal\u2003${this.formatCurrency(cart.subtotal)}`];
    if (cart.discount > 0) {
      breakdown.push(
        `\uD83C\uDFF7 ${cart.couponCode || 'Discount'}\u2003\u2212${this.formatCurrency(cart.discount)}`,
      );
    }
    breakdown.push(bold(`You pay\u2003${this.formatCurrency(cart.total)}`));

    const FREE_SHIP_THRESHOLD = 500;
    const shippingLine =
      cart.subtotal >= FREE_SHIP_THRESHOLD
        ? '\n\n\uD83C\uDF89 Free delivery unlocked'
        : `\n\n${italic(`Add ${this.formatCurrency(FREE_SHIP_THRESHOLD - cart.subtotal)} more for free delivery`)}`;

    const header = `\uD83D\uDED2 Your cart \u00B7 ${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}`;
    const body = `${itemList}\n\n${breakdown.join('\n')}${shippingLine}`;

    // Show the edit-tip once per session to keep follow-up renders clean.
    const tipSeen = session.context?.cartTipSeen === true;
    const footer = tipSeen ? undefined : "Tip: type 'remove ghee' to edit";
    if (!tipSeen) {
      session.context = mergeChatContext(session.context, { cartTipSeen: true });
      await session.save();
    }

    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: clip(header, WA.HEADER),
      bodyText: body,
      footerText: footer,
      buttons: [
        { id: BTN.CHECKOUT, title: '\u2705 Checkout' },
        { id: BTN.MANAGE_CART, title: '\u270F\uFE0F Manage' },
        { id: BTN.KEEP_SHOPPING, title: '\u2795 Add More' },
      ],
    });
  }

  /** Empty cart with high-intent recovery CTAs. */
  private async sendEmptyCart(phone: string): Promise<void> {
    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: '\uD83D\uDED2 Your cart',
      bodyText:
        `Your cart's empty \uD83E\uDEB9\n\n` +
        `Start browsing to find something you'll love.`,
      buttons: [
        { id: BTN.BROWSE, title: '\uD83D\uDECD Browse All' },
        { id: BTN.ORDERS, title: '\uD83D\uDCE6 My Orders' },
      ],
    });
  }

  /** Item list for the "Manage Items" flow — user picks an item to adjust. */
  private async sendManageCartList(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) return;
    const cart = await this.cartService.getCart(session.user.toString());
    if (cart.items.length === 0) {
      await this.sendCartSummary(phone, session);
      return;
    }

    const itemRows = cart.items.slice(0, 8).map((item, idx) => ({
      id: Btn.manageItem(idx),
      title: clip(item.product.name, WA.LIST_ROW_TITLE),
      description: clip(
        `\u00D7${item.quantity}  \u00B7  ${this.formatCurrency(item.total)}`,
        WA.LIST_ROW_DESC,
      ),
    }));

    const rows = [
      ...itemRows,
      { id: BTN.CLEAR_CART, title: 'Clear entire cart', description: 'Remove all items' },
      { id: BTN.BACK, title: 'Back to cart', description: 'Return to summary' },
    ];

    await this.whatsappService.sendInteractiveList({
      phone,
      headerText: 'Manage cart',
      bodyText: 'Pick an item to change quantity or remove it.',
      buttonText: 'Choose item',
      sections: [{ title: 'Cart items', rows }],
    });
  }

  /** Per-item panel with − / + / Remove controls. */
  private async sendCartItemManage(
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

    const unitPrice = item.quantity > 0 ? item.total / item.quantity : item.price;
    const firstWord = item.product.name.split(' ')[0].toLowerCase();
    const body =
      `\uD83D\uDCE6 ${bold(item.product.name)}\n\n` +
      `Unit\u2003${this.formatCurrency(unitPrice)}\n` +
      `Qty\u2003${bold(`\u00D7${item.quantity}`)}\n` +
      `Total\u2003${bold(this.formatCurrency(item.total))}\n\n` +
      italic(`Type 'set ${firstWord} 3' to set a specific quantity.`);

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: body,
      buttons: [
        { id: Btn.decItem(idx), title: '\u2212' },
        { id: Btn.incItem(idx), title: '+' },
        { id: Btn.delItem(idx), title: '\uD83D\uDDD1 Remove' },
      ],
    });
  }

  private async sendCheckoutOptions(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'Please register to checkout.',
      });
      return;
    }

    const user = await this.usersService.findById(session.user.toString());

    // If the user has no saved addresses, the list would only hold the "Add new" row,
    // which reads awkwardly as a list. Fall back to a simple 2-button screen.
    if (user.addresses.length === 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        headerText: 'Deliver to',
        bodyText: 'Add a delivery address to continue.',
        buttons: [
          { id: BTN.ADD_NEW_ADDRESS, title: '\u2795 Add address' },
          { id: BTN.BACK, title: '\u21A9 Back' },
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
      bodyText: 'Pick an address or add a new one.',
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
          { id: BTN.BROWSE, title: '\uD83D\uDECD Start Shopping' },
          { id: BTN.BACK, title: '\u21A9 Main Menu' },
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

    const rows = slice.map((order) => ({
      id: Btn.order(order._id.toString()),
      title: clip(order.orderNumber, WA.LIST_ROW_TITLE),
      description: clip(
        `${this.formatOrderStatusForCustomer(order)}  \u00B7  ${this.formatCurrency(order.total)}`,
        WA.LIST_ROW_DESC,
      ),
    }));

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
  ): Promise<void> {
    // Main menu renders dynamically (personalized greeting + live cart count).
    if (state === 'main_menu') {
      await this.sendMainMenu(phone, session);
      return;
    }

    // Coupon prompt renders dynamically to support auto-suggestion.
    if (state === 'coupon_prompt') {
      await this.sendCouponPromptScreen(phone, session);
      return;
    }

    const flow = CHATBOT_FLOWS[state];
    const action = flow.action;

    switch (action.type) {
      case 'text':
        if (action.content) {
          await this.whatsappService.sendTextMessage({
            phone,
            message: action.content,
          });
        }
        break;

      case 'buttons':
        if (action.buttons) {
          await this.whatsappService.sendInteractiveButtons({
            phone,
            headerText: clip(action.header, WA.HEADER) || undefined,
            bodyText: action.content,
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
            bodyText: action.content,
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
  private async sendMainMenu(
    phone: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    const flow = CHATBOT_FLOWS.main_menu;
    const action = flow.action;

    const name = firstName(session.metadata?.contactName);

    let cartCount = 0;
    if (session.user) {
      try {
        const cart = await this.cartService.getCart(session.user.toString());
        cartCount = cart.itemCount ?? 0;
      } catch {
        cartCount = 0;
      }
    }
    const cartLabel = cartCount > 0 ? `\uD83D\uDED2 Cart \u00B7 ${cartCount}` : '\uD83D\uDED2 My Cart';

    const body =
      `Hey ${name} \uD83D\uDC4B\n` +
      `What are you in the mood for today?\n\n` +
      `Quick access: ${bold('orders')} \u00B7 ${bold('account')} \u00B7 ${bold('help')}`;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      headerText: clip(action.header, WA.HEADER) || undefined,
      bodyText: body,
      footerText: clip(action.footer, WA.FOOTER) || undefined,
      buttons: [
        { id: BTN.BROWSE, title: '\uD83D\uDECD Shop Now' },
        { id: BTN.CART, title: clip(cartLabel, WA.BUTTON_TITLE) },
        { id: BTN.ORDERS, title: '\uD83D\uDCE6 Track Order' },
      ],
    });
  }

  private async getOrCreateSession(phone: string): Promise<ChatSessionDocument> {
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
      await session.save();
    }

    return session;
  }

  private async transitionToState(
    session: ChatSessionDocument,
    newState: SessionState,
  ): Promise<void> {
    session.previousState = session.currentState;
    session.currentState = newState;
    await session.save();
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
        '4': 'account', 'account': 'account', 'my account': 'account', 'profile': 'account',
        '5': 'faq', 'help': 'faq', 'faq': 'faq', 'help & faq': 'faq', 'help and faq': 'faq',
        '6': 'support', 'support': 'support', 'agent': 'support', 'human': 'support',
      },
      browsing: { back: 'back', more: 'more_products', next: 'more_products' },
      product_detail: {
        '1': 'add_cart', 'add': 'add_cart', 'add to cart': 'add_cart',
        '2': 'buy_now', 'buy': 'buy_now', 'buy now': 'buy_now',
        back: 'back',
      },
      cart: {
        '1': 'checkout', 'checkout': 'checkout', 'pay': 'checkout', 'order': 'checkout',
        '2': 'remove', 'remove': 'remove',
        '3': 'clear', 'clear': 'clear', 'empty': 'clear',
        continue: 'continue', 'continue shopping': 'continue',
        back: 'back',
      },
      coupon_prompt: {
        '1': 'coupon_yes', yes: 'coupon_yes', y: 'coupon_yes',
        '2': 'coupon_no', no: 'coupon_no', n: 'coupon_no', skip: 'coupon_no',
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
          key === 'back' ||
          key === 'continue' ||
          key === 'continue_shopping' ||
          key.startsWith('mi_') ||
          key.startsWith('inc_') ||
          key.startsWith('dec_') ||
          key.startsWith('del_') ||
          key.startsWith('rm_')
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
          key === 'back' ||
          key === 'another_yes' ||
          key === 'another_no'
        );
      case 'order_tracking':
        return key === 'back' || key === 'more_orders' || key === 'browse' || key.startsWith('order_') || key.startsWith('reorder_');
      case 'reorder':
        return key === 'confirm' || key === 'modify' || key === 'cancel' || key === 'back';
      case 'faq':
        return key === 'back' || key === 'support' || key.startsWith('faq_');
      case 'support':
        return key === 'menu';
      case 'product_detail':
        return key === 'add_cart' || key === 'buy_now' || key === 'back';
      case 'address_input':
        return key === 'back' || key === 'submit';
      case 'main_menu':
        return key === 'browse' || key === 'cart' || key === 'orders' || key === 'account' || key === 'help' || key === 'faq' || key === 'support';
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
        await this.sendCategoryList(phone, session);
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

  /** States from which free-text is safe to interpret as a product search. */
  private isSearchCapableState(state: SessionState): boolean {
    return state === 'main_menu' || state === 'browsing' || state === 'product_detail';
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
    // Must be either a parseable rating OR a short message (> 3 chars, < 500) right after
    // a feedback request — otherwise we hand off to search/menu to avoid hijacking.
    const looksLikeFeedback =
      rating !== null || (trimmed.length >= 3 && trimmed.length <= 500 && !/^[a-z_]+$/i.test(trimmed));
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
        { id: 'browse', title: 'Browse Products' },
        { id: 'orders', title: 'My Orders' },
        { id: 'menu', title: 'Main Menu' },
      ],
    });
    return true;
  }

  /**
   * Search products by free text and render the results as an interactive list.
   * Returns true if a response was sent (search ran), false if the query was
   * skipped (e.g. too few letters, no matches and we chose not to spam).
   */
  private async tryProductSearch(
    phone: string,
    session: ChatSessionDocument,
    query: string,
  ): Promise<boolean> {
    const trimmed = query.trim();
    if (trimmed.length < 3) return false;

    let products: Product[] = [];
    try {
      products = await this.productsService.searchProducts(trimmed, 9);
    } catch (err) {
      this.logger.warn('Product search failed', err);
      return false;
    }

    if (products.length === 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText:
          `*No matches for "${trimmed.slice(0, 40)}"*\n\n` +
          `Try a different keyword, or browse by category.`,
        buttons: [
          { id: 'browse', title: 'Browse Categories' },
          { id: 'menu', title: 'Main Menu' },
        ],
      });
      return true;
    }

    const rows = products.map((prod) => ({
      id: `prod_${prod._id.toString()}`,
      title: prod.name.slice(0, 24),
      description: `${this.formatCurrency(prod.price)}`.slice(0, 72),
    }));

    await this.transitionToState(session, 'browsing');
    await this.whatsappService.sendInteractiveList({
      phone,
      bodyText:
        `*Results for "${trimmed.slice(0, 40)}"*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Tap a product to view details.`,
      buttonText: 'View Results',
      sections: [{ title: 'Matches', rows }],
    });
    return true;
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
