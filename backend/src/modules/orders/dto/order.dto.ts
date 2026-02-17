import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, PaymentMethod, PaymentStatus } from '../schemas/order.schema';

export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  pincode: string;

  @IsString()
  @IsOptional()
  landmark?: string;
}

export class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsOptional()
  variantSku?: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @IsOptional()
  items?: OrderItemDto[];

  @IsString()
  @IsOptional()
  cartId?: string;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @IsEnum(['cod', 'prepaid', 'upi', 'card', 'netbanking', 'wallet'])
  paymentMethod: PaymentMethod;

  @IsString()
  @IsOptional()
  couponCode?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded'])
  status: OrderStatus;

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  updatedBy?: string;
}

export class UpdatePaymentStatusDto {
  @IsEnum(['pending', 'paid', 'failed', 'refunded'])
  paymentStatus: PaymentStatus;

  @IsString()
  @IsOptional()
  transactionId?: string;
}

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class AddOrderNoteDto {
  @IsString()
  @IsNotEmpty()
  note: string;

  @IsString()
  @IsOptional()
  updatedBy?: string;
}

export class UpdateShippingDto {
  @IsString()
  @IsOptional()
  awbNumber?: string;

  @IsString()
  @IsOptional()
  courierName?: string;

  @IsString()
  @IsOptional()
  trackingUrl?: string;

  @IsString()
  @IsOptional()
  expectedDeliveryDate?: string;
}

export class OrderQueryDto {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsEnum(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded'])
  @IsOptional()
  status?: OrderStatus;

  @IsEnum(['pending', 'paid', 'failed', 'refunded'])
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class ReorderDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  @IsOptional()
  shippingAddress?: ShippingAddressDto;
}
