import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Settings } from './schemas/settings.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { AccessGuard } from '../../common/guards/access.guard';

// Appearance page keys; everything else needs settings.edit.
const APPEARANCE_KEYS = ['appearance', 'banners'];

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly access: AccessGuard,
  ) {}

  @Public()
  @Get('public')
  async getPublicSettings(): Promise<Record<string, Record<string, unknown>>> {
    return this.settingsService.getPublicSettings();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async getAllSettings(): Promise<Record<string, Record<string, unknown>>> {
    return this.settingsService.getAllSettings();
  }

  @Get(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async getSettings(@Param('key') key: string): Promise<Record<string, unknown> | null> {
    return this.settingsService.get(key);
  }

  @Put(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  async setSettings(
    @Param('key') key: string,
    @Body() value: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
  ): Promise<Settings> {
    return this.settingsService.set(key, value, userId);
  }

  @Put(':key/update')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async updateSettings(
    @Param('key') key: string,
    @Body() updates: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ): Promise<Settings> {
    await this.access.assertAccess(user, [APPEARANCE_KEYS.includes(key) ? 'admin.appearance.edit' : 'admin.settings.edit']);
    return this.settingsService.update(key, updates, user.sub);
  }
}
