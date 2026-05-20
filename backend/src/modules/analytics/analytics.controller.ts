import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SnapshotPeriod } from './schemas/analytics-snapshot.schema';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboardStats(): Promise<Record<string, unknown>> {
    return this.analyticsService.getDashboardStats();
  }

  @Get('orders')
  async getOrderMetrics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<Record<string, unknown>> {
    return this.analyticsService.getOrderMetrics(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('customers')
  async getCustomerMetrics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<Record<string, unknown>> {
    return this.analyticsService.getCustomerMetrics(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('products')
  async getProductMetrics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<Record<string, unknown>> {
    return this.analyticsService.getProductMetrics(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('chat')
  async getChatMetrics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<Record<string, unknown>> {
    return this.analyticsService.getChatMetrics(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('revenue')
  async getRevenueByDay(
    @Query('days') days?: string,
  ): Promise<Array<{ date: string; revenue: number; orders: number }>> {
    return this.analyticsService.getRevenueByDay(
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('snapshots')
  async getSnapshots(
    @Query('period') period: SnapshotPeriod = 'daily',
    @Query('limit') limit?: string,
  ): Promise<unknown[]> {
    return this.analyticsService.getSnapshots(
      period,
      limit ? parseInt(limit, 10) : 30,
    );
  }

  // ==================== MULTI-STORE ANALYTICS ====================

  @Get('stores/dashboard/:storeId')
  async getStoreDashboardStats(@Param('storeId') storeId: string) {
    return this.analyticsService.getStoreDashboardStats(storeId);
  }

  @Get('stores/today')
  async getTodayRevenuePerStore() {
    return this.analyticsService.getTodayRevenuePerStore();
  }

  @Get('stores/revenue-comparison')
  async getMultiStoreRevenue(@Query('days') days?: string) {
    return this.analyticsService.getMultiStoreRevenue(
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('stores/stock-summary')
  async getStockSummaryPerStore() {
    return this.analyticsService.getStockSummaryPerStore();
  }

  @Get('stores/top-products/:storeId')
  async getTopSellingByStore(
    @Param('storeId') storeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    return this.analyticsService.getTopSellingByStore(storeId, start, end);
  }

  @Get('stores/top-products')
  async getTopSellingOverall(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    return this.analyticsService.getTopSellingOverall(start, end);
  }

  @Get('stores/month-over-month')
  async getMonthOverMonthByStore() {
    return this.analyticsService.getMonthOverMonthByStore();
  }

  @Get('stores/top-customers/:storeId')
  async getTopCustomersByStore(@Param('storeId') storeId: string) {
    return this.analyticsService.getTopCustomersByStore(storeId);
  }

  @Get('stores/top-customers')
  async getTopCustomersOverall() {
    return this.analyticsService.getTopCustomersOverall();
  }

  @Delete('reset/dashboard')
  async resetDashboardMetrics(): Promise<{ deletedSnapshots: number }> {
    return this.analyticsService.resetDashboardMetrics();
  }

  @Delete('reset/customers')
  async resetCustomerMetrics(): Promise<{ usersReset: number; productsReset: number }> {
    return this.analyticsService.resetCustomerMetrics();
  }
}
