// backend/src/modules/crm/crm.controller.ts
import {
  Controller, Get, Post, Patch, Put, Delete, Param, Body, Query, UseGuards,
  ForbiddenException, BadRequestException, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CrmService } from './crm.service';
import { CrmFoundationService } from './crm-foundation.service';
import { CallOutcome } from './schemas/crm-call-log.schema';
import { RequireAccess } from '../../common/decorators/require-access.decorator';

@Controller('crm')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class CrmController {
  constructor(private readonly crm: CrmService, private readonly foundation: CrmFoundationService) {}

  private managersOnly(user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
  }

  // ─── Customers ──────────────────────────────────────────────────────────

  @Get('customers')
  @RequireAccess('crm_customers.view')
  getCustomers(
    @Query('segment') segment: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('isEscalated') isEscalated: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const agentId = user.departmentType === 'crm_senior' ? user.sub : undefined;
    return this.crm.getCustomers({
      segment, search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      agentId,
      isEscalated: isEscalated === 'true',
    });
  }

  @Get('customers/:id')
  @RequireAccess('crm_customers.view', 'crm_caller.view')
  getCustomer360(@Param('id') id: string) {
    return this.crm.getCustomer360(id);
  }

  // ─── Queue ───────────────────────────────────────────────────────────────

  @Get('queue')
  @RequireAccess('crm_queue.view', 'crm_caller.view', 'crm_today.view')
  getQueue(
    @Query('tab') tab: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const agentId = user.departmentType === 'crm_senior' ? user.sub : undefined;
    return this.crm.getQueue({ agentId, tab: (tab as any) ?? 'all' });
  }

  @Get('abandoned')
  @RequireAccess('crm_abandoned.view')
  getAbandoned(@Query('days') days: string, @CurrentUser() user: JwtPayload) {
    const agentId = user.departmentType === 'crm_senior' ? user.sub : undefined;
    return this.crm.getAbandoned({ days: parseInt(days), agentId });
  }

  @Get('chat/:userId')
  @RequireAccess('crm_customers.view', 'crm_caller.view', 'crm_queue.view')
  getChat(@Param('userId') userId: string, @CurrentUser() user: JwtPayload) {
    const agentId = user.departmentType === 'crm_senior' ? user.sub : undefined;
    return this.crm.getChat(userId, agentId);
  }

  @Patch('queue/:userId/snooze')
  @RequireAccess('crm_queue.act')
  snoozeCustomer(@Param('userId') userId: string, @Body() body: { until: string }) {
    return this.crm.snoozeCustomer(userId, body.until);
  }

  @Patch('queue/:userId/dismiss')
  @RequireAccess('crm_queue.act')
  dismissCustomer(@Param('userId') userId: string) {
    return this.crm.dismissCustomer(userId);
  }

  @Patch('queue/:userId/escalate')
  @RequireAccess('crm_queue.act')
  escalateCustomer(@Param('userId') userId: string) {
    return this.crm.escalateCustomer(userId);
  }

  @Patch('queue/:userId/assign')
  @RequireAccess('crm_queue.act')
  assignCustomer(
    @Param('userId') userId: string,
    @Body() body: { agentId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException('Agents cannot reassign');
    return this.crm.assignCustomer(userId, body.agentId);
  }

  // ─── Call Logs ───────────────────────────────────────────────────────────

  @Post('calls')
  @RequireAccess('crm_caller.log')
  logCall(
    @Body() body: { customerId: string; outcome: CallOutcome; notes?: string; callbackAt?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crm.logCall({ ...body, agentId: user.sub, agentName: user.name ?? 'Agent' });
  }

  @Get('calls/:customerId')
  @RequireAccess('crm_caller.view', 'crm_customers.view')
  getCallLogs(@Param('customerId') customerId: string) {
    return this.crm.getCallLogs(customerId);
  }

  @Post('calls/:id/recording')
  @RequireAccess('crm_caller.log')
  @UseInterceptors(FileInterceptor('recording', {
    storage: memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  uploadRecording(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No recording file provided');
    return this.crm.attachRecording(id, file);
  }

  // ─── Campaigns ───────────────────────────────────────────────────────────

  @Get('campaigns')
  @RequireAccess('crm_campaigns.view')
  getCampaigns(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.getCampaigns();
  }

  @Post('campaigns')
  @RequireAccess('crm_campaigns.create')
  createCampaign(
    @Body() body: { name: string; segmentFilter: string[]; waMessage: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.createCampaign({ ...body, createdById: user.sub });
  }

  @Patch('campaigns/:id/approve')
  @RequireAccess('crm_campaigns.approve')
  approveCampaign(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.approveCampaign(id, user.sub);
  }

  @Post('campaigns/:id/send')
  @RequireAccess('crm_campaigns.send')
  sendCampaign(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.sendCampaign(id);
  }

  @Delete('campaigns/:id')
  @RequireAccess('crm_campaigns.delete')
  cancelCampaign(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.cancelCampaign(id);
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────

  @Get('leaderboard')
  @RequireAccess('crm_analytics.view')
  getLeaderboard() {
    return this.crm.getLeaderboard();
  }

  // ─── Analytics ───────────────────────────────────────────────────────────

  @Get('analytics')
  @RequireAccess('crm_analytics.view')
  getAnalytics(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException('Agents use /crm/leaderboard for own stats');
    return this.crm.getAnalytics();
  }

  // ─── Settings ────────────────────────────────────────────────────────────

  @Get('settings')
  @RequireAccess('crm_settings.view', 'crm_queue.view', 'crm_caller.view', 'crm_today.view')
  getSettings(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException('Settings restricted to managers and admins');
    return this.crm.getSettings();
  }

  @Put('settings')
  @RequireAccess('crm_settings.edit')
  updateSettings(
    @Body() body: {
      reorderCycles?: Record<string, number>;
      fallbackCycleDays?: number;
      thresholds?: { atRiskAfterDays: number; dormantAfterDays: number; lostAfterDays: number };
      vip?: { minOrders: number; minLifetimeValue: number };
      dailyCallTarget?: number;
      scripts?: Record<string, string>;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException('Settings restricted to managers and admins');
    return this.crm.updateSettings(body);
  }

  // ─── Notes ───────────────────────────────────────────────────────────────

  @Post('customers/:id/notes')
  @RequireAccess('crm_customers.edit')
  addNote(
    @Param('id') id: string,
    @Body() body: { text: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crm.addNote(id, user.sub, body.text, user.name ?? 'Agent');
  }

  @Patch('customers/:id/notes/:noteId/delete')
  @RequireAccess('crm_customers.edit')
  deleteNote(@Param('id') id: string, @Param('noteId') noteId: string) {
    return this.crm.deleteNote(id, noteId);
  }

  @Patch('customers/:id/tags')
  @RequireAccess('crm_customers.edit')
  setTags(@Param('id') id: string, @Body() body: { tags: string[] }) {
    return this.crm.setTags(id, body.tags ?? []);
  }

  // ─── WhatsApp Nudge ──────────────────────────────────────────────────────

  @Post('nudge')
  @RequireAccess('crm_customers.edit')
  logNudge(
    @Body() body: { customerId: string; templateName: string; message: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crm.logNudge({ ...body, agentId: user.sub, agentName: user.name ?? 'Agent' });
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────

  @Get('metrics')
  @RequireAccess('crm_today.view', 'crm_analytics.view')
  getMetrics(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.getMetrics();
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────

  @Get('dashboard')
  @RequireAccess('crm_today.view', 'crm_analytics.view')
  getDashboard(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.getDashboard();
  }

  // ─── Reorder Calendar ────────────────────────────────────────────────────

  @Get('calendar')
  @RequireAccess('crm_today.view')
  getCalendar(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.getCalendar();
  }

  // ─── Engine ──────────────────────────────────────────────────────────────

  @Post('engine/refresh')
  @RequireAccess('crm_today.view', 'crm_queue.view')
  triggerRefresh(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.triggerRefresh();
  }

  // ─── CRM Admin — Employee Management (crm_head / crm_manager / superadmin) ─

  private requireCrmAdmin(user: JwtPayload): void {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') {
      throw new ForbiddenException('CRM admin access required');
    }
  }

  @Get('admin/live')
  @RequireAccess('crm_team.view')
  getLiveView(@CurrentUser() user: JwtPayload) {
    this.requireCrmAdmin(user);
    return this.crm.getLiveView();
  }

  @Get('admin/employees')
  @RequireAccess('crm_team.view')
  listEmployees(@CurrentUser() user: JwtPayload) {
    this.requireCrmAdmin(user);
    return this.crm.listCrmEmployees();
  }

  @Post('admin/employees')
  @RequireAccess('crm_team.manage')
  createEmployee(
    @Body() body: { name: string; email: string; loginId?: string; departmentType: 'crm_manager' | 'crm_senior' | 'crm_viewer' },
    @CurrentUser() user: JwtPayload,
  ) {
    this.requireCrmAdmin(user);
    return this.crm.createCrmEmployee(body);
  }

  @Patch('admin/employees/:id')
  @RequireAccess('crm_team.manage')
  updateEmployee(
    @Param('id') id: string,
    @Body() body: { departmentType?: string; isActive?: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    this.requireCrmAdmin(user);
    return this.crm.updateCrmEmployee(id, body);
  }

  @Post('admin/employees/:id/reset-password')
  @RequireAccess('crm_team.manage')
  resetEmployeePassword(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.requireCrmAdmin(user);
    return this.crm.resetCrmEmployeePassword(id);
  }

  @Post('admin/employees/:id/force-logout')
  @RequireAccess('crm_team.manage')
  forceEmployeeLogout(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.requireCrmAdmin(user);
    return this.crm.forceCrmEmployeeLogout(id);
  }

  @Get('admin/employees/:id/analytics')
  @RequireAccess('crm_team.view')
  getEmployeeAnalytics(
    @Param('id') id: string,
    @Query('days') days: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.requireCrmAdmin(user);
    return this.crm.getEmployeeStats(id, days ? parseInt(days) : 30);
  }

  // ─── Product catalog (read-only) ─────────────────────────────────────────

  @Get('products')
  @RequireAccess('crm_products.view', 'crm_campaigns.view')
  getCrmProducts(@Query('search') search: string) {
    return this.crm.getCrmProducts(search);
  }

  // ─── Orders, sync health, duplicates (blueprint Phase 1) ──────────────────

  @Get('orders')
  @RequireAccess('crm_orders.view')
  listOrders(
    @Query('status') status: string, @Query('search') search: string, @Query('from') from: string,
    @Query('to') to: string, @Query('page') page: string, @Query('limit') limit: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.managersOnly(user);
    return this.foundation.listOrders({ status, search, from, to, page: parseInt(page) || 1, limit: parseInt(limit) || 25 });
  }

  @Get('sync/health')
  @RequireAccess('crm_orders.view')
  syncHealth(@CurrentUser() user: JwtPayload) {
    this.managersOnly(user);
    return this.foundation.syncHealth();
  }

  @Get('duplicates')
  @RequireAccess('crm_duplicates.view')
  duplicates(@CurrentUser() user: JwtPayload) {
    this.managersOnly(user);
    return this.foundation.findDuplicates();
  }

  // ─── Heartbeat ───────────────────────────────────────────────────────────

  @Post('heartbeat')
  logHeartbeat(@CurrentUser() user: JwtPayload) {
    this.crm.heartbeat(user.sub, user.name ?? 'Agent');
    return { ok: true };
  }
}
