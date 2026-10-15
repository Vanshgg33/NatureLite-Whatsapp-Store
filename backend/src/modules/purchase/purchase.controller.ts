import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller('purchase')
@UseGuards(PermissionGuard)
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  // ─── Materials ─────────────────────────────────────────────────────────

  @Post('materials/seed')
  seedMaterials() {
    return this.purchaseService.seedDefaultMaterials();
  }

  @Get('materials')
  getMaterials(@Query('all') all?: string) {
    return this.purchaseService.getMaterials(all !== 'true');
  }

  @Post('materials')
  @RequirePermission('materials.manage')
  createMaterial(@Body() body: { name: string; category?: string; uom?: string }) {
    return this.purchaseService.createMaterial(body);
  }

  @Post('materials/bulk')
  @RequirePermission('materials.manage')
  bulkAddMaterials(@Body() body: { names: string[]; uom: string; defaultTagId?: string }) {
    return this.purchaseService.bulkAddMaterials(body.names, body.uom, body.defaultTagId);
  }

  @Patch('materials/:id')
  @RequirePermission('materials.manage')
  updateMaterial(
    @Param('id') id: string,
    @Body() body: { name?: string; category?: string; isActive?: boolean; uom?: string; defaultTagId?: string },
  ) {
    return this.purchaseService.updateMaterial(id, body);
  }

  // ─── Item line aggregation ────────────────────────────────────────────────

  @Get('items')
  getItems(@Query() q: { tags?: string; status?: string; q?: string }) {
    return this.purchaseService.getItems(q);
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  @Get('tags')
  getTags(@Query('all') all?: string) {
    return this.purchaseService.getTags(all !== 'true');
  }

  @Post('tags/seed')
  @RequirePermission('tags.manage')
  seedTags() {
    return this.purchaseService.seedDefaultTags();
  }

  @Post('tags')
  @RequirePermission('tags.manage')
  createTag(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.purchaseService.createTag(body, { userId: user.sub, name: user.name });
  }

  @Patch('tags/:id')
  @RequirePermission('tags.manage')
  updateTag(@Param('id') id: string, @Body() body: any) {
    return this.purchaseService.updateTag(id, body);
  }

  // ─── Vendors ─────────────────────────────────────────────────────────────

  @Get('vendors')
  getVendors(@Query('all') all?: string) {
    return this.purchaseService.getVendors(all !== 'true');
  }

  @Post('vendors')
  @RequirePermission('vendors.manage')
  createVendor(@Body() body: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
    paymentTerms?: string;
  }) {
    return this.purchaseService.createVendor(body);
  }

  @Patch('vendors/:id')
  @RequirePermission('vendors.manage')
  updateVendor(
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      gstin?: string;
      paymentTerms?: string;
      isActive?: boolean;
    },
  ) {
    return this.purchaseService.updateVendor(id, body);
  }

  @Delete('vendors/:id')
  @RequirePermission('vendors.manage')
  deleteVendor(@Param('id') id: string) {
    return this.purchaseService.deleteVendor(id);
  }

  // ─── Stats ─────────────────────────────────────────────────────────────

  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload) {
    return this.purchaseService.getStats(
      user.sub,
      user.purchaseRole,
      user.role === 'superadmin',
    );
  }

  @Get('summary')
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.purchaseService.getPurchaseSummary(
      user.sub,
      user.purchaseRole,
      user.role === 'superadmin',
    );
  }

  // ─── Requests ──────────────────────────────────────────────────────────

  @Get('requests')
  getRequests(
    @Query() query: { status?: string; mine?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.purchaseService.getRequests({
      status: query.status,
      mine: query.mine === 'true',
      userId: user.sub,
    });
  }

  @Post('requests')
  @RequirePermission('pr.create')
  createRequest(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      items: Array<{ materialId: string; materialName: string; qtyKg: number }>;
      note?: string;
    },
  ) {
    return this.purchaseService.createRequest(user, body);
  }

  @Get('requests/:id')
  getRequest(@Param('id') id: string) {
    return this.purchaseService.getRequest(id);
  }

  @Post('requests/:id/po')
  @RequirePermission('po.raise')
  createPO(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      vendorName: string;
      vendorPhone?: string;
      vendorAddress?: string;
      items: Array<{ materialId: string; materialName: string; qtyKg: number; ratePerKg: number }>;
      expectedDelivery?: string;
      terms?: string;
    },
  ) {
    return this.purchaseService.createPO(id, user, body);
  }

  @Post('requests/:id/split-po')
  @RequirePermission('po.raise')
  splitPO(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      items: Array<{
        materialId: string;
        materialName: string;
        qtyKg: number;
        ratePerKg: number;
        vendorName: string;
        vendorPhone?: string;
        vendorAddress?: string;
        terms?: string;
      }>;
      expectedDelivery?: string;
    },
  ) {
    return this.purchaseService.splitPO(id, user, body);
  }

  @Post('requests/:id/drop-item')
  @RequirePermission('po.raise')
  dropItem(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { itemId: string; reason: string },
  ) {
    return this.purchaseService.dropItem(id, body.itemId, body.reason, user);
  }

  @Post('requests/:id/decision')
  @RequirePermission('po.approve')
  makeDecision(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { action: 'APPROVED' | 'REJECTED'; reason?: string },
  ) {
    return this.purchaseService.makeDecision(id, user, body);
  }

  @Post('requests/:id/vendor-bill')
  uploadVendorBill(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { url: string; name: string; mime: string; publicId: string },
  ) {
    return this.purchaseService.uploadVendorBill(id, user, body);
  }

  @Delete('requests/:id/vendor-bill/:publicId')
  deleteVendorBill(
    @Param('id') id: string,
    @Param('publicId') publicId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.purchaseService.deleteVendorBill(id, decodeURIComponent(publicId), user);
  }

  @Post('requests/:id/receive')
  @RequirePermission('delivery.receive')
  receiveGoods(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      gateBill: { url: string; name: string; mime: string; publicId: string };
      receivedItems: Array<{ materialName: string; orderedKg: number; receivedKg: number }>;
      remarks?: string;
    },
  ) {
    return this.purchaseService.receiveGoods(id, user, body);
  }

  @Post('requests/:id/deadline')
  @RequirePermission('deadline.set')
  setDeadline(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { dueAt: string },
  ) {
    return this.purchaseService.setDeadline(id, user, body.dueAt);
  }

  @Post('requests/:id/cancel')
  @RequirePermission('request.cancel')
  cancelRequest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { reason: string },
  ) {
    return this.purchaseService.cancelRequest(id, user, body.reason);
  }

  // ─── FMS User management ───────────────────────────────────────────────────

  @Get('users')
  @RequirePermission('users.manage')
  getFmsUsers() {
    return this.purchaseService.getFmsUsers();
  }

  @Post('users')
  @RequirePermission('users.manage')
  createFmsUser(@Body() body: any) {
    return this.purchaseService.createFmsUser(body);
  }

  @Patch('users/:id')
  @RequirePermission('users.manage')
  updateFmsUser(@Param('id') id: string, @Body() body: any) {
    return this.purchaseService.updateFmsUser(id, body);
  }

  @Post('users/:id/photo')
  @RequirePermission('users.manage')
  setUserPhoto(@Param('id') id: string, @Body() body: { photoUrl: string }) {
    return this.purchaseService.setUserPhoto(id, body.photoUrl);
  }

  @Post('users/:id/reset-password')
  @RequirePermission('users.manage')
  resetFmsUserPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
    return this.purchaseService.resetFmsUserPassword(id, body.newPassword);
  }
}
