import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export enum UcmSyncMode {
  DryRun = 'dry_run',
  Meta = 'meta',
}

export class UpdateUcmCatalogConfigDto {
  @IsString()
  @IsOptional()
  selectedCatalogId?: string;

  @IsString()
  @IsOptional()
  selectedCatalogName?: string;

  @IsEnum(UcmSyncMode)
  @IsOptional()
  syncMode?: UcmSyncMode;

  @IsBoolean()
  @IsOptional()
  autoSyncEnabled?: boolean;
}