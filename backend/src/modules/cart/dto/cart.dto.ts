import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class AddToCartDto {
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

export class UpdateCartItemDto {
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class RemoveFromCartDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsOptional()
  variantSku?: string;
}

export class ApplyCouponDto {
  @IsString()
  @IsNotEmpty()
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
    gstPercentage: number;
  }>;
  couponCode?: string;
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
}
