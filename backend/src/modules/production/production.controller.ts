import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Types } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccessRolesService } from '../admin/access-roles.service';
import { NoRoleAccess } from '../../common/decorators/require-access.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { ProductionOutboxService } from './production-outbox.service';
import { Ctx, ProductionService } from './production.service';

@Controller('production')
@UseGuards(RolesGuard, StoreGuard)
@Roles('admin', 'superadmin')
export class ProductionController {
  constructor(private readonly svc: ProductionService, private readonly mail: ProductionOutboxService, private readonly roles: AccessRolesService) {}

  /** Store-scoped admins are pinned to their store; unscoped admins pass ?storeId= or body.storeId. */
  private c(u: JwtPayload, src: any): Ctx {
    const s = u.storeId || src?.storeId;
    if (!s || !Types.ObjectId.isValid(s)) throw new BadRequestException('A valid storeId is required');
    return { storeId: s, user: u };
  }

  @Get('items') @RequireAccess('production.view') items(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.listItems(this.c(u, q), q.kind); }
  @Post('items') @RequireAccess('production.master') createItem(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.saveItem(this.c(u, b), b); }
  @Put('items/:id') @RequireAccess('production.master') updateItem(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() b: any) { return this.svc.saveItem(this.c(u, b), b, id); }

  @Get('locations') @RequireAccess('production.view') locations(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.listLocations(this.c(u, q)); }
  @Post('locations') @RequireAccess('production.master') createLocation(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.saveLocation(this.c(u, b), b); }
  @Put('locations/:id') @RequireAccess('production.master') updateLocation(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() b: any) { return this.svc.saveLocation(this.c(u, b), b, id); }

  @Get('machines') @RequireAccess('production.view') machines(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.listMachines(this.c(u, q)); }
  @Post('machines') @RequireAccess('production.master') createMachine(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.saveMachine(this.c(u, b), b); }
  @Put('machines/:id') @RequireAccess('production.master') updateMachine(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() b: any) { return this.svc.saveMachine(this.c(u, b), b, id); }

  @Post('receipts') @RequireAccess('production.receive') receive(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.receive(this.c(u, b), b); }
  @Post('issues') @RequireAccess('production.issue') issue(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.issue(this.c(u, b), b); }
  @Get('issues') @RequireAccess('production.view') issues(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.issues(this.c(u, q), q); }
  @Post('returns') @RequireAccess('production.return') ret(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.returnMaterial(this.c(u, b), b); }
  @Post('adjustments') @RequireAccess('production.adjust') adjust(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.adjust(this.c(u, b), b); }
  @Post('waste') @RequireAccess('production.adjust') waste(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.waste(this.c(u, b), b); }
  @Post('count') @RequireAccess('production.adjust') count(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.countAdjust(this.c(u, b), b); }
  @Post('reverse') @RequireAccess('production.reverse') reverse(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.reverse(this.c(u, b), b); }

  @Get('ledger') @RequireAccess('production.view') ledger(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.ledger(this.c(u, q), q); }
  @Get('balances') @RequireAccess('production.view') balances(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.balances(this.c(u, q), q); }
  @Get('eod') @RequireAccess('production.view') eod(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.eod(this.c(u, q), q); }

  @Get('entries/:id') @RequireAccess('production.view') entry(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Query() q: any) { return this.svc.entryDetail(this.c(u, q), id); }
  @Get('entries') @RequireAccess('production.view') entries(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.listEntries(this.c(u, q), q); }
  @Post('entries') @RequireAccess('production.produce') createEntry(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.saveEntry(this.c(u, b), b); }
  @Put('entries/:id') @RequireAccess('production.produce') updateEntry(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() b: any) { return this.svc.saveEntry(this.c(u, b), b, id); }
  @Post('entries/:id/post') @RequireAccess('production.produce') post(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() b: any) { return this.svc.postEntry(this.c(u, b), id); }
  @Post('packing') @RequireAccess('production.pack') pack(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.pack(this.c(u, b), b); }

  @Get('reports/output') @RequireAccess('production.view') rOutput(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.reportOutput(this.c(u, q), q); }
  @Get('reports/finished') @RequireAccess('production.view') rFinished(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.reportFinished(this.c(u, q), q); }
  @Get('reports/overview') @RequireAccess('production.view') rOverview(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.overview(this.c(u, q), q); }
  @Get('export/ledger') @RequireAccess('production.view') xLedger(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.exportLedger(this.c(u, q), q); }
  @Get('export/eod') @RequireAccess('production.view') xEod(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.exportEod(this.c(u, q), q); }

  @Get('tags') @RequireAccess('production.view') getTags(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.getTags(this.c(u, q)); }
  @Put('tags') @RequireAccess('production.master') tags(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.saveTags(this.c(u, b), b.tags); }

  @Post('evidence/upload')
  @RequireAccess('production.receive', 'production.issue', 'production.return', 'production.produce')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() u: JwtPayload, @Body() b: any, @UploadedFile() file: Express.Multer.File) { return this.svc.uploadEvidence(this.c(u, b), file); }
  @Get('evidence/url') @RequireAccess('production.view') evUrl(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.evidenceUrl(this.c(u, q), q.key); }

  /** Creates the four standard roles from the spec (skips any that already exist). Superadmin / unrestricted admins only. */
  @Post('role-presets') @NoRoleAccess()
  async presets(@CurrentUser() u: JwtPayload) {
    const p = (...k: string[]) => k.map((x) => `admin.production.${x}`);
    const operator = p('view', 'receive', 'issue', 'return', 'produce', 'pack');
    const lead = [...operator, ...p('adjust', 'reverse')];
    const inv = [...lead, ...p('master', 'settings')];
    const defs = [
      { name: 'Production Operator', description: 'Receipts, issues, returns, production entries, packing', permissions: operator },
      { name: 'Production Lead', description: 'Operator + adjustments and reversals', permissions: lead },
      { name: 'Inventory Admin', description: 'Lead + master data and email recipients', permissions: inv },
      { name: 'Production ERP Admin', description: 'Everything in Production', permissions: inv },
    ];
    const created: string[] = []; const skipped: string[] = [];
    for (const d of defs) {
      try { await this.roles.create(d, { id: u.sub, name: u.name }); created.push(d.name); }
      catch (e) { if (e instanceof ConflictException) skipped.push(d.name); else throw e; }
    }
    return { created, skipped };
  }

  @Get('settings') @RequireAccess('production.settings') settings(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.getSettings(this.c(u, q)); }
  @Put('settings') @RequireAccess('production.settings') saveSettings(@CurrentUser() u: JwtPayload, @Body() b: any) { return this.svc.saveSettings(this.c(u, b), b); }
  @Get('outbox') @RequireAccess('production.settings') outbox(@CurrentUser() u: JwtPayload, @Query() q: any) { return this.svc.listOutbox(this.c(u, q), q.status); }
  @Post('outbox/:id/retry') @RequireAccess('production.settings') retry(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() b: any) { return this.svc.retryOutbox(this.c(u, b), id); }
  @Post('notifications/test') @RequireAccess('production.settings') test(@Body() b: any) {
    if (typeof b?.to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.to)) throw new BadRequestException('A valid recipient email is required');
    return this.mail.test(b.to);
  }
}
