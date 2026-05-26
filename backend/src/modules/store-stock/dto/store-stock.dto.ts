import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsBoolean, ValidateNested, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SetStoreStockDto {
  @IsString()
  @IsNotEmpty()
  storeId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockInDelta?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  returnedDelta?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  damagedDelta?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  saleLogDelta?: number;

  @IsString()
  @IsOptional()
  variantSku?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number;

  @IsString()
  @IsOptional()
  adminPassword?: string;
}

export class BulkStockItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0)
  stock: number;

  @IsString()
  @IsOptional()
  variantSku?: string;
}

export class BulkSetStockDto {
  @IsString()
  @IsNotEmpty()
  storeId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkStockItemDto)
  items: BulkStockItemDto[];
}

export class StockAnalyticsQueryDto {
  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;
}

export class UpdateStockAnalyticsDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  stockInDelta?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  returnedDelta?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  damagedDelta?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  saleLogDelta?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalStock?: number;

  @IsString()
  @IsNotEmpty()
  adminPassword: string;
}

export class StockQueryDto {
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  page?: number;

  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  lowStockOnly?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  inStockOnly?: boolean;
}
