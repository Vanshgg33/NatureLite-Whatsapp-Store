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

  // ─── Products (billing-enriched search) ───────────────────────────────────

  @Get('products/search')
  searchProducts(@Query('q') q: string) {
    return this.billingService.searchProductsForBilling(q);
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

  // ─── Bills ────────────────────────────────────────────────────────────────

  @Post('bills')
  createBill(@Body() body: {
    customerId: string;
    billingAddress?: string;
    orderTag: string;
    items: Array<{
      productId: string;
      name: string;
      sku: string;
      hsnCode?: string;
      qty: number;
      unitPrice: number;
      gstRate: number;
    }>;
    amountPaid: number;
    notes?: string;
  }) {
    return this.billingService.createBill(body);
  }

  @Get('bills')
  getBills(@Query() q: {
    customerId?: string;
    paymentStatus?: string;
    orderTag?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    limit?: string;
  }) {
    return this.billingService.getBills({
      ...q,
      page: q.page ? parseInt(q.page) : undefined,
      limit: q.limit ? parseInt(q.limit) : undefined,
    });
  }

  @Get('bills/:id')
  getBill(@Param('id') id: string) {
    return this.billingService.getBill(id);
  }

  @Post('bills/:id/payment')
  recordPayment(@Param('id') id: string, @Body() body: { amount: number }) {
    return this.billingService.recordPayment(id, body.amount);
  }
}
