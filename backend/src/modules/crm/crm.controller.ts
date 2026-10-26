// backend/src/modules/crm/crm.controller.ts
import {
  Controller, Get, Post, Patch, Put, Param, Body, Query, UseGuards,
  ForbiddenException, BadRequestException, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

  @Patch('queue/:userId/snooze')
  snoozeCustomer(@Param('userId') userId: string, @Body() body: { until: string }) {
    return this.crm.snoozeCustomer(userId, body.until);
  }

  @Patch('queue/:userId/dismiss')
  dismissCustomer(@Param('userId') userId: string) {
    return this.crm.dismissCustomer(userId);
  }

  @Patch('queue/:userId/escalate')
  escalateCustomer(@Param('userId') userId: string) {
    return this.crm.escalateCustomer(userId);
  }

  @Patch('queue/:userId/assign')
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
  logCall(
    @Body() body: { customerId: string; outcome: CallOutcome; notes?: string; callbackAt?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crm.logCall({ ...body, agentId: user.sub, agentName: user.name ?? 'Agent' });
  }

  @Get('calls/:customerId')
  getCallLogs(@Param('customerId') customerId: string) {
    return this.crm.getCallLogs(customerId);
  }

  @Post('calls/:id/recording')
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
  getCampaigns(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.getCampaigns();
  }

  @Post('campaigns')
  createCampaign(
    @Body() body: { name: string; segmentFilter: string[]; waMessage: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.createCampaign({ ...body, createdById: user.sub });
  }

  @Patch('campaigns/:id/approve')
  approveCampaign(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.approveCampaign(id, user.sub);
  }

  @Post('campaigns/:id/send')
  sendCampaign(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
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
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException('Agents use /crm/leaderboard for own stats');
    return this.crm.getAnalytics();
  }

  // ─── Settings ────────────────────────────────────────────────────────────

  @Get('settings')
  getSettings(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException('Settings restricted to managers and admins');
    return this.crm.getSettings();
  }

  @Put('settings')
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
  addNote(
    @Param('id') id: string,
    @Body() body: { text: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crm.addNote(id, user.sub, body.text, user.name ?? 'Agent');
  }

  @Patch('customers/:id/notes/:noteId/delete')
  deleteNote(@Param('id') id: string, @Param('noteId') noteId: string) {
    return this.crm.deleteNote(id, noteId);
  }

  @Patch('customers/:id/tags')
  setTags(@Param('id') id: string, @Body() body: { tags: string[] }) {
    return this.crm.setTags(id, body.tags ?? []);
  }

  // ─── WhatsApp Nudge ──────────────────────────────────────────────────────

  @Post('nudge')
  logNudge(
    @Body() body: { customerId: string; templateName: string; message: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crm.logNudge({ ...body, agentId: user.sub, agentName: user.name ?? 'Agent' });
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────

  @Get('metrics')
  getMetrics(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.getMetrics();
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────

  @Get('dashboard')
  getDashboard(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.getDashboard();
  }

  // ─── Reorder Calendar ────────────────────────────────────────────────────

  @Get('calendar')
  getCalendar(@CurrentUser() user: JwtPayload) {
    if (user.departmentType === 'crm_senior' || user.departmentType === 'crm_viewer') throw new ForbiddenException();
    return this.crm.getCalendar();
  }

  // ─── Engine ──────────────────────────────────────────────────────────────

  @Post('engine/refresh')
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
  getLiveView(@CurrentUser() user: JwtPayload) {
    this.requireCrmAdmin(user);
    return this.crm.getLiveView();
  }

  @Get('admin/employees')
  listEmployees(@CurrentUser() user: JwtPayload) {
    this.requireCrmAdmin(user);
    return this.crm.listCrmEmployees();
  }

  @Post('admin/employees')
  createEmployee(
    @Body() body: { name: string; email: string; loginId?: string; departmentType: 'crm_manager' | 'crm_senior' | 'crm_viewer' },
    @CurrentUser() user: JwtPayload,
  ) {
    this.requireCrmAdmin(user);
    return this.crm.createCrmEmployee(body);
  }

  @Patch('admin/employees/:id')
  updateEmployee(
    @Param('id') id: string,
    @Body() body: { departmentType?: string; isActive?: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    this.requireCrmAdmin(user);
    return this.crm.updateCrmEmployee(id, body);
  }

  @Post('admin/employees/:id/reset-password')
  resetEmployeePassword(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.requireCrmAdmin(user);
    return this.crm.resetCrmEmployeePassword(id);
  }

  @Post('admin/employees/:id/force-logout')
  forceEmployeeLogout(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.requireCrmAdmin(user);
    return this.crm.forceCrmEmployeeLogout(id);
  }

  @Get('admin/employees/:id/analytics')
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
  getCrmProducts(@Query('search') search: string) {
    return this.crm.getCrmProducts(search);
  }

  // ─── Heartbeat ───────────────────────────────────────────────────────────

  @Post('heartbeat')
  logHeartbeat(@CurrentUser() user: JwtPayload) {
    this.crm.heartbeat(user.sub, user.name ?? 'Agent');
    return { ok: true };
  }
}
