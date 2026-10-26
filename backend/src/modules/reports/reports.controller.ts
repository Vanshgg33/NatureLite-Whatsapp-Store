import { Controller, Get, Post, Put, Body, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DailyReportService } from './daily-report.service';

@Controller('reports')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class ReportsController {
  constructor(private readonly svc: DailyReportService) {}

  @Get('config')
  getConfig() { return this.svc.getConfig(); }

  @Put('config')
  updateConfig(@Body() body: { recipients?: { name: string; email?: string; phone?: string }[]; enabled?: boolean }) {
    return this.svc.updateConfig(body);
  }

  @Post('send-now')
  sendNow() { return this.svc.sendReport(); }
}
