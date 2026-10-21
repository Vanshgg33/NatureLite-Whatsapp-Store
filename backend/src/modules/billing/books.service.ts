import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BillingCounter, BillingCounterDocument } from './schemas/billing-counter.schema';
import {
  BillingAccount, BillingExpense, BillingOpening, BillingPayment, BillingPurchase, BillingStockEntry, PurchaseItem,
} from './schemas/books.schemas';
import { startOfDay } from './reports/period';

const COMPANY_STATE = '22';
const asDate = (v: any, field = 'date') => {
  const d = v ? new Date(v) : new Date();
  if (isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}`);
  return d;
};
const rangeQuery = (field: string, from?: string, to?: string) => {
  if (!from && !to) return {};
  const q: any = {};
  if (from) q.$gte = startOfDay(from);
  if (to) q.$lt = new Date(startOfDay(to).getTime() + 86_400_000);
  return { [field]: q };
};

/** Entry side of the money and stock layers: accounts, payments, expenses, purchases, opening balances, stock entries. */
@Injectable()
export class BooksService {
  constructor(
    @InjectModel(BillingAccount.name) private accounts: Model<BillingAccount>,
    @InjectModel(BillingPayment.name) private payments: Model<BillingPayment>,
    @InjectModel(BillingExpense.name) private expenses: Model<BillingExpense>,
    @InjectModel(BillingPurchase.name) private purchases: Model<BillingPurchase>,
    @InjectModel(BillingStockEntry.name) private stockEntries: Model<BillingStockEntry>,
    @InjectModel(BillingOpening.name) private opening: Model<BillingOpening>,
    @InjectModel(BillingCounter.name) private counters: Model<BillingCounterDocument>,
  ) {}

  // ── accounts ──
  listAccounts() { return this.accounts.find().sort({ createdAt: 1 }).lean(); }
  createAccount(d: { name: string; kind: string; openingBalanceRupees?: number }) {
    if (!d.name?.trim()) throw new BadRequestException('Account name required');
    if (!['CASH', 'BANK', 'WALLET'].includes(d.kind)) throw new BadRequestException('kind must be CASH, BANK or WALLET');
    return this.accounts.create({ name: d.name.trim(), kind: d.kind, openingBalancePaise: Math.round((d.openingBalanceRupees ?? 0) * 100) });
  }
  async updateAccount(id: string, d: { name?: string; openingBalanceRupees?: number }) {
    const set: any = {};
    if (d.name) set.name = d.name.trim();
    if (d.openingBalanceRupees != null) set.openingBalancePaise = Math.round(d.openingBalanceRupees * 100);
    const a = await this.accounts.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!a) throw new NotFoundException('Account not found');
    return a;
  }

  // ── opening balances ──
  getOpening() { return this.opening.findOne({ key: 'default' }).lean(); }
  async setOpening(d: { asOn: string; retainedEarningsRupees?: number; partyOpenings?: Array<{ partyId: string; name: string; balanceRupees: number }>; modeAccountMap?: Record<string, string> }) {
    if (!d.asOn) throw new BadRequestException('asOn required (YYYY-MM-DD)');
    const set: any = { asOn: startOfDay(d.asOn), retainedEarningsPaise: Math.round((d.retainedEarningsRupees ?? 0) * 100) };
    if (d.partyOpenings) set.partyOpenings = d.partyOpenings.map(p => ({ partyId: p.partyId, name: p.name, balancePaise: Math.round(p.balanceRupees * 100) }));
    if (d.modeAccountMap) set.modeAccountMap = d.modeAccountMap;
    // opening stock sits on the day the books open; keep it there if that day moves
    await this.stockEntries.updateMany({ kind: 'OPENING' }, { $set: { date: set.asOn } });
    return this.opening.findOneAndUpdate({ key: 'default' }, { $set: set }, { upsert: true, new: true }).lean();
  }

  // ── payments (in / out) ──
  listPayments(q: { from?: string; to?: string; type?: string }) {
    return this.payments.find({ ...rangeQuery('date', q.from, q.to), ...(q.type ? { type: q.type } : {}) }).sort({ date: -1 }).limit(1000).lean();
  }
  createPayment(d: { type: string; partyId?: string; partyName: string; mode: string; amountRupees: number; discountRupees?: number; accountId?: string; date?: string; refDocNo?: string; note?: string }) {
    if (!['IN', 'OUT'].includes(d.type)) throw new BadRequestException('type must be IN or OUT');
    if (!(d.amountRupees > 0)) throw new BadRequestException('amount must be positive');
    if (!d.partyName?.trim()) throw new BadRequestException('party required');
    const mode = (d.mode || 'cash').toLowerCase();
    return this.payments.create({
      type: d.type, partyId: d.partyId, partyName: d.partyName.trim(), mode, amountPaise: Math.round(d.amountRupees * 100),
      discountPaise: Math.round((d.discountRupees ?? 0) * 100), accountId: d.accountId, date: asDate(d.date), refDocNo: d.refDocNo, note: d.note,
      status: mode === 'cheque' && d.type === 'IN' ? 'UNDEPOSITED' : 'CLEARED',
    });
  }
  async setChequeStatus(id: string, d: { status: 'CLEARED' | 'BOUNCED'; accountId?: string; clearedOn?: string }) {
    const p = await this.payments.findById(id);
    if (!p || p.mode !== 'cheque' || p.status !== 'UNDEPOSITED') throw new BadRequestException('Only an undeposited cheque can be cleared or bounced');
    p.status = d.status;
    if (d.status === 'CLEARED') { p.clearedOn = asDate(d.clearedOn, 'clearedOn'); if (d.accountId) p.accountId = d.accountId; }
    await p.save();
    return p;
  }

  // ── expenses / other income ──
  listExpenses(q: { from?: string; to?: string }) { return this.expenses.find(rangeQuery('date', q.from, q.to)).sort({ date: -1 }).limit(1000).lean(); }
  createExpense(d: { date?: string; category: string; amountRupees: number; accountId?: string; mode?: string; direct?: boolean; isIncome?: boolean; note?: string }) {
    if (!d.category?.trim() || !(d.amountRupees > 0)) throw new BadRequestException('category and a positive amount are required');
    return this.expenses.create({ date: asDate(d.date), category: d.category.trim(), amountPaise: Math.round(d.amountRupees * 100), accountId: d.accountId, mode: (d.mode ?? 'cash').toLowerCase(), direct: !!d.direct, isIncome: !!d.isIncome, note: d.note });
  }
  async deleteExpense(id: string) { await this.expenses.findByIdAndDelete(id); return { ok: true }; }

  // ── stock entries ──
  listStockEntries() { return this.stockEntries.find().sort({ date: -1 }).limit(1000).lean(); }
  async createStockEntry(d: { productId: string; name: string; kind: 'OPENING' | 'ADJUST'; qty: number; unitCostRupees?: number; date?: string; note?: string }) {
    if (!d.productId || !d.name || !Number.isFinite(d.qty) || d.qty === 0) throw new BadRequestException('productId, name and a non-zero qty are required');
    if (!['OPENING', 'ADJUST'].includes(d.kind)) throw new BadRequestException('kind must be OPENING or ADJUST');
    const op = await this.getOpening();
    // opening stock lives on the day the books open, so valuations at that instant include it
    const date = d.kind === 'OPENING' ? (op?.asOn ?? asDate(d.date)) : asDate(d.date);
    return this.stockEntries.create({ productId: d.productId, name: d.name, kind: d.kind, qty: d.qty, unitCostPaise: d.unitCostRupees != null ? Math.round(d.unitCostRupees * 100) : undefined, date, note: d.note });
  }

  // ── purchases / debit notes ──
  listPurchases(q: { from?: string; to?: string }) { return this.purchases.find(rangeQuery('date', q.from, q.to)).sort({ date: -1 }).limit(1000).lean(); }

  private async nextPurchaseNo(debit: boolean) {
    const series = debit ? 'dn' : 'purchase';
    const c = await this.counters.findOneAndUpdate({ key: `${series}-2026-27` }, { $inc: { value: 1 } }, { upsert: true, new: true }).lean();
    return `${debit ? 'DN' : 'PUR'}-26-27/${c.value}`;
  }

  async createPurchase(d: {
    supplierId?: string; supplierName: string; supplierGstin?: string; stateOfSupply?: string; date?: string; isDebitNote?: boolean; refDocNo?: string;
    itcEligibility?: string; reverseCharge?: boolean; paidRupees?: number; paymentMode?: string; roundOff?: boolean; notes?: string;
    items: Array<{ productId?: string; name: string; hsnCode?: string; qty: number; unit?: string; rate: number; priceInclTax?: boolean; discountPct?: number; gstRate: number; gstTreatment?: string }>;
  }) {
    if (!d.supplierName?.trim()) throw new BadRequestException('supplier required');
    if (!d.items?.length) throw new BadRequestException('at least one item required');
    const pos = d.stateOfSupply ?? COMPANY_STATE;
    const inter = pos !== COMPANY_STATE;
    const items: PurchaseItem[] = d.items.map(i => {
      const gross = Math.round(i.rate * 100) * i.qty;
      const afterDisc = gross - Math.round(gross * (i.discountPct ?? 0) / 100);
      const taxable = i.priceInclTax ? Math.round(afterDisc * 100 / (100 + i.gstRate)) : afterDisc;
      const tax = i.priceInclTax ? afterDisc - taxable : Math.round(taxable * i.gstRate / 100);
      const cgst = inter ? 0 : Math.floor(tax / 2);
      return {
        productId: i.productId, name: i.name, hsnCode: i.hsnCode ?? '', qty: i.qty, unit: i.unit, gstRate: i.gstRate, gstTreatment: i.gstTreatment,
        taxable, cgst, sgst: inter ? 0 : tax - cgst, igst: inter ? tax : 0,
      };
    });
    const taxable = items.reduce((s, i) => s + i.taxable, 0), tax = items.reduce((s, i) => s + i.cgst + i.sgst + i.igst, 0);
    let total = taxable + (d.reverseCharge ? 0 : tax);
    if (d.roundOff) total = Math.round(total / 100) * 100;
    return this.purchases.create({
      docNo: await this.nextPurchaseNo(!!d.isDebitNote), supplierId: d.supplierId, supplierName: d.supplierName.trim(), supplierGstin: d.supplierGstin,
      stateOfSupply: pos, date: asDate(d.date), isDebitNote: !!d.isDebitNote, refDocNo: d.refDocNo, itcEligibility: d.itcEligibility ?? 'ELIGIBLE',
      reverseCharge: !!d.reverseCharge, items, totalPaise: total, paidPaise: Math.round((d.paidRupees ?? 0) * 100), paymentMode: (d.paymentMode ?? 'cash').toLowerCase(), notes: d.notes,
    });
  }

  async cancelPurchase(id: string) {
    const p = await this.purchases.findByIdAndUpdate(id, { $set: { status: 'cancelled' } }, { new: true }).lean();
    if (!p) throw new NotFoundException('Purchase not found');
    return p;
  }
}
