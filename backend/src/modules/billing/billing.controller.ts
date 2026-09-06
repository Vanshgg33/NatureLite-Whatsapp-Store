import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CustomerTag } from './schemas/billing-customer.schema';

@Controller('billing')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ─── Customers ────────────────────────────────────────────────────────────

  @Get('customers')
  searchCustomers(@Query('q') q: string) {
    return this.billingService.searchCustomers(q);
  }

  @Get('customers/:id')
  getCustomer(@Param('id') id: string) {
    return this.billingService.getCustomer(id);
  }

  @Post('customers')
  createCustomer(@Body() body: {
    name: string;
    phone: string;
    altPhone?: string;
    gstNo?: string;
    tags?: CustomerTag[];
    addresses?: Array<{ label: string; line: string; isDefault?: boolean }>;
  }) {
    return this.billingService.createCustomer(body);
  }

  @Patch('customers/:id')
  updateCustomer(
    @Param('id') id: string,
    @Body() body: Partial<{
      altPhone: string;
      gstNo: string;
      tags: CustomerTag[];
      addresses: Array<{ label: string; line: string; isDefault: boolean }>;
    }>,
  ) {
    return this.billingService.updateCustomer(id, body);
  }

  @Post('customers/:id/addresses')
  addAddress(
    @Param('id') id: string,
    @Body() body: { label: string; line: string; isDefault?: boolean },
  ) {
    return this.billingService.addAddress(id, body);
  }

  // ─── Tag Prices ───────────────────────────────────────────────────────────

  @Get('tag-prices')
  getTagPrices(@Query('productId') productId?: string) {
    return this.billingService.getTagPrices(productId);
  }

  @Post('tag-prices')
  upsertTagPrice(@Body() body: { productId: string; tag: CustomerTag; price: number }) {
    return this.billingService.upsertTagPrice(body.productId, body.tag, body.price);
  }

  @Delete('tag-prices/:id')
  deleteTagPrice(@Param('id') id: string) {
    return this.billingService.deleteTagPrice(id);
  }

  @Post('tag-prices/bulk')
  bulkUpsert(@Body() body: Array<{ productId: string; tag: CustomerTag; price: number }>) {
    return this.billingService.bulkUpsertTagPrices(body);
  }
}
