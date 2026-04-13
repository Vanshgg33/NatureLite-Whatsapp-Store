import { IsNotEmpty, IsString } from 'class-validator';

export class WhatsAppCheckoutPrepareDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  token: string;
}

export class WhatsAppCheckoutVerifyDto {
  @IsString()
  @IsNotEmpty()
  payToken: string;

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
