import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreatePaymentOrderDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;
}

export class VerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  razorpay_order_id: string;

  @IsString()
  @IsNotEmpty()
  razorpay_payment_id: string;

  @IsString()
  @IsNotEmpty()
  razorpay_signature: string;
}

export class InitiateRefundDto {
  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
