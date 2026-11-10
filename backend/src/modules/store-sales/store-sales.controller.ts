import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, BadRequestException, ForbiddenException } from '@nestjs/common';
import { StoreSalesService } from './store-sales.service';
import { CreateStoreSaleDto, UpdateStoreSaleDto, SaleQueryDto } from './dto/store-sale.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';

@Controller('store-sales')
@UseGuards(RolesGuard, StoreGuard)
@Roles('admin', 'superadmin')
export class StoreSalesController {
  constructor(private readonly storeSalesService: StoreSalesService) {}

  /** All-stores views are for admins without a store scope; this replaces a blanket @Roles('superadmin') so access roles can grant them. */
  private assertNotStoreScoped(user: JwtPayload) {
    if (user.role !== 'superadmin' && user.storeId) throw new ForbiddenException('Only all-store admins can view this');
  }

  /** ID-only routes bypass StoreGuard, so a store-scoped admin must own the sale. */
  private async assertOwnsSale(id: string, user: JwtPayload) {
    const sale = await this.storeSalesService.findById(id);
    if (user.role !== 'superadmin' && user.storeId) {
      const store = sale.store as unknown as { _id?: { toString(): string } } & { toString(): string };
      const saleStoreId = (store?._id ?? store).toString();
      if (saleStoreId !== user.storeId) throw new ForbiddenException('You can only access your own store');
    }
    return sale;
  }

  @Post()
  @RequireAccess('sales.create')
  async create(
    @Body() dto: CreateStoreSaleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeSalesService.create(dto, user.sub);
  }

  @Get()
  @RequireAccess('sales.view', 'dashboard.view')
  async findAll(@Query() query: SaleQueryDto, @CurrentUser() user: JwtPayload) {
    this.assertNotStoreScoped(user);
    return this.storeSalesService.findAll(query);
  }

  @Get('store/:storeId')
  @RequireAccess('sales.view', 'dashboard.view')
  async findByStore(
    @Param('storeId') storeId: string,
    @Query() query: SaleQueryDto,
  ) {
    return this.storeSalesService.findByStore(storeId, query);
  }

  @Get('revenue/all-stores')
  @RequireAccess('sales.view', 'dashboard.view')
  async getRevenueAllStores(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    this.assertNotStoreScoped(user);
    const n = days ? parseInt(days, 10) : 30;
    return this.storeSalesService.getRevenueByStoreByDay(Number.isFinite(n) && n > 0 ? Math.min(n, 366) : 30);
  }

  @Get('stats/:storeId')
  @RequireAccess('sales.view', 'dashboard.view')
  async getSaleStats(
    @Param('storeId') storeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
    const end = endDate ? new Date(endDate) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new BadRequestException('Invalid startDate or endDate');
    return this.storeSalesService.getSaleStats(storeId, start, end);
  }

  @Get(':id')
  @RequireAccess('sales.view')
  async findById(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.assertOwnsSale(id, user);
  }

  @Patch(':id')
  @RequireAccess('sales.edit')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreSaleDto,
  ) {
    return this.storeSalesService.update(id, dto);
  }

  @Post(':id/invoice')
  @RequireAccess('sales.invoice')
  async storeInvoice(
    @Param('id') id: string,
    @Body('pdfBase64') pdfBase64: string,
    @Body('filename') filename: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ url: string }> {
    if (!pdfBase64) throw new BadRequestException('pdfBase64 is required');
    await this.assertOwnsSale(id, user);
    return this.storeSalesService.storeSaleInvoice(id, pdfBase64, filename || `sale_${id}.pdf`);
  }

  @Post(':id/send-invoice')
  @RequireAccess('sales.invoice')
  async sendInvoice(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<{ sent: boolean }> {
    await this.assertOwnsSale(id, user);
    return this.storeSalesService.sendSaleInvoiceToCustomer(id);
  }
}
