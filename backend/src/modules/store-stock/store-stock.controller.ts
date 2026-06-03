import { Controller, Get, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { StoreStockService } from './store-stock.service';
import { SetStoreStockDto, BulkSetStockDto, StockQueryDto, StockAnalyticsQueryDto, UpdateStockAnalyticsDto } from './dto/store-stock.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller('store-stock')
@UseGuards(RolesGuard, StoreGuard)
@Roles('admin', 'superadmin')
export class StoreStockController {
  constructor(private readonly storeStockService: StoreStockService) {}

  @Get('store/:storeId')
  async getStockByStore(
    @Param('storeId') storeId: string,
    @Query() query: StockQueryDto,
  ) {
    return this.storeStockService.getStockByStore(storeId, query);
  }

  @Get('product/:productId')
  async getStockForProduct(@Param('productId') productId: string) {
    return this.storeStockService.getStockForProduct(productId);
  }

  @Get('store/:storeId/product/:productId')
  async getStockForStoreProduct(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
  ) {
    return this.storeStockService.getStockForStoreProduct(storeId, productId);
  }

  @Put()
  async setStock(@Body() dto: SetStoreStockDto, @CurrentUser() user: JwtPayload) {
    return this.storeStockService.setStock(dto, user);
  }

  @Put('bulk')
  async bulkSetStock(@Body() dto: BulkSetStockDto) {
    return this.storeStockService.bulkSetStock(dto);
  }

  @Get('store/:storeId/summary')
  async getStockSummary(@Param('storeId') storeId: string) {
    return this.storeStockService.getStockSummary(storeId);
  }

  @Get('store/:storeId/low-stock')
  async getLowStockByStore(@Param('storeId') storeId: string) {
    return this.storeStockService.getLowStockByStore(storeId);
  }

  @Get('store/:storeId/analytics')
  async getStockAnalytics(
    @Param('storeId') storeId: string,
    @Query() query: StockAnalyticsQueryDto,
  ) {
    return this.storeStockService.getStockAnalytics(storeId, query);
  }

  @Put('analytics/:snapshotId')
  async updateStockAnalytics(
    @Param('snapshotId') snapshotId: string,
    @Body() dto: UpdateStockAnalyticsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeStockService.updateStockAnalytics(snapshotId, dto, user);
  }
}
