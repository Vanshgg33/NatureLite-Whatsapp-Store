import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller('purchase')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  // ─── Materials ─────────────────────────────────────────────────────────

  @Get('materials')
  getMaterials(@Query('all') all?: string) {
    return this.purchaseService.getMaterials(all !== 'true');
  }

  @Post('materials')
  createMaterial(@Body() body: { name: string; category?: string }) {
    return this.purchaseService.createMaterial(body);
  }

  @Patch('materials/:id')
  updateMaterial(
    @Param('id') id: string,
    @Body() body: { name?: string; category?: string; isActive?: boolean },
  ) {
    return this.purchaseService.updateMaterial(id, body);
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

  @Post('requests/:id/decision')
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

  @Post('requests/:id/receive')
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
  setDeadline(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { dueAt: string },
  ) {
    return this.purchaseService.setDeadline(id, user, body.dueAt);
  }

  @Post('requests/:id/cancel')
  cancelRequest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { reason: string },
  ) {
    return this.purchaseService.cancelRequest(id, user, body.reason);
  }
}
