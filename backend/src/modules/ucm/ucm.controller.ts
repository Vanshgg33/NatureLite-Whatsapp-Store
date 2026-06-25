import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdateUcmCatalogConfigDto } from './dto/ucm.dto';
import { UcmService } from './ucm.service';

@Controller('ucm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class UcmController {
  constructor(private readonly ucmService: UcmService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.ucmService.getDashboardSnapshot();
  }

  @Get('catalogs')
  async listCatalogs() {
    return this.ucmService.listRemoteCatalogs();
  }

  @Get('config')
  async getConfig() {
    return this.ucmService.getCatalogState();
  }

  @Put('config')
  async updateConfig(@Body() dto: UpdateUcmCatalogConfigDto, @CurrentUser('sub') userId: string) {
    return this.ucmService.updateCatalogConfig(dto, userId);
  }

  @Post('sync')
  async syncAll(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.ucmService.pushCatalogToMeta('manual_sync', this.extractActor(user, req));
  }

  @Post('sync/pull')
  async pullCatalog() {
    return this.ucmService.pullCatalogToDatabase('manual_pull');
  }

  @Post('sync/push')
  async pushCatalog(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.ucmService.pushCatalogToMeta('manual_push', this.extractActor(user, req));
  }

  @Post('sync/:productId')
  async syncProduct(
    @Param('productId') productId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    await this.ucmService.syncProductById(productId, 'manual_sync', this.extractActor(user, req));
    return { success: true };
  }

  @Delete('catalogs/:catalogId')
  async deleteCatalog(@Param('catalogId') catalogId: string) {
    await this.ucmService.deleteRemoteCatalog(catalogId);
    return { success: true };
  }

  private extractActor(user: JwtPayload, req: Request): { userId: string; userPhone: string; ipAddress: string } {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
      : (req.socket?.remoteAddress ?? req.ip ?? 'unknown');
    return { userId: user?.sub ?? '', userPhone: user?.phone ?? '', ipAddress: ip };
  }
}