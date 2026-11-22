import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireAccess } from '../../../common/decorators/require-access.decorator';
import { CashDrawerService } from './cash-drawer.service';

const who = (req: any) => ({ userId: String(req.user?.sub ?? req.user?._id ?? 'system'), name: String(req.user?.name ?? req.user?.email ?? '') });

/** Cash drawer: viewing for billing admins; opening count, adjustments, end-of-day count and settings for superadmin only. */
@Controller('billing/cash-drawer')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class CashDrawerController {
  constructor(private readonly drawer: CashDrawerService) {}

  @Get()
  // the counter on New Bill, Record Payment and Cancel reads it too
  @RequireAccess('billing_cash_drawer.view', 'billing_new.view', 'billing_dues.record', 'billing_new.cancel')
  get(@Query('storeId') storeId: string) {
    return this.drawer.get(storeId);
  }

  @Get('txns')
  @RequireAccess('billing_cash_drawer.view')
  txns(@Query() q: any) {
    return this.drawer.listTxns(q.storeId, q); // format=csv returns the CSV text inside the usual JSON envelope; the page saves it
  }

  @Get('verify')
  @RequireAccess('billing_cash_drawer.view')
  verify(@Query('storeId') storeId: string) {
    return this.drawer.verify(storeId);
  }

  @Post('opening-count')
  @Roles('superadmin')
  openingCount(@Body() b: any, @Req() req: any) {
    return this.drawer.openingCount(b?.storeId, b?.counts, b?.clientRequestId, who(req));
  }

  @Post('adjust')
  @Roles('superadmin')
  adjust(@Body() b: any, @Req() req: any) {
    return this.drawer.adjust(b?.storeId, b ?? {}, who(req));
  }

  @Post('reconcile')
  @Roles('superadmin')
  reconcile(@Body() b: any, @Req() req: any) {
    return this.drawer.reconcile(b?.storeId, b ?? {}, who(req));
  }

  @Patch('settings')
  @Roles('superadmin')
  settings(@Body() b: any, @Req() req: any) {
    return this.drawer.updateSettings(b?.storeId, b ?? {}, who(req));
  }
}
