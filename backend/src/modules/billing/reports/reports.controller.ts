import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('billing/reports')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private respond(res: Response, format: string | undefined, report: any) {
    const { _sheets, _file, sheets, ...json } = report;
    // @Res() bypasses TransformInterceptor, so mirror its envelope for the JSON case
    if (format !== 'xlsx') { res.json({ success: true, data: json, timestamp: new Date().toISOString() }); return; }
    const f = ReportsService.file(report);
    res.set({ 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${encodeURIComponent(f.filename)}"`, 'X-Report-Filename': encodeURIComponent(f.filename), 'Access-Control-Expose-Headers': 'X-Report-Filename' });
    res.end(f.buffer);
  }

  @Get('daybook')
  async daybook(@Query('from') from: string, @Query('to') to: string, @Query('format') format: string, @Res() res: Response) {
    return this.respond(res, format, await this.reports.daybook(from, to));
  }

  @Get('sale-summary-hsn')
  async saleSummaryHsn(@Query('from') from: string, @Query('to') to: string, @Query('format') format: string, @Res() res: Response) {
    return this.respond(res, format, await this.reports.saleSummaryByHsn(from, to));
  }

  @Get('gstr1-full')
  async gstr1Full(@Query('month') month: string, @Query('format') format: string, @Res() res: Response) {
    return this.respond(res, format, await this.reports.gstr1Full(month));
  }

  @Get('profit-loss')
  async pnl(@Query('from') from: string, @Query('to') to: string, @Query('format') format: string, @Res() res: Response) {
    return this.respond(res, format, await this.reports.profitAndLoss(from, to));
  }

  @Get('stock-summary')
  async stock(@Query('asOn') asOn: string, @Query('format') format: string, @Res() res: Response) {
    return this.respond(res, format, await this.reports.stockSummary(asOn));
  }

  @Get('trial-balance')
  async trial(@Query('asOn') asOn: string, @Query('format') format: string, @Res() res: Response) {
    return this.respond(res, format, await this.reports.trialBalance(asOn));
  }

  @Get('balance-sheet')
  async balance(@Query('asOn') asOn: string, @Query('format') format: string, @Res() res: Response) {
    return this.respond(res, format, await this.reports.balanceSheet(asOn));
  }

  @Get('gstr3b')
  async gstr3b(@Query('month') month: string, @Query('format') format: string, @Res() res: Response) {
    return this.respond(res, format, await this.reports.gstr3b(month));
  }
}
