import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';

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
  bodyParamNames?: string[];

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
  @RequireAccess('campaigns.manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendBroadcast(
    @Body() dto: BroadcastDto,
  ): Promise<{ campaignId: string }> {
    return this.notificationsService.enqueueBroadcast(dto.phones, dto.templateName, {
      languageCode: dto.languageCode,
      headerParams: dto.headerParams,
      bodyParams: dto.bodyParams,
      bodyParamNames: dto.bodyParamNames,
      buttonParams: dto.buttonParams,
      headerImageUrl: dto.headerImageUrl,
      bodyParamFields: dto.bodyParamFields,
      recipients: dto.recipients,
    });
  }

  @Post('broadcast/media')
  @RequireAccess('campaigns.manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendMediaBroadcast(
    @Body() dto: MediaBroadcastDto,
  ): Promise<{ campaignId: string }> {
    return this.notificationsService.enqueueMediaBroadcast(dto.phones, dto.imageUrl, dto.caption, dto.mediaType, dto.mediaFilename);
  }

  @Get('campaigns')
  @RequireAccess('campaigns.view')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async listCampaigns(
    @Query('limit') limit?: string,
  ): Promise<unknown[]> {
    const parsed = limit ? parseInt(limit, 10) : 50;
    return this.notificationsService.listCampaigns(Number.isFinite(parsed) ? parsed : 50);
  }

  @Delete('campaigns')
  @RequireAccess('campaigns.manage')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async clearCampaignHistory(): Promise<{ deleted: number }> {
    return this.notificationsService.clearCampaignHistory();
  }

  @Post('campaigns/:id/retry')
  @RequireAccess('campaigns.manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async retryCampaign(@Param('id') id: string): Promise<{ campaignId: string }> {
    return this.notificationsService.retryCampaign(id);
  }

  @Post('campaigns/:id/cancel')
  @RequireAccess('campaigns.manage')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async cancelCampaign(@Param('id') id: string): Promise<void> {
    return this.notificationsService.cancelCampaign(id);
  }

  @Get('template-presets')
  @RequireAccess('campaigns.view')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async listTemplatePresets(): Promise<unknown[]> {
    return this.notificationsService.listTemplatePresets();
  }

  @Post('template-presets')
  @RequireAccess('campaigns.manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async upsertTemplatePreset(@Body() body: {
    templateName: string;
    languageCode: string;
    headerParams: string;
    buttonParams: string;
    bodyParamRows: { value: string; field: string }[];
    tplImageMethod: string;
    tplImageUrl: string;
  }): Promise<unknown> {
    return this.notificationsService.upsertTemplatePreset(body);
  }

  @Delete('template-presets/:id')
  @RequireAccess('campaigns.manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async deleteTemplatePreset(@Param('id') id: string): Promise<void> {
    return this.notificationsService.deleteTemplatePreset(id);
  }
}
