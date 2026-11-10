import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { ComplaintsService, ResolveComplaintInput } from './complaints.service';
import { ComplaintCategory, ComplaintSource, ComplaintStatus } from './schemas/complaint.schema';

/** crm_viewer is read-only everywhere else in the CRM, so it can look at tickets but not change them. */
const assertCanAct = (user: JwtPayload) => {
  if (user.departmentType === 'crm_viewer') throw new ForbiddenException('Viewers cannot change complaints');
};

@Controller('crm/complaints')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @RequireAccess('crm_complaints.view')
  list(
    @Query('status') status: string,
    @Query('mine') mine: string,
    @Query('overdue') overdue: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.complaints.list({
      status, search, overdue: overdue === 'true',
      assignedTo: mine === 'true' ? user.sub : undefined,
      page: page ? parseInt(page, 10) || 1 : 1,
    });
  }

  @Get('summary')
  @RequireAccess('crm_complaints.view')
  summary(@CurrentUser() user: JwtPayload) {
    return this.complaints.summary(user.sub);
  }

  @Get('agents')
  @RequireAccess('crm_complaints.view')
  agents() {
    return this.complaints.agents();
  }

  @Get('customer/:customerId')
  @RequireAccess('crm_complaints.view', 'crm_customers.view', 'crm_caller.view')
  forCustomer(@Param('customerId') customerId: string) {
    return this.complaints.forCustomer(customerId);
  }

  @Get(':id')
  @RequireAccess('crm_complaints.view')
  get(@Param('id') id: string) {
    return this.complaints.get(id);
  }

  @Post()
  @RequireAccess('crm_complaints.act')
  create(
    @Body() body: { customerId: string; orderId?: string; category: ComplaintCategory; description?: string; source?: ComplaintSource },
    @CurrentUser() user: JwtPayload,
  ) {
    assertCanAct(user);
    return this.complaints.create({ ...body, source: body.source ?? 'call', createdByName: user.name ?? 'Agent' });
  }

  @Post(':id/reply')
  @RequireAccess('crm_complaints.act')
  reply(@Param('id') id: string, @Body() body: { text: string; internal?: boolean }, @CurrentUser() user: JwtPayload) {
    assertCanAct(user);
    return this.complaints.reply(id, body.text, user.name ?? 'Agent', !!body.internal);
  }

  @Patch(':id/status')
  @RequireAccess('crm_complaints.act')
  setStatus(@Param('id') id: string, @Body() body: { status: ComplaintStatus }, @CurrentUser() user: JwtPayload) {
    assertCanAct(user);
    return this.complaints.setStatus(id, body.status, user.name ?? 'Agent');
  }

  @Patch(':id/assign')
  @RequireAccess('crm_complaints.act')
  assign(@Param('id') id: string, @Body() body: { agentId: string }, @CurrentUser() user: JwtPayload) {
    assertCanAct(user);
    return this.complaints.reassign(id, body.agentId, user.name ?? 'Agent');
  }

  @Patch(':id/root-cause')
  @RequireAccess('crm_complaints.act')
  rootCause(@Param('id') id: string, @Body() body: { rootCause: string }, @CurrentUser() user: JwtPayload) {
    assertCanAct(user);
    return this.complaints.setRootCause(id, body.rootCause);
  }

  @Post(':id/resolve')
  @RequireAccess('crm_complaints.act')
  resolve(@Param('id') id: string, @Body() body: ResolveComplaintInput, @CurrentUser() user: JwtPayload) {
    assertCanAct(user);
    return this.complaints.resolve(id, body, user.name ?? 'Agent', user.sub);
  }
}
