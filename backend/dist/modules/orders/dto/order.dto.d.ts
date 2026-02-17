import { OrderStatus, PaymentMethod, PaymentStatus } from '../schemas/order.schema';
export declare class ShippingAddressDto {
    name: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
}
export declare class OrderItemDto {
    productId: string;
    variantSku?: string;
    quantity: number;
}
export declare class CreateOrderDto {
    items?: OrderItemDto[];
    cartId?: string;
    shippingAddress: ShippingAddressDto;
    paymentMethod: PaymentMethod;
    couponCode?: string;
    notes?: string;
}
export declare class UpdateOrderStatusDto {
    status: OrderStatus;
    message?: string;
    updatedBy?: string;
}
export declare class UpdatePaymentStatusDto {
    paymentStatus: PaymentStatus;
    transactionId?: string;
}
export declare class CancelOrderDto {
    reason: string;
}
export declare class AddOrderNoteDto {
    note: string;
    updatedBy?: string;
}
export declare class UpdateShippingDto {
    awbNumber?: string;
    courierName?: string;
    trackingUrl?: string;
    expectedDeliveryDate?: string;
}
export declare class OrderQueryDto {
    page?: number;
    limit?: number;
    userId?: string;
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    search?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export declare class ReorderDto {
    orderId: string;
    shippingAddress?: ShippingAddressDto;
}
