import { Controller, Get, Param, Query, Res, UseGuards, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Response, Request } from 'express';
import * as crypto from 'crypto';
import { StoreStockService } from '../store-stock/store-stock.service';
import { RawMaterialService } from '../raw-materials/raw-material.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('analytics/export')
export class PublicExportController {
  constructor(
    private readonly storeStockService: StoreStockService,
    private readonly rawMaterialService: RawMaterialService,
  ) {}

  private verifySheetsToken(storeId: string, token: string): boolean {
    if (!storeId || !token) return false;
    const secret = process.env.JWT_SECRET || 'fallback-sheets-secret-key-12345';
    const expectedToken = crypto
      .createHash('sha256')
      .update(`${storeId}:${secret}`)
      .digest('hex')
      .slice(0, 16);
    return token === expectedToken;
  }

  private convertToCsv(headers: string[], rows: any[][]): string {
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.join(','), ...rows.map(row => row.map(escape).join(','))].join('\n');
  }

  @Get('links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async getLinks(@Query('storeId') storeId: string, @Req() req: Request) {
    if (!storeId) throw new BadRequestException('storeId query is required');
    const secret = process.env.JWT_SECRET || 'fallback-sheets-secret-key-12345';
    const token = crypto
      .createHash('sha256')
      .update(`${storeId}:${secret}`)
      .digest('hex')
      .slice(0, 16);

    const apiPrefix = process.env.API_PREFIX || 'api/v1';
    let baseDomain = process.env.BACKEND_URL;
    if (baseDomain) {
      baseDomain = baseDomain.replace(/\/+$/, '');
    } else {
      const host = req.get('host');
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      baseDomain = `${protocol}://${host}`;
    }
    const baseUrl = `${baseDomain}/${apiPrefix}/analytics/export`;

    return {
      imsLink: `${baseUrl}/ims?storeId=${storeId}&token=${token}`,
      pmsLink: `${baseUrl}/pms?storeId=${storeId}&token=${token}`,
      rmsLink: `${baseUrl}/rms?storeId=${storeId}&token=${token}`,
    };
  }

  @Get('ims')
  @Public()
  async exportIms(
    @Query('storeId') storeId: string,
    @Query('token') token: string,
    @Query('date') date: string,
    @Res() res: Response,
  ) {
    if (!this.verifySheetsToken(storeId, token)) {
      throw new UnauthorizedException('Invalid Google Sheets access token');
    }

    let csv: string;
    let filename: string;

    if (date) {
      // Historical stock movement snapshot
      const analytics = await this.storeStockService.getStockAnalytics(storeId, { date });
      const items = ((analytics as any)?.items ?? []) as any[];
      
      const headers = ['Date', 'Product Name', 'SKU', 'Stock In', 'Returned', 'Damaged', 'Sale Log', 'Total Stock'];
      const rows = items.map(item => [
        date,
        item.productName || '—',
        item.productSku || '—',
        item.stockInDelta || 0,
        item.returnedDelta || 0,
        item.damagedDelta || 0,
        item.saleLogDelta || 0,
        item.totalStock || 0,
      ]);
      csv = this.convertToCsv(headers, rows);
      filename = `IMS-StockFlow-${storeId}-${date}.csv`;
    } else {
      // Current Packed Stock Levels
      const paginatedResult = await this.storeStockService.getStockByStore(storeId, { limit: 1000, page: 1 });
      const items = (paginatedResult?.items ?? []) as any[];

      const headers = ['Product Name', 'SKU', 'Price', 'Current Stock', 'Low Stock Threshold', 'Status'];
      const rows = items.map(item => {
        const mainStock = item.stock ?? 0;
        const variantStockSum = (item.variantStocks ?? []).reduce((acc: number, v: any) => acc + (v.stock ?? 0), 0);
        const stock = mainStock + variantStockSum;
        const status = stock <= 0 ? 'Out of Stock' : stock <= item.lowStockThreshold ? 'Low Stock' : 'In Stock';
        return [
          item.productName || '—',
          item.productSku || '—',
          `Rs. ${item.productPrice || 0}`,
          stock,
          item.lowStockThreshold || 0,
          status,
        ];
      });
      csv = this.convertToCsv(headers, rows);
      filename = `IMS-CurrentStock-${storeId}.csv`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('pms')
  @Public()
  async exportPms(
    @Query('storeId') storeId: string,
    @Query('token') token: string,
    @Query('date') date: string,
    @Res() res: Response,
  ) {
    if (!this.verifySheetsToken(storeId, token)) {
      throw new UnauthorizedException('Invalid Google Sheets access token');
    }

    let csv: string;
    let filename: string;

    if (date) {
      // Production entries for specific date
      const analytics = await this.rawMaterialService.getAnalytics(storeId, { date });
      const items = ((analytics as any)?.items ?? []) as any[];

      const headers = ['Date', 'Material Name', 'Unit', 'Opening Stock', 'Stock In', 'Processed', 'Output Oil (L)', 'Closing Stock'];
      const rows = items.map(item => [
        date,
        item.materialName || '—',
        item.materialUnit || 'kg',
        item.openingStock || 0,
        item.stockIn || 0,
        item.processed || 0,
        item.outputLitres || 0,
        item.closing || 0,
      ]);
      csv = this.convertToCsv(headers, rows);
      filename = `PMS-ProductionLog-${storeId}-${date}.csv`;
    } else {
      // Fetch dates and pull logs across multiple dates or provide a summary list of raw materials today's entry
      const rawMaterials = (await this.rawMaterialService.getByStore(storeId, {})) as any[];
      const headers = ['Material Name', 'Unit', 'Opening Stock', 'Stock In', 'Processed', 'Output Oil (L)', 'Closing Stock', 'Log Date'];
      const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
      const rows = rawMaterials.map(m => {
        const entry = m.todayEntry;
        return [
          m.name || '—',
          m.unit || 'kg',
          entry ? entry.openingStock : m.totalStock,
          entry ? entry.stockIn : 0,
          entry ? entry.processed : 0,
          entry ? entry.outputLitres : 0,
          entry ? entry.closing : m.totalStock,
          todayStr,
        ];
      });
      csv = this.convertToCsv(headers, rows);
      filename = `PMS-CurrentProduction-${storeId}.csv`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('rms')
  @Public()
  async exportRms(
    @Query('storeId') storeId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!this.verifySheetsToken(storeId, token)) {
      throw new UnauthorizedException('Invalid Google Sheets access token');
    }

    const rawMaterials = (await this.rawMaterialService.getByStore(storeId, {})) as any[];
    
    const headers = ['Material Name', 'Unit', 'Current Stock', 'Status'];
    const rows = rawMaterials.map(m => {
      const stock = m.totalStock ?? 0;
      const status = stock <= 0 ? 'Critical' : stock < 20 ? 'Low Stock' : 'Good';
      return [
        m.name || '—',
        m.unit || 'kg',
        stock,
        status,
      ];
    });

    const csv = this.convertToCsv(headers, rows);
    const filename = `RMS-RawMaterialsInventory-${storeId}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
