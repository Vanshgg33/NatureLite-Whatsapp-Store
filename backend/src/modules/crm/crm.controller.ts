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
import { CrmInsightsService } from './crm-insights.service';
import { CrmOpsService } from './crm-ops.service';
import { parseExtraFilters } from './crm-filters';
import { CallOutcome } from './schemas/crm-call-log.schema';
import { RequireAccess } from '../../common/decorators/require-access.decorator';

@Controller('crm')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class CrmController {
  constructor(private readonly crm: CrmService, private readonly foundation: CrmFoundationService, private readonly insights: CrmInsightsService, private readonly ops: CrmOpsService) {}

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
    @Query() allQuery: Record<string, string>,
    @CurrentUser() user: JwtPayload,
  ) {
    const agentId = user.departmentType === 'crm_senior' ? user.sub : undefined;
    return this.crm.getCustomers({
      extra: parseExtraFilters(allQuery),
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
    return this.crm.setTags(id, Array.isArray(body?.tags) ? body.tags : []);
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

  // ─── Segments, subscriptions, reports, attribution, acquisition (blueprint M09/M07/M27/M26/M20) ──

  @Get('segments')
  @RequireAccess('crm_segments.view')
  segments(@CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.insights.segments(); }

  @Get('subscriptions')
  @RequireAccess('crm_subscriptions.view')
  subscriptions(@CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.insights.subscriptions(); }

  @Get('reports/investor')
  @RequireAccess('crm_investor.view')
  investor(@CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.insights.investor(); }

  @Get('attribution')
  @RequireAccess('crm_attribution.view')
  attribution(@Query('days') days: string, @CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.insights.attribution(parseInt(days) || 7); }

  @Get('acquisition')
  @RequireAccess('crm_acquisition.view')
  acquisition(@Query('month') month: string, @CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.insights.acquisition(month); }

  @Post('spend')
  @RequireAccess('crm_acquisition.edit')
  addSpend(@Body() body: any, @CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.insights.addSpend(body); }

  @Delete('spend/:id')
  @RequireAccess('crm_acquisition.edit')
  deleteSpend(@Param('id') id: string, @CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.insights.deleteSpend(id); }

  @Get('views')
  @RequireAccess('crm_customers.view')
  views(@CurrentUser() user: JwtPayload) { return this.ops.listViews(user.sub); }

  @Post('views')
  @RequireAccess('crm_customers.view')
  saveView(@Body() body: any, @CurrentUser() user: JwtPayload) { return this.ops.saveView(user.sub, body, user.departmentType !== 'crm_senior'); }

  @Delete('views/:id')
  @RequireAccess('crm_customers.view')
  deleteView(@Param('id') id: string, @CurrentUser() user: JwtPayload) { return this.ops.deleteView(id, user.sub, user.departmentType !== 'crm_senior'); }

  @Post('bulk/tag')
  @RequireAccess('crm_customers.edit')
  bulkTag(@Body() body: any, @CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.ops.bulkAddTag(body?.ids, body?.tag); }

  // ─── Goals, callbacks, leads, walk-ins, feedback, audit, inbox, intelligence, integrations ──

  @Get('goals')
  @RequireAccess('crm_goals.view')
  goals(@Query('month') month: string, @CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.ops.goals(month); }

  @Put('goals')
  @RequireAccess('crm_goals.edit')
  setGoal(@Body() body: any, @CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.ops.setGoal(body); }

  @Get('callbacks')
  @RequireAccess('crm_callbacks.view')
  callbacks(@CurrentUser() user: JwtPayload) {
    return this.ops.callbacks(user.departmentType === 'crm_senior' ? user.sub : undefined);
  }

  @Get('leads')
  @RequireAccess('crm_leads.view')
  leads(@Query('stage') stage: string) { return this.ops.leads(stage); }

  @Post('leads')
  @RequireAccess('crm_leads.edit')
  addLead(@Body() body: any, @CurrentUser() user: JwtPayload) { return this.ops.addLead(body, user.sub); }

  @Patch('leads/:id/stage')
  @RequireAccess('crm_leads.edit')
  setLeadStage(@Param('id') id: string, @Body() body: any) { return this.ops.setLeadStage(id, body?.stage, body?.lostReason); }

  @Get('walkins/stats')
  @RequireAccess('crm_walkins.view')
  walkinStats() { return this.ops.walkinStats(); }

  @Post('walkins')
  @RequireAccess('crm_walkins.edit')
  addWalkin(@Body() body: any, @CurrentUser() user: JwtPayload) { return this.ops.addWalkin(body, user.sub); }

  @Get('feedback')
  @RequireAccess('crm_feedback.view')
  feedback(@CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.ops.feedbackSummary(); }

  @Get('audit')
  @RequireAccess('crm_audit.view')
  audit(@Query('action') action: string, @CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.ops.audit(action); }

  @Get('inbox')
  @RequireAccess('crm_inbox.view')
  inbox(@CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.ops.inbox(); }

  @Get('inbox/:phone')
  @RequireAccess('crm_inbox.view')
  thread(@Param('phone') phone: string, @CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.ops.thread(phone); }

  @Get('intelligence')
  @RequireAccess('crm_intelligence.view')
  intelligence(@CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.ops.intelligence(); }

  @Get('integrations')
  @RequireAccess('crm_integrations.view')
  integrations(@CurrentUser() user: JwtPayload) { this.managersOnly(user); return this.ops.integrations(); }

  // ─── Heartbeat ───────────────────────────────────────────────────────────

  @Post('heartbeat')
  logHeartbeat(@CurrentUser() user: JwtPayload) {
    this.crm.heartbeat(user.sub, user.name ?? 'Agent');
    return { ok: true };
  }
}
