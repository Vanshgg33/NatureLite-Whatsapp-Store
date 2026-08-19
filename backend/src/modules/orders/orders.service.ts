import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectConnection } from '@nestjs/mongoose';
import { Types, Connection } from 'mongoose';
import * as crypto from 'crypto';
import { Order, OrderDocument, OrderItem, OrderStatus, PaymentStatus, PaymentMethod } from './schemas/order.schema';
import { OrderRepository } from './repositories/order.repository';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { CouponsService } from '../coupons/coupons.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { StoresService } from '../stores/stores.service';
import { StoreStockService } from '../store-stock/store-stock.service';
import { StoreSalesService } from '../store-sales/store-sales.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UcmService } from '../ucm/ucm.service';
import { AdminService } from '../admin/admin.service';
import { MediaService } from '../media/media.service';
import { UpdateUserDto } from '../users/dto/user.dto';
import { RedisService } from '../redis/redis.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  UpdatePaymentStatusDto,
  CancelOrderDto,
  AddOrderNoteDto,
  UpdateShippingDto,
  OrderQueryDto,
  ReorderDto,
  UpdateDeliveryWorkflowDto,
  GuestCreateOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import type { DeliveryWorkflowMetadata, DeliveryWorkflowStep, OrderMetadata, TimelineMetadata } from '../../common/types/order-types';
import { PaginatedResult } from '../../common/types/pagination.types';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);
  // BUG 9 fix: increased to 10 retries + jitter to reduce collision probability under concurrency
  private static readonly MAX_ORDER_NUMBER_RETRIES = 10;

  private getDuplicateKeyPattern(err: Error): Record<string, number> | null {
    const withPattern = err as Error & { keyPattern?: Record<string, number> };
    if (!withPattern.keyPattern) return null;
    return withPattern.keyPattern;
  }

  private computeRequestHash(input: {
    userId: string;
    dto: CreateOrderDto;
    items: Array<Pick<OrderItem, 'product' | 'variantSku' | 'quantity' | 'price'>>;
    subtotal: number;
    discount: number;
    gstTotal: number;
    shippingCharge: number;
    total: number;
    walletUsedPaise: number;
    paymentGatewayAmountPaise: number;
  }): string {
    const stable = {
      userId: input.userId,
      cartId: input.dto.cartId ?? null,
      paymentMethod: input.dto.paymentMethod,
      couponCode: input.dto.couponCode ?? null,
      walletAmount: input.dto.walletAmount ?? null,
      shippingAddress: input.dto.shippingAddress,
      items: input.items.map((i) => ({
        productId: i.product.toString(),
        variantSku: i.variantSku ?? null,
        quantity: i.quantity,
        price: i.price,
      })),
      totals: {
        subtotal: input.subtotal,
        discount: input.discount,
        gstTotal: input.gstTotal,
        shippingCharge: input.shippingCharge,
        total: input.total,
        walletUsedPaise: input.walletUsedPaise,
        paymentGatewayAmountPaise: input.paymentGatewayAmountPaise,
      },
    };

    const json = JSON.stringify(stable);
    return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
  }

  constructor(
    private readonly orderRepository: OrderRepository,
    @InjectConnection() private connection: Connection,
    private cartService: CartService,
    private productsService: ProductsService,
    private usersService: UsersService,
    private couponsService: CouponsService,
    private emailService: EmailService,
    private settingsService: SettingsService,
    private storesService: StoresService,
    private storeStockService: StoreStockService,
    private storeSalesService: StoreSalesService,
    private walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly ucmService: UcmService,
    private readonly adminService: AdminService,
    private readonly mediaService: MediaService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const n = await this.orderRepository.migrateLegacyOrderStatuses();
      if (n > 0) {
        this.logger.log(`Migrated ${n} order document(s) to canonical status values`);
      }
      const t = await this.orderRepository.migrateTimelineEntryStatuses();
      if (t > 0) {
        this.logger.log(`Normalized timeline.status on ${t} order document(s)`);
      }
    } catch (err) {
      this.logger.error('Order status / timeline migration failed', err);
    }
  }

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    const userObjId = parseObjectId(userId, 'userId');
    let requestHashForIdem = '';

    const hasCart = Boolean(dto.cartId?.trim());
    const hasItems = Boolean(dto.items && dto.items.length > 0);
    if (hasCart && hasItems) {
      throw new BadRequestException('Provide either cartId or line items, not both');
    }
    if (!hasCart && !hasItems) {
      throw new BadRequestException('Either cartId or at least one line item is required');
    }

    const idem = dto.idempotencyKey?.trim();
    // Idempotency is enforced later with requestHash comparison (prevents payload-mismatch corruption).

    // Use transaction for atomic order creation
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      let orderItems: OrderItem[] = [];
      let subtotal = 0;
      // Which products opt out of inventory tracking. Used below to skip the
      // per-store stock decrement — otherwise a product with trackStock=false
      // would incorrectly fail order creation with "Insufficient store stock
      // for this product" when no StoreStock row exists for it.
      const tracksStockByProductId = new Map<string, boolean>();

      // Track product + category IDs for downstream coupon validation
      // (allowedProducts / allowedCategories restrictions).
      const orderProductIds: string[] = [];
      const orderCategoryIds: string[] = [];
      const collectCategoryId = (rawCategory: unknown): void => {
        if (!rawCategory) return;
        if (typeof rawCategory === 'object' && rawCategory !== null && '_id' in rawCategory) {
          orderCategoryIds.push(String((rawCategory as { _id: unknown })._id));
        } else {
          orderCategoryIds.push(String(rawCategory));
        }
      };

      if (dto.cartId) {
        // cartId integrity: verify referenced cart belongs to user
        const cart = await this.cartService.getCartById(userId, dto.cartId);

        if (cart.items.length === 0) {
          throw new BadRequestException('Cart is empty');
        }

        const productIds = cart.items.map((item) => item.product.toString());
        const products = await Promise.all(productIds.map((id) => this.productsService.findById(id)));
        const productMap = new Map(products.map((p) => [p._id.toString(), p]));

        for (const item of cart.items) {
          const productId = item.product.toString();
          const product = productMap.get(productId)!;
          if (!product.isActive) {
            throw new BadRequestException(
              `"${product.name}" is no longer available. Please remove it from your cart and try again.`,
            );
          }
          tracksStockByProductId.set(productId, product.trackStock !== false);
          orderProductIds.push(productId);
          collectCategoryId(product.category);

          // Recompute price from the live product/variant rather than trusting
          // cart.items[].price, which can be stale (price was captured when the
          // item was added; admin edits or UCM pulls in between would
          // silently leave the order at the old price). If the live price is
          // missing/zero we fall back to the cart-captured price (last-known
          // good) rather than billing zero.
          let livePrice = product.price;
          if (item.variantSku) {
            const variant = product.variants.find((v) => v.sku === item.variantSku);
            if (variant && Number.isFinite(variant.price) && variant.price > 0) {
              livePrice = variant.price;
            }
          }
          const resolvedPrice =
            Number.isFinite(livePrice) && livePrice > 0 ? livePrice : item.price;
          if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
            throw new BadRequestException(
              `Price unavailable for ${product.name}. Please remove this item or contact support.`,
            );
          }

          const orderItem: OrderItem = {
            product: new Types.ObjectId(productId),
            name: product.name,
            variantSku: item.variantSku,
            quantity: item.quantity,
            price: resolvedPrice,
            total: resolvedPrice * item.quantity,
            image: product.images?.[0],
            gstAmount: (resolvedPrice * item.quantity * ((product.category as any)?.gstPercentage ?? 0)) / 100,
          };

          orderItems.push(orderItem);
          subtotal += orderItem.total;
        }
      } else if (dto.items && dto.items.length > 0) {
        const products = await Promise.all(
          dto.items.map((item) =>
            this.productsService.findById(item.productId).catch((err) => {
              if (err instanceof NotFoundException) {
                throw new BadRequestException(
                  'One or more items in your cart are no longer available. Please refresh the page and try again.',
                );
              }
              throw err;
            }),
          ),
        );
        const productMap = new Map(products.map((p) => [p._id.toString(), p]));

        for (const item of dto.items) {
          const productIdObj = parseObjectId(item.productId, 'items[].productId');
          const product = productMap.get(item.productId)!;
          if (!product.isActive) {
            throw new BadRequestException(
              `"${product.name}" is no longer available. Please refresh and try again.`,
            );
          }
          tracksStockByProductId.set(item.productId, product.trackStock !== false);
          orderProductIds.push(item.productId);
          collectCategoryId(product.category);
          let price = product.price;

          const matchedVariant = item.variantSku
            ? product.variants.find((v) => v.sku === item.variantSku)
            : undefined;
          if (matchedVariant && Number.isFinite(matchedVariant.price) && matchedVariant.price > 0) {
            price = matchedVariant.price;
          }

          const orderItem: OrderItem = {
            product: productIdObj,
            name: product.name,
            variantSku: item.variantSku,
            variantName: matchedVariant?.name,
            quantity: item.quantity,
            price,
            total: price * item.quantity,
            image: product.images?.[0],
            gstAmount: (price * item.quantity * ((product.category as any)?.gstPercentage ?? 0)) / 100,
          };

          orderItems.push(orderItem);
          subtotal += orderItem.total;
        }
      } else {
        throw new BadRequestException('Either cartId or items must be provided');
      }

      // Basic serviceability check by pincode (Raipur, Bhilai, Durg, Bilaspur areas)
      // Skipped for admin-created orders so staff can place orders for any location.
      const pincode = dto.shippingAddress?.pincode;
      const SERVICEABLE_PINCODE_PREFIXES = ['492', '490', '491', '495']; // Raipur, Bhilai, Durg, Bilaspur
      if (
        dto.source !== 'admin' &&
        (!pincode || !SERVICEABLE_PINCODE_PREFIXES.some((prefix) => pincode.startsWith(prefix)))
      ) {
        throw new BadRequestException('We currently do not deliver to this pincode.');
      }

      let discount = 0;
      let appliedCouponCode: string | undefined;

      // Admin-supplied flat discount (used when no coupon code is provided)
      if (!dto.couponCode && dto.adminDiscount != null && dto.adminDiscount > 0) {
        discount = Math.min(dto.adminDiscount, subtotal);
      }

      if (dto.couponCode) {
        // Precompute per-user counts so the coupon service can enforce
        // `maxUsagePerUser` and `isFirstOrderOnly` without itself depending on
        // the orders module (avoids circular imports).
        const [userOrderCount, userCouponUsageCount] = await Promise.all([
          this.orderRepository.countNonCancelledOrdersByUser(userId),
          this.orderRepository.countCouponUsesByUser(userId, dto.couponCode),
        ]);

        const validation = await this.couponsService.validateCoupon({
          code: dto.couponCode,
          orderAmount: subtotal,
          userId,
          productIds: orderProductIds,
          categoryIds: orderCategoryIds,
          userOrderCount,
          userCouponUsageCount,
        });

        if (validation.valid) {
          discount = validation.discountAmount;
          appliedCouponCode = dto.couponCode.toUpperCase();
        } else {
          // Bug fix: previously this silently dropped the discount and let the
          // order go through at full price. Customers expecting a discount got
          // billed full and had no idea why. Surface the real reason instead.
          throw new BadRequestException(`Coupon could not be applied: ${validation.message}`);
        }
      }

      // Get shipping settings instead of hard-coded values
      let freeShippingThreshold = 300;
      let defaultShippingCharge = 50;
      try {
        const storeSettings = await this.settingsService.get('store');
        if (storeSettings?.value && typeof storeSettings.value === 'object') {
          const v = storeSettings.value as {
            freeShippingThreshold?: number;
            defaultShippingCharge?: number;
          };
          freeShippingThreshold = v.freeShippingThreshold ?? 300;
          defaultShippingCharge = v.defaultShippingCharge ?? 50;
        }
      } catch {
        // Use defaults if settings unavailable
      }

      const gstTotal = orderItems.reduce((sum, item) => sum + item.gstAmount, 0);
      const shippingCharge = subtotal >= freeShippingThreshold ? 0 : defaultShippingCharge;

      // GST is included in product prices (MRP pricing) — gstTotal is informational only
      const totalBeforeWallet = subtotal - discount + shippingCharge;

      // Handle wallet usage (amount provided in rupees) — only with prepaid payments
      let walletUsedPaise = 0;
      let paymentGatewayAmountPaise = Math.round(totalBeforeWallet * 100);

      if (dto.walletAmount && dto.walletAmount > 0) {
        if (dto.paymentMethod !== 'prepaid') {
          throw new BadRequestException(
            'Wallet amount can only be used with prepaid payment method',
          );
        }

        const requestedPaise = Math.round(dto.walletAmount * 100);
        const walletBalancePaise = await this.walletService.getBalance(userId);
        walletUsedPaise = Math.min(requestedPaise, walletBalancePaise, paymentGatewayAmountPaise);

        if (walletUsedPaise > 0) {
          await this.walletService.debit(
            userId,
            walletUsedPaise,
            'order_payment',
            { tentativeTotal: totalBeforeWallet },
            session,
          );
          paymentGatewayAmountPaise -= walletUsedPaise;
        }
      }

      const total = totalBeforeWallet;

      const requestHash =
        idem
          ? this.computeRequestHash({
              userId,
              dto,
              items: orderItems.map((i) => ({
                product: i.product,
                variantSku: i.variantSku,
                quantity: i.quantity,
                price: i.price,
              })),
              subtotal,
              discount,
              gstTotal,
              shippingCharge,
              total,
              walletUsedPaise,
              paymentGatewayAmountPaise,
            })
          : '';
      requestHashForIdem = requestHash;

      if (idem) {
        const existing = await this.orderRepository.findByUserIdAndIdempotencyKey(userObjId, idem);
        if (existing) {
          const existingHash = existing.metadata?.requestHash;
          if (existingHash && existingHash !== requestHash) {
            throw new ConflictException('Idempotency key already used with a different request payload');
          }
          return existing;
        }
      }

      const baseOrderData: Omit<Partial<Order>, 'orderNumber'> = {
        user: userObjId,
        items: orderItems,
        shippingAddress: dto.shippingAddress,
        source: dto.source || 'website',
        orderType: (dto as any).orderType,
        paymentMethod: dto.paymentMethod,
        subtotal,
        discount,
        couponCode: appliedCouponCode,
        shippingCharge,
        gstTotal,
        walletUsed: walletUsedPaise,
        paymentGatewayAmount: paymentGatewayAmountPaise,
        total,
        notes: dto.notes,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
        metadata: idem ? { idempotencyKey: idem, requestHash } : undefined,
        timeline: [
          {
            status: 'placed',
            message: 'Order placed successfully',
            timestamp: new Date(),
          },
        ],
      };

      let savedOrder: OrderDocument | null = null;
      for (let attempt = 0; attempt < OrdersService.MAX_ORDER_NUMBER_RETRIES; attempt += 1) {
        const orderNumber = await this.generateOrderNumber();
        try {
          savedOrder = await this.orderRepository.createWithSession(
            { ...baseOrderData, orderNumber },
            session,
          );
          break;
        } catch (err) {
          if (!(err instanceof Error) || (err as { code?: number }).code !== 11000) {
            throw err;
          }
          const keyPattern = this.getDuplicateKeyPattern(err);
          // Only retry when the collision is due to orderNumber uniqueness.
          if (!keyPattern || keyPattern.orderNumber !== 1) {
            throw err;
          }
          // BUG 9 fix: jitter delay between retries to reduce thundering-herd collisions
          if (attempt < OrdersService.MAX_ORDER_NUMBER_RETRIES - 1) {
            await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 50) + 10));
          }
        }
      }

      if (!savedOrder) {
        throw new BadRequestException('Failed to generate a unique order number. Please try again.');
      }

      // Decrement stock from main store (Raipur).
      //   - Products with trackStock=false opt out of inventory entirely — skip.
      //   - Products with no StoreStock row yet (admin hasn't set store-level
      //     inventory) also skip the decrement: blocking a customer order for
      //     a data-setup gap that only the admin can fix would be incorrect.
      //     Admins can still see low/zero stock in the Store Stock dashboard.
      //   - Products with a StoreStock row get the normal guarded decrement.
      let mainStore: Awaited<ReturnType<typeof this.storesService.findMainStore>> | null = null;
      try {
        mainStore = await this.storesService.findMainStore();
      } catch {
        // Main store not configured — skip stock decrement, order still goes through
      }
      const mainStoreId = mainStore?._id.toString();

      await Promise.all(
        orderItems.map(async (item) => {
          const productId = item.product.toString();
          if (!mainStoreId) return;
          if (tracksStockByProductId.get(productId) === false) return;
          // BUG 5 fix note: getStockForStoreProduct is called inside the open transaction but without
          // the session, so it is not a snapshot read. TODO: extend StoreStockService.getStockForStoreProduct
          // to accept an optional ClientSession parameter so this existence check is part of the
          // transaction snapshot and cannot race with a concurrent delete of the StoreStock row.
          // The actual oversell guard is in decrementStock (atomic conditional $inc), which already
          // uses the session and will throw if stock < quantity.
          const existingStoreStock = await this.storeStockService.getStockForStoreProduct(
            mainStoreId,
            productId,
          );
          if (!existingStoreStock) {
            this.logger.warn(
              `No StoreStock row for product ${productId} in store ${mainStoreId} — skipping decrement`,
            );
            return;
          }
          await this.storeStockService.decrementStock(
            mainStoreId,
            productId,
            item.quantity,
            item.variantSku,
            session,
          );
        }),
      );

      // Atomically reserve the coupon usage slot inside the transaction so
      // concurrent orders cannot both pass the `maxUsageCount` check, both
      // commit, and only one's increment land. If the conditional update
      // modifies 0 rows the cap was just hit by another order; aborting the
      // transaction rolls back this order entirely.
      if (appliedCouponCode) {
        await this.couponsService.incrementUsageCount(appliedCouponCode, session);
      }

      await session.commitTransaction();
      try {
        await Promise.all(
          orderItems.map((item) =>
            this.productsService.incrementTotalSold(item.product.toString(), item.quantity),
          ),
        );
      } catch (soldErr) {
        this.logger.warn(
          `Post-commit totalSold update failed for order ${savedOrder.orderNumber}`,
          soldErr,
        );
      }

      // Push fresh availability/inventory to Meta catalog so out-of-stock
      // products stop being selectable on the storefront. Fire-and-forget —
      // failure here must not block the order response.
      const productIdsToSync = Array.from(
        new Set(
          orderItems
            .filter((i) => tracksStockByProductId.get(i.product.toString()) !== false)
            .map((i) => i.product.toString()),
        ),
      );
      void Promise.all(
        productIdsToSync.map((pid) =>
          this.ucmService.syncProductById(pid, 'order_committed').catch((err) => {
            this.logger.warn(
              `UCM sync failed for product ${pid} after order ${savedOrder.orderNumber}: ${err instanceof Error ? err.message : 'unknown'}`,
            );
          }),
        ),
      );

      try {
        await this.cartService.clearCart(userId);
      } catch (clearErr) {
        this.logger.error(
          `Order ${savedOrder.orderNumber} committed but cart clear failed for user ${userId}`,
          clearErr,
        );
      }

      try {
        await this.usersService.updateOrderStats(userId, total);
      } catch (statsErr) {
        this.logger.warn(`Failed to update order stats for user ${userId}`, statsErr);
      }

      // Auto-log as website sale for the main store (non-blocking)
      try {
        await this.storeSalesService.createFromOrder(savedOrder.toObject(), mainStoreId);
      } catch (saleError) {
        this.logger.warn(`Failed to auto-log website sale: ${saleError.message}`);
      }

      // BUG 8 fix: sendOrderConfirmation must be awaited so async errors are caught; order
      // creation still succeeds even if email delivery fails.
      try {
        const user = await this.usersService.findById(userId);
        if (user?.email) {
          try {
            await this.emailService.sendOrderConfirmation(savedOrder.toObject(), user.email);
          } catch (emailErr) {
            this.logger.error('Order confirmation email failed', emailErr);
          }
        }
      } catch (emailError) {
        this.logger.warn(`Failed to send order confirmation email: ${emailError.message}`);
      }

      // Send WhatsApp order created notification (non-blocking)
      try {
        await this.notificationsService.notifyOrderCreated(savedOrder);
      } catch (waErr) {
        this.logger.warn(
          `Failed to send WhatsApp order created notification for ${savedOrder.orderNumber}`,
          waErr,
        );
      }

      this.logger.log(`event_order_placed order=${savedOrder._id.toString()} user=${userId}`);
      this.clearChatbotCache();

      return savedOrder;
    } catch (error) {
      await session.abortTransaction();

      // Concurrency-safe idempotency: return the existing order if this is a duplicate insert.
      const isDupKey = error instanceof Error && (error as { code?: number }).code === 11000;
      if (isDupKey && idem && error instanceof Error) {
        const keyPattern = this.getDuplicateKeyPattern(error);
        const isIdempotencyKeyCollision = Boolean(
          keyPattern && keyPattern['metadata.idempotencyKey'] === 1,
        );
        if (!isIdempotencyKeyCollision) {
          throw error;
        }
        const existing = await this.orderRepository.findByUserIdAndIdempotencyKey(userObjId, idem);
        if (existing) {
          const existingHash = existing.metadata?.requestHash;
          const mismatch = Boolean(existingHash && existingHash !== requestHashForIdem);
          if (mismatch) {
            throw new ConflictException('Idempotency key already used with a different request payload');
          }
          return existing;
        }
      }

      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAll(query: OrderQueryDto): Promise<PaginatedResult<Order>> {
    return this.orderRepository.findAllPaginated(query);
  }

  async findById(id: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findByIdWithUserAndItems(idObj);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order> {
    const order = await this.orderRepository.findOneByOrderNumber(orderNumber);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async findUserOrders(userId: string, limit: number = 10, phone?: string): Promise<Order[]> {
    const userObjId = parseObjectId(userId, 'userId');
    const userIds: Types.ObjectId[] = [userObjId];

    // Resolve phone-format splits: a customer may have two user records if they
    // first logged in via OTP (creating a raw 10-digit record) and later placed
    // a guest/chatbot order that created a 91XXXXXXXXXX record (or vice-versa).
    // Include orders from both user IDs so the customer sees all their orders.
    if (phone) {
      const digits = phone.replace(/[^\d]/g, '');
      const altPhone = digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)       // 91XXXXXXXXXX → XXXXXXXXXX
        : digits.length === 10
          ? `91${digits}`       // XXXXXXXXXX → 91XXXXXXXXXX
          : null;
      if (altPhone) {
        const altUser = await this.usersService.findByPhone(altPhone);
        if (altUser && altUser._id.toString() !== userId) {
          userIds.push(altUser._id as unknown as Types.ObjectId);
        }
      }
    }

    if (userIds.length === 1) {
      return this.orderRepository.findUserOrders(userObjId, limit);
    }
    return this.orderRepository.findUserOrdersByIds(userIds, limit);
  }

  async findUserOrdersExcludingCancelled(userId: string, limit: number = 10): Promise<Order[]> {
    const userObjId = parseObjectId(userId, 'userId');
    return this.orderRepository.findUserOrdersExcludingCancelled(userObjId, limit);
  }

  async createGuestOrder(dto: GuestCreateOrderDto, allowAdminDiscount = false): Promise<Order> {
    // Same phone = same user: find or create by phone (guest identity is tied to phone)
    const user = await this.usersService.findOrCreateByPhone(dto.phone);

    // Optionally update basic profile info for this user
    const updates: UpdateUserDto = {};
    if (dto.name && !user.name) updates.name = dto.name;
    if (dto.email && !user.email) updates.email = dto.email;
    if (Object.keys(updates).length > 0) {
      await this.usersService.update(user._id.toString(), updates);
    }

    // Reuse existing create logic so pricing, coupons, and stock handling stay consistent.
    // adminDiscount is only forwarded when allowAdminDiscount=true (authenticated admin callers).
    // The public guest endpoint passes false to prevent unauthenticated discount self-grants.
    const createDto: CreateOrderDto = {
      items: dto.items,
      shippingAddress: dto.shippingAddress,
      paymentMethod: dto.paymentMethod,
      couponCode: dto.couponCode,
      notes: dto.notes,
      walletAmount: dto.walletAmount,
      idempotencyKey: dto.idempotencyKey,
      source: dto.source,
      orderType: dto.orderType,
      adminDiscount: allowAdminDiscount ? dto.adminDiscount : undefined,
      scheduledFor: dto.scheduledFor,
    };

    return this.create(user._id.toString(), createDto);
  }

  /** Single place timeline rows are appended on the order document (avoids drift vs status). */
  private pushTimelineEntry(
    order: OrderDocument,
    entry: {
      status: OrderStatus;
      message: string;
      updatedBy?: string;
      metadata?: TimelineMetadata;
    },
  ): void {
    order.timeline.push({
      status: entry.status,
      message: entry.message,
      timestamp: new Date(),
      updatedBy: entry.updatedBy,
      metadata: entry.metadata,
    });
  }

  /** Fulfilment: out_for_delivery always requires packing (all callers: admin API, billing, scripts). */
  private assertPackedBeforeOutForDelivery(
    order: OrderDocument,
    nextStatus: OrderStatus,
    actorId?: string,
  ): void {
    if (nextStatus === 'out_for_delivery' && !order.packedAt) {
      this.logger.warn('blocked_transition_requires_packed', {
        orderId: order._id?.toString?.() ?? '',
        fromStatus: order.status,
        toStatus: nextStatus,
        actorId: actorId ?? '',
      });
      throw new BadRequestException(
        'Order must be packed before marking out for delivery.',
      );
    }
  }

  /**
   * Razorpay / webhooks: apply paid + prepaid + one timeline note (do not $push timeline from PaymentsService).
   *
   * Atomic: webhook + client-verify can race. Whichever call flips paymentStatus
   * from anything-but-paid to paid is the unique "winner" and is the only one
   * that sends the WhatsApp confirmation. The losing call sees a null result and
   * returns silently.
   */
  async recordRazorpayPaymentApplied(orderId: string, message: string): Promise<void> {
    const idObj = parseObjectId(orderId, 'orderId');
    const saved = await this.orderRepository.claimRazorpayPaymentApplied(idObj, message);
    if (!saved) {
      // Either the order doesn't exist, or another concurrent caller already
      // marked it paid. Either way: nothing more to do (no double-notify).
      return;
    }

    // Notify the customer on WhatsApp. Without this, a paid prepaid order
    // sits in the chat with no confirmation — especially bad when the bank
    // redirect drops the customer before they see the success page. Wrapped
    // in try/catch because notification failure must never roll back a
    // captured payment.
    try {
      const phone = saved.shippingAddress?.phone?.trim();
      if (phone) {
        await this.notificationsService.sendPaymentReceived(saved.toObject() as Order, phone);
      } else {
        this.logger.warn(
          `Payment confirmation skipped for ${orderId}: no phone on shippingAddress`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send payment confirmation for ${orderId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
    this.clearChatbotCache();
  }

  /**
   * BUG 7 fix: replaced read-check-mutate-save with a single atomic findOneAndUpdate filtered
   * on paymentStatus != 'refunded'. If the document was already marked refunded by a prior
   * webhook delivery, findOneAndUpdate returns null and we return early — preventing double
   * wallet credit and duplicate timeline entries.
   */
  async recordRefundOnOrder(orderId: string, refundAmount: number): Promise<void> {
    const idObj = parseObjectId(orderId, 'orderId');
    const updated = await this.orderRepository.getModel().findOneAndUpdate(
      { _id: idObj, paymentStatus: { $ne: 'refunded' } },
      {
        $set: { paymentStatus: 'refunded', status: 'refunded' },
        $push: {
          timeline: {
            status: 'refunded',
            message: `Refund of ₹${refundAmount} initiated`,
            timestamp: new Date(),
          },
        },
      },
      { new: true },
    ).exec();

    if (!updated) {
      // Order not found or already marked refunded — idempotent, nothing to do
      return;
    }
    this.clearChatbotCache();
  }

  private static readonly VALID_TRANSITIONS: Record<string, string[]> = {
    placed: ['confirmed', 'cancelled', 'out_for_delivery'],
    confirmed: ['preparing', 'cancelled', 'out_for_delivery'],
    preparing: ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['delivered', 'returned'],
    delivered: ['returned', 'refunded'],
    cancelled: [],
    returned: ['refunded'],
    refunded: [],
  };

  /**
   * Fulfilment status changes: `order.status` and the matching timeline row are updated together here only
   * (see `pushTimelineEntry`). Use this path for admin API and department billing transitions.
   *
   * BUG 13 fix: replaced load-mutate-save (last-write-wins race) with a single atomic findOneAndUpdate
   * that filters on the current status. If another request changed the status between our validation read
   * and the write, findOneAndUpdate returns null and we surface a ConflictException.
   */
  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior',
  ): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (departmentType) {
      if (
        departmentType === 'packing' &&
        (dto.status !== 'out_for_delivery' || order.status !== 'preparing')
      ) {
        throw new BadRequestException(
          'Packing staff can only send packed orders out for delivery.',
        );
      }
      if (
        departmentType === 'billing' &&
        (dto.status !== 'out_for_delivery' || order.status !== 'preparing')
      ) {
        throw new BadRequestException(
          'Billing can only set out for delivery from preparing (after packing marks complete).',
        );
      }
      if (departmentType === 'delivery') {
        throw new BadRequestException('Delivery staff must use the delivery workflow endpoint, not status update.');
      }
    }

    const allowedNext = OrdersService.VALID_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from "${order.status}" to "${dto.status}". Allowed: ${allowedNext.join(', ') || 'none'}`,
      );
    }

    this.assertPackedBeforeOutForDelivery(order, dto.status, dto.updatedBy);

    const previousStatus = order.status;

    // BUG 13 fix: build the update atomically — filter includes the current status so a concurrent
    // update that already moved the order to a different status causes this findOneAndUpdate to
    // return null, which we surface as a ConflictException rather than silently overwriting.
    const timelineEntry = {
      status: dto.status as OrderStatus,
      message: dto.message || `Order status updated to ${dto.status}`,
      timestamp: new Date(),
      updatedBy: dto.updatedBy,
    };

    const setFields: Record<string, any> = { status: dto.status };

    if (dto.status === 'out_for_delivery') {
      setFields.outForDeliveryAt = new Date();
      if (dto.updatedBy) {
        setFields.billedAt = new Date();
        setFields.billedBy = dto.updatedBy;
      }
      if (dto.assignedTo) {
        setFields.assignedDeliveryUserId = dto.assignedTo;
        setFields.assignedDeliveryAt = new Date();
      }
    } else if (dto.status === 'delivered') {
      setFields.deliveredAt = new Date();
    }

    const savedOrder = await this.orderRepository.getModel().findOneAndUpdate(
      { _id: idObj, status: previousStatus },
      { $set: setFields, $push: { timeline: timelineEntry } },
      { new: true },
    ).exec();

    if (!savedOrder) {
      throw new ConflictException(
        'Order status was modified concurrently. Please reload and retry.',
      );
    }

    // Fire-and-forget: email + WhatsApp run after response is sent
    const orderObj = savedOrder.toObject() as Order;
    const phone = savedOrder.shippingAddress?.phone?.trim();

    this.usersService.findById(order.user.toString()).then((user) => {
      if (user?.email) {
        if (dto.status === 'out_for_delivery') {
          this.emailService.sendShippingUpdate(orderObj, user.email);
        } else if (dto.status === 'delivered') {
          this.emailService.sendDeliveryConfirmation(orderObj, user.email);
        }
      }
    }).catch((err) => this.logger.warn(`Failed to send status update email: ${err.message}`));

    if (phone) {
      if (dto.status === 'out_for_delivery') {
        const deliveryUserId = savedOrder.assignedDeliveryUserId || dto.assignedTo;
        const deliveryPersonPromise = deliveryUserId
          ? this.adminService.findById(deliveryUserId.toString()).catch(() => null)
          : Promise.resolve(null);
        deliveryPersonPromise
          .then((deliveryUser) => {
            const name = dto.assignedToName || deliveryUser?.name;
            const phone2 = dto.assignedToPhone || deliveryUser?.phone;
            return this.notificationsService.sendOutForDeliveryNotification(
              orderObj,
              phone,
              name ? { name, phone: phone2 } : undefined,
            );
          })
          .catch((err) =>
            this.logger.warn(`Failed to send out-for-delivery WhatsApp for ${savedOrder.orderNumber}: ${err.message}`),
          );
      } else {
        const waPromise = dto.status === 'confirmed'
          ? this.notificationsService.sendOrderConfirmed(orderObj, phone)
          : this.notificationsService.notifyOrderStatusChanged(savedOrder, previousStatus);
        waPromise.catch((err) =>
          this.logger.warn(`Failed to send WhatsApp status notification for ${savedOrder.orderNumber}: ${err.message}`),
        );
      }
    }

    this.clearChatbotCache();
    return savedOrder;
  }

  /**
   * Packing: sets packedAt while order stays in preparing; billing then moves to out_for_delivery.
   */
  async markPacked(
    id: string,
    updatedBy: string,
    departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior',
    packedByName?: string,
  ): Promise<Order> {
    if (departmentType && departmentType !== 'packing') {
      throw new BadRequestException('Only packing staff can mark an order as packed.');
    }
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!['placed', 'confirmed', 'preparing'].includes(order.status)) {
      throw new BadRequestException('Order cannot be marked packed at this stage.');
    }
    if (order.packedAt && !order.repackRequired) {
      return order;
    }
    if (order.status !== 'preparing') {
      order.status = 'preparing';
      this.pushTimelineEntry(order, {
        status: 'preparing',
        message: 'Moved to preparing by packing staff',
        updatedBy,
      });
    }
    order.packedAt = new Date();
    if (updatedBy) {
      order.packedBy = updatedBy;
    }
    if (packedByName) {
      order.packedByName = packedByName;
    }
    order.repackRequired = false;
    order.editChanges = [] as any;
    this.pushTimelineEntry(order, {
      status: 'preparing',
      message: packedByName
        ? `Packed by ${packedByName} — ready for dispatch`
        : 'Packed — ready for billing / dispatch',
      updatedBy,
    });
    const saved = await order.save();

    // Fire-and-forget: WhatsApp runs after response is sent
    const phone = saved.shippingAddress?.phone?.trim();
    if (phone) {
      this.notificationsService
        .sendOrderPacked(saved.toObject() as Order, phone)
        .catch((err) => this.logger.warn(`Failed to send packed notification for ${saved.orderNumber}: ${err.message}`));
    }

    this.clearChatbotCache();
    return saved;
  }

  async updatePaymentStatus(id: string, dto: UpdatePaymentStatusDto): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.paymentStatus = dto.paymentStatus;

    this.pushTimelineEntry(order, {
      status: order.status,
      message: `Payment status updated to ${dto.paymentStatus}`,
    });

    return order.save();
  }

  async updateDeliveryWorkflow(
    id: string,
    dto: UpdateDeliveryWorkflowDto,
    updatedBy: string,
    departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior',
  ): Promise<Order> {
    if (departmentType && departmentType !== 'delivery') {
      throw new BadRequestException('Only delivery staff can update delivery workflow.');
    }

    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'out_for_delivery') {
      throw new BadRequestException(
        `Cannot update delivery workflow: order is "${order.status}", not "out_for_delivery".`,
      );
    }

    if (departmentType === 'delivery') {
      if (!order.assignedDeliveryUserId) {
        throw new ForbiddenException('This order has not been assigned to any delivery staff yet.');
      }
      if (order.assignedDeliveryUserId.toString() !== updatedBy) {
        throw new ForbiddenException('This order is assigned to a different delivery person.');
      }
    }

    if (['delivery_done', 'unpaid', 'partial_payment'].includes(dto.status) && !dto.deliveryProofUrl && departmentType === 'delivery') {
      throw new BadRequestException('A delivery proof photo is required.');
    }

    const previousStatus = order.status;
    const metadata: OrderMetadata = order.metadata || {};
    const workflow: DeliveryWorkflowMetadata = {
      status: dto.status,
      paymentMethod: dto.paymentMethod,
      paymentProofUrl: dto.paymentProofUrl,
      deliveryProofUrl: dto.deliveryProofUrl,
      amountCollected: dto.amountCollected,
      cashAmount: dto.cashAmount,
      upiAmount: dto.upiAmount,
      note: dto.note,
      updatedBy,
      updatedAt: new Date(),
    };

    order.metadata = { ...metadata, deliveryWorkflow: workflow };

    const step: DeliveryWorkflowStep = dto.status;

    if (dto.status === 'delivery_done') {
      if (order.paymentStatus !== 'paid') {
        if (order.paymentMethod === 'cod') {
          order.paymentStatus = 'paid';
        } else {
          // Non-COD order reached delivery without paid status — Razorpay webhook likely failed.
          // Order already cleared packing + billing, so allow delivery and flag for finance reconciliation.
          order.paymentStatus = 'paid';
          this.logger.warn(
            `prepaid_delivery_webhook_miss order=${order._id} method=${order.paymentMethod} — auto-reconciled at delivery`,
          );
        }
      }
      order.status = 'delivered';
      order.deliveredAt = new Date();
      order.deliveryProofUrl = dto.deliveryProofUrl;
      order.paymentProofUrl = dto.paymentProofUrl;
      if (dto.amountCollected !== undefined) {
        order.amountCollected = dto.amountCollected;
      }
      if (dto.amountCollected && dto.amountCollected > 0) {
        order.collectionStatus = 'pending';
      }
      if (dto.paymentMethod === 'upi') {
        order.paymentMethod = 'upi';
      }
    } else if (dto.status === 'unpaid') {
      order.status = 'delivered';
      order.deliveredAt = new Date();
      order.deliveryProofUrl = dto.deliveryProofUrl;
      order.amountCollected = 0;
      order.collectionStatus = 'pending';
    } else if (dto.status === 'partial_payment') {
      const collected = (dto.cashAmount ?? 0) + (dto.upiAmount ?? 0);
      if (collected <= 0) {
        throw new BadRequestException(
          'Partial payment requires at least one non-zero amount (cash or UPI).',
        );
      }
      order.status = 'delivered';
      order.deliveredAt = new Date();
      order.deliveryProofUrl = dto.deliveryProofUrl;
      order.paymentProofUrl = dto.paymentProofUrl;
      order.amountCollected = collected;
      order.collectionStatus = 'pending';
    }

    this.pushTimelineEntry(order, {
      status: order.status,
      message:
        dto.note ||
        `Delivery status updated to ${dto.status.replace(/_/g, ' ')}`.trim(),
      updatedBy,
      metadata: {
        step,
        paymentMethod: dto.paymentMethod,
        paymentProofUrl: dto.paymentProofUrl,
        deliveryProofUrl: dto.deliveryProofUrl,
        amountCollected: dto.amountCollected,
      },
    });

    const saved = await order.save();

    // WhatsApp notifications — non-blocking, each wrapped individually.
    const phone = saved.shippingAddress?.phone?.trim();
    if (phone) {
      if (['delivery_done', 'unpaid', 'partial_payment'].includes(dto.status)) {
        // delivered statuses → notifyOrderStatusChanged handles it.
        try {
          await this.notificationsService.notifyOrderStatusChanged(saved, previousStatus);
        } catch (waErr) {
          this.logger.warn(`Failed to send delivered notification for ${saved.orderNumber}`, waErr);
        }
      } else if (
        dto.status === 'customer_ringing' ||
        dto.status === 'customer_tomorrow' ||
        dto.status === 'customer_cancelled'
      ) {
        try {
          await this.notificationsService.sendDeliveryAttemptNotification(
            saved.toObject() as Order,
            phone,
            dto.status,
            dto.note,
          );
        } catch (waErr) {
          this.logger.warn(`Failed to send delivery attempt notification for ${saved.orderNumber}`, waErr);
        }
      }
    }

    return saved;
  }

  async cancelOrder(id: string, dto: CancelOrderDto, cancelledBy?: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');

    // Atomic guard: only succeeds if the order is not already in a terminal state.
    // Concurrent cancel requests (e.g. network retry) both pass a non-atomic read-then-save,
    // which would double-credit the wallet and double-restore stock. Using findOneAndUpdate
    // here means only one request can win the race; the loser gets null and throws.
    const order = await this.orderRepository.getModel().findOneAndUpdate(
      { _id: idObj, status: { $nin: ['delivered', 'cancelled', 'refunded'] } },
      { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: dto.reason } },
      { new: true },
    ).exec();

    if (!order) {
      const existing = await this.orderRepository.findById(idObj);
      if (!existing) throw new NotFoundException('Order not found');
      throw new BadRequestException('Order cannot be cancelled');
    }

    // BUG 1 fix: restore stock for all items on cancellation
    let cancelMainStore: Awaited<ReturnType<typeof this.storesService.findMainStore>> | null = null;
    try {
      cancelMainStore = await this.storesService.findMainStore();
    } catch {
      // Main store not configured — skip stock restore
    }
    if (cancelMainStore) {
      const cancelStoreId = cancelMainStore._id.toString();
      await Promise.all(
        order.items.map(async (item) => {
          try {
            await this.storeStockService.incrementStock(
              cancelStoreId,
              item.product.toString(),
              item.quantity,
              item.variantSku,
            );
          } catch (stockErr) {
            this.logger.warn(
              `cancelOrder: failed to restore stock for product ${item.product.toString()} on order ${id}: ${stockErr.message}`,
            );
          }
        }),
      );
    }

    // BUG 2 fix: credit wallet back if wallet was used for this order
    if (order.walletUsed && order.walletUsed > 0) {
      try {
        await this.walletService.credit(
          order.user.toString(),
          order.walletUsed,
          'order_cancelled',
          { orderId: order._id as Types.ObjectId },
        );
      } catch (walletErr) {
        this.logger.warn(
          `cancelOrder: failed to refund wallet for order ${id}: ${walletErr.message}`,
        );
      }
    }

    this.pushTimelineEntry(order, {
      status: 'cancelled',
      message: `Order cancelled: ${dto.reason}`,
      updatedBy: cancelledBy,
    });

    const savedOrder = await order.save();

    // Fire-and-forget: these don't affect the cancel outcome so don't block the response.
    if (order.couponCode) {
      this.couponsService.decrementUsageCount(order.couponCode).catch((err: Error) => {
        this.logger.warn(`cancelOrder: failed to decrement coupon usage for ${order.couponCode}: ${err.message}`);
      });
    }

    this.storeSalesService.voidByLinkedOrder(id, 'order_cancelled').catch((voidErr: Error) => {
      this.logger.warn(`Failed to void store sale for cancelled order: ${voidErr.message}`);
    });

    this.usersService.findById(order.user.toString()).then((user) => {
      if (user?.email) {
        this.emailService.sendOrderCancelled(savedOrder.toObject(), user.email);
      }
    }).catch((emailError: Error) => {
      this.logger.warn(`Failed to send cancellation email: ${emailError.message}`);
    });

    return savedOrder;
  }

  async addNote(id: string, dto: AddOrderNoteDto): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const existingNotes = order.adminNotes || '';
    order.adminNotes = existingNotes
      ? `${existingNotes}\n[${new Date().toISOString()}] ${dto.note}`
      : `[${new Date().toISOString()}] ${dto.note}`;

    return order.save();
  }

  async updateShipping(id: string, dto: UpdateShippingDto): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (dto.awbNumber) order.awbNumber = dto.awbNumber;
    if (dto.courierName) order.courierName = dto.courierName;
    if (dto.trackingUrl) order.trackingUrl = dto.trackingUrl;
    if (dto.expectedDeliveryDate) {
      order.expectedDeliveryDate = new Date(dto.expectedDeliveryDate);
    }

    return order.save();
  }

  async deleteOrder(id: string): Promise<{ deleted: boolean }> {
    const idObj = parseObjectId(id, 'id');

    // Void any linked store sale so sales log stays consistent
    try {
      await this.storeSalesService.voidByLinkedOrder(id, 'order_deleted');
    } catch (err) {
      this.logger.warn(`Failed to void store sale on order delete: ${err.message}`);
    }

    await this.orderRepository.deleteOne({ _id: idObj });
    return { deleted: true };
  }

  async dismissFromView(id: string, view: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);
    if (!order) throw new NotFoundException('Order not found');
    if (!order.dismissedFromViews) order.dismissedFromViews = [];
    if (!order.dismissedFromViews.includes(view)) {
      order.dismissedFromViews.push(view);
    }
    return order.save();
  }

  async restoreToView(id: string, view: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);
    if (!order) throw new NotFoundException('Order not found');
    order.dismissedFromViews = (order.dismissedFromViews || []).filter(v => v !== view);
    return order.save();
  }

  async updateOrder(id: string, dto: UpdateOrderDto): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (dto.status && order.status !== dto.status) {
      order.status = dto.status as OrderStatus;
      this.pushTimelineEntry(order, {
        status: order.status,
        message: `Order status updated to ${dto.status} via admin edit`,
      });

      if (dto.status === 'out_for_delivery') {
        order.outForDeliveryAt = new Date();
      } else if (dto.status === 'delivered') {
        order.deliveredAt = new Date();
      }
    }

    if (dto.paymentStatus) {
      order.paymentStatus = dto.paymentStatus as PaymentStatus;
    }
    if (dto.paymentMethod) {
      order.paymentMethod = dto.paymentMethod as PaymentMethod;
    }
    if (dto.notes !== undefined) {
      order.notes = dto.notes;
    }
    if (dto.adminNotes !== undefined) {
      order.adminNotes = dto.adminNotes;
    }
    if (dto.paymentProofUrl !== undefined) {
      order.paymentProofUrl = dto.paymentProofUrl;
    }

    if (dto.shippingCharge != null) {
      order.shippingCharge = dto.shippingCharge;
    }

    if (dto.shippingAddress) {
      order.shippingAddress = {
        ...((order.shippingAddress as any).toObject?.() || order.shippingAddress),
        ...dto.shippingAddress,
      };
      order.markModified('shippingAddress');
    }

    if (dto.items && dto.items.length > 0) {
      // Snapshot old items for diff before overwriting
      const oldItems = (order.items as any[]).map((i: any) => ({
        productId: i.product.toString(),
        variantSku: i.variantSku || '',
        name: i.name,
        variantName: i.variantName,
        quantity: i.quantity,
      }));
      const oldMap = new Map(oldItems.map((i) => [`${i.productId}|${i.variantSku}`, i]));

      const products = await Promise.all(
        dto.items.map((item) => this.productsService.findById(item.productId)),
      );
      const productMap = new Map(products.map((p) => [p._id.toString(), p]));

      let newSubtotal = 0;
      const newItems: OrderItem[] = [];

      for (const item of dto.items) {
        const productIdObj = parseObjectId(item.productId, 'items[].productId');
        const product = productMap.get(item.productId)!;

        let price = product.price;
        if (item.variantSku) {
          const variant = product.variants.find((v) => v.sku === item.variantSku);
          if (variant) price = variant.price;
        }

        const lineTotal = price * item.quantity;
        const gstPct = (product.category as any)?.gstPercentage ?? 0;

        newItems.push({
          product: productIdObj,
          name: product.name,
          variantSku: item.variantSku,
          variantName: item.variantSku
            ? product.variants.find((v) => v.sku === item.variantSku)?.name
            : undefined,
          quantity: item.quantity,
          price,
          total: lineTotal,
          image: product.images?.[0],
          gstAmount: (lineTotal * gstPct) / 100,
        });
        newSubtotal += lineTotal;
      }

      // Compute diff: detect qty changes, additions, removals
      const newMap = new Map(
        newItems.map((i) => [
          `${i.product.toString()}|${i.variantSku || ''}`,
          i,
        ]),
      );
      const editChanges: {
        type: string;
        productId: string;
        name: string;
        variantSku?: string;
        variantName?: string;
        oldQty?: number;
        newQty?: number;
      }[] = [];

      for (const [key, old] of oldMap) {
        const curr = newMap.get(key);
        if (!curr) {
          editChanges.push({ type: 'item_removed', productId: old.productId, name: old.name, variantSku: old.variantSku || undefined, variantName: old.variantName, oldQty: old.quantity });
        } else if (curr.quantity !== old.quantity) {
          editChanges.push({ type: 'qty_changed', productId: old.productId, name: old.name, variantSku: old.variantSku || undefined, variantName: old.variantName, oldQty: old.quantity, newQty: curr.quantity });
        }
      }
      for (const [key, curr] of newMap) {
        if (!oldMap.has(key)) {
          editChanges.push({ type: 'item_added', productId: curr.product.toString(), name: curr.name, variantSku: curr.variantSku || undefined, variantName: curr.variantName, newQty: curr.quantity });
        }
      }

      if (editChanges.length > 0) {
        order.editChanges = editChanges as any;
        order.repackRequired = true;
        // Reset packing so the order re-surfaces in the packing queue
        order.packedAt = undefined;
        order.packedBy = undefined;
        order.packedByName = undefined;
        this.pushTimelineEntry(order, {
          status: order.status,
          message: `Order items edited by admin — repack required (${editChanges.length} change${editChanges.length > 1 ? 's' : ''})`,
        });

        // BUG 12 fix: sync inventory for the changed items so store stock stays accurate
        // after admin edits. Runs best-effort after the order is saved; failures are logged
        // but do not block the response.
        let stockSyncStore: Awaited<ReturnType<typeof this.storesService.findMainStore>> | null = null;
        try {
          stockSyncStore = await this.storesService.findMainStore();
        } catch {
          // Main store not configured — skip stock sync
        }
        if (stockSyncStore) {
          const stockSyncStoreId = stockSyncStore._id.toString();
          for (const change of editChanges) {
            try {
              if (change.type === 'item_removed') {
                // Item no longer in order — return full old quantity to stock
                await this.storeStockService.incrementStock(
                  stockSyncStoreId,
                  change.productId,
                  change.oldQty!,
                  change.variantSku,
                );
              } else if (change.type === 'item_added') {
                // New item added to order — decrement stock by new quantity
                await this.storeStockService.decrementStock(
                  stockSyncStoreId,
                  change.productId,
                  change.newQty!,
                  change.variantSku,
                );
              } else if (change.type === 'qty_changed') {
                const delta = change.newQty! - change.oldQty!;
                if (delta > 0) {
                  // More ordered — decrement stock by the additional quantity
                  await this.storeStockService.decrementStock(
                    stockSyncStoreId,
                    change.productId,
                    delta,
                    change.variantSku,
                  );
                } else if (delta < 0) {
                  // Fewer ordered — return the released quantity to stock
                  await this.storeStockService.incrementStock(
                    stockSyncStoreId,
                    change.productId,
                    Math.abs(delta),
                    change.variantSku,
                  );
                }
              }
            } catch (stockErr) {
              this.logger.warn(
                `updateOrder: stock sync failed for product ${change.productId} (${change.type}): ${stockErr.message}`,
              );
            }
          }
        }
      }

      order.items = newItems as any;
      order.subtotal = newSubtotal;
      order.gstTotal = newItems.reduce((sum, item) => sum + item.gstAmount, 0);
      // Apply updated discount if provided alongside item changes, else keep existing
      const effectiveDiscount = dto.discount != null ? Math.min(dto.discount, newSubtotal) : (order.discount || 0);
      order.discount = effectiveDiscount;
      order.total = Math.max(0, newSubtotal - effectiveDiscount + (order.shippingCharge || 0));
    }

    // Standalone discount update (no item changes)
    if ((dto.discount != null) && !(dto.items && dto.items.length > 0)) {
      const cappedDiscount = Math.min(dto.discount, order.subtotal || 0);
      order.discount = cappedDiscount;
      order.total = Math.max(0, (order.subtotal || 0) - cappedDiscount + (order.shippingCharge || 0));
    }

    // Standalone shippingCharge update (no item or discount changes) — recalculate total
    if (dto.shippingCharge != null && !(dto.items && dto.items.length > 0) && dto.discount == null) {
      order.total = Math.max(0, (order.subtotal || 0) - (order.discount || 0) + order.shippingCharge);
    }

    return order.save();
  }

  async setPriorityTags(id: string, tags: string[]): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findByIdAndUpdate(idObj, {
      $set: { priorityTags: tags },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async requestReturn(userId: string, id: string, reason: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Ensure customer owns the order
    if (order.user.toString() !== userId) {
      throw new BadRequestException('You do not have access to this order');
    }

    // Only allow returns for delivered, paid, non-cancelled/refunded orders
    if (order.status !== 'delivered' || order.paymentStatus !== 'paid') {
      throw new BadRequestException(
        'Return can only be requested for delivered and paid orders',
      );
    }

    if (order.returnRequestStatus && order.returnRequestStatus !== 'rejected') {
      throw new BadRequestException('Return request already submitted for this order');
    }

    // Optional: enforce a simple return window (e.g. 7 days from delivery)
    if (order.deliveredAt) {
      const deliveredAt = order.deliveredAt.getTime();
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (now - deliveredAt > sevenDaysMs) {
        throw new BadRequestException('Return window has expired for this order');
      }
    }

    order.returnRequestedAt = new Date();
    order.returnRequestReason = reason;
    order.returnRequestStatus = 'requested';

    this.pushTimelineEntry(order, {
      status: order.status,
      message: `Customer requested return: ${reason}`,
    });

    const savedOrder = await order.save();

    // Optionally notify admin via email (best-effort)
    try {
      const user = await this.usersService.findById(order.user.toString());
      if (user?.email) {
        this.emailService.sendOrderCancelled?.(savedOrder.toObject(), user.email);
      }
    } catch (emailError) {
      this.logger.warn(`Failed to send return request email: ${emailError.message}`);
    }

    return savedOrder;
  }

  async approveReturn(id: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);
    if (!order) throw new NotFoundException('Order not found');
    if (order.returnRequestStatus !== 'requested') {
      throw new BadRequestException('Return request must be in requested state to approve');
    }
    order.returnRequestStatus = 'approved';
    this.pushTimelineEntry(order, {
      status: order.status,
      message: 'Return approved by admin',
    });
    return order.save();
  }

  async rejectReturn(id: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);
    if (!order) throw new NotFoundException('Order not found');
    if (order.returnRequestStatus !== 'requested') {
      throw new BadRequestException('Return request must be in requested state to reject');
    }
    order.returnRequestStatus = 'rejected';
    this.pushTimelineEntry(order, {
      status: order.status,
      message: 'Return request rejected by admin',
    });
    return order.save();
  }

  async completeReturn(id: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);
    if (!order) throw new NotFoundException('Order not found');
    if (order.returnRequestStatus !== 'approved') {
      throw new BadRequestException('Return must be approved before marking complete');
    }
    order.returnRequestStatus = 'completed';
    order.status = 'returned';
    this.pushTimelineEntry(order, {
      status: 'returned',
      message: 'Return completed',
    });
    return order.save();
  }

  async reorder(userId: string, dto: ReorderDto): Promise<Order> {
    parseObjectId(userId, 'userId');
    const orderIdObj = parseObjectId(dto.orderId, 'orderId');
    const originalOrder = await this.orderRepository.findById(orderIdObj);

    if (!originalOrder) {
      throw new NotFoundException('Original order not found');
    }

    if (originalOrder.user.toString() !== userId) {
      throw new ForbiddenException('You can only reorder your own orders');
    }

    const mainStore = await this.storesService.findMainStore();
    const mainStoreId = mainStore._id.toString();

    for (const item of originalOrder.items) {
      const storeStock = await this.storeStockService.getStockForStoreProduct(
        mainStoreId,
        item.product.toString(),
      );
      const available = item.variantSku
        ? (storeStock?.variantStocks?.find((v) => v.variantSku === item.variantSku)?.stock ?? 0)
        : (storeStock?.stock ?? 0);
      if (item.quantity > available) {
        throw new BadRequestException(
          `Insufficient stock for "${item.name}"${item.variantSku ? ` (${item.variantSku})` : ''}. Available: ${available}. Reduce quantity or remove from reorder.`,
        );
      }
    }

    const items = originalOrder.items.map((item) => ({
      productId: item.product.toString(),
      variantSku: item.variantSku,
      quantity: item.quantity,
    }));

    return this.create(userId, {
      items,
      shippingAddress: dto.shippingAddress || {
        name: originalOrder.shippingAddress.name,
        phone: originalOrder.shippingAddress.phone,
        street: originalOrder.shippingAddress.street,
        city: originalOrder.shippingAddress.city,
        state: originalOrder.shippingAddress.state,
        pincode: originalOrder.shippingAddress.pincode,
        landmark: originalOrder.shippingAddress.landmark,
      },
      paymentMethod: originalOrder.paymentMethod,
    });
  }

  async getOrderStats(startDate?: Date, endDate?: Date): Promise<Record<string, unknown>> {
    return this.orderRepository.getOrderStats(startDate, endDate);
  }

  async getOrdersByStatus(): Promise<Record<OrderStatus, number>> {
    if (await this.settingsService.getMockDataEnabled()) {
      return {
        placed: 14,
        confirmed: 9,
        preparing: 6,
        out_for_delivery: 5,
        delivered: 87,
        cancelled: 4,
        returned: 2,
        refunded: 1,
      };
    }
    const resetAt = await this.settingsService.getMetricsResetAt();
    return this.orderRepository.getOrdersByStatus(resetAt);
  }

  async assignDelivery(orderId: string, deliveryUserId: string, assignedBy?: string): Promise<Order> {
    const idObj = parseObjectId(orderId, 'id');
    const order = await this.orderRepository.findById(idObj);
    if (!order) throw new NotFoundException('Order not found');

    const assignableStatuses: OrderStatus[] = ['placed', 'confirmed', 'preparing', 'out_for_delivery'];
    if (!assignableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Cannot assign delivery: order status is "${order.status}". Order must be placed, confirmed, preparing, or out for delivery.`,
      );
    }

    let deliveryUser;
    try {
      deliveryUser = await this.adminService.findById(deliveryUserId);
    } catch {
      throw new BadRequestException('Delivery user not found.');
    }
    if (deliveryUser.departmentType !== 'delivery') {
      throw new BadRequestException('The specified user is not a delivery staff member.');
    }
    if (!deliveryUser.isActive) {
      throw new BadRequestException('The specified delivery staff member is inactive.');
    }

    order.assignedDeliveryUserId = deliveryUserId;
    order.assignedDeliveryAt = new Date();
    this.pushTimelineEntry(order, {
      status: order.status,
      message: `Order assigned to delivery staff: ${deliveryUser.name}`,
      updatedBy: assignedBy,
    });

    return order.save();
  }

  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    // BUG 9 note: this read-then-increment pattern is not atomic. Callers wrap it in a
    // retry loop (MAX_ORDER_NUMBER_RETRIES=10) with jitter so duplicate-key collisions
    // resolve without user-visible errors. TODO: replace with a Counter collection +
    // findOneAndUpdate($inc) for fully atomic generation when a Counter model is available.
    const lastOrder = await this.orderRepository.findOneByOrderNumberPrefix(`ORD${dateStr}`);
    let sequence = 1;
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.slice(-4), 10);
      sequence = lastSequence + 1;
    }
    return `ORD${dateStr}${sequence.toString().padStart(4, '0')}`;
  }

  /**
   * Ask customers for feedback 24h–7d after delivery. Runs every 6h; idempotent via
   * `order.feedbackRequestedAt`. 7-day cap avoids pestering users for old orders when
   * the cron first starts running. Limit 100 per tick to cap burst WhatsApp sends.
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async requestPostDeliveryFeedback(): Promise<void> {
    const now = Date.now();
    const olderThan = new Date(now - 24 * 60 * 60 * 1000); // delivered >= 24h ago
    const newerThan = new Date(now - 7 * 24 * 60 * 60 * 1000); // but <= 7d ago

    let orders: OrderDocument[];
    try {
      orders = await this.orderRepository.findDeliveredPendingFeedback({
        olderThan,
        newerThan,
        limit: 100,
      });
    } catch (err) {
      this.logger.warn('feedback_request_query_failed', err);
      return;
    }

    if (orders.length === 0) return;

    let sent = 0;
    for (const order of orders) {
      const phone = order.shippingAddress?.phone;
      if (!phone) continue;
      try {
        const ok = await this.notificationsService.sendFeedbackRequest(order, phone);
        // Mark requested even on no-op (duplicate) so we don't re-query it forever.
        await this.orderRepository.markFeedbackRequested(order._id);
        if (ok) sent++;
      } catch (err) {
        this.logger.warn(`feedback_request_send_failed order=${order._id.toString()}`, err);
      }
    }

    if (sent > 0) {
      this.logger.log(`post_delivery_feedback_requested count=${sent}`);
    }
  }

  /**
   * Reclaim stock from prepaid orders the customer never paid for. Stock is
   * decremented at order-create time inside the same transaction as the order
   * row, so a stuck `paymentStatus='pending'` row holds inventory hostage —
   * other customers see "out of stock" on items that physically exist. After
   * 48h with no payment we cancel the order, increment the main-store stock
   * back, and push the fresh availability to Meta so the catalog reflects it.
   * Runs every 30 minutes; capped at 50 per tick to avoid bursts.
   *
   * BUG 3 fix: order status is saved BEFORE stock increments so a failed save cannot
   * cause a double-increment on the next cron tick. The order document is updated
   * atomically with findOneAndUpdate (status != 'cancelled' guard) before any stock
   * changes; if the update fails the item is skipped and will be retried next tick.
   * TODO: when StoreStockService.incrementStock gains a ClientSession parameter, wrap
   * both the order update and stock increments in a single MongoDB transaction.
   */
  @Cron('*/30 * * * *')
  async releaseAbandonedPrepaidStock(): Promise<void> {
    const olderThan = new Date(Date.now() - 48 * 60 * 60 * 1000);

    let orders: OrderDocument[];
    try {
      orders = await this.orderRepository.findAbandonedPrepaidOrders({
        olderThan,
        limit: 50,
      });
    } catch (err) {
      this.logger.warn('abandoned_prepaid_query_failed', err);
      return;
    }

    if (orders.length === 0) return;

    const mainStore = await this.storesService.findMainStore().catch(() => null);
    if (!mainStore) {
      this.logger.warn('abandoned_prepaid_skipped: main store not configured');
      return;
    }
    const mainStoreId = mainStore._id.toString();

    let released = 0;
    const productIdsToSync = new Set<string>();

    for (const order of orders) {
      try {
        // BUG 3 fix: persist the cancellation atomically FIRST (with a guard so a concurrent
        // cron tick that already cancelled this order becomes a no-op). Only increment stock
        // after the cancel is confirmed — this prevents double-increment if order.save() had
        // previously failed after stock was already incremented.
        const cancelledOrder = await this.orderRepository.getModel().findOneAndUpdate(
          { _id: order._id, status: { $ne: 'cancelled' } },
          {
            $set: {
              status: 'cancelled',
              cancelledAt: new Date(),
              cancelReason: 'Payment not received within 48 hours',
            },
            $push: {
              timeline: {
                status: 'cancelled',
                message: 'Auto-cancelled: payment not received within 48 hours',
                timestamp: new Date(),
              },
            },
          },
          { new: true },
        ).exec();

        if (!cancelledOrder) {
          // Already cancelled by another cron tick — skip stock increment
          continue;
        }

        // Order is now confirmed cancelled — safe to increment stock
        for (const item of order.items) {
          try {
            await this.storeStockService.incrementStock(
              mainStoreId,
              item.product.toString(),
              item.quantity,
              item.variantSku,
            );
            productIdsToSync.add(item.product.toString());
          } catch (stockErr) {
            this.logger.warn(
              `release_stock_increment_failed order=${order._id.toString()} product=${item.product.toString()}`,
              stockErr,
            );
          }
        }

        released += 1;
      } catch (err) {
        this.logger.warn(
          `abandoned_prepaid_cancel_failed order=${order._id.toString()}`,
          err,
        );
      }
    }

    void Promise.all(
      Array.from(productIdsToSync).map((pid) =>
        this.ucmService.syncProductById(pid, 'abandoned_order_released').catch((err) => {
          this.logger.warn(`abandoned_release_ucm_sync_failed product=${pid}`, err);
        }),
      ),
    );

    if (released > 0) {
      this.logger.log(`abandoned_prepaid_released count=${released}`);
      this.clearChatbotCache();
    }
  }

  async storeOrderInvoice(id: string, pdfBase64: string, filename: string): Promise<{ url: string }> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);
    if (!order) throw new NotFoundException('Order not found');

    const buffer = Buffer.from(pdfBase64, 'base64');
    const result = await this.mediaService.uploadPdfBuffer(buffer, 'invoices/orders', filename);

    order.invoiceUrl = result.secureUrl;
    await order.save();
    return { url: result.secureUrl };
  }

  async sendOrderInvoiceToCustomer(id: string): Promise<{ sent: boolean }> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);
    if (!order) throw new NotFoundException('Order not found');
    if (!order.invoiceUrl) throw new BadRequestException('No invoice found for this order. Generate it first.');

    const phone = order.shippingAddress?.phone?.trim();
    if (!phone) throw new BadRequestException('No customer phone found for this order.');

    await this.notificationsService.sendInvoiceDocument(order.orderNumber, phone, order.invoiceUrl);
    return { sent: true };
  }

  private clearChatbotCache(): void {
    this.redisService.delPattern('chatbot:tool:*').catch((err) => {
      this.logger.warn(`Failed to clear chatbot cache: ${err.message}`);
    });
  }
}
