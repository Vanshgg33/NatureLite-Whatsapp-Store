import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BillingStockService } from './billing-stock.service';
import { CustomerTag } from './schemas/billing-customer.schema';
import { RequireAccess } from '../../common/decorators/require-access.decorator';

@Controller('billing')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class BillingController {
  constructor(private readonly billingService: BillingService, private readonly stock: BillingStockService) {}

  // ─── Customers ────────────────────────────────────────────────────────────

  @Get('customers')
  @RequireAccess('billing_customers.view', 'billing_new.view', 'billing_reports.view')
  searchCustomers(@Query('q') q: string) {
    return this.billingService.searchCustomers(q);
  }

  @Get('customers/:id')
  @RequireAccess('billing_customers.view', 'billing_new.view', 'billing_reports.view')
  getCustomer(@Param('id') id: string) {
    return this.billingService.getCustomer(id);
  }

  @Post('customers')
  @RequireAccess('billing_customers.create', 'billing_new.create')
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
  @RequireAccess('billing_customers.edit', 'billing_new.create')
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
  @RequireAccess('billing_customers.create', 'billing_new.create')
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
  @RequireAccess('billing_pricing.edit')
  upsertTagPrice(@Body() body: { productId: string; tag: CustomerTag; price: number }) {
    return this.billingService.upsertTagPrice(body.productId, body.tag, body.price);
  }

  @Delete('tag-prices/:id')
  @RequireAccess('billing_pricing.edit')
  deleteTagPrice(@Param('id') id: string) {
    return this.billingService.deleteTagPrice(id);
  }

  @Post('tag-prices/bulk')
  @RequireAccess('billing_pricing.edit')
  bulkUpsert(@Body() body: Array<{ productId: string; tag: CustomerTag; price: number }>) {
    return this.billingService.bulkUpsertTagPrices(body);
  }

  // ─── Godowns ──────────────────────────────────────────────────────────────

  @Get('godowns')
  getGodowns() {
    return this.billingService.getGodowns();
  }

  // ─── Bills ────────────────────────────────────────────────────────────────

  @Patch('customers/:id/default-delivery')
  @RequireAccess('billing_customers.edit', 'billing_new.create')
  setDefaultDelivery(
    @Param('id') id: string,
    @Body() body: { deliveryUserId: string | null },
  ) {
    return this.billingService.setDefaultDelivery(id, body.deliveryUserId);
  }

  @Post('bills')
  @RequireAccess('billing_new.create')
  createBill(@Body() body: {
    customerId: string;
    billingAddress?: string;
    orderTag: string;
    deliveryUserId?: string;
    deliveryUserName?: string;
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

  @Post('bills/v1')
  @RequireAccess('billing_new.create')
  createBillV1(@Body() body: any, @Req() req: any) {
    const userId = req.user?._id?.toString() ?? 'system';
    const ip = req.ip ?? '';
    // only a super admin may sell below zero stock, and only with a reason (logged on the bill)
    const canOverrideStock = String(req.user?.role ?? '').toLowerCase() === 'superadmin';
    return this.billingService.createBillV1(body, userId, ip, canOverrideStock);
  }

  @Get('stock/availability')
  @RequireAccess('billing_new.view')
  stockAvailability(@Query('ids') ids = '') {
    return this.stock.availability(ids.split(',').filter(Boolean));
  }

  @Post('bills/:id/whatsapp/retry')
  @RequireAccess('billing_new.create')
  retryWhatsapp(@Param('id') id: string) {
    return this.billingService.retryWhatsapp(id);
  }

  @Patch('bills/:id/cancel')
  @RequireAccess('billing_new.cancel')
  cancelBill(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    const userId = req.user?._id?.toString() ?? 'system';
    const ip = req.ip ?? '';
    return this.billingService.cancelBill(id, reason, userId, ip);
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
  @RequireAccess('billing_dues.record')
  recordPayment(@Param('id') id: string, @Body() body: { amount: number; mode?: string }) {
    return this.billingService.recordPayment(id, body.amount, body.mode);
  }

  // ─── Dues ──────────────────────────────────────────────────────────────────

  @Get('dues')
  @RequireAccess('billing_dues.view')
  getDues(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.billingService.getDues(startDate || endDate ? { startDate, endDate } : undefined);
  }

  // ─── Insights ──────────────────────────────────────────────────────────────

  @Get('insights/customers')
  @RequireAccess('billing_insights.view')
  getTopCustomers(
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: 'totalPurchase' | 'orderCount',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.billingService.getTopCustomers(limit ? parseInt(limit) : 200, sortBy ?? 'totalPurchase', startDate, endDate);
  }

  @Get('insights/top-products')
  @RequireAccess('billing_insights.view')
  getTopProductPerCustomer(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.billingService.getTopProductPerCustomer(startDate, endDate);
  }

  // ─── GSTR-1 ────────────────────────────────────────────────────────────────

  @Get('gstr1')
  @RequireAccess('billing_gstr1.view')
  getGstr1(@Query('month') month?: string) {
    return this.billingService.getGstr1(month);
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  @RequireAccess('billing_dashboard.view')
  getDashboard() {
    return this.billingService.getDashboard();
  }

  // ─── Reports ───────────────────────────────────────────────────────────────

  @Get('reports/products')
  @RequireAccess('billing_reports.view')
  getProductReport(@Query() q: { startDate?: string; endDate?: string; orderTag?: string; customerId?: string }) {
    return this.billingService.getProductReport(q);
  }

  @Get('reports/customers')
  @RequireAccess('billing_reports.view')
  getCustomerReport(@Query() q: { startDate?: string; endDate?: string; orderTag?: string; productSku?: string; customerId?: string }) {
    return this.billingService.getCustomerReport(q);
  }
}
