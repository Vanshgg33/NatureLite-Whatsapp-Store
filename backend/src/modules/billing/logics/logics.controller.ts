import { Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common'
import { LogicsService } from './logics.service'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { RequireAccess } from '../../../common/decorators/require-access.decorator'

// Serves /api/v1/billing/logics (global prefix adds api/v1).
@Controller('billing/logics')
@UseGuards(JwtAuthGuard)
export class LogicsController {
  constructor(private readonly svc: LogicsService) {}

  private requireAdmin(req: any) {
    if (!['admin', 'superadmin'].includes(req.user?.role)) throw new ForbiddenException('Admin only')
  }

  @Get()
  @RequireAccess('billing_logics.view')
  registry(@Req() req: any) {
    this.requireAdmin(req)
    return this.svc.registry()
  }

  /** The bill screen needs the formulas in force to preview totals; any billing user may read them. */
  @Get('active')
  @RequireAccess('billing_new.view', 'billing_new.create')
  async active(@Query('date') date?: string) {
    const d = date ? new Date(date) : new Date() // same parsing as the invoice date on save
    const { version, formulas } = await this.svc.formulasFor(isNaN(d.getTime()) ? new Date() : d)
    return { version, formulas }
  }

  @Post('formulas/test')
  @RequireAccess('billing_logics.edit')
  test(@Body('formulas') formulas: unknown, @Req() req: any) {
    this.requireAdmin(req)
    return this.svc.test(formulas)
  }

  @Post('formulas')
  @RequireAccess('billing_logics.edit')
  publish(@Body() b: { formulas: unknown; startsOn: string; reason: string }, @Req() req: any) {
    this.requireAdmin(req)
    return this.svc.publish(b.formulas, b.startsOn, b.reason, req.user.sub, req.ip)
  }

  @Post('params')
  @RequireAccess('billing_logics.edit')
  setParam(@Body() b: { key: string; value: unknown; startsOn: string; reason: string }, @Req() req: any) {
    this.requireAdmin(req)
    return this.svc.setParam(b.key, b.value, b.startsOn, b.reason, req.user.sub, req.ip)
  }
}
