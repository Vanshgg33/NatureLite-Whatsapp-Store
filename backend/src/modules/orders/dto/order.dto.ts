import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
  IsIn,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ORDER_STATUS_VALUES, type OrderStatus } from '../../../common/constants/order-status';
import type { PaymentMethod, PaymentStatus } from '../schemas/order.schema';
import type { DeliveryWorkflowStep } from '../../../common/types/order-types';

const ORDER_STATUS_LIST = [...ORDER_STATUS_VALUES] as OrderStatus[];

export class ShippingAddressDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10,}$/, { message: 'Phone must be at least 10 digits' })
  phone: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  alternatePhone?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  street: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  city: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  state: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Pincode must be exactly 6 digits' })
  pincode?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
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

  /**
   * Optional wallet amount in rupees the customer wants to apply.
   * Backend will cap this based on actual wallet balance and payable amount.
   */
  @IsNumber()
  @IsOptional()
  @Min(0)
  walletAmount?: number;

  /**
   * When the same user repeats a checkout with the same key, the existing order is returned (no double charge / duplicate rows).
   */
  @IsString()
  @IsOptional()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  orderType?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  adminDiscount?: number;

  @IsString()
  @IsOptional()
  scheduledFor?: string;
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUS_LIST)
  status: OrderStatus;

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  updatedBy?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  assignedToName?: string;

  @IsString()
  @IsOptional()
  assignedToPhone?: string;
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

  @IsIn(ORDER_STATUS_LIST)
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

  @IsOptional()
  forPacking?: boolean;

  @IsOptional()
  forBilling?: boolean;

  @IsOptional()
  forDelivery?: boolean;

  @IsString()
  @IsOptional()
  deliveryUserId?: string;

  @IsString()
  @IsOptional()
  city?: string;
}

export class AssignDeliveryDto {
  @IsString()
  @IsNotEmpty()
  deliveryUserId: string;
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

export class UpdateDeliveryWorkflowDto {
  @IsEnum(['delivery_done', 'customer_ringing', 'customer_cancelled', 'customer_tomorrow', 'unpaid', 'partial_payment'])
  status: DeliveryWorkflowStep;

  @IsEnum(['cash', 'upi'])
  @IsOptional()
  paymentMethod?: 'cash' | 'upi';

  @IsString()
  @IsOptional()
  paymentProofUrl?: string;

  @IsString()
  @IsOptional()
  deliveryProofUrl?: string;

  @IsNumber()
  @IsOptional()
  amountCollected?: number;

  @IsNumber()
  @IsOptional()
  cashAmount?: number;

  @IsNumber()
  @IsOptional()
  upiAmount?: number;

  @IsString()
  @IsOptional()
  note?: string;
}

export class RequestReturnDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class GuestCreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

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

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  name?: string;

  /**
   * Optional wallet amount in rupees the customer wants to apply.
   * Backend will cap this based on actual wallet balance and payable amount.
   */
  @IsNumber()
  @IsOptional()
  @Min(0)
  walletAmount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  orderType?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  adminDiscount?: number;

  @IsString()
  @IsOptional()
  scheduledFor?: string;
}

export class UpdateOrderDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  paymentStatus?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  adminNotes?: string;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  @IsOptional()
  shippingAddress?: ShippingAddressDto;

  @IsString()
  @IsOptional()
  paymentProofUrl?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @IsOptional()
  items?: OrderItemDto[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  discount?: number;
}
