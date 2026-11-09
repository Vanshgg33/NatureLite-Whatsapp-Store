import { Controller, Get, Post, Param, Body, Req, UseGuards, ForbiddenException } from '@nestjs/common'
import { TaxSettingsService } from './tax-settings.service'
import { CreateRuleDto } from './dto/create-rule.dto'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

// The global prefix already adds api/v1, so this serves /api/v1/settings/tax.
@Controller('settings/tax')
@UseGuards(JwtAuthGuard)
export class TaxSettingsController {
  constructor(private readonly svc: TaxSettingsService) {}

  private requireAdmin(req: any) {
    if (!['admin', 'superadmin'].includes(req.user?.role)) throw new ForbiddenException('Admin only')
  }

  @Get('rules')
  getRules(@Req() req: any) {
    this.requireAdmin(req)
    return this.svc.getRules()
  }

  @Post('rules')
  createRule(@Body() dto: CreateRuleDto, @Req() req: any) {
    this.requireAdmin(req)
    return this.svc.createRule(dto, req.user.sub, req.ip)
  }

  @Post('rules/:id/cancel')
  cancelRule(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    this.requireAdmin(req)
    return this.svc.cancelRule(id, reason, req.user.sub, req.ip)
  }

  @Get('params')
  getParams(@Req() req: any) {
    this.requireAdmin(req)
    return this.svc.getAllParams()
  }

  @Get('changelog')
  getChangelog(@Req() req: any) {
    this.requireAdmin(req)
    return this.svc.getChangelog()
  }
}
