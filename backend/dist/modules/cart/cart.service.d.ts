import { CartDocument } from './schemas/cart.schema';
import { CartRepository } from './repositories/cart.repository';
import { ProductsService } from '../products/products.service';
import { CouponsService } from '../coupons/coupons.service';
import { AddToCartDto, UpdateCartItemDto, CartResponse } from './dto/cart.dto';
export declare class CartService {
    private readonly cartRepository;
    private productsService;
    private couponsService;
    constructor(cartRepository: CartRepository, productsService: ProductsService, couponsService: CouponsService);
    getCart(userId: string): Promise<CartResponse>;
    addItem(userId: string, dto: AddToCartDto): Promise<CartResponse>;
    updateItemQuantity(userId: string, productId: string, dto: UpdateCartItemDto, variantSku?: string): Promise<CartResponse>;
    removeItem(userId: string, productId: string, variantSku?: string): Promise<CartResponse>;
    clearCart(userId: string): Promise<CartResponse>;
    applyCoupon(userId: string, couponCode: string): Promise<CartResponse>;
    removeCoupon(userId: string): Promise<CartResponse>;
    markAsAbandoned(cartId: string): Promise<void>;
    getAbandonedCarts(minutesOld: number, limit?: number): Promise<CartDocument[]>;
    markAbandonedReminderSent(cartId: string): Promise<void>;
    private findOrCreateCart;
    private recalculateCart;
    private formatCartResponse;
}
