import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  async syncAll() {
    return this.ucmService.syncAllProducts('manual_sync');
  }

  @Post('sync/:productId')
  async syncProduct(@Param('productId') productId: string) {
    await this.ucmService.syncProductById(productId, 'manual_sync');
    return { success: true };
  }

  @Delete('catalogs/:catalogId')
  async deleteCatalog(@Param('catalogId') catalogId: string) {
    await this.ucmService.deleteRemoteCatalog(catalogId);
    return { success: true };
  }
}