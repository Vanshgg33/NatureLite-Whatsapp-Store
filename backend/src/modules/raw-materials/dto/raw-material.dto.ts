import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, MaxLength } from 'class-validator';

export class CreateRawMaterialDto {
  @IsString()
  @IsNotEmpty()
  storeId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  unit?: string;

}

export class UpsertDailyEntryDto {
  @IsNumber()
  @Min(0)
  openingStock: number;

  @IsNumber()
  @Min(0)
  stockIn: number;

  @IsNumber()
  @Min(0)
  processed: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outputLitres?: number;

  @IsString()
  @IsOptional()
  adminPassword?: string;

  @IsString() @IsOptional() @MaxLength(40)
  machine?: string;

  @IsString() @IsOptional() @MaxLength(80)
  operator?: string;

  @IsString() @IsOptional() @MaxLength(500)
  note?: string;
}

export class RawMaterialQueryDto {
  @IsString()
  @IsOptional()
  search?: string;
}

export class RawMaterialAnalyticsQueryDto {
  @IsString()
  @IsOptional()
  date?: string;
}

export class UpdateRawMaterialAnalyticsDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  openingStock?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockIn?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  processed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outputLitres?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  closing?: number;

  @IsString()
  @IsNotEmpty()
  adminPassword: string;
}
