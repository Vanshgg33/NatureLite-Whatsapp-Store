import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductVariantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  compareAtPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @IsObject()
  @IsOptional()
  attributes?: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];
}

export class BatchInfoDto {
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsString()
  @IsOptional()
  batchDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  yieldKg?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  milkLitres?: number;

  @IsString()
  @IsOptional()
  origin?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  nextBatchDays?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  purityClaims?: string[];
}

export class ProductDimensionsDto {
  @IsNumber()
  @Min(0)
  length: number;

  @IsNumber()
  @Min(0)
  width: number;

  @IsNumber()
  @Min(0)
  height: number;
}

export class ProductSeoDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  keywords?: string;

  @IsString()
  @IsOptional()
  canonicalUrl?: string;
}

export class NutritionalFactRowDto {
  @IsString()
  name: string;

  @IsString()
  per100g: string;

  @IsString()
  perServing: string;
}

export class NutritionalFactsDto {
  @IsBoolean()
  isActive: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NutritionalFactRowDto)
  rows: NutritionalFactRowDto[];
}

export class ToggleableTextField {
  @IsBoolean()
  isActive: boolean;

  @IsString()
  text: string;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  shortDescription?: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageAlts?: string[];

  @IsString()
  @IsOptional()
  videoUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  videos?: string[];

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  compareAtPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  specialOfferPrice?: number;

  @IsString()
  @IsOptional()
  specialOfferLabel?: string;

  @IsBoolean()
  @IsOptional()
  specialOfferActive?: boolean;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @IsBoolean()
  @IsOptional()
  trackStock?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  lowStockThreshold?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  @IsOptional()
  variants?: ProductVariantDto[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  weight?: number;

  @ValidateNested()
  @Type(() => ProductDimensionsDto)
  @IsOptional()
  dimensions?: ProductDimensionsDto;

  @IsNumber()
  @IsOptional()
  @Min(0)
  gstPercentage?: number;

  @IsString()
  @IsOptional()
  hsnCode?: string;

  @ValidateNested()
  @Type(() => ProductSeoDto)
  @IsOptional()
  seo?: ProductSeoDto;

  @ValidateNested()
  @Type(() => NutritionalFactsDto)
  @IsOptional()
  nutritionalFacts?: NutritionalFactsDto;

  @ValidateNested()
  @Type(() => ToggleableTextField)
  @IsOptional()
  ingredients?: ToggleableTextField;

  @ValidateNested()
  @Type(() => ToggleableTextField)
  @IsOptional()
  allergenDeclaration?: ToggleableTextField;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  relatedProducts?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  upsellProducts?: string[];

  @ValidateNested()
  @Type(() => BatchInfoDto)
  @IsOptional()
  batchInfo?: BatchInfoDto;
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  shortDescription?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageAlts?: string[];

  @IsString()
  @IsOptional()
  videoUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  videos?: string[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  compareAtPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  specialOfferPrice?: number;

  @IsString()
  @IsOptional()
  specialOfferLabel?: string;

  @IsBoolean()
  @IsOptional()
  specialOfferActive?: boolean;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @IsBoolean()
  @IsOptional()
  trackStock?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  lowStockThreshold?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  @IsOptional()
  variants?: ProductVariantDto[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  weight?: number;

  @ValidateNested()
  @Type(() => ProductDimensionsDto)
  @IsOptional()
  dimensions?: ProductDimensionsDto;

  @IsNumber()
  @IsOptional()
  @Min(0)
  gstPercentage?: number;

  @IsString()
  @IsOptional()
  hsnCode?: string;

  @ValidateNested()
  @Type(() => ProductSeoDto)
  @IsOptional()
  seo?: ProductSeoDto;

  @ValidateNested()
  @Type(() => NutritionalFactsDto)
  @IsOptional()
  nutritionalFacts?: NutritionalFactsDto;

  @ValidateNested()
  @Type(() => ToggleableTextField)
  @IsOptional()
  ingredients?: ToggleableTextField;

  @ValidateNested()
  @Type(() => ToggleableTextField)
  @IsOptional()
  allergenDeclaration?: ToggleableTextField;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  relatedProducts?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  upsellProducts?: string[];

  @ValidateNested()
  @Type(() => BatchInfoDto)
  @IsOptional()
  batchInfo?: BatchInfoDto;
}

export class ProductQueryDto {
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
  search?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isFeatured?: boolean;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  inStock?: boolean;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class UpdateStockDto {
  @IsNumber()
  @Min(0)
  stock: number;

  @IsString()
  @IsOptional()
  variantSku?: string;
}

export class BulkUpdateCategoryDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  productIds: string[];

  @IsString()
  @IsNotEmpty()
  categoryId: string;
}

export class BulkDeleteProductsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  productIds: string[];
}

