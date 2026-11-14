import { Body, Controller, ForbiddenException, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { CrmLogicsService } from './crm-logics.service';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireAccess } from '../../../common/decorators/require-access.decorator';

// Serves /api/v1/crm/logics. Same audience as CRM Settings: managers and admins, not junior agents or viewers.
@Controller('crm/logics')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class CrmLogicsController {
  constructor(private readonly svc: CrmLogicsService) {}

  private managersOnly(req: any) {
    if (req.user?.departmentType === 'crm_senior' || req.user?.departmentType === 'crm_viewer') throw new ForbiddenException('Logics is for managers and admins');
  }

  @Get()
  @RequireAccess('crm_logics.view')
  registry(@Req() req: any) { this.managersOnly(req); return this.svc.registry(); }

  @Post('preview')
  @RequireAccess('crm_logics.view')
  preview(@Body() b: { formulas?: unknown; values?: unknown }, @Req() req: any) { this.managersOnly(req); return this.svc.preview(b?.formulas, b?.values); }

  @Post('formulas')
  @RequireAccess('crm_logics.edit')
  publish(@Body() b: { formulas: unknown; reason: string; baseVersion?: unknown }, @Req() req: any) {
    this.managersOnly(req);
    const base = Number.isInteger(b.baseVersion) ? (b.baseVersion as number) : undefined;
    return this.svc.publishFormulas(b.formulas, b.reason, req.user.sub, req.ip, base);
  }

  @Put('values')
  @RequireAccess('crm_logics.edit')
  setValues(@Body() b: { values: unknown; reason: string }, @Req() req: any) { this.managersOnly(req); return this.svc.setValues(b.values, b.reason, req.user.sub, req.ip); }
}
