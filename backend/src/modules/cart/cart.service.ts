import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { CartDocument, CartItem } from './schemas/cart.schema';
import { CartRepository } from './repositories/cart.repository';
import { ProductsService } from '../products/products.service';
import { CouponsService } from '../coupons/coupons.service';
import { OrderRepository } from '../orders/repositories/order.repository';
import { AddToCartDto, UpdateCartItemDto, CartResponse } from './dto/cart.dto';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly cartRepository: CartRepository,
    private productsService: ProductsService,
    private couponsService: CouponsService,
    @Inject(forwardRef(() => OrderRepository))
    private readonly orderRepository: OrderRepository,
  ) {}

  private async revalidateOrClearCoupon(cart: CartDocument, userId: string): Promise<void> {
    const code = cart.couponCode?.trim();
    if (!code) return;

    const [userOrderCount, userCouponUsageCount, categoryIds] = await Promise.all([
      this.orderRepository.countNonCancelledOrdersByUser(userId),
      this.orderRepository.countCouponUsesByUser(userId, code),
      this.collectCartCategoryIds(cart),
    ]);

    const validation = await this.couponsService.validateCoupon({
      code,
      orderAmount: cart.subtotal,
      userId,
      productIds: cart.items.map((i) => i.product.toString()),
      categoryIds,
      userOrderCount,
      userCouponUsageCount,
    });

    if (!validation.valid) {
      cart.couponCode = undefined;
      cart.discount = 0;
    } else {
      cart.discount = validation.discountAmount;
    }
  }

  async getCart(userId: string): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);
    await this.refreshStalePrices(cart, userId);
    return this.formatCartResponse(cart);
  }

  /**
   * Detects cart items whose stored `price` no longer matches the live
   * product/variant (admin edit or UCM pull happened after the item was
   * captured) and rewrites the stored price. Subtotal/total/discount are
   * recomputed and any applied coupon is revalidated against the new
   * subtotal so the customer never sees a stale ₹ on the cart screen.
   * Read-side only — write-side races are still possible, but the
   * authoritative recompute at order-create time (orders.service) catches
   * any divergence before billing.
   */
  private async refreshStalePrices(cart: CartDocument, userId: string): Promise<void> {
    if (!cart.items.length) return;
    let mutated = false;
    for (const item of cart.items) {
      try {
        const product = await this.productsService.findById(item.product.toString());
        if (!product?.isActive) continue;
        let livePrice = product.price;
        if (item.variantSku) {
          const variant = product.variants.find((v) => v.sku === item.variantSku);
          if (variant && Number.isFinite(variant.price) && variant.price > 0) {
            livePrice = variant.price;
          }
        }
        if (
          Number.isFinite(livePrice) &&
          livePrice > 0 &&
          Math.abs((item.price ?? 0) - livePrice) > 0.005
        ) {
          item.price = livePrice;
          item.priceCapturedAt = new Date();
          mutated = true;
        }
      } catch {
        // Product lookup failed (deleted between cart save and read);
        // leave the cart-captured price untouched. Order-create will
        // surface the failure if it persists.
      }
    }
    if (mutated) {
      this.recalculateCart(cart);
      await this.revalidateOrClearCoupon(cart, userId);
      await cart.save();
    }
  }

  async getCartById(userId: string, cartId: string): Promise<CartDocument> {
    const userObjId = parseObjectId(userId, 'userId');
    const cartObjId = parseObjectId(cartId, 'cartId');
    const cart = await this.cartRepository.findOneByIdAndUser(cartObjId, userObjId);
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }
    return cart;
  }

  async addItem(
    userId: string,
    dto: AddToCartDto,
    options?: { unitPriceOverride?: number },
  ): Promise<CartResponse> {
    const productIdObj = parseObjectId(dto.productId, 'productId');
    const cart = await this.findOrCreateCart(userId);
    const product = await this.productsService.findById(dto.productId);

    if (!product.isActive) {
      throw new BadRequestException('Product is not available');
    }

    let price = product.price;
    let stock = product.stock;

    if (dto.variantSku) {
      const variant = product.variants.find((v) => v.sku === dto.variantSku);
      if (!variant) {
        throw new BadRequestException('Variant not found');
      }
      if (!variant.isActive) {
        throw new BadRequestException('Variant is not available');
      }
      price = variant.price;
      stock = variant.stock;
    }

    // The override is a *fallback*, not a blind override: it only applies when
    // the local price is missing/zero (the original symptom — products imported
    // from Meta with no price field). Trusting the WhatsApp echo over a valid
    // local price would let an admin price-cut be ignored at checkout.
    const overridePrice = options?.unitPriceOverride;
    const localPriceUnusable = !Number.isFinite(price) || price <= 0;
    if (
      localPriceUnusable &&
      typeof overridePrice === 'number' &&
      Number.isFinite(overridePrice) &&
      overridePrice > 0
    ) {
      price = overridePrice;
    }

    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestException(
        `Price unavailable for ${product.name}. Please contact support so we can fix this product's pricing.`,
      );
    }

    if (product.trackStock && stock < dto.quantity) {
      throw new BadRequestException('Not enough stock available');
    }

    const existingItemIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === productIdObj.toString() &&
        item.variantSku === dto.variantSku,
    );

    const now = new Date();
    if (existingItemIndex >= 0) {
      const newQuantity = cart.items[existingItemIndex].quantity + dto.quantity;

      if (product.trackStock && stock < newQuantity) {
        throw new BadRequestException('Not enough stock available');
      }

      // Refresh price/capture-time on quantity bump too — otherwise a customer
      // who adds, sees an admin price change, then adds again would still be
      // pinned to the original price for the whole row.
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].price = price;
      cart.items[existingItemIndex].priceCapturedAt = now;
    } else {
      const cartItem: CartItem = {
        product: productIdObj,
        variantSku: dto.variantSku,
        quantity: dto.quantity,
        price,
        name: product.name,
        slug: product.slug,
        image: product.images[0],
        addedAt: now,
        priceCapturedAt: now,
        gstPercentage: (product.category as any)?.gstPercentage ?? 0,
      };

      cart.items.push(cartItem);
    }

    this.recalculateCart(cart);
    await this.revalidateOrClearCoupon(cart, userId);
    await cart.save();

    return this.formatCartResponse(cart);
  }

  async updateItemQuantity(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
    variantSku?: string,
  ): Promise<CartResponse> {
    parseObjectId(productId, 'productId');
    const cart = await this.findOrCreateCart(userId);

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId &&
        item.variantSku === variantSku,
    );

    if (itemIndex < 0) {
      return this.formatCartResponse(cart);
    }

    const product = await this.productsService.findById(productId);
    let stock = product.stock;

    if (variantSku) {
      const variant = product.variants.find((v) => v.sku === variantSku);
      if (!variant) {
        throw new BadRequestException('Variant not found');
      }
      stock = variant.stock;
    }

    if (product.trackStock && stock < dto.quantity) {
      throw new BadRequestException('Not enough stock available');
    }

    cart.items[itemIndex].quantity = dto.quantity;

    this.recalculateCart(cart);
    await this.revalidateOrClearCoupon(cart, userId);
    await cart.save();

    return this.formatCartResponse(cart);
  }

  async removeItem(
    userId: string,
    productId: string,
    variantSku?: string,
  ): Promise<CartResponse> {
    parseObjectId(productId, 'productId');
    const cart = await this.findOrCreateCart(userId);

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId &&
        item.variantSku === variantSku,
    );

    if (itemIndex < 0) {
      return this.formatCartResponse(cart);
    }

    cart.items.splice(itemIndex, 1);

    this.recalculateCart(cart);
    await this.revalidateOrClearCoupon(cart, userId);
    await cart.save();

    return this.formatCartResponse(cart);
  }

  async clearCart(userId: string): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);

    cart.items = [];
    cart.couponCode = undefined;
    cart.discount = 0;

    this.recalculateCart(cart);
    await cart.save();

    return this.formatCartResponse(cart);
  }

  async applyCoupon(userId: string, couponCode: string): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const [userOrderCount, userCouponUsageCount, categoryIds] = await Promise.all([
      this.orderRepository.countNonCancelledOrdersByUser(userId),
      this.orderRepository.countCouponUsesByUser(userId, couponCode),
      this.collectCartCategoryIds(cart),
    ]);

    const validation = await this.couponsService.validateCoupon({
      code: couponCode,
      orderAmount: cart.subtotal,
      userId,
      productIds: cart.items.map((i) => i.product.toString()),
      categoryIds,
      userOrderCount,
      userCouponUsageCount,
    });

    if (!validation.valid) {
      throw new BadRequestException(validation.message);
    }

    cart.couponCode = couponCode.toUpperCase();
    cart.discount = validation.discountAmount;

    this.recalculateCart(cart);
    await cart.save();

    this.logger.log(`event_coupon_applied user=${userId} code=${couponCode}`);

    return this.formatCartResponse(cart);
  }

  async removeCoupon(userId: string): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);

    cart.couponCode = undefined;
    cart.discount = 0;

    this.recalculateCart(cart);
    await cart.save();

    return this.formatCartResponse(cart);
  }

  async markAsAbandoned(cartId: string): Promise<void> {
    const cartObjId = parseObjectId(cartId, 'cartId');
    await this.cartRepository.updateOne(
      { _id: cartObjId },
      { abandonedAt: new Date() },
    );

    this.logger.log(`event_cart_abandoned cart=${cartId}`);
  }

  async getAbandonedCarts(
    minutesOld: number,
    limit: number = 100,
  ): Promise<CartDocument[]> {
    const cutoffTime = new Date(Date.now() - minutesOld * 60 * 1000);
    return this.cartRepository.findAbandonedCarts(cutoffTime, limit);
  }

  async markAbandonedReminderSent(cartId: string): Promise<void> {
    const cartObjId = parseObjectId(cartId, 'cartId');
    await this.cartRepository.updateOne(
      { _id: cartObjId },
      {
        $set: { abandonedReminderSent: true, abandonedLastReminderAt: new Date() },
        $inc: { abandonedReminderCount: 1 },
      },
    );
  }

  private async findOrCreateCart(userId: string): Promise<CartDocument> {
    const userObjId = parseObjectId(userId, 'userId');
    let cart = await this.cartRepository.findOneByUser(userObjId);
    if (!cart) {
      cart = await this.cartRepository.create({
        user: userObjId,
        items: [],
        subtotal: 0,
        discount: 0,
        total: 0,
      } as Partial<CartDocument>);
    }
    return cart;
  }

  /**
   * Resolve the distinct category ids for the products currently in the cart.
   * Used to feed coupon validation so cart-time validation matches the
   * order-time check (which already passes categoryIds). Without this, a
   * category-restricted coupon can pass at apply-time and only fail at
   * place-order — confusing for customers who saw the discount on cart.
   */
  private async collectCartCategoryIds(cart: CartDocument): Promise<string[]> {
    if (!cart.items.length) return [];
    const seen = new Set<string>();
    for (const item of cart.items) {
      try {
        const product = await this.productsService.findById(item.product.toString());
        const raw = product?.category as unknown;
        if (!raw) continue;
        const id =
          typeof raw === 'object' && raw !== null && '_id' in raw
            ? String((raw as { _id: unknown })._id)
            : String(raw);
        if (id) seen.add(id);
      } catch {
        // A product may have been deleted between cart save and this lookup;
        // skip it rather than blocking the entire validation.
      }
    }
    return Array.from(seen);
  }

  private recalculateCart(cart: CartDocument): void {
    cart.subtotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    cart.total = Math.max(0, cart.subtotal - cart.discount);
  }

  private formatCartResponse(cart: CartDocument): CartResponse {
    return {
      id: cart._id.toString(),
      items: cart.items.map((item) => ({
        product: {
          id: item.product.toString(),
          name: item.name,
          slug: item.slug ?? '',
          image: item.image,
        },
        variantSku: item.variantSku,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
        gstPercentage: item.gstPercentage ?? 0,
      })),
      couponCode: cart.couponCode,
      subtotal: cart.subtotal,
      discount: cart.discount,
      total: cart.total,
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }
}
