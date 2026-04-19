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
import { WhatsAppMessage } from '../whatsapp/dto/whatsapp.dto';
import { CHATBOT_FLOWS, FAQ_RESPONSES } from './chatbot.flows';
import {
  type ChatListPageKey,
  mergeChatContext,
} from './chat-session-context';
import { Category } from '../categories/schemas/category.schema';
import { Product } from '../products/schemas/product.schema';

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
  ) {}

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
   * Zomato-style vertical tracker. Uses check/current/pending glyphs and timestamps
   * from order lifecycle fields. Cancelled orders short-circuit to a red layout.
   */
  private buildOrderTrackingMessage(order: any): string {
    const DIVIDER =
      '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
    const statusLabel = this.formatOrderStatusForCustomer(order);

    if (order.status === 'cancelled') {
      const when = this.formatStepTimestamp(order.cancelledAt || order.updatedAt);
      const reasonLine = order.cancelReason ? `\n\nReason: _${order.cancelReason}_` : '';
      return (
        `\u274C  *Order ${order.orderNumber}*\n` +
        `${DIVIDER}\n\n` +
        `Status \u00B7 *Cancelled*\n` +
        (when ? `When \u00B7 _${when}_\n` : '') +
        reasonLine +
        `\n\n` +
        `${DIVIDER}\n` +
        `Items \u00B7 *${order.items.length}*\n` +
        `*Total  ${this.formatCurrency(order.total)}*`
      );
    }

    // Build timeline stages. Each stage has a status: done / current / pending.
    type Stage = { icon: string; label: string; at?: Date | null };
    const current = (() => {
      if (order.status === 'delivered') return 5;
      if (order.status === 'out_for_delivery') return 4;
      if (order.status === 'preparing' && order.packedAt) return 3;
      if (order.status === 'preparing' || order.status === 'confirmed') return 2;
      return 1;
    })();

    const stages: Stage[] = [
      { icon: '\uD83D\uDCDD', label: 'Order Placed', at: order.createdAt },
      { icon: '\u2705', label: 'Confirmed', at: null },
      { icon: '\uD83D\uDCE6', label: 'Packed & Ready', at: order.packedAt },
      { icon: '\uD83D\uDEF5', label: 'Out for Delivery', at: order.outForDeliveryAt },
      { icon: '\uD83C\uDFE0', label: 'Delivered', at: order.deliveredAt },
    ];

    const timeline = stages
      .map((stage, i) => {
        const idx = i + 1;
        const glyph =
          idx < current ? '\u2705' : idx === current ? '\uD83D\uDFE0' : '\u26AA';
        const weight = idx === current ? `*${stage.label}*` : stage.label;
        const whenLine = stage.at
          ? `\n     _${this.formatStepTimestamp(stage.at)}_`
          : idx === current
            ? `\n     _in progress_`
            : `\n     _pending_`;
        return `${glyph}  ${weight}${whenLine}`;
      })
      .join('\n\n');

    const etaLine = order.expectedDeliveryDate
      ? `ETA \u00B7 *${new Date(order.expectedDeliveryDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}*\n`
      : '';

    const courierLines: string[] = [];
    if (order.courierName) courierLines.push(`\uD83D\uDEF5  Courier \u00B7 *${order.courierName}*`);
    if (order.awbNumber) courierLines.push(`\uD83D\uDCE6  AWB \u00B7 *${order.awbNumber}*`);
    if (order.trackingUrl) courierLines.push(`\uD83D\uDD17  ${order.trackingUrl}`);
    const courierBlock = courierLines.length
      ? `\n${DIVIDER}\n${courierLines.join('\n')}\n`
      : '';

    const itemsPreview = (order.items as any[])
      .slice(0, 4)
      .map((it: any) => `\u2022  ${it.name}  \u00D7${it.quantity}`)
      .join('\n');
    const itemsMore =
      order.items.length > 4 ? `\n_\u2026 and ${order.items.length - 4} more_` : '';

    const headerIcon =
      order.status === 'delivered'
        ? '\u2705'
        : order.status === 'out_for_delivery'
          ? '\uD83D\uDEF5'
          : '\uD83D\uDED2';

    return (
      `${headerIcon}  *Order ${order.orderNumber}*\n` +
      `${DIVIDER}\n\n` +
      `Status \u00B7 *${statusLabel}*\n` +
      etaLine +
      `\n${DIVIDER}  *Journey*  ${DIVIDER}\n\n` +
      `${timeline}\n` +
      courierBlock +
      `\n${DIVIDER}  *Items (${order.items.length})*  ${DIVIDER}\n` +
      `${itemsPreview}${itemsMore}\n\n` +
      `*Total   ${this.formatCurrency(order.total)}*`
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
    if (input === 'back') {
      await this.goBack(session, phone);
      return;
    }

    if (input === 'more_categories') {
      const nextPage = this.getListPage(session, 'categoryPage') + 1;
      await this.setListPage(session, 'categoryPage', nextPage);
      await this.sendCategoryList(phone, session);
      return;
    }

    if (input === 'more_products' && session.currentCategoryId) {
      const nextPage = this.getListPage(session, 'productPage') + 1;
      await this.setListPage(session, 'productPage', nextPage);
      await this.sendProductList(phone, session.currentCategoryId, session);
      return;
    }

    if (input.startsWith('cat_')) {
      const categoryId = input.replace('cat_', '');
      session.currentCategoryId = categoryId;
      // Reset product list paging when category changes.
      session.context = mergeChatContext(session.context, { productPage: 0 });
      await session.save();
      await this.sendProductList(phone, categoryId, session);
      return;
    }

    if (input.startsWith('prod_')) {
      const productId = input.replace('prod_', '');
      session.currentProductId = productId;
      await this.transitionToState(session, 'product_detail');
      await this.sendProductDetail(phone, productId, session);
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
      const isOutOfStock =
        product.trackStock === true && (product.stock ?? 0) <= 0;

      if (isOutOfStock) {
        await this.whatsappService.sendInteractiveButtons({
          phone,
          bodyText:
            `*Out of Stock*\n` +
            `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
            `"${product.name}" is currently unavailable.\n\nWould you like to browse other products?`,
          buttons: [
            { id: 'back', title: 'Back' },
            { id: 'browse', title: 'Browse' },
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
        if (/stock/i.test(msg)) {
          await this.whatsappService.sendTextMessage({
            phone,
            message: 'Not enough stock available for this item.',
          });
          await this.sendProductDetail(phone, session.currentProductId, session);
          return;
        }
        throw e;
      }

      const cart = await this.cartService.getCart(session.user.toString());
      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText:
          `\u2705  *Added to Cart*\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          `\uD83D\uDCE6  ${product.name}\n` +
          `\uD83D\uDED2  Cart: *${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}*  \u00B7  ${this.formatCurrency(cart.total)}`,
        buttons: [
          { id: 'view_cart', title: 'View Cart' },
          { id: 'continue_shopping', title: 'Keep Shopping' },
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
        if (/stock/i.test(msg)) {
          await this.whatsappService.sendTextMessage({
            phone,
            message: 'Not enough stock available for this item.',
          });
          await this.sendProductDetail(phone, session.currentProductId, session);
          return;
        }
        throw e;
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

    // Select a specific item to manage (list row) → open its +/-/remove panel.
    if (input.startsWith('mi_')) {
      const idx = Number.parseInt(input.replace('mi_', ''), 10);
      if (!Number.isFinite(idx) || idx < 0) {
        await this.sendManageCartList(phone, session);
        return;
      }
      await this.sendCartItemManage(phone, session, idx);
      return;
    }

    // Increase quantity by 1
    if (input.startsWith('inc_')) {
      const idx = Number.parseInt(input.replace('inc_', ''), 10);
      await this.adjustCartItemQuantity(phone, session, idx, +1);
      return;
    }

    // Decrease quantity by 1 (removes if goes to 0)
    if (input.startsWith('dec_')) {
      const idx = Number.parseInt(input.replace('dec_', ''), 10);
      await this.adjustCartItemQuantity(phone, session, idx, -1);
      return;
    }

    // Delete item
    if (input.startsWith('del_') || input.startsWith('rm_')) {
      const idx = Number.parseInt(input.replace(/^(del_|rm_)/, ''), 10);
      await this.removeCartItemByIndex(phone, session, idx);
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
        await this.sendCartItemManage(phone, session, idx);
        return;
      }
      throw e;
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
    await this.cartService.removeItem(
      session.user.toString(),
      item.product.id,
      item.variantSku,
    );
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
      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText:
          `*Your Cart*\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          `Your cart is empty. Start browsing to add items.`,
        buttons: [{ id: 'continue_shopping', title: 'Browse Products' }],
      });
      await this.transitionToState(session, 'browsing');
      return;
    }

    if (input === 'back') {
      await this.goBack(session, phone);
      return;
    }

    if (input === 'coupon_no') {
      await this.goBack(session, phone);
      return;
    }

    if (input === 'coupon_yes') {
      await this.transitionToState(session, 'coupon_input');
      await this.sendFlowResponse(phone, 'coupon_input', session);
      return;
    }

    await this.sendFlowResponse(phone, 'coupon_prompt', session);
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

    if (transitionKey === 'back') {
      await this.goBack(session, phone);
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
        message: '_Applying coupon..._',
      });
      const updated = await this.cartService.applyCoupon(session.user.toString(), code);
      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `*Coupon Applied* \u2713\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          `Code     *${code}*\n` +
          `Discount  *\u2212${this.formatCurrency(updated.discount)}*\n` +
          `Total      *${this.formatCurrency(updated.total)}*`,
      });
      await this.transitionToState(session, 'checkout');
      await this.sendCheckoutOptions(phone, session);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText:
          `*Invalid Coupon*\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          (msg || 'Please check the code and try again.'),
        buttons: [
          { id: 'try_coupon_again', title: 'Try Again' },
          { id: 'skip_coupon', title: 'Skip' },
        ],
      });
    }
  }

  private async handleCheckout(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    if (input === 'back') {
      await this.goBack(session, phone);
      return;
    }

    if (input === 'new_address') {
      await this.transitionToState(session, 'address_input');
      await this.sendFlowResponse(phone, 'address_input', session);
      return;
    }

    if (input.startsWith('address_')) {
      const addressIndex = Number.parseInt(input.replace('address_', ''), 10);
      if (!Number.isInteger(addressIndex) || addressIndex < 0) {
        await this.sendCheckoutOptions(phone, session);
        return;
      }
      session.context = mergeChatContext(session.context, { selectedAddressIndex: addressIndex });
      await session.save();
      await this.transitionToState(session, 'payment_selection');
      await this.sendFlowResponse(phone, 'payment_selection', session);
      return;
    }

    await this.sendCheckoutOptions(phone, session);
  }

  private async handleAddressInput(
    session: ChatSessionDocument,
    phone: string,
    input: string,
  ): Promise<void> {
    const lines = input.split('\n').filter((l) => l.trim());

    if (lines.length < 4) {
      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `*Invalid Format*\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          `Please send your address as:\n\n` +
          `Name\nStreet Address\nCity, State\nPincode\nLandmark _(optional)_`,
      });
      return;
    }

    if (session.user) {
      const [name, street, cityState, pincode, landmark] = lines;
      const [city, state] = (cityState || '').split(',').map((s) => s.trim());

      await this.usersService.addAddress(session.user.toString(), {
        label: 'Delivery',
        street,
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        landmark,
        isDefault: false,
      });

      session.context = mergeChatContext(session.context, {
        newAddress: { name, street, city: city || '', state: state || '', pincode: pincode || '', landmark },
      });
      await session.save();
    }

    await this.whatsappService.sendTextMessage({
      phone,
      message: '*Address Saved* \u2713',
    });

    // Navigate back depending on where the user came from.
    if (session.previousState === 'account_addresses') {
      await this.transitionToState(session, 'account_addresses');
      await this.sendAddressList(phone, session);
    } else {
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
          `*Online Payment Unavailable*\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          `Tap *Back* to select Cash on Delivery, or try again later.`,
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
          bodyText:
            `*Recent Order Detected*\n` +
            `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
            `You placed an order just moments ago. Would you like to place another?`,
          buttons: [
            { id: 'another_yes', title: 'Yes, Place Order' },
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
      const msg = err instanceof BadRequestException ? err.message : '';
      if (/stock|pincode|empty|deliver/i.test(msg)) {
        await this.whatsappService.sendTextMessage({
          phone,
          message:
            `*Order Failed*\n` +
            `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
            `${msg || 'Please review your cart and address, then try again.'}`,
        });
        await this.transitionToState(session, 'cart');
        await this.sendCartSummary(phone, session);
        return;
      }
      throw err;
    }

    if (paymentMethod === 'cod') {
      const message =
        `*Order Confirmed* \u2713\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Order    *${order.orderNumber}*\n` +
        `Total     *${this.formatCurrency(order.total)}*\n` +
        `Status   *${this.formatOrderStatusForCustomer(order)}*\n\n` +
        `We'll notify you with updates.`;
      await this.whatsappService.sendTextMessage({ phone, message });
    } else {
      let payUrl: string;
      try {
        const payToken = this.paymentsService.signWhatsAppPayToken(
          order._id.toString(),
          session.user.toString(),
        );
        const base = this.resolveFrontendBaseUrl();
        if (base) {
          payUrl = `${base}/pay/${encodeURIComponent(order._id.toString())}?t=${encodeURIComponent(payToken)}`;
        } else {
          payUrl = '';
        }
      } catch (signErr) {
        this.logger.warn('WhatsApp pay token failed', signErr);
        payUrl = '';
      }

      const message =
        `*Order Created* \u2713\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Order    *${order.orderNumber}*\n` +
        `Total     *${this.formatCurrency(order.total)}*\n` +
        `Status   *${this.formatOrderStatusForCustomer(order)}*\n\n` +
        (payUrl
          ? `Complete your payment securely:\n${payUrl}\n\n_Link expires in 48 hours._`
          : `Sign in to our website and pay for order *${order.orderNumber}* from your account.`);

      await this.whatsappService.sendTextMessage({ phone, message });
    }

    await this.transitionToState(session, 'main_menu');
    await this.sendFlowResponse(phone, 'main_menu', session);
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

    if (input.startsWith('order_')) {
      const orderId = input.replace('order_', '');
      const order = await this.ordersService.findById(orderId);
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
          message: '❌ *You do not have access to this order.*',
        });
        await this.sendOrdersList(phone, session);
        return;
      }

      const message = this.buildOrderTrackingMessage(order);

      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText: message,
        buttons: [
          { id: `reorder_${orderId}`, title: 'Reorder' },
          { id: 'back', title: 'Back' },
        ],
      });
      return;
    }

    if (input.startsWith('reorder_')) {
      const orderId = input.replace('reorder_', '');
      const order = await this.ordersService.findById(orderId);
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
        if (/stock|insufficient/i.test(msg)) {
          await this.whatsappService.sendTextMessage({
            phone,
            message:
              `*Reorder Unavailable*\n` +
              `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
              `Some items are currently out of stock.\n\nType *menu* to continue browsing.`,
          });
          await this.transitionToState(session, 'main_menu');
          await this.sendFlowResponse(phone, 'main_menu', session);
          return;
        }
        throw e;
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
          message: 'That doesn\'t look like a valid email. Please try again.',
        });
        return;
      }

      await this.usersService.update(session.user.toString(), { [editingField]: value });
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
    const pageSize = 9; // leave 1 slot for "View more"
    let start = page * pageSize;

    // Reset to first page if current page is beyond available data.
    if (start >= categories.length && categories.length > 0) {
      page = 0;
      start = 0;
      await this.setListPage(session, 'categoryPage', 0);
    }

    const slice = categories.slice(start, start + pageSize);
    const hasMore = start + pageSize < categories.length;

    const rows = slice.map((cat) => ({
      id: `cat_${cat._id.toString()}`,
      title: cat.name,
      description: cat.description?.slice(0, 72),
    }));

    if (hasMore) {
      rows.push({
        id: 'more_categories',
        title: 'View More',
        description: `Showing ${start + 1}\u2013${start + slice.length} of ${categories.length}`,
      });
    }

    const sections = [{
      title: 'Categories',
      rows,
    }];

    await this.whatsappService.sendInteractiveList({
      phone,
      bodyText:
        `*Browse Products*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Select a category to explore.` +
        (page > 0 ? `\n\n_Page ${page + 1}_` : ''),
      buttonText: 'View Categories',
      sections,
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
      products = await this.productsService.findByCategory(categoryId);
      productCacheEntry.set(products);
    }

    if (products.length === 0) {
      await this.whatsappService.sendTextMessage({
        phone,
        message: 'No products in this category.',
      });
      return;
    }

    let page = this.getListPage(session, 'productPage');
    const pageSize = 9;
    let start = page * pageSize;

    // Reset to first page if current page is beyond available data.
    if (start >= products.length && products.length > 0) {
      page = 0;
      start = 0;
      await this.setListPage(session, 'productPage', 0);
    }

    const slice = products.slice(start, start + pageSize);
    const hasMore = start + pageSize < products.length;

    const rows = slice.map((prod) => ({
      id: `prod_${prod._id.toString()}`,
      title: prod.name.slice(0, 24),
      description: `${this.formatCurrency(prod.price)}`.slice(0, 72),
    }));

    if (hasMore) {
      rows.push({
        id: 'more_products',
        title: 'View More',
        description: `Showing ${start + 1}\u2013${start + slice.length} of ${products.length}`,
      });
    }

    const sections = [{
      title: 'Products',
      rows,
    }];

    await this.whatsappService.sendInteractiveList({
      phone,
      bodyText:
        `*Products*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Select a product to view details.` +
        (page > 0 ? `\n\n_Page ${page + 1}_` : ''),
      buttonText: 'View Products',
      sections,
    });
  }

  private async sendProductDetail(
    phone: string,
    productId: string,
    session: ChatSessionDocument,
  ): Promise<void> {
    const product = await this.productsService.findById(productId);

    const inStock = product.trackStock !== true || (product.stock ?? 0) > 0;
    const stockBadge = product.trackStock === true
      ? inStock
        ? '\uD83D\uDFE2 In Stock'
        : '\uD83D\uDD34 Out of Stock'
      : '\uD83D\uDFE2 Available';

    const priceDisplay = product.compareAtPrice
      ? `~${this.formatCurrency(product.compareAtPrice)}~  *${this.formatCurrency(product.price)}*`
      : `*${this.formatCurrency(product.price)}*`;

    const savings = product.compareAtPrice && product.compareAtPrice > product.price
      ? `\n\uD83C\uDFF7\uFE0F  Save ${this.formatCurrency(product.compareAtPrice - product.price)}`
      : '';

    const caption =
      `\u2728  *${product.name}*\n` +
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
      `\uD83D\uDCB0  ${priceDisplay}${savings}\n` +
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

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText:
        product.images[0]
          ? `*${product.name}*  \u00B7  ${this.formatCurrency(product.price)}  \u00B7  ${stockBadge}`
          : caption,
      buttons: [
        { id: 'add_cart', title: 'Add to Cart' },
        { id: 'buy_now', title: 'Buy Now' },
        { id: 'back', title: 'Back' },
      ],
    });
  }

  private async sendCartSummary(phone: string, session: ChatSessionDocument): Promise<void> {
    if (!session.user) {
      await this.whatsappService.sendTextMessage({
        phone,
        message:
          `\uD83D\uDED2  *Your Cart*\n\n` +
          `Your cart is empty. Start browsing to add items.`,
      });
      return;
    }

    const cart = await this.cartService.getCart(session.user.toString());

    if (cart.items.length === 0) {
      await this.whatsappService.sendInteractiveButtons({
        phone,
        bodyText:
          `\uD83D\uDED2  *Your Cart*\n\n` +
          `Your cart is empty.\n` +
          `Tap below to browse our products and fill it up.`,
        buttons: [{ id: 'continue_shopping', title: 'Browse Products' }],
      });
      return;
    }

    const itemList = cart.items
      .map((item, idx) =>
        `*${idx + 1}.*  ${item.product.name}\n` +
        `     \u2003Qty *\u00D7${item.quantity}*  \u00B7  ${this.formatCurrency(item.total)}`,
      )
      .join('\n\n');

    const footerLines: string[] = [];
    footerLines.push(`Subtotal\u2003${this.formatCurrency(cart.subtotal)}`);
    if (cart.discount > 0) {
      footerLines.push(
        `Discount\u2003\u2212${this.formatCurrency(cart.discount)}` +
          (cart.couponCode ? `  \uD83C\uDFF7\uFE0F ${cart.couponCode}` : ''),
      );
    }
    footerLines.push(`*Total\u2003\u2003${this.formatCurrency(cart.total)}*`);

    const message =
      `\uD83D\uDED2  *Your Cart* \u00B7 ${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}\n` +
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
      `${itemList}\n\n` +
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n` +
      `${footerLines.join('\n')}\n\n` +
      `_Tip: type *+1 ghee* or *remove ghee* to edit quickly._`;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: message,
      buttons: [
        { id: 'checkout', title: 'Checkout' },
        { id: 'manage', title: 'Manage Items' },
        { id: 'continue_shopping', title: 'Keep Shopping' },
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
      id: `mi_${idx}`,
      title: item.product.name.slice(0, 24),
      description: `Qty ${item.quantity}  \u00B7  ${this.formatCurrency(item.total)}`,
    }));

    const rows = [
      ...itemRows,
      { id: 'clear', title: 'Clear Entire Cart', description: 'Remove all items at once' },
      { id: 'back', title: 'Back to Cart', description: 'Return to cart summary' },
    ];

    await this.whatsappService.sendInteractiveList({
      phone,
      bodyText:
        `\uD83D\uDEE0\uFE0F  *Manage Cart*\n\n` +
        `Pick an item to change quantity or remove it.`,
      buttonText: 'Choose Item',
      sections: [{ title: 'Cart Items', rows }],
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
    const body =
      `\uD83D\uDCE6  *${item.product.name}*\n` +
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
      `Unit price\u2003${this.formatCurrency(unitPrice)}\n` +
      `Quantity\u2003\u2003*\u00D7${item.quantity}*\n` +
      `Line total\u2003*${this.formatCurrency(item.total)}*\n\n` +
      `Tap to adjust, or type *set ${item.product.name.split(' ')[0].toLowerCase()} 3* to set a specific quantity.`;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText: body,
      buttons: [
        { id: `dec_${idx}`, title: '\u2212 Decrease' },
        { id: `inc_${idx}`, title: '+ Increase' },
        { id: `del_${idx}`, title: 'Remove' },
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

    // WhatsApp allows max 3 buttons. Prioritise: up to 2 saved addresses + new/back.
    // If user has addresses: show 1 address + New Address + Back (3 total).
    // If no addresses: show New Address + Back (2 total).
    const buttons: Array<{ id: string; title: string }> = [];

    if (user.addresses.length > 0) {
      // Show only first saved address to leave room for New Address + Back.
      const addr = user.addresses[0];
      buttons.push({
        id: 'address_0',
        title: (addr.label || 'Address 1').slice(0, 20),
      });
    }

    buttons.push({ id: 'new_address', title: 'New Address' });
    buttons.push({ id: 'back', title: 'Back' });

    const bodyText = user.addresses.length > 1
      ? `*Delivery Address*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `_${user.addresses.length} saved addresses \u2014 showing your default._`
      : `*Delivery Address*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Select an address or add a new one.`;

    await this.whatsappService.sendInteractiveButtons({
      phone,
      bodyText,
      buttons,
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
        bodyText:
          `*My Orders*\n` +
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
          `No orders yet. Start shopping to place your first order.`,
        buttons: [
          { id: 'back', title: 'Main Menu' },
          { id: 'browse', title: 'Start Shopping' },
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
      id: `order_${order._id.toString()}`,
      title: order.orderNumber,
      description: `${this.formatOrderStatusForCustomer(order)}  \u00B7  \u20B9${order.total}`.slice(0, 72),
    }));

    if (hasMore) {
      rows.push({
        id: 'more_orders',
        title: 'View More',
        description: `Showing ${start + 1}\u2013${start + slice.length} of ${allOrders.length}`,
      });
    }

    await this.whatsappService.sendInteractiveList({
      phone,
      bodyText:
        `*My Orders*${page > 0 ? `  \u00B7  Page ${page + 1}` : ''}\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Select an order for details.`,
      buttonText: 'View Orders',
      sections: [{ title: 'Recent Orders', rows }],
    });
  }

  private async sendFlowResponse(
    phone: string,
    state: SessionState,
    session: ChatSessionDocument,
  ): Promise<void> {
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
            bodyText: action.content,
            buttons: action.buttons,
          });
        }
        break;

      case 'list':
        if (action.sections) {
          await this.whatsappService.sendInteractiveList({
            phone,
            bodyText: action.content,
            buttonText: 'Select',
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
        return key === 'coupon_yes' || key === 'coupon_no' || key === 'back';
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
