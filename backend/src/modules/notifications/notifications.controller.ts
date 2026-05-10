import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

class BroadcastDto {
  phones: string[];
  templateName: string;
  params?: string[];
  languageCode?: string;
  headerParams?: string[];
  bodyParams?: string[];
  buttonParams?: string[];
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('broadcast')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendBroadcast(
    @Body() dto: BroadcastDto,
  ): Promise<{ queued: number; skipped: number }> {
    return this.notificationsService.sendBroadcast(
      dto.phones,
      dto.templateName,
      dto.params ?? [],
      {
        languageCode: dto.languageCode,
        headerParams: dto.headerParams,
        bodyParams: dto.bodyParams,
        buttonParams: dto.buttonParams,
      },
    );
  }
}
