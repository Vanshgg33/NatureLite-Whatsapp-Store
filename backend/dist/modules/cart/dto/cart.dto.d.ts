export declare class AddToCartDto {
    productId: string;
    variantSku?: string;
    quantity: number;
}
export declare class UpdateCartItemDto {
    quantity: number;
}
export declare class RemoveFromCartDto {
    productId: string;
    variantSku?: string;
}
export declare class ApplyCouponDto {
    couponCode: string;
}
export interface CartResponse {
    id: string;
    items: Array<{
        product: {
            id: string;
            name: string;
            slug: string;
            image?: string;
        };
        variantSku?: string;
        quantity: number;
        price: number;
        total: number;
    }>;
    couponCode?: string;
    subtotal: number;
    discount: number;
    total: number;
    itemCount: number;
}
