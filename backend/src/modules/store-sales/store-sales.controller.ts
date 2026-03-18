import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { StoreSalesService } from './store-sales.service';
import { CreateStoreSaleDto, UpdateStoreSaleDto, SaleQueryDto } from './dto/store-sale.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller('store-sales')
@UseGuards(RolesGuard, StoreGuard)
@Roles('admin', 'superadmin')
export class StoreSalesController {
  constructor(private readonly storeSalesService: StoreSalesService) {}

  @Post()
  async create(
    @Body() dto: CreateStoreSaleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeSalesService.create(dto, user.sub);
  }

  @Get()
  @Roles('superadmin')
  async findAll(@Query() query: SaleQueryDto) {
    return this.storeSalesService.findAll(query);
  }

  @Get('store/:storeId')
  async findByStore(
    @Param('storeId') storeId: string,
    @Query() query: SaleQueryDto,
  ) {
    return this.storeSalesService.findByStore(storeId, query);
  }

  @Get('revenue/all-stores')
  @Roles('superadmin')
  async getRevenueAllStores(@Query('days') days?: string) {
    return this.storeSalesService.getRevenueByStoreByDay(
      days ? parseInt(days) : 30,
    );
  }

  @Get('stats/:storeId')
  async getSaleStats(
    @Param('storeId') storeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
    const end = endDate ? new Date(endDate) : new Date();
    return this.storeSalesService.getSaleStats(storeId, start, end);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.storeSalesService.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreSaleDto,
  ) {
    return this.storeSalesService.update(id, dto);
  }
}
