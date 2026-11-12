import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BillingBill, BillingBillDocument } from '../schemas/billing-bill.schema';
import { BusinessProfile } from '../schemas/business-profile.schema';
import { TaxSettingsService } from '../tax-settings/tax-settings.service';
import { RDoc, toRDoc } from './docs';
import { buildDaybook, daybookSheets } from './daybook';
import { buildSaleSummaryByHsn, saleSummarySheets } from './hsn-summary';
import { buildGstr1 } from './gstr1';
import { buildGstr3b } from './gstr3b';
import { Books, toPayRec, toPDoc } from './books';
import { parseGstr2b, reconcileGstr2b } from './gstr2b';
import { collectMoves } from './stock';
import { computePnl } from './ledger';
import { buildBalanceSheet, buildStockSummary, buildTrialBalance, fyStartOf, pnlSheet } from './statements';
import { BillingAccount, BillingExpense, BillingOpening, BillingPayment, BillingPurchase, BillingStockEntry } from '../schemas/books.schemas';
import { dayRange, fileDay, monthRange, startOfDay, todayYmd } from './period';
import { Sheet, toXlsx } from './xlsx';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

export interface ReportFile { buffer: Buffer; filename: string }

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(BillingBill.name) private billModel: Model<BillingBillDocument>,
    @InjectModel(BusinessProfile.name) private profileModel: Model<BusinessProfile>,
    private readonly taxSettings: TaxSettingsService,
    @InjectModel('Product') private productModel: Model<any>,
    @InjectModel(BillingAccount.name) private accountModel: Model<any>,
    @InjectModel(BillingPayment.name) private paymentModel: Model<any>,
    @InjectModel(BillingExpense.name) private expenseModel: Model<any>,
    @InjectModel(BillingPurchase.name) private purchaseModel: Model<any>,
    @InjectModel(BillingStockEntry.name) private stockEntryModel: Model<any>,
    @InjectModel(BillingOpening.name) private openingModel: Model<any>,
  ) {}

  private async company() {
    const p = await this.profileModel.findOne().lean() as any;
    return {
      stateCode: p?.stateCode ?? '22',
      gstin: p?.gstin ?? '',
      legalName: p?.legalName ?? p?.name ?? '',
      tradeName: p?.name && p?.name !== p?.legalName ? p.name : '',
    };
  }

  /** Every bill (any doc type, any status) dated in [start,end) or carrying a payment in it. */
  private async load(start: Date, end: Date, stateCode: string, withPayments = false): Promise<RDoc[]> {
    const dated = { $or: [{ invoiceDate: { $gte: start, $lt: end } }, { invoiceDate: null, createdAt: { $gte: start, $lt: end } }, { invoiceDate: { $exists: false }, createdAt: { $gte: start, $lt: end } }] };
    const q = withPayments ? { $or: [...dated.$or, { 'payments.at': { $gte: start, $lt: end } }] } : dated;
    const bills = await this.billModel.find(q).setOptions({ allDocTypes: true }).lean();
    return bills.map(b => toRDoc(b, stateCode));
  }

  private range(from?: string, to?: string) {
    const f = from ?? todayYmd();
    const t = to ?? f;
    if (!YMD.test(f) || !YMD.test(t)) throw new BadRequestException('from/to must be YYYY-MM-DD');
    return { from: f, to: t, ...dayRange(f, t) };
  }

  private month(m?: string) {
    if (!m || !YM.test(m)) throw new BadRequestException('month must be YYYY-MM');
    return { month: m, ...monthRange(m) };
  }

  async daybook(from?: string, to?: string) {
    const r = this.range(from, to);
    const co = await this.company();
    const result = buildDaybook(await this.load(r.start, r.end, co.stateCode, true), r.start, r.end);
    return { from: r.from, to: r.to, ...result, _sheets: daybookSheets(result), _file: `Daybook_${fileDay(r.from)}_to_${fileDay(r.to)}.xlsx` };
  }

  async saleSummaryByHsn(from?: string, to?: string) {
    const r = this.range(from, to);
    const co = await this.company();
    const result = buildSaleSummaryByHsn(await this.load(r.start, r.end, co.stateCode), r.start, r.end);
    return { from: r.from, to: r.to, ...result, _sheets: saleSummarySheets(result, r.from, r.to), _file: `Sale Summary By HSN_${fileDay(r.from)}_to_${fileDay(r.to)}.xlsx` };
  }

  async gstr1Full(monthStr?: string) {
    const m = this.month(monthStr);
    const co = await this.company();
    const docs = await this.load(m.start, m.end, co.stateCode);
    // sale orders referenced by converted sales (for Table 11B) + orders placed this month (Table 11A)
    const refNos = docs.map(d => d.convertedFromOrderNo).filter(Boolean) as string[];
    const orders = (await this.billModel.find({ docType: 'SALE_ORDER', $or: [{ invoiceNo: { $in: refNos } }, { createdAt: { $gte: m.start, $lt: m.end } }] })
      .setOptions({ allDocTypes: true }).lean()).map(b => toRDoc(b, co.stateCode));
    const limit = Number(await this.taxSettings.getParam('b2clThreshold', m.start)) || 10_000_000;
    const result = buildGstr1([...docs, ...orders], m.month, m.start, m.end, { ...co, b2clLimitPaise: limit }, orders);
    const [y, mm] = m.month.split('-');
    return { ...result, _file: `GSTR1 Report_${mm}_${y.slice(2)}_to_${mm}_${y.slice(2)}.xlsx` };
  }

  async gstr3b(monthStr?: string) {
    const m = this.month(monthStr);
    const co = await this.company();
    const purchases = (await this.purchaseModel.find({ date: { $gte: m.start, $lt: m.end } }).lean()).map(toPDoc);
    const result = buildGstr3b(await this.load(m.start, m.end, co.stateCode), m.month, m.start, m.end, purchases, co.stateCode);
    const [y, mm] = m.month.split('-');
    return { ...result, view: result.sheets, _file: `GSTR3B Report_${mm}_${y.slice(2)}_to_${mm}_${y.slice(2)}.xlsx` };
  }

  /** GSTR-2B JSON (from the portal) vs the purchase register. `month` = YYYY-MM return period. */
  async gstr2bReconcile(monthStr: string | undefined, json: any) {
    const m = this.month(monthStr);
    let govt;
    try { govt = parseGstr2b(json); } catch (e: any) { throw new BadRequestException(e.message); }
    const from = new Date(m.start); from.setUTCMonth(from.getUTCMonth() - 6);
    const purchases = (await this.purchaseModel.find({ date: { $gte: from, $lt: m.end } }).lean()).map(toPDoc);
    return { month: m.month, ...reconcileGstr2b(govt, purchases, m.start, m.end) };
  }

  /** GSTR-9: the 12 monthly GSTR-1 / GSTR-3B results of an Indian FY (fy = start year, e.g. 2026 for 2026-27) summed. */
  async gstr9(fyStr?: string) {
    const y = Number(fyStr);
    if (!Number.isInteger(y) || y < 2017 || y > 2100) throw new BadRequestException('fy must be the FY start year, e.g. 2026 for 2026-27');
    const co = await this.company();
    const fyStart = monthRange(`${y}-04`).start, fyEnd = monthRange(`${y + 1}-03`).end;
    const docs = await this.load(fyStart, fyEnd, co.stateCode);
    const purchases = (await this.purchaseModel.find({ date: { $gte: fyStart, $lt: fyEnd } }).lean()).map(toPDoc);
    const zero = () => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
    const out = { gstr1: zero(), t31a: zero(), t31b: zero(), t31c: zero(), t31e: zero(), itc: { igst: 0, cgst: 0, sgst: 0 } };
    const addRow = (t: ReturnType<typeof zero>, r: any[]) => { t.taxable += r[1]; t.igst += r[2]; t.cgst += r[3]; t.sgst += r[4]; t.cess += r[5]; };
    const months: string[] = [];
    for (let i = 0; i < 12; i++) {
      const mm = ((3 + i) % 12) + 1, yy = mm >= 4 ? y : y + 1;
      const month = `${yy}-${String(mm).padStart(2, '0')}`;
      months.push(month);
      const { start, end } = monthRange(month);
      const r1 = buildGstr1(docs, month, start, end, { ...co, b2clLimitPaise: Number(await this.taxSettings.getParam('b2clThreshold', start)) || 10_000_000 });
      const t = r1.totals;
      out.gstr1.taxable += t.taxable; out.gstr1.igst += t.igst; out.gstr1.cgst += t.cgst; out.gstr1.sgst += t.sgst; out.gstr1.cess += t.cess;
      const r3 = buildGstr3b(docs, month, start, end, purchases, co.stateCode);
      addRow(out.t31a, r3.table31.a); addRow(out.t31b, r3.table31.b); addRow(out.t31c, r3.table31.c); addRow(out.t31e, r3.table31.e);
      out.itc.igst += r3.itcOther.igst; out.itc.cgst += r3.itcOther.cgst; out.itc.sgst += r3.itcOther.sgst;
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const round = (o: any): any => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : round(v)]));
    return { fy: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, months, ...round(out) };
  }

  /** Everything the books engine needs, cumulative from the beginning up to (excluding) `before`. */
  private async loadBooks(before: Date) {
    const p = await this.profileModel.findOne().lean() as any;
    const co = { ...(await this.company()), phone: p?.phone ?? '', email: p?.email ?? '', fyStartMonth: p?.fyStartMonth ?? 4 };
    const dateQ = { $or: [{ invoiceDate: { $lt: before } }, { invoiceDate: null, createdAt: { $lt: before } }, { invoiceDate: { $exists: false }, createdAt: { $lt: before } }] };
    const [bills, purchases, payments, expenses, accounts, stockEntries, opening, products] = await Promise.all([
      this.billModel.find(dateQ).setOptions({ allDocTypes: true }).lean(),
      this.purchaseModel.find({ date: { $lt: before } }).lean(),
      this.paymentModel.find({ date: { $lt: before } }).lean(),
      this.expenseModel.find({ date: { $lt: before } }).lean(),
      this.accountModel.find().lean(),
      this.stockEntryModel.find({ date: { $lt: before } }).lean(),
      this.openingModel.findOne({ key: 'default' }).lean(),
      this.productModel.find().select('name sku price purchasePrice').lean(),
    ]);
    const docs = bills.map(b => toRDoc(b, co.stateCode));
    const pdocs = purchases.map(toPDoc);
    const o: any = opening;
    const books: Books = {
      docs, purchases: pdocs, stateCode: co.stateCode,
      payments: payments.map(toPayRec),
      expenses: expenses.map((e: any) => ({ date: new Date(e.date), category: e.category, amountPaise: e.amountPaise, accountId: e.accountId, mode: e.mode, direct: !!e.direct, isIncome: !!e.isIncome })),
      accounts: accounts.map((a: any) => ({ id: String(a._id), name: a.name, kind: a.kind, openingBalancePaise: a.openingBalancePaise ?? 0 })),
      opening: o ? { asOn: new Date(o.asOn), retainedEarningsPaise: o.retainedEarningsPaise ?? 0, partyOpenings: o.partyOpenings ?? [], modeAccountMap: o.modeAccountMap ?? {} } : null,
      products: products.map((x: any) => ({ id: String(x._id), name: x.name, sku: x.sku ?? '', salePricePaise: Math.round((x.price ?? 0) * 100), purchasePricePaise: Math.round((x.purchasePrice ?? 0) * 100) })),
      moves: collectMoves(docs, pdocs, stockEntries.map((e: any) => ({ productId: e.productId, date: new Date(e.date), kind: e.kind, qty: e.qty, unitCostPaise: e.unitCostPaise, location: e.location }))),
    };
    return { books, co };
  }

  private asOn(asOn?: string) {
    const ymd = asOn ?? todayYmd();
    if (!YMD.test(ymd)) throw new BadRequestException('asOn must be YYYY-MM-DD');
    return { ymd, before: new Date(startOfDay(ymd).getTime() + 86_400_000) };
  }

  async profitAndLoss(from?: string, to?: string) {
    const r = this.range(from, to);
    const { books } = await this.loadBooks(r.end);
    const p = computePnl(books, r.start, r.end);
    return { from: r.from, to: r.to, ...p, sheets: pnlSheet(p, r.from, r.to), view: pnlSheet(p, r.from, r.to), _file: `ProfitAndLossReport_${fileDay(r.from)}_to_${fileDay(r.to)}.xlsx` };
  }

  async stockSummary(asOn?: string, location?: string) {
    const a = this.asOn(asOn);
    if (location && !['all', 'godown', 'store'].includes(location)) throw new BadRequestException('location must be all, godown or store');
    const { books } = await this.loadBooks(a.before);
    const r = buildStockSummary(books, a.ymd, (location as any) || 'all');
    return { ...r, sheets: r.sheet, view: r.sheet, _file: `StockSummaryReport_${fileDay(a.ymd)}.xlsx` };
  }

  async trialBalance(asOn?: string) {
    const a = this.asOn(asOn);
    const { books, co } = await this.loadBooks(a.before);
    const fy = fyStartOf(a.ymd, co.fyStartMonth);
    const r = buildTrialBalance(books, a.ymd, { name: co.legalName, phone: co.phone, email: co.email, gstin: co.gstin }, fy);
    return { ...r, sheets: r.sheet, view: r.sheet, _file: `Trial Balance Report_${fileDay(fy)}_to_${fileDay(a.ymd)}.xlsx` };
  }

  async balanceSheet(asOn?: string) {
    const a = this.asOn(asOn);
    const { books, co } = await this.loadBooks(a.before);
    const r = buildBalanceSheet(books, a.ymd, co.fyStartMonth);
    return { ...r, sheets: r.sheet, view: r.sheet, _file: `BalanceSheet_${fileDay(fyStartOf(a.ymd, co.fyStartMonth))}_to_${fileDay(a.ymd)}.xlsx` };
  }

  /** Strip internal fields and (optionally) produce the workbook. */
  static file(report: { _sheets?: Sheet[]; sheets?: Sheet[]; _file: string }): ReportFile {
    return { buffer: toXlsx((report._sheets ?? report.sheets)!), filename: report._file };
  }
}
