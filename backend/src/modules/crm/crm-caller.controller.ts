import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CrmCallerService, isManager } from './crm-caller.service';

/** Caller Command Center (docs/NatureLite_Caller_Command_Center_Blueprint.pdf). Callers see only their own data. */
@Controller('crm/caller')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class CrmCallerController {
  constructor(private readonly caller: CrmCallerService) {}

  private managers(user: JwtPayload) {
    if (!isManager(user)) throw new ForbiddenException('Managers only');
  }

  // ─── caller ────────────────────────────────────────────────────────────────
  @Get('shift')
  @RequireAccess('crm_caller.view')
  shift(@CurrentUser() u: JwtPayload) { return this.caller.myShift(u); }

  @Post('shift')
  @RequireAccess('crm_caller.log')
  shiftAction(@Body() b: { action?: string; reason?: string }, @CurrentUser() u: JwtPayload) { return this.caller.shiftAction(u, String(b?.action ?? ''), b?.reason); }

  @Post('heartbeat')
  @RequireAccess('crm_caller.view')
  heartbeat(@Body() b: { interacted?: boolean }, @CurrentUser() u: JwtPayload) { return this.caller.heartbeat(u, !!b?.interacted); }

  @Post('mode')
  @RequireAccess('crm_caller.log')
  mode(@Body() b: { mode?: string }, @CurrentUser() u: JwtPayload) { return this.caller.setMode(u, String(b?.mode ?? '')); }

  @Get('next')
  @RequireAccess('crm_caller.view')
  next(@Query('mode') mode: string, @CurrentUser() u: JwtPayload) { return this.caller.next(u, mode || undefined); }

  @Post('skip')
  @RequireAccess('crm_caller.log')
  skip(@Body() b: { assignmentId?: string; reason?: string }, @CurrentUser() u: JwtPayload) { return this.caller.skip(u, String(b?.assignmentId ?? ''), String(b?.reason ?? '')); }

  @Post('pull-more')
  @RequireAccess('crm_caller.log')
  pullMore(@CurrentUser() u: JwtPayload) { return this.caller.pullMore(u); }

  @Post('warmup')
  @RequireAccess('crm_caller.log', 'crm_customers.edit')
  warmup(@CurrentUser() u: JwtPayload) { return this.caller.warmup(u); }

  @Post('calls/start')
  @RequireAccess('crm_caller.log')
  start(@Body() b: { customerId?: string }, @CurrentUser() u: JwtPayload) { return this.caller.startCall(u, b ?? {}); }

  @Post('calls/hangup')
  @RequireAccess('crm_caller.log')
  hangup(@CurrentUser() u: JwtPayload) { return this.caller.hangup(u); }

  @Post('calls/end')
  @RequireAccess('crm_caller.log')
  end(@Body() b: any, @CurrentUser() u: JwtPayload) { return this.caller.logDisposition(u, b ?? {}); }

  @Get('me')
  @RequireAccess('crm_caller.view', 'crm_today.view')
  me(@CurrentUser() u: JwtPayload) { return this.caller.me(u); }

  @Get('list')
  @RequireAccess('crm_caller.view', 'crm_today.view', 'crm_team.view')
  list(@Query() q: any, @CurrentUser() u: JwtPayload) { return this.caller.list(u, q ?? {}); }

  @Get('report')
  @RequireAccess('crm_caller.view', 'crm_team.view')
  report(@Query('date') date: string, @CurrentUser() u: JwtPayload) { return this.caller.report(u, date || undefined); }

  // ─── reminders (everyone: own; managers: all) ──────────────────────────────
  @Get('reminders')
  @RequireAccess('crm_caller.view', 'crm_callbacks.view', 'crm_today.view', 'crm_customers.view')
  reminders(@Query('scope') scope: string, @Query('customerId') customerId: string, @CurrentUser() u: JwtPayload) { return this.caller.listReminders(u, scope, customerId || undefined); }

  @Post('reminders')
  @RequireAccess('crm_caller.log', 'crm_callbacks.view', 'crm_customers.edit')
  addReminder(@Body() b: any, @CurrentUser() u: JwtPayload) { return this.caller.createReminder(u, b ?? {}); }

  @Patch('reminders/:id')
  @RequireAccess('crm_caller.log', 'crm_callbacks.view')
  updateReminder(@Param('id') id: string, @Body() b: any, @CurrentUser() u: JwtPayload) { return this.caller.updateReminder(u, id, b ?? {}); }

  // ─── managers ──────────────────────────────────────────────────────────────
  @Get('live')
  @RequireAccess('crm_team.view')
  live(@CurrentUser() u: JwtPayload) { this.managers(u); return this.caller.live(u); }

  @Post('distribute')
  @RequireAccess('crm_team.manage', 'crm_queue.act')
  distribute(@Body() b: { mode?: string; dryRun?: boolean }, @CurrentUser() u: JwtPayload) {
    this.managers(u);
    return this.caller.distribute(b?.mode === 'rebalance' ? 'rebalance' : 'fresh', u, !!b?.dryRun);
  }

  @Post('callers/:id/force-mode')
  @RequireAccess('crm_team.manage', 'crm_queue.act')
  forceMode(@Param('id') id: string, @Body() b: { mode?: string | null; minutes?: number }, @CurrentUser() u: JwtPayload) {
    this.managers(u);
    return this.caller.forceMode(u, id, b?.mode ?? null, b?.minutes);
  }

  @Post('callers/:id/reassign')
  @RequireAccess('crm_team.manage', 'crm_queue.act')
  reassign(@Param('id') id: string, @CurrentUser() u: JwtPayload) { this.managers(u); return this.caller.reassign(u, id); }

  @Post('callers/:id/pull-more')
  @RequireAccess('crm_team.manage', 'crm_queue.act')
  pullFor(@Param('id') id: string, @CurrentUser() u: JwtPayload) { this.managers(u); return this.caller.pullMore(u, id); }

  @Post('callers/:id/pause')
  @RequireAccess('crm_team.manage', 'crm_queue.act')
  pause(@Param('id') id: string, @CurrentUser() u: JwtPayload) { this.managers(u); return this.caller.pauseCaller(u, id); }

  @Post('duel')
  @RequireAccess('crm_team.manage', 'crm_queue.act')
  duel(@Body() b: { a?: string; b?: string; minutes?: number }, @CurrentUser() u: JwtPayload) {
    this.managers(u);
    return this.caller.startDuel(u, String(b?.a ?? ''), String(b?.b ?? ''), b?.minutes);
  }

  @Get('settings')
  @RequireAccess('crm_settings.view', 'crm_team.view')
  settings() { return this.caller.config(); }

  @Put('settings')
  @RequireAccess('crm_settings.edit')
  saveSettings(@Body() b: unknown, @CurrentUser() u: JwtPayload) { this.managers(u); return this.caller.saveConfig(b, u); }
}
