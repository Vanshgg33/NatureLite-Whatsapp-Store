import { Controller, Get, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { StoreStockService } from './store-stock.service';
import { SetStoreStockDto, BulkSetStockDto, StockQueryDto, StockAnalyticsQueryDto, UpdateStockAnalyticsDto } from './dto/store-stock.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';

@Controller('store-stock')
@UseGuards(RolesGuard, StoreGuard)
@Roles('admin', 'superadmin')
export class StoreStockController {
  constructor(private readonly storeStockService: StoreStockService) {}

  @Get('store/:storeId')
  @RequireAccess('ims.view', 'sales.view', 'sales.create', 'dashboard.view')
  async getStockByStore(
    @Param('storeId') storeId: string,
    @Query() query: StockQueryDto,
  ) {
    return this.storeStockService.getStockByStore(storeId, query);
  }

  @Get('product/:productId')
  @RequireAccess('ims.view', 'sales.view', 'products.view')
  async getStockForProduct(@Param('productId') productId: string) {
    return this.storeStockService.getStockForProduct(productId);
  }

  @Get('store/:storeId/product/:productId')
  @RequireAccess('ims.view', 'sales.view', 'sales.create')
  async getStockForStoreProduct(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
  ) {
    return this.storeStockService.getStockForStoreProduct(storeId, productId);
  }

  @Put()
  @RequireAccess('ims.edit')
  async setStock(@Body() dto: SetStoreStockDto, @CurrentUser() user: JwtPayload) {
    return this.storeStockService.setStock(dto, user);
  }

  @Put('bulk')
  @RequireAccess('ims.edit')
  async bulkSetStock(@Body() dto: BulkSetStockDto) {
    return this.storeStockService.bulkSetStock(dto);
  }

  @Get('store/:storeId/summary')
  @RequireAccess('ims.view', 'dashboard.view')
  async getStockSummary(@Param('storeId') storeId: string) {
    return this.storeStockService.getStockSummary(storeId);
  }

  @Get('store/:storeId/low-stock')
  @RequireAccess('ims.view', 'dashboard.view')
  async getLowStockByStore(@Param('storeId') storeId: string) {
    return this.storeStockService.getLowStockByStore(storeId);
  }

  @Get('store/:storeId/analytics')
  @RequireAccess('ims.view')
  async getStockAnalytics(
    @Param('storeId') storeId: string,
    @Query() query: StockAnalyticsQueryDto,
  ) {
    return this.storeStockService.getStockAnalytics(storeId, query);
  }

  @Put('analytics/:snapshotId')
  @RequireAccess('ims.edit')
  async updateStockAnalytics(
    @Param('snapshotId') snapshotId: string,
    @Body() dto: UpdateStockAnalyticsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeStockService.updateStockAnalytics(snapshotId, dto, user);
  }

  @Get('movements')
  @RequireAccess('ims.view')
  async getMovements(
    @Query('store') storeId: string,
    @Query('product') productId: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeStockService.getMovements(storeId, productId, limit ? parseInt(limit, 10) : 50);
  }
}
