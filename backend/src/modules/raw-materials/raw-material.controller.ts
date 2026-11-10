import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { RawMaterialService } from './raw-material.service';
import {
  CreateRawMaterialDto,
  UpsertDailyEntryDto,
  RawMaterialQueryDto,
  RawMaterialAnalyticsQueryDto,
  UpdateRawMaterialAnalyticsDto,
} from './dto/raw-material.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';

@Controller('raw-materials')
@UseGuards(RolesGuard, StoreGuard)
@Roles('admin', 'superadmin')
export class RawMaterialController {
  constructor(private readonly rawMaterialService: RawMaterialService) {}

  @Get('store/:storeId')
  @RequireAccess('pms.view', 'rms.view')
  async getByStore(
    @Param('storeId') storeId: string,
    @Query() query: RawMaterialQueryDto,
  ) {
    return this.rawMaterialService.getByStore(storeId, query);
  }

  @Get('store/:storeId/analytics')
  @RequireAccess('pms.view', 'rms.view')
  async getAnalytics(
    @Param('storeId') storeId: string,
    @Query() query: RawMaterialAnalyticsQueryDto,
  ) {
    return this.rawMaterialService.getAnalytics(storeId, query);
  }

  @Put('analytics/:entryId')
  @RequireAccess('pms.edit', 'rms.edit')
  async updateAnalyticsEntry(
    @Param('entryId') entryId: string,
    @Body() dto: UpdateRawMaterialAnalyticsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rawMaterialService.updateAnalyticsEntry(entryId, dto, user);
  }

  @Get(':id/prefill')
  @RequireAccess('pms.view', 'rms.view')
  async getPrefill(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rawMaterialService.getTodayPrefill(id, user.storeId);
  }

  @Post()
  @RequireAccess('pms.create')
  async create(@Body() dto: CreateRawMaterialDto) {
    return this.rawMaterialService.create(dto);
  }

  @Put(':id/entry')
  @RequireAccess('pms.edit', 'rms.edit')
  async upsertEntry(@Param('id') id: string, @Body() dto: UpsertDailyEntryDto, @CurrentUser() user: JwtPayload) {
    return this.rawMaterialService.upsertTodayEntry(id, dto, user.storeId, user);
  }

  @Delete(':id')
  @RequireAccess('pms.delete')
  async softDelete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.rawMaterialService.softDelete(id, user.storeId);
    return { message: 'Deleted' };
  }
}
