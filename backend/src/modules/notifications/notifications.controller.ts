import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

class BroadcastDto {
  phones: string[];
  templateName: string;
  languageCode?: string;
  headerParams?: string[];
  bodyParams?: string[];
  buttonParams?: string[];
  headerImageUrl?: string;
}

class MediaBroadcastDto {
  phones: string[];
  imageUrl: string;
  caption?: string;
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
    });
  }

  @Post('broadcast/media')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendMediaBroadcast(
    @Body() dto: MediaBroadcastDto,
  ): Promise<{ campaignId: string }> {
    return this.notificationsService.enqueueMediaBroadcast(dto.phones, dto.imageUrl, dto.caption);
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
