import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsEnum, ValidateNested, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SaleItemDto {
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

export class CreateStoreSaleDto {
  @IsString()
  @IsNotEmpty()
  storeId: string;

  @IsEnum(['walk_in', 'delivery'])
  saleType: 'walk_in' | 'delivery';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  @IsOptional()
  customerAlternatePhone?: string;

  @IsString()
  @IsOptional()
  customerAddress?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discount?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  paymentProofUrl?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  images?: string[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  reminderMessage?: string;

  @IsString()
  @IsOptional()
  reminderDueAt?: string;
}

export class UpdateStoreSaleDto {
  @IsString()
  @IsNotEmpty()
  storeId: string;

  @IsEnum(['walk_in', 'delivery', 'website'])
  @IsOptional()
  saleType?: 'walk_in' | 'delivery' | 'website';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  @IsOptional()
  items?: SaleItemDto[];

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  @IsOptional()
  customerAlternatePhone?: string;

  @IsString()
  @IsOptional()
  customerAddress?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discount?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  paymentProofUrl?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  images?: string[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class SaleQueryDto {
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  page?: number;

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number;

  @IsEnum(['walk_in', 'delivery', 'website'])
  @IsOptional()
  saleType?: 'walk_in' | 'delivery' | 'website';

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  search?: string;
}
