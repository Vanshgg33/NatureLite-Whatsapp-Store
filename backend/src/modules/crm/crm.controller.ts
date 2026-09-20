// backend/src/modules/crm/crm.controller.ts
import {
  Controller, Get, Post, Patch, Put, Param, Body, Query, UseGuards, ForbiddenException,
} from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CrmService } from './crm.service';
import { CallOutcome } from './schemas/crm-call-log.schema';

@Controller('crm')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  // ─── Customers ──────────────────────────────────────────────────────────

  @Get('customers')
  getCustomers(
    @Query('segment') segment: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const agentId = user.departmentType === 'crm_senior' ? user.sub : undefined;
    return this.crm.getCustomers({
      segment, search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      agentId,
    });
  }

  @Get('customers/:id')
  getCustomer360(@Param('id') id: string) {
    return this.crm.getCustomer360(id);
  }

  // ─── Queue ───────────────────────────────────────────────────────────────

  @Get('queue')
  getQueue(
    @Query('tab') tab: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const agentId = user.departmentType === 'crm_senior' ? user.sub : undefined;
    return this.crm.getQueue({ agentId, tab: (tab as any) ?? 'all' });
  }

  @Patch('queue/:userId/assign')
  assignCustomer(
    @Param('userId') userId: string,
    @Body() body: { agentId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.departmentType === 'crm_senior') throw new ForbiddenException('Agents cannot reassign');
    return this.crm.assignCustomer(userId, body.agentId);
  }

  // ─── Call Logs ───────────────────────────────────────────────────────────

  @Post('calls')
  logCall(
    @Body() body: { customerId: string; outcome: CallOutcome; notes?: string; callbackAt?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crm.logCall({ ...body, agentId: user.sub });
  }

  @Get('calls/:customerId')
  getCallLogs(@Param('customerId') customerId: string) {
    return this.crm.getCallLogs(customerId);
  }

  // ─── Campaigns ───────────────────────────────────────────────────────────

  @Get('campaigns')
  getCampaigns(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior') throw new ForbiddenException();
    return this.crm.getCampaigns();
  }

  @Post('campaigns')
  createCampaign(
    @Body() body: { name: string; segmentFilter: string[]; waMessage: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.departmentType === 'crm_senior') throw new ForbiddenException();
    return this.crm.createCampaign({ ...body, createdById: user.sub });
  }

  @Patch('campaigns/:id/approve')
  approveCampaign(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior') throw new ForbiddenException();
    return this.crm.approveCampaign(id, user.sub);
  }

  @Post('campaigns/:id/send')
  sendCampaign(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior') throw new ForbiddenException();
    return this.crm.sendCampaign(id);
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────

  @Get('leaderboard')
  getLeaderboard() {
    return this.crm.getLeaderboard();
  }

  // ─── Analytics ───────────────────────────────────────────────────────────

  @Get('analytics')
  getAnalytics(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior') throw new ForbiddenException('Agents use /crm/leaderboard for own stats');
    return this.crm.getAnalytics();
  }

  // ─── Settings ────────────────────────────────────────────────────────────

  @Get('settings')
  getSettings(@CurrentUser() user: JwtPayload) {
    if (user.departmentType) throw new ForbiddenException('Settings restricted to admin');
    return this.crm.getSettings();
  }

  @Put('settings')
  updateSettings(
    @Body() body: { reorderCycles: Record<string, number> },
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.departmentType) throw new ForbiddenException('Settings restricted to admin');
    return this.crm.updateSettings(body.reorderCycles);
  }

  // ─── Engine ──────────────────────────────────────────────────────────────

  @Post('engine/refresh')
  triggerRefresh(@CurrentUser() user: JwtPayload) {
    if (user.departmentType) throw new ForbiddenException();
    return this.crm.triggerRefresh();
  }
}
