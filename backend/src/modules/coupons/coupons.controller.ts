import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CouponsService, CouponValidationResult } from './coupons.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
  CouponQueryDto,
} from './dto/coupon.dto';
import { Coupon } from './schemas/coupon.schema';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { PaginatedResult } from '@/common/types/pagination.types';

@Controller('coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  @Roles('admin', 'superadmin')
  async create(@Body() dto: CreateCouponDto): Promise<Coupon> {
    return this.couponsService.create(dto);
  }

  @Get()
  @Roles('admin', 'superadmin')
  async findAll(@Query() query: CouponQueryDto): Promise<PaginatedResult<Coupon>> {
    return this.couponsService.findAll(query);
  }

  @Get('active')
  @Roles('admin', 'superadmin')
  async getActiveCoupons(): Promise<Coupon[]> {
    return this.couponsService.getActiveCoupons();
  }

  @Post('validate')
  async validateCoupon(@Body() dto: ValidateCouponDto): Promise<CouponValidationResult> {
    return this.couponsService.validateCoupon(dto);
  }

  @Get(':id')
  @Roles('admin', 'superadmin')
  async findOne(@Param('id') id: string): Promise<Coupon> {
    return this.couponsService.findById(id);
  }

  @Get('code/:code')
  @Roles('admin', 'superadmin')
  async findByCode(@Param('code') code: string): Promise<Coupon> {
    return this.couponsService.findByCode(code);
  }

  @Put(':id')
  @Roles('admin', 'superadmin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<Coupon> {
    return this.couponsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'superadmin')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.couponsService.delete(id);
    return { message: 'Coupon deleted successfully' };
  }
}
