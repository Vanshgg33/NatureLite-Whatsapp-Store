import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

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
