import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument, CartItem } from './schemas/cart.schema';
import { ProductsService } from '../products/products.service';
import { CouponsService } from '../coupons/coupons.service';
import { AddToCartDto, UpdateCartItemDto, CartResponse } from './dto/cart.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private cartModel: Model<CartDocument>,
    private productsService: ProductsService,
    private couponsService: CouponsService,
  ) {}

  async getCart(userId: string): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);
    return this.formatCartResponse(cart);
  }

  async addItem(userId: string, dto: AddToCartDto): Promise<CartResponse> {
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

    if (product.trackStock && stock < dto.quantity) {
      throw new BadRequestException('Not enough stock available');
    }

    const existingItemIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === dto.productId &&
        item.variantSku === dto.variantSku,
    );

    if (existingItemIndex >= 0) {
      const newQuantity = cart.items[existingItemIndex].quantity + dto.quantity;

      if (product.trackStock && stock < newQuantity) {
        throw new BadRequestException('Not enough stock available');
      }

      cart.items[existingItemIndex].quantity = newQuantity;
    } else {
      const cartItem: CartItem = {
        product: new Types.ObjectId(dto.productId),
        variantSku: dto.variantSku,
        quantity: dto.quantity,
        price,
        name: product.name,
        image: product.images[0],
        addedAt: new Date(),
      };

      cart.items.push(cartItem);
    }

    this.recalculateCart(cart);
    await cart.save();

    return this.formatCartResponse(cart);
  }

  async updateItemQuantity(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
    variantSku?: string,
  ): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId &&
        item.variantSku === variantSku,
    );

    if (itemIndex < 0) {
      throw new NotFoundException('Item not found in cart');
    }

    const product = await this.productsService.findById(productId);
    let stock = product.stock;

    if (variantSku) {
      const variant = product.variants.find((v) => v.sku === variantSku);
      if (variant) {
        stock = variant.stock;
      }
    }

    if (product.trackStock && stock < dto.quantity) {
      throw new BadRequestException('Not enough stock available');
    }

    cart.items[itemIndex].quantity = dto.quantity;

    this.recalculateCart(cart);
    await cart.save();

    return this.formatCartResponse(cart);
  }

  async removeItem(
    userId: string,
    productId: string,
    variantSku?: string,
  ): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId &&
        item.variantSku === variantSku,
    );

    if (itemIndex < 0) {
      throw new NotFoundException('Item not found in cart');
    }

    cart.items.splice(itemIndex, 1);

    this.recalculateCart(cart);
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

    const validation = await this.couponsService.validateCoupon({
      code: couponCode,
      orderAmount: cart.subtotal,
      userId,
    });

    if (!validation.valid) {
      throw new BadRequestException(validation.message);
    }

    cart.couponCode = couponCode;
    cart.discount = validation.discountAmount;

    this.recalculateCart(cart);
    await cart.save();

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
    await this.cartModel.updateOne(
      { _id: new Types.ObjectId(cartId) },
      { abandonedAt: new Date() },
    );
  }

  async getAbandonedCarts(
    minutesOld: number,
    limit: number = 100,
  ): Promise<Cart[]> {
    const cutoffTime = new Date(Date.now() - minutesOld * 60 * 1000);

    return this.cartModel
      .find({
        updatedAt: { $lt: cutoffTime },
        abandonedAt: { $exists: false },
        abandonedReminderSent: false,
        'items.0': { $exists: true },
      })
      .populate('user', 'phone name')
      .limit(limit)
      .exec();
  }

  async markAbandonedReminderSent(cartId: string): Promise<void> {
    await this.cartModel.updateOne(
      { _id: new Types.ObjectId(cartId) },
      { abandonedReminderSent: true },
    );
  }

  private async findOrCreateCart(userId: string): Promise<CartDocument> {
    let cart = await this.cartModel.findOne({
      user: new Types.ObjectId(userId),
    });

    if (!cart) {
      cart = new this.cartModel({
        user: new Types.ObjectId(userId),
        items: [],
        subtotal: 0,
        discount: 0,
        total: 0,
      });
      await cart.save();
    }

    return cart;
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
          slug: '',
          image: item.image,
        },
        variantSku: item.variantSku,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      })),
      couponCode: cart.couponCode,
      subtotal: cart.subtotal,
      discount: cart.discount,
      total: cart.total,
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }
}
