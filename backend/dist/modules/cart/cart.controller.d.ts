import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto, ApplyCouponDto, CartResponse } from './dto/cart.dto';
export declare class CartController {
    private readonly cartService;
    constructor(cartService: CartService);
    getCart(userId: string): Promise<CartResponse>;
    addItem(userId: string, dto: AddToCartDto): Promise<CartResponse>;
    updateItemQuantity(userId: string, productId: string, variantSku: string | undefined, dto: UpdateCartItemDto): Promise<CartResponse>;
    removeItem(userId: string, productId: string, variantSku?: string): Promise<CartResponse>;
    clearCart(userId: string): Promise<CartResponse>;
    applyCoupon(userId: string, dto: ApplyCouponDto): Promise<CartResponse>;
    removeCoupon(userId: string): Promise<CartResponse>;
}
