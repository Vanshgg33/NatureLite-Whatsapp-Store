import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
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
}
