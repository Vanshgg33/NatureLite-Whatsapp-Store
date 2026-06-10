import { IsString, IsOptional, IsDateString, IsArray, IsNotEmpty } from 'class-validator';

export class GetLedgerDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  deliveryUserId?: string;
}

export class SettleCollectionDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  orderIds: string[];

  @IsString()
  @IsOptional()
  note?: string;
}
