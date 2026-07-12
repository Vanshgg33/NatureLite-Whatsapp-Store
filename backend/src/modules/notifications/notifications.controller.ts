import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

class BroadcastDto {
  @IsArray()
  @IsString({ each: true })
  phones: string[];

  @IsString()
  @IsNotEmpty()
  templateName: string;

  @IsString()
  @IsOptional()
  languageCode?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  headerParams?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bodyParams?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  buttonParams?: string[];

  @IsString()
  @IsOptional()
  headerImageUrl?: string;

  /** Per-slot binding: 'static' | 'customer_name' for each body param */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bodyParamFields?: string[];

  /** Recipients with names for dynamic variable resolution */
  @IsOptional()
  recipients?: { phone: string; name?: string }[];
}

class MediaBroadcastDto {
  @IsArray()
  @IsString({ each: true })
  phones: string[];

  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsString()
  @IsOptional()
  mediaType?: string;

  @IsString()
  @IsOptional()
  mediaFilename?: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('broadcast')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendBroadcast(
    @Body() dto: BroadcastDto,
  ): Promise<{ campaignId: string }> {
    return this.notificationsService.enqueueBroadcast(dto.phones, dto.templateName, {
      languageCode: dto.languageCode,
      headerParams: dto.headerParams,
      bodyParams: dto.bodyParams,
      buttonParams: dto.buttonParams,
      headerImageUrl: dto.headerImageUrl,
      bodyParamFields: dto.bodyParamFields,
      recipients: dto.recipients,
    });
  }

  @Post('broadcast/media')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendMediaBroadcast(
    @Body() dto: MediaBroadcastDto,
  ): Promise<{ campaignId: string }> {
    return this.notificationsService.enqueueMediaBroadcast(dto.phones, dto.imageUrl, dto.caption, dto.mediaType, dto.mediaFilename);
  }

  @Get('campaigns')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async listCampaigns(
    @Query('limit') limit?: string,
  ): Promise<unknown[]> {
    const parsed = limit ? parseInt(limit, 10) : 50;
    return this.notificationsService.listCampaigns(Number.isFinite(parsed) ? parsed : 50);
  }
}
