import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmEngineService } from '../crm/crm-engine.service';
import { BillingBill, BillingBillDocument, BillLineItem, PaymentStatus } from './schemas/billing-bill.schema';
import { BillingCounter, BillingCounterDocument } from './schemas/billing-counter.schema';
import { Godown } from './schemas/godown.schema';
import { isChannel } from './channels';
import { stockKey } from './reports/stock';
import { StoreStockService } from '../store-stock/store-stock.service';
import { StoresService } from '../stores/stores.service';
import { BillingWhatsappService } from './billing-whatsapp.service';
import { BillingStockService } from './billing-stock.service';
import { AuditLog } from './schemas/audit-log.schema';
import { User } from '../users/schemas/user.schema';
import { TaxSettingsService } from './tax-settings/tax-settings.service';
import { LogicsService } from './logics/logics.service';
import { calcBill, CalcResult } from './logics/formula-engine';

function validateInvoiceNo(no: string): boolean {
  return /^[A-Za-z0-9/\-]{1,16}$/.test(no);
}

// Report value in rupees for both legacy (rupee) and v1 (paise) bills: taxable + GST backward-compat fields are always rupees.
const ITEM_VALUE = { $add: ['$items.taxableAmount', '$items.gstAmount'] };
// One sale line with the bill's own timestamp (createdAt carries the time of day; invoiceDate is date-only).
const SALE_LINE = {
  at: '$createdAt', invoiceNo: '$invoiceNo', customerName: '$customerName', channel: '$orderTag',
  qty: '$items.qty', rate: '$items.unitPrice', amount: ITEM_VALUE,
};

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(User.name) private userModel: Model<any>,
    @InjectModel(BillingBill.name) private billModel: Model<BillingBillDocument>,
    @InjectModel(BillingCounter.name) private counterModel: Model<BillingCounterDocument>,
    @InjectModel('Product') private productModel: Model<any>,
    @InjectModel(Godown.name) private godownModel: Model<any>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<any>,
    private readonly crmEngine: CrmEngineService,
    private readonly taxSettings: TaxSettingsService,
    private readonly logics: LogicsService,
    private readonly billingWhatsapp: BillingWhatsappService,
    private readonly billingStock: BillingStockService,
    private readonly storeStock: StoreStockService,
    private readonly stores: StoresService,
  ) {}

  // ─── IMS stock (the stores' real stock) ───────────────────────────────────

  private imsQty(ss: any, variantSku?: string): number {
    if (!ss) return 0;
    return variantSku ? (ss.variantStocks ?? []).find((v: any) => v.variantSku === variantSku)?.stock ?? 0 : ss.stock ?? 0;
  }

  /** The IMS store a bill works against; it must exist and be active. */
  private async imsStore(storeId?: string) {
    if (!storeId) throw new BadRequestException('Select the store this stock comes from');
    const store = (await this.stores.findAll()).find((s: any) => String(s._id) === String(storeId));
    if (!store) throw new BadRequestException('Store not found');
    return store;
  }

  /**
   * Checks the sale against the store's IMS stock. Returns what can be taken per line key; a shortage throws unless a
   * role-approved override with a reason is given (then only what is actually there is taken, IMS never goes below zero).
   */
  private async checkImsStock(storeId: string, storeName: string, items: Array<{ productId: string; variantSku?: string; name: string; qty: number }>, override?: { reason?: string; allowed: boolean }) {
    const need = new Map<string, { productId: string; variantSku?: string; name: string; qty: number }>();
    for (const i of items) {
      const k = stockKey(i.productId, i.variantSku);
      const n = need.get(k);
      need.set(k, { productId: i.productId, variantSku: i.variantSku, name: i.name, qty: (n?.qty ?? 0) + i.qty });
    }
    const map = await this.storeStock.getStockMapForStoreProducts(storeId, [...new Set([...need.values()].map(n => n.productId))]);
    const take: Array<{ productId: string; variantSku?: string; qty: number }> = [];
    const short: string[] = [];
    for (const n of need.values()) {
      const have = this.imsQty(map.get(n.productId), n.variantSku);
      if (have < n.qty) short.push(`${n.name}: need ${n.qty}, ${storeName} has ${have}`);
      take.push({ productId: n.productId, variantSku: n.variantSku, qty: Math.min(have, n.qty) });
    }
    if (!short.length) return { take, overridden: false as const, short };
    if (override?.allowed && override.reason?.trim()) return { take, overridden: true as const, short };
    throw new BadRequestException(`Not enough stock in ${storeName}: ${short.join('; ')}`);
  }

  /** Takes stock out of the store; if any line fails the ones already taken are put back. */
  private async takeImsStock(storeId: string, take: Array<{ productId: string; variantSku?: string; qty: number }>) {
    const done: typeof take = [];
    try {
      for (const t of take) {
        if (t.qty <= 0) continue;
        await this.storeStock.decrementStock(storeId, t.productId, t.qty, t.variantSku);
        done.push(t);
      }
    } catch (e) {
      await this.returnImsStock(storeId, done);
      throw e;
    }
    return done;
  }

  private async returnImsStock(storeId: string, lines: Array<{ productId: string; variantSku?: string; qty: number }>) {
    for (const t of lines) if (t.qty > 0) await this.storeStock.incrementStock(storeId, t.productId, t.qty, t.variantSku).catch(() => undefined);
  }

  // Map a User document to the billing customer shape the frontend expects
  private mapUser(u: any) {
    const phone = u.phone ?? '';
    // Strip 91 country code for display (10-digit)
    const displayPhone = /^91\d{10}$/.test(phone) ? phone.slice(2) : phone;

    // Use billingAddresses if present; fall back to formatting delivery addresses
    const addresses = (u.billingAddresses ?? []).length > 0
      ? u.billingAddresses
      : (u.addresses ?? []).map((a: any) => ({
          label: a.label || 'Default',
          line: [a.house, a.building, a.area, a.street, a.city, a.state, a.pincode]
            .filter(Boolean).join(', '),
          isDefault: a.isDefault ?? false,
        }));

    return {
      _id: u._id,
      name: u.name?.trim() || displayPhone || 'Unknown',
      phone: displayPhone,
      gstNo: u.gstNo,
      tags: u.tags ?? [],
      addresses,
      orderCount: u.totalOrders ?? 0,
      totalPurchase: u.totalSpent ?? 0,
      outstanding: u.outstanding ?? 0,
      assignedDeliveryUserId: u.assignedDeliveryUserId,
    };
  }

  // ─── Customers ───────────────────────────────────────────────────────────

  async searchCustomers(q: string) {
    if (!q?.trim()) {
      const users = await this.userModel.find({}).sort({ name: 1 }).limit(50).lean();
      return users.map(u => this.mapUser(u));
    }
    const digits = q.replace(/[^\d]/g, '');
    const orConds: any[] = [{ name: { $regex: q.trim(), $options: 'i' } }];
    if (digits) orConds.push({ phone: { $regex: digits } });
    const users = await this.userModel.find({ $or: orConds }).limit(20).lean();
    return users.map(u => this.mapUser(u));
  }

  async getCustomer(id: string) {
    const u = await this.userModel.findById(id).lean();
    if (!u) throw new NotFoundException('Customer not found');
    return this.mapUser(u);
  }

  async createCustomer(data: {
    name: string;
    phone: string;
    altPhone?: string;
    gstNo?: string;
    tags?: string[];
    addresses?: Array<{ label: string; line: string; isDefault?: boolean }>;
  }) {
    // Normalize phone: 10-digit → 91XXXXXXXXXX
    const digits = data.phone.replace(/[^\d]/g, '');
    const normalizedPhone = digits.length === 10 ? '91' + digits : digits;

    const existing = await this.userModel.findOne({ phone: normalizedPhone }).lean();
    if (existing) throw new ConflictException('Customer with this phone already exists');

    // Duplicate name: suffix with last 3 phone digits so both stay findable
    const baseName = data.name.trim();
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameDup = await this.userModel.findOne({ name: new RegExp(`^${escaped}$`, 'i') }).lean();
    const resolvedName = nameDup ? `${baseName} (${normalizedPhone.slice(-3)})` : baseName;

    const billingAddresses = (data.addresses ?? []).map((a, i) => ({
      label: a.label,
      line: a.line,
      isDefault: a.isDefault ?? i === 0,
    }));

    const u = await this.userModel.create({
      name: resolvedName,
      phone: normalizedPhone,
      gstNo: data.gstNo,
      tags: data.tags ?? [],
      billingAddresses,
      isActive: true,
    });
    this.crmEngine.refreshUser(u._id).catch(() => {});
    return this.mapUser(u);
  }

  async updateCustomer(id: string, data: Partial<{
    altPhone: string;
    gstNo: string;
    tags: string[];
    addresses: Array<{ label: string; line: string; isDefault: boolean }>;
  }>) {
    const update: any = {};
    if (data.gstNo !== undefined) update.gstNo = data.gstNo;
    if (data.tags !== undefined) update.tags = data.tags;
    if (data.addresses !== undefined) update.billingAddresses = data.addresses;

    const u = await this.userModel.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!u) throw new NotFoundException('Customer not found');
    return this.mapUser(u);
  }

  async addAddress(id: string, address: { label: string; line: string; isDefault?: boolean }) {
    const u = await this.userModel.findById(id).lean() as any;
    if (!u) throw new NotFoundException('Customer not found');

    const makeDefault = address.isDefault ?? false;
    const existing = (u.billingAddresses ?? []).map((a: any) => ({
      ...a, isDefault: makeDefault ? false : a.isDefault,
    }));
    existing.push({ label: address.label, line: address.line, isDefault: makeDefault });

    const updated = await this.userModel.findByIdAndUpdate(
      id, { $set: { billingAddresses: existing } }, { new: true },
    ).lean() as any;
    return this.mapUser(updated);
  }

  // ─── Products (for billing search) ───────────────────────────────────────

  async searchProductsForBilling(q: string, storeId?: string) {
    const filter = q?.trim()
      ? { isActive: true, $or: [{ name: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } }, { 'variants.sku': { $regex: q, $options: 'i' } }, { 'variants.name': { $regex: q, $options: 'i' } }] }
      : { isActive: true };

    const products = await this.productModel
      .find(filter, 'name sku price b2bPrice hsnCode gstRate mrp uqc variants.name variants.sku variants.price variants.b2bPrice variants.compareAtPrice variants.isActive')
      .limit(30)
      .lean();

    if (!products.length) return [];

    // One row per product, then one per active variant: each is its own stock item with its own prices.
    const tiers = (price: number, b2b?: number | null) => [
      { tag: 'Store/Retail', price },
      ...(typeof b2b === 'number' ? [{ tag: 'B2B', price: b2b }] : []),
    ];
    const rows = products.flatMap((p: any) => {
      const { variants = [], ...base } = p;
      const id = String(p._id);
      return [
        { ...base, key: id, stockKey: id, tagPrices: tiers(p.price, p.b2bPrice), unit: p.uqc ?? 'NOS' },
        ...variants.filter((v: any) => v.isActive !== false).map((v: any) => ({
          ...base, key: stockKey(id, v.sku), stockKey: stockKey(id, v.sku), variantSku: v.sku,
          name: `${p.name} - ${v.name}`, sku: v.sku, price: v.price, b2bPrice: v.b2bPrice, mrp: v.compareAtPrice ?? p.mrp ?? 0,
          tagPrices: tiers(v.price, v.b2bPrice), unit: p.uqc ?? 'NOS',
        })),
      ];
    });
    // stock = what the chosen IMS store has (variants have their own); no store chosen yet = unknown
    const ims = storeId ? await this.storeStock.getStockMapForStoreProducts(storeId, products.map((p: any) => String(p._id))) : undefined;
    return rows.map(r => ({ ...r, stock: ims ? this.imsQty(ims.get(String(r._id)), r.variantSku) : undefined }));
  }

  /** Active IMS stores for the bill's store picker. */
  async listStoresForBilling() {
    return (await this.stores.findAll())
      .filter((s: any) => s.isActive !== false)
      .map((s: any) => ({ _id: String(s._id), name: s.name, isMainStore: !!s.isMainStore }));
  }

  // ─── Invoice numbering ────────────────────────────────────────────────────

  private async nextInvoiceNo(): Promise<string> {
    const year = new Date().getFullYear();
    const key = `invoice-${year}`;
    const counter = await this.counterModel.findOneAndUpdate(
      { key },
      { $inc: { value: 1 } },
      { upsert: true, new: true },
    ).lean();
    return `NL-${year}-${String(counter.value).padStart(4, '0')}`;
  }

  private async nextInvoiceNoV1(docType: 'SALE' | 'CREDIT_NOTE' | 'SALE_ORDER' = 'SALE'): Promise<string> {
    // Indian financial year runs Apr–Mar; number looks like NIF-26-27/9321
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const yy = (n: number) => String(n).slice(2);
    const fyLabel = `${fyStart}-${yy(fyStart + 1)}`;
    const prefix = `NIF-${yy(fyStart)}-${yy(fyStart + 1)}/`;
    // Three independent series: sale, credit note, sale order (blueprint §2.6)
    const series = docType === 'CREDIT_NOTE' ? 'cn' : docType === 'SALE_ORDER' ? 'so' : 'sale';
    const counter = await this.counterModel.findOneAndUpdate(
      { key: `${series}-${fyLabel}` },
      { $inc: { value: 1 } },
      { upsert: true, new: true },
    ).lean();
    const no = `${prefix}${counter.value}`;
    if (!validateInvoiceNo(no)) throw new BadRequestException(`Generated invoice no too long: ${no}`);
    return no;
  }

  // ─── Godowns ──────────────────────────────────────────────────────────────

  async getGodowns() {
    const docs = await this.godownModel.find().sort({ isDefault: -1, name: 1 }).lean();
    return docs.map((d: any) => ({
      _id: d._id.toString(),
      name: d.name,
      code: d.code,
      isDefault: !!d.isDefault,
    }));
  }

  // ─── Bills ───────────────────────────────────────────────────────────────

  async setDefaultDelivery(customerId: string, deliveryUserId: string | null) {
    const u = await this.userModel.findByIdAndUpdate(
      customerId,
      { $set: { assignedDeliveryUserId: deliveryUserId ?? null } },
      { new: true },
    ).lean();
    if (!u) throw new NotFoundException('Customer not found');
    return this.mapUser(u);
  }

  async createBill(data: {
    customerId: string;
    billingAddress?: string;
    orderTag: string;
    deliveryUserId?: string;
    deliveryUserName?: string;
    items: Array<{
      productId: string;
      name: string;
      sku: string;
      hsnCode?: string;
      qty: number;
      unitPrice: number;
      gstRate: number;
    }>;
    amountPaid: number;
    notes?: string;
  }) {
    const customer = await this.userModel.findById(data.customerId).lean() as any;
    if (!customer) throw new NotFoundException('Customer not found');
    if (!data.items?.length) throw new BadRequestException('Bill must have at least one item');

    const items: BillLineItem[] = data.items.map(i => {
      const total = Math.round(i.unitPrice * i.qty * 100) / 100;
      const taxableAmount = Math.round(total / (1 + i.gstRate / 100) * 100) / 100;
      const gstAmount = Math.round((total - taxableAmount) * 100) / 100;
      return {
        productId: new Types.ObjectId(i.productId),
        name: i.name,
        sku: i.sku,
        hsnCode: i.hsnCode ?? '',
        qty: i.qty,
        unitPrice: i.unitPrice,
        gstRate: i.gstRate,
        taxableAmount,
        gstAmount,
        total,
      };
    });

    const subtotal = Math.round(items.reduce((s, i) => s + i.taxableAmount, 0) * 100) / 100;
    const totalGst = Math.round(items.reduce((s, i) => s + i.gstAmount, 0) * 100) / 100;
    const grandTotal = Math.round((subtotal + totalGst) * 100) / 100;
    const amountPaid = Math.min(data.amountPaid ?? 0, grandTotal);
    const amountDue = Math.round((grandTotal - amountPaid) * 100) / 100;
    const paymentStatus = amountDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

    const invoiceNo = await this.nextInvoiceNo();

    // Resolve billing address: billingAddresses first, fall back to formatted delivery address
    const billingAddrs: any[] = customer.billingAddresses ?? [];
    const deliveryAddrs: any[] = customer.addresses ?? [];
    const defaultBillingLine =
      (billingAddrs.find((a: any) => a.isDefault) ?? billingAddrs[0])?.line ??
      [deliveryAddrs.find((a: any) => a.isDefault) ?? deliveryAddrs[0]]
        .filter(Boolean)
        .map((a: any) => [a.house, a.building, a.area, a.street, a.city, a.state, a.pincode].filter(Boolean).join(', '))[0];
    const billingAddress = data.billingAddress ?? defaultBillingLine;

    // Display phone: strip 91 prefix
    const rawPhone = customer.phone ?? '';
    const customerPhone = /^91\d{10}$/.test(rawPhone) ? rawPhone.slice(2) : rawPhone;

    const bill = await this.billModel.create({
      invoiceNo,
      customerId: new Types.ObjectId(data.customerId),
      customerName: customer.name,
      customerPhone,
      customerGstNo: customer.gstNo,
      billingAddress,
      customerTags: customer.tags ?? [],
      orderTag: data.orderTag,
      deliveryUserId: data.deliveryUserId,
      deliveryUserName: data.deliveryUserName,
      items,
      subtotal,
      totalGst,
      grandTotal,
      amountPaid,
      amountDue,
      paymentStatus,
      notes: data.notes,
    });

    // Increment outstanding on User
    await this.userModel.findByIdAndUpdate(data.customerId, {
      $inc: { outstanding: amountDue },
    });

    this.crmEngine.refreshUser(data.customerId).catch(() => {});
    return bill;
  }

  async getBills(filters: {
    customerId?: string;
    paymentStatus?: string;
    orderTag?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    docType?: 'SALE_ORDER';
    page?: number;
    limit?: number;
  }) {
    const q: any = { status: 'active' };
    if (filters.docType === 'SALE_ORDER') q.docType = 'SALE_ORDER'; // open sale orders (hidden from sales lists by default)
    if (filters.customerId) q.customerId = new Types.ObjectId(filters.customerId);
    const term = filters.search?.trim();
    if (term) {
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ invoiceNo: re }, { customerName: re }, { customerPhone: re }];
    }
    if (filters.paymentStatus) q.paymentStatus = filters.paymentStatus;
    if (filters.orderTag) q.orderTag = filters.orderTag;
    if (filters.startDate || filters.endDate) {
      q.createdAt = {};
      if (filters.startDate) q.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) q.createdAt.$lte = new Date(filters.endDate);
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const skip = ((filters.page ?? 1) - 1) * limit;

    const [items, total] = await Promise.all([
      this.billModel.find(q).setOptions({ allDocTypes: filters.docType === 'SALE_ORDER' }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.billModel.countDocuments(q).setOptions({ allDocTypes: filters.docType === 'SALE_ORDER' }),
    ]);

    return { items, total, page: filters.page ?? 1, limit };
  }

  async getBill(id: string) {
    const bill = await this.billModel.findById(id).setOptions({ allDocTypes: true }).lean();
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  // ─── Dues ────────────────────────────────────────────────────────────────

  async getDues(filters?: { startDate?: string; endDate?: string }) {
    const match: any = { status: 'active', paymentStatus: { $in: ['unpaid', 'partial'] } };
    if (filters?.startDate || filters?.endDate) {
      match.createdAt = {};
      if (filters?.startDate) match.createdAt.$gte = new Date(filters.startDate);
      if (filters?.endDate) match.createdAt.$lte = new Date(filters.endDate);
    }
    const [bills, summary] = await Promise.all([
      this.billModel.find(match).sort({ amountDue: -1 }).limit(500).lean(),
      this.billModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalDue: { $sum: '$amountDue' },
            count: { $sum: 1 },
            unpaid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, 1, 0] } },
            partial: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'partial'] }, 1, 0] } },
          },
        },
      ]),
    ]);
    const s = summary[0] ?? { totalDue: 0, count: 0, unpaid: 0, partial: 0 };
    return { bills, totalDue: s.totalDue, count: s.count, unpaid: s.unpaid, partial: s.partial };
  }

  // ─── Insights ─────────────────────────────────────────────────────────────

  async getTopCustomers(limit = 200, sortBy: 'totalPurchase' | 'orderCount' = 'totalPurchase', startDate?: string, endDate?: string) {
    const match: any = { status: 'active' };
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }
    return this.billModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$customerId',
          name: { $first: '$customerName' },
          phone: { $first: '$customerPhone' },
          totalPurchase: { $sum: '$grandTotal' },
          orderCount: { $sum: 1 },
          outstanding: { $sum: '$amountDue' },
        },
      },
      { $sort: { [sortBy]: -1 } },
      { $limit: limit },
      // Join User to get current tags
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: '_user' } },
      {
        $project: {
          name: 1,
          phone: 1,
          totalPurchase: 1,
          orderCount: 1,
          outstanding: 1,
          tags: { $ifNull: [{ $arrayElemAt: ['$_user.tags', 0] }, []] },
        },
      },
    ]);
  }

  async getTopProductPerCustomer(startDate?: string, endDate?: string) {
    const match: any = { status: 'active' };
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }
    return this.billModel.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $group: {
        _id: { customerId: '$customerId', sku: '$items.sku' },
        customerName: { $first: '$customerName' },
        customerPhone: { $first: '$customerPhone' },
        productName: { $first: '$items.name' },
        productQty: { $sum: '$items.qty' },
      }},
      { $sort: { '_id.customerId': 1, productQty: -1 } },
      { $group: {
        _id: '$_id.customerId',
        customerName: { $first: '$customerName' },
        customerPhone: { $first: '$customerPhone' },
        topSku: { $first: '$_id.sku' },
        topProductName: { $first: '$productName' },
        topProductQty: { $first: '$productQty' },
        totalQty: { $sum: '$productQty' },
      }},
      { $project: {
        _id: 0,
        customerId: '$_id',
        customerName: 1,
        customerPhone: 1,
        topSku: 1,
        topProductName: 1,
        topProductQty: 1,
        totalQty: 1,
        pct: { $cond: [{ $gt: ['$totalQty', 0] }, { $round: [{ $multiply: [{ $divide: ['$topProductQty', '$totalQty'] }, 100] }, 1] }, 0] },
      }},
      { $sort: { topProductQty: -1 } },
    ]);
  }

  // ─── GSTR-1 ───────────────────────────────────────────────────────────────

  async getGstr1(month?: string) {
    const match: any = { status: 'active' };
    if (month) {
      const [y, m] = month.split('-').map(Number);
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      match.createdAt = {
        $gte: new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS),
        $lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999) - IST_OFFSET_MS),
      };
    }

    const hasGst = { $and: [{ $ne: ['$customerGstNo', null] }, { $ne: ['$customerGstNo', ''] }] };
    const noGst  = { $or:  [{ $eq:  ['$customerGstNo', null] }, { $eq:  ['$customerGstNo', ''] }] };

    const [b2b, b2cAgg, hsnSummary, docAgg] = await Promise.all([
      this.billModel.find(
        { ...match, customerGstNo: { $exists: true, $nin: [null, ''] } },
        'invoiceNo createdAt customerGstNo customerName subtotal totalGst grandTotal orderTag',
      ).sort({ createdAt: 1 }).lean(),

      this.billModel.aggregate([
        { $match: { ...match, $or: [{ customerGstNo: { $exists: false } }, { customerGstNo: '' }, { customerGstNo: null }] } },
        { $unwind: '$items' },
        { $group: {
          _id: '$items.gstRate',
          taxableAmount: { $sum: '$items.taxableAmount' },
          gstAmount: { $sum: '$items.gstAmount' },
          totalValue: { $sum: '$items.total' },
        }},
        { $sort: { _id: 1 } },
      ]),

      this.billModel.aggregate([
        { $match: match },
        { $unwind: '$items' },
        { $group: {
          _id: { hsnCode: '$items.hsnCode', gstRate: '$items.gstRate' },
          taxableAmount: { $sum: '$items.taxableAmount' },
          gstAmount: { $sum: '$items.gstAmount' },
          totalValue: { $sum: '$items.total' },
          qty: { $sum: '$items.qty' },
          b2bTaxable: { $sum: { $cond: [hasGst, '$items.taxableAmount', 0] } },
          b2cTaxable: { $sum: { $cond: [noGst,  '$items.taxableAmount', 0] } },
          b2bGst:     { $sum: { $cond: [hasGst, '$items.gstAmount', 0] } },
          b2cGst:     { $sum: { $cond: [noGst,  '$items.gstAmount', 0] } },
        }},
        { $project: {
          _id: 0, hsnCode: '$_id.hsnCode', gstRate: '$_id.gstRate',
          taxableAmount: { $round: ['$taxableAmount', 2] },
          gstAmount: { $round: ['$gstAmount', 2] },
          totalValue: { $round: ['$totalValue', 2] },
          qty: 1,
          b2bTaxable: { $round: ['$b2bTaxable', 2] },
          b2cTaxable: { $round: ['$b2cTaxable', 2] },
          b2bGst: { $round: ['$b2bGst', 2] },
          b2cGst: { $round: ['$b2cGst', 2] },
        }},
        { $sort: { hsnCode: 1, gstRate: 1 } },
      ]),

      this.billModel.aggregate([
        // Drop status filter so cancelled bills are visible for doc summary
        { $match: month ? { createdAt: match.createdAt } : {} },
        { $group: {
          _id: null,
          totalInvoices: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          cancelledInvoices: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          firstInvoiceNo: { $min: '$invoiceNo' },
          lastInvoiceNo: { $max: '$invoiceNo' },
        }},
      ]),
    ]);

    const b2cSummary = b2cAgg.map((r: any) => ({
      gstRate: r._id,
      taxableAmount: Math.round(r.taxableAmount * 100) / 100,
      cgst: Math.round(r.gstAmount / 2 * 100) / 100,
      sgst: Math.round(r.gstAmount / 2 * 100) / 100,
      gstAmount: Math.round(r.gstAmount * 100) / 100,
      totalValue: Math.round(r.totalValue * 100) / 100,
    }));

    return {
      b2b,
      b2cSummary,
      hsnSummary,
      docSummary: docAgg[0] ?? { totalInvoices: 0, cancelledInvoices: 0, firstInvoiceNo: null, lastInvoiceNo: null },
    };
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard() {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    const startOfToday = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_OFFSET_MS);
    const startOfMonth = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - IST_OFFSET_MS);

    const prevStartOfMonth = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth() - 1, 1) - IST_OFFSET_MS);

    const [todayStats, monthStats, allTimeStats, outstandingAgg, customerCount, recentBills, thisMonthTags, prevMonthTags] = await Promise.all([
      this.billModel.aggregate([
        { $match: { status: 'active', createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, collected: { $sum: '$amountPaid' } } },
      ]),
      this.billModel.aggregate([
        { $match: { status: 'active', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, collected: { $sum: '$amountPaid' }, due: { $sum: '$amountDue' } } },
      ]),
      this.billModel.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, collected: { $sum: '$amountPaid' } } },
      ]),
      this.billModel.aggregate([
        { $match: { status: 'active', paymentStatus: { $in: ['unpaid', 'partial'] } } },
        { $group: { _id: null, totalOutstanding: { $sum: '$amountDue' } } },
      ]),
      this.userModel.countDocuments({}),
      this.billModel.find({ status: 'active' }).sort({ createdAt: -1 }).limit(10).lean(),
      this.billModel.aggregate([
        { $match: { status: 'active', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: '$orderTag', total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
      this.billModel.aggregate([
        { $match: { status: 'active', createdAt: { $gte: prevStartOfMonth, $lt: startOfMonth } } },
        { $group: { _id: '$orderTag', total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
    ]);

    // Merge tag stats with prev-month for trend
    const prevMap: Record<string, { total: number; count: number }> = {};
    for (const t of prevMonthTags) prevMap[t._id] = { total: t.total, count: t.count };
    const tagStats = thisMonthTags.map((t: any) => {
      const prev = prevMap[t._id] ?? { total: 0, count: 0 };
      return {
        tag: t._id,
        total: t.total,
        count: t.count,
        prevTotal: prev.total,
        trend: prev.total > 0 ? Math.round((t.total - prev.total) / prev.total * 100) : null,
      };
    });

    return {
      today: todayStats[0] ?? { total: 0, count: 0, collected: 0 },
      month: monthStats[0] ?? { total: 0, count: 0, collected: 0, due: 0 },
      allTime: allTimeStats[0] ?? { total: 0, count: 0, collected: 0 },
      outstanding: outstandingAgg[0]?.totalOutstanding ?? 0,
      customerCount,
      recentBills,
      tagStats,
    };
  }

  // ─── Reports ─────────────────────────────────────────────────────────────

  async getProductReport(filters: {
    startDate?: string;
    endDate?: string;
    orderTag?: string;
    customerId?: string;
  }) {
    const match: any = { status: 'active' };
    if (filters.startDate || filters.endDate) {
      match.createdAt = {};
      if (filters.startDate) match.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) match.createdAt.$lte = new Date(filters.endDate);
    }
    if (filters.orderTag) match.orderTag = filters.orderTag;
    if (filters.customerId) match.customerId = new Types.ObjectId(filters.customerId);

    return this.billModel.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: { sku: '$items.sku', name: '$items.name', hsnCode: '$items.hsnCode' },
          totalQty: { $sum: '$items.qty' },
          totalValue: { $sum: ITEM_VALUE },
          uniqueCustomers: { $addToSet: '$customerId' },
          lines: { $push: SALE_LINE },
        },
      },
      {
        $project: {
          _id: 0,
          sku: '$_id.sku',
          name: '$_id.name',
          hsnCode: '$_id.hsnCode',
          lines: 1,
          totalQty: 1,
          totalValue: 1,
          uniqueCustomerCount: { $size: '$uniqueCustomers' },
          avgRate: { $cond: [{ $gt: ['$totalQty', 0] }, { $divide: ['$totalValue', '$totalQty'] }, 0] },
        },
      },
      { $sort: { totalValue: -1 } },
    ]);
  }

  async getCustomerReport(filters: {
    startDate?: string;
    endDate?: string;
    orderTag?: string;
    productSku?: string;
    customerId?: string;
  }) {
    const match: any = { status: 'active' };
    if (filters.startDate || filters.endDate) {
      match.createdAt = {};
      if (filters.startDate) match.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) match.createdAt.$lte = new Date(filters.endDate);
    }
    if (filters.orderTag) match.orderTag = filters.orderTag;
    if (filters.customerId) match.customerId = new Types.ObjectId(filters.customerId);

    const pipeline: any[] = [{ $match: match }, { $unwind: '$items' }];
    if (filters.productSku?.trim()) {
      pipeline.push({ $match: { 'items.sku': { $regex: filters.productSku.trim(), $options: 'i' } } });
    }

    pipeline.push(
      {
        $group: {
          _id: { customerId: '$customerId', sku: '$items.sku' },
          customerName: { $first: '$customerName' },
          customerPhone: { $first: '$customerPhone' },
          billingAddress: { $first: '$billingAddress' },
          productName: { $first: '$items.name' },
          hsnCode: { $first: '$items.hsnCode' },
          qty: { $sum: '$items.qty' },
          value: { $sum: ITEM_VALUE },
          lines: { $push: SALE_LINE },
        },
      },
      {
        $group: {
          _id: '$_id.customerId',
          customerName: { $first: '$customerName' },
          customerPhone: { $first: '$customerPhone' },
          billingAddress: { $first: '$billingAddress' },
          totalQty: { $sum: '$qty' },
          totalValue: { $sum: '$value' },
          products: {
            $push: {
              sku: '$_id.sku',
              name: '$productName',
              hsnCode: '$hsnCode',
              qty: '$qty',
              value: '$value',
              lines: '$lines',
            },
          },
        },
      },
      { $sort: { totalValue: -1 } },
    );

    return this.billModel.aggregate(pipeline);
  }

  async createBillV1(dto: {
    docType?: 'SALE' | 'CREDIT_NOTE' | 'SALE_ORDER';
    refInvoiceNo?: string;
    convertedFromOrderNo?: string;
    paymentTerm?: string;
    invoiceDate?: string;
    invoiceNo?: string;
    placeOfSupply?: string;
    godownId?: string;
    storeId?: string; // IMS store the stock comes from
    customerId: string;
    billingAddress?: string;
    shippingAddress?: string;
    sameAsBilling?: boolean;
    orderTag: string;
    paymentMode?: string;
    items: Array<{
      productId: string;
      variantSku?: string;
      name: string;
      sku: string;
      hsnCode: string;
      mrp?: number;
      qty: number;
      unit?: string;
      rate: number;
      priceInclTax?: boolean;
      discountPct?: number;
      gstRate: number;
    }>;
    billDiscountPct?: number;
    billDiscountMode?: 'percent' | 'amount';
    charges?: Array<{ label: string; amtRupees: number; hsn?: string; gstRate?: number }>;
    roundOffEnabled?: boolean;
    amountPaidRupees?: number;
    payments?: Array<{ mode: 'cash' | 'upi'; amountRupees: number }>;
    terms?: string;
    notes?: string;
    deliveryUserId?: string;
    deliveryUserName?: string;
    sendWhatsApp?: boolean;
    stockLocation?: 'godown' | 'store';
    stockOverrideReason?: string;
  }, userId = 'system', ip = '', canOverrideStock = false) {
    if (!dto.items?.length) throw new BadRequestException('Bill must have at least one item');
    if (!dto.customerId) throw new BadRequestException('Select a customer first');
    const noId = dto.items.find(i => !i.productId);
    if (noId) throw new BadRequestException(`Item "${noId.name}" has no product id: remove it and add it again`);
    if (!isChannel(dto.orderTag)) throw new BadRequestException('Sales channel is required: Transport Order, B2B Order, Home Delivery Order or Store Order');

    const docType = dto.docType ?? 'SALE';
    await this.taxSettings.assertPeriodOpen(dto.invoiceDate ? new Date(dto.invoiceDate) : new Date());

    // 0. Stock lives in IMS: a sale takes from the chosen store and may not take it below zero;
    //    a credit note puts stock back into that store; a sale order does not touch stock.
    let stockOverride: { reason: string; by: string; short: string[] } | undefined;
    const store: any = docType === 'SALE_ORDER' ? undefined : await this.imsStore(dto.storeId);
    let imsTake: Array<{ productId: string; variantSku?: string; qty: number }> = [];
    if (docType === 'SALE') {
      const chk = await this.checkImsStock(String(store._id), store.name, dto.items, { reason: dto.stockOverrideReason, allowed: canOverrideStock });
      imsTake = chk.take;
      if (chk.overridden) stockOverride = { reason: dto.stockOverrideReason!.trim(), by: userId, short: chk.short };
    }

    // 1. Invoice number
    const providedNo = dto.invoiceNo?.trim();
    let invoiceNo: string;
    if (providedNo) {
      if (!validateInvoiceNo(providedNo)) throw new BadRequestException('Invoice number must be 1-16 chars, letters/digits/hyphen/slash only');
      const existing = await this.billModel.findOne({ invoiceNo: providedNo }).setOptions({ allDocTypes: true }).lean();
      if (existing) throw new ConflictException(`Invoice number ${providedNo} already exists`);
      invoiceNo = providedNo;
    } else {
      invoiceNo = await this.nextInvoiceNoV1(docType);
    }

    // 2. Customer snapshot
    const customer = await this.userModel.findById(dto.customerId).lean() as any;
    if (!customer) throw new NotFoundException('Customer not found');

    // 3. Tax direction
    const pos = dto.placeOfSupply ?? '22';
    const isInterState = pos !== '22';

    // Snapshot per-product reporting attributes (GST treatment, UQC, category, barcode)
    const productDocs = await this.productModel
      .find({ _id: { $in: dto.items.map(i => i.productId) } })
      .select('gstTreatment uqc sku category')
      .populate('category', 'name')
      .lean() as any[];
    const productById = new Map(productDocs.map(p => [String(p._id), p]));

    // Rates come from the effective-dated rule master for the invoice date, not from the client.
    // shortcut: no matching rule keeps the client's rate so billing works until the master is seeded; cess is not billed yet.
    const rateDate = dto.invoiceDate ? new Date(dto.invoiceDate) : new Date();
    const TREATMENT = { taxable: 'TAXABLE', nil: 'NIL_RATED', exempt: 'EXEMPT', non_gst: 'NON_GST' } as const;
    for (const item of dto.items) {
      const prod = productById.get(item.productId);
      const rule = await this.taxSettings.findRate(
        { _id: item.productId, hsnCode: item.hsnCode ?? '', categoryId: prod?.category?._id ? String(prod.category._id) : undefined },
        rateDate,
      );
      if (!rule) continue;
      item.gstRate = rule.taxability === 'taxable' ? rule.gstRate : 0;
      const t = TREATMENT[rule.taxability as keyof typeof TREATMENT];
      if (t) productById.set(item.productId, { ...(prod ?? {}), gstTreatment: t });
    }

    // 4. Charges. A charge with gstRate is GST-inclusive (e.g. Shipping, SAC 996511 @18%) and flows into GST reports as a pseudo-line
    const chargesPaise = (dto.charges ?? []).map(c => {
      const amtPaise = Math.round(c.amtRupees * 100);
      if (!c.gstRate || c.gstRate <= 0) return { label: c.label, amtPaise, hsn: c.hsn, gstRate: c.gstRate };
      const taxablePaise = Math.round(amtPaise * 100 / (100 + c.gstRate));
      const tax = amtPaise - taxablePaise;
      const cgst = isInterState ? 0 : Math.floor(tax / 2);
      return {
        label: c.label, amtPaise, hsn: c.hsn, gstRate: c.gstRate, taxablePaise,
        cgst, sgst: isInterState ? 0 : tax - cgst, igst: isInterState ? tax : 0,
      };
    });
    const chargesTotalPaise = chargesPaise.reduce((s, c) => s + c.amtPaise, 0);

    // 5. Line maths, bill discount, tax split and round-off: from the formulas in force on the invoice date (Logics page)
    // amount mode: billDiscountPct carries rupees, capped at the subtotal; the % stored for print is derived
    const rawDisc = dto.billDiscountPct ?? 0;
    if (!(rawDisc >= 0) || (dto.billDiscountMode !== 'amount' && rawDisc > 100)) throw new BadRequestException('Invalid bill discount');
    const { version: formulaVersion, formulas } = await this.logics.formulasFor(rateDate);
    let calc: CalcResult;
    try {
      calc = calcBill(
        dto.items.map(i => ({ rate: i.rate, qty: i.qty, discountPct: i.discountPct ?? 0, gstRate: i.gstRate, priceInclTax: i.priceInclTax !== false })),
        { discountValue: rawDisc, discountMode: dto.billDiscountMode === 'amount' ? 'amount' : 'percent', roundOff: !!dto.roundOffEnabled, isInterState, chargesTotalPaise },
        formulas,
      );
    } catch (e: any) {
      throw new BadRequestException(`Bill formula problem: ${e.message}. Ask an admin to check the Logics page.`);
    }
    const billDiscAmtPaise = calc.billDiscAmtPaise;
    const billDiscountPct = dto.billDiscountMode === 'amount'
      ? (calc.preTaxableTotal > 0 ? +(billDiscAmtPaise * 100 / calc.preTaxableTotal).toFixed(2) : 0)
      : rawDisc;

    const lines = dto.items.map((item, i) => {
      const { discountAmt: lineDiscAmt, taxable: taxableABD, taxAmt, cgst, sgst, igst, total } = calc.lines[i];
      return {
        productId: new Types.ObjectId(item.productId),
        variantSku: item.variantSku || undefined,
        name: item.name,
        sku: item.sku,
        hsnCode: item.hsnCode ?? '',
        mrp: item.mrp ?? 0,
        qty: item.qty,
        unit: item.unit ?? 'NOS',
        gstTreatment: productById.get(item.productId)?.gstTreatment ?? (item.gstRate > 0 ? 'TAXABLE' : 'NIL_RATED'),
        uqc: productById.get(item.productId)?.uqc ?? 'NOS',
        category: productById.get(item.productId)?.category?.name ?? '',
        barcode: item.variantSku ? item.sku : (productById.get(item.productId)?.sku ?? item.sku),
        rate: item.rate,
        priceInclTax: item.priceInclTax !== false,
        discountPct: item.discountPct ?? 0,
        discountAmt: lineDiscAmt,
        taxable: taxableABD,
        gstRate: item.gstRate,
        cgst, sgst, igst,
        total,
        // backward compat float fields:
        unitPrice: item.rate,
        taxableAmount: +(taxableABD / 100).toFixed(2),
        gstAmount: +(taxAmt / 100).toFixed(2),
      };
    });

    // 6. Totals (charge tax is added to the reported CGST/SGST/IGST; it is already inside the charge amount)
    const cgstTotalPaise = calc.cgstTotal + chargesPaise.reduce((s, c) => s + (c.cgst ?? 0), 0);
    const sgstTotalPaise = calc.sgstTotal + chargesPaise.reduce((s, c) => s + (c.sgst ?? 0), 0);
    const igstTotalPaise = calc.igstTotal + chargesPaise.reduce((s, c) => s + (c.igst ?? 0), 0);
    const taxableTotalPaise = calc.taxableTotal + chargesPaise.reduce((s, c) => s + (c.taxablePaise ?? 0), 0);
    const { roundOffPaise, grandTotalPaise } = calc;

    const billedAt = new Date();
    // split tender (e.g. 500 cash + 600 UPI) comes as dto.payments; amountPaidRupees + paymentMode stays for older callers
    const splits = dto.payments ?? [];
    for (const p of splits) {
      if (!['cash', 'upi'].includes(p.mode) || !(p.amountRupees >= 0)) throw new BadRequestException('Payments must be cash or upi with a valid amount');
    }
    const payments = splits.length
      ? splits.filter(p => p.amountRupees > 0).map(p => ({ mode: p.mode, amountPaise: Math.round(p.amountRupees * 100), at: billedAt, kind: 'INITIAL' as const }))
      : (dto.amountPaidRupees ?? 0) > 0
        ? [{ mode: dto.paymentMode ?? 'cash', amountPaise: Math.round(dto.amountPaidRupees! * 100), at: billedAt, kind: 'INITIAL' as const }]
        : [];
    const amountPaidPaise = payments.reduce((s, p) => s + p.amountPaise, 0);
    if (splits.length && amountPaidPaise > grandTotalPaise) throw new BadRequestException('Payments exceed the bill total');
    const amountDuePaise = Math.max(0, grandTotalPaise - amountPaidPaise);
    const paymentStatus: PaymentStatus = amountDuePaise <= 0 ? 'paid' : amountPaidPaise > 0 ? 'partial' : 'unpaid';
    const billPaymentMode = splits.length ? ([...new Set(payments.map(p => p.mode))].join(', ') || 'credit') : (dto.paymentMode ?? 'credit');

    // 8. GSTR-1 section
    const gstin = customer.gstNo ?? '';
    const hasValidGstin = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin);
    const B2CL_THRESHOLD_PAISE = Number(await this.taxSettings.paramOrDefault('b2clThreshold', rateDate));
    let gstr1Section: string;
    if (hasValidGstin) {
      gstr1Section = 'B2B';
    } else if (isInterState && grandTotalPaise > B2CL_THRESHOLD_PAISE) {
      gstr1Section = 'B2CL';
    } else {
      gstr1Section = 'B2CS';
    }

    // 9. Resolve billing address
    const rawPhone = customer.phone ?? '';
    const customerPhone = /^91\d{10}$/.test(rawPhone) ? rawPhone.slice(2) : rawPhone;
    const billingAddrs: any[] = customer.billingAddresses ?? [];
    const defaultBillingLine =
      (billingAddrs.find((a: any) => a.isDefault) ?? billingAddrs[0])?.line ?? '';

    // take the stock first (atomic per line); if the bill cannot be saved it goes straight back
    const taken = docType === 'SALE' ? await this.takeImsStock(String(store._id), imsTake) : [];
    let bill: any;
    try {
    bill = await this.billModel.create({
      invoiceNo,
      invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : billedAt,
      docType,
      refInvoiceNo: dto.refInvoiceNo,
      convertedFromOrderNo: dto.convertedFromOrderNo,
      payments,
      customerId: new Types.ObjectId(dto.customerId),
      customerName: customer.name ?? '',
      customerPhone,
      customerGstNo: customer.gstNo,
      billingAddress: dto.billingAddress ?? defaultBillingLine,
      shippingAddress: (dto.sameAsBilling !== false) ? (dto.billingAddress ?? defaultBillingLine) : (dto.shippingAddress ?? ''),
      sameAsBilling: dto.sameAsBilling !== false,
      customerTags: customer.tags ?? [],
      orderTag: dto.orderTag,
      deliveryUserId: dto.deliveryUserId,
      deliveryUserName: dto.deliveryUserName,
      godownId: dto.godownId,
      storeId: store ? new Types.ObjectId(String(store._id)) : undefined,
      storeName: store?.name,
      stockOverride,
      placeOfSupply: pos,
      isInterState,
      paymentTerm: dto.paymentTerm ?? 'credit',
      paymentMode: billPaymentMode,
      items: lines,
      billDiscountPct,
      billDiscountAmtPaise: billDiscAmtPaise,
      charges: chargesPaise,
      roundOffPaise,
      cgstTotalPaise,
      sgstTotalPaise,
      igstTotalPaise,
      grandTotalPaise,
      amountPaidPaise,
      amountDuePaise,
      gstr1Section,
      formulaVersion,
      // backward compat float fields:
      subtotal: +(taxableTotalPaise / 100).toFixed(2),
      totalGst: +((cgstTotalPaise + sgstTotalPaise + igstTotalPaise) / 100).toFixed(2),
      grandTotal: +(grandTotalPaise / 100).toFixed(2),
      amountPaid: +(amountPaidPaise / 100).toFixed(2),
      amountDue: +(amountDuePaise / 100).toFixed(2),
      paymentStatus,
      terms: dto.terms,
      notes: dto.notes,
      status: 'active',
    });
    } catch (e) {
      await this.returnImsStock(String(store?._id), taken);
      throw e;
    }
    // a credit note brings the goods back into the same store
    if (docType === 'CREDIT_NOTE') await this.returnImsStock(String(store._id), dto.items.map(i => ({ productId: i.productId, variantSku: i.variantSku, qty: i.qty })));

    await this.auditLogModel.create({
      targetCollection: 'BillingBill',
      docId: bill._id,
      action: 'create',
      before: null,
      after: { invoiceNo, grandTotalPaise, paymentStatus },
      userId,
      ip,
      at: new Date(),
    });

    // Sale orders never touch the party balance; credit notes reduce it
    const outstandingDelta = docType === 'SALE' ? amountDuePaise : docType === 'CREDIT_NOTE' ? -amountDuePaise : 0;
    if (outstandingDelta !== 0) {
      await this.userModel.findByIdAndUpdate(dto.customerId, { $inc: { outstanding: outstandingDelta / 100 } });
    }
    this.crmEngine.refreshUser(dto.customerId).catch(() => {});
    // fire and forget: a WhatsApp problem must never fail or delay the bill
    if (dto.sendWhatsApp !== false && docType !== 'SALE_ORDER') this.billingWhatsapp.queue(String(bill._id)).catch(() => {});
    return bill;
  }

  retryWhatsapp(id: string) {
    return this.billingWhatsapp.retry(id);
  }

  async cancelBill(id: string, reason: string, userId = 'system', ip = '') {
    if (!reason?.trim()) throw new BadRequestException('Cancel reason required');
    const bill = await this.billModel.findById(id).setOptions({ allDocTypes: true }).lean() as any;
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status === 'cancelled') throw new BadRequestException('Already cancelled');
    await this.taxSettings.assertPeriodOpen(new Date(bill.invoiceDate ?? bill.createdAt));

    await this.billModel.updateOne({ _id: id }, { $set: { status: 'cancelled', cancelReason: reason.trim() } });
    // IMS stock goes back (sale) or out again (credit note) in the store the bill used; old bills have no store and are left alone
    if (bill.storeId && bill.docType !== 'SALE_ORDER') {
      const lines = (bill.items ?? []).map((i: any) => ({ productId: String(i.productId), variantSku: i.variantSku || undefined, qty: Number(i.qty) || 0 }));
      if (bill.docType === 'CREDIT_NOTE') await this.takeImsStock(String(bill.storeId), lines).catch(() => undefined);
      else await this.returnImsStock(String(bill.storeId), lines);
    }
    // creation added the unpaid amount to the customer's outstanding (a credit note subtracted it); undo that
    const due = Number(bill.amountDue) || 0;
    if (bill.docType !== 'SALE_ORDER' && due > 0 && bill.customerId) {
      await this.userModel.findByIdAndUpdate(bill.customerId, { $inc: { outstanding: bill.docType === 'CREDIT_NOTE' ? due : -due } });
    }
    await this.auditLogModel.create({
      targetCollection: 'BillingBill',
      docId: bill._id,
      action: 'cancel',
      before: { status: bill.status },
      after: { status: 'cancelled', cancelReason: reason.trim() },
      userId,
      ip,
      at: new Date(),
    });
    return { ok: true };
  }

  /** Edit a sale = cancel it (stock back) and issue a corrected invoice. If the new one fails, the old bill is restored. */
  async reissueBill(id: string, dto: any, userId = 'system', ip = '', canOverrideStock = false) {
    const old = await this.billModel.findById(id).setOptions({ allDocTypes: true }).lean() as any;
    if (!old) throw new NotFoundException('Bill not found');
    if (old.status === 'cancelled') throw new BadRequestException('Bill is already cancelled');
    const oldType = old.docType ?? 'SALE';
    if (oldType !== 'SALE' && oldType !== 'SALE_ORDER') throw new BadRequestException('Only sale invoices and sale orders can be edited');

    await this.cancelBill(id, `Edited - replaced by a corrected invoice`, userId, ip);
    let created: any;
    try {
      created = await this.createBillV1(dto, userId, ip, canOverrideStock);
    } catch (e) {
      // put the old bill back exactly as it was: active, stock taken again, balance restored
      await this.billModel.updateOne({ _id: id }, { $set: { status: 'active' }, $unset: { cancelReason: 1 } });
      if (old.storeId && oldType === 'SALE') {
        const lines = (old.items ?? []).map((i: any) => ({ productId: String(i.productId), variantSku: i.variantSku || undefined, qty: Number(i.qty) || 0 }));
        await this.takeImsStock(String(old.storeId), lines).catch(() => undefined);
      }
      const due = Number(old.amountDue) || 0;
      if (due > 0 && oldType === 'SALE') await this.userModel.findByIdAndUpdate(old.customerId, { $inc: { outstanding: due } });
      throw e;
    }
    await this.billModel.updateOne({ _id: id }, { $set: { cancelReason: `Edited - replaced by ${created.invoiceNo}` } });
    return created;
  }

  /** Confirm a sale order: issue the real invoice (stock and balance apply now), then close the order. */
  async convertOrder(id: string, dto: any, userId = 'system', ip = '', canOverrideStock = false) {
    const order = await this.billModel.findById(id).setOptions({ allDocTypes: true }).lean() as any;
    if (!order) throw new NotFoundException('Sale order not found');
    if (order.docType !== 'SALE_ORDER') throw new BadRequestException('Not a sale order');
    if (order.status !== 'active') throw new BadRequestException('This sale order is already confirmed or cancelled');
    const bill = await this.createBillV1({ ...dto, docType: 'SALE', convertedFromOrderNo: order.invoiceNo }, userId, ip, canOverrideStock);
    await this.billModel.updateOne({ _id: id }, { $set: { status: 'converted', cancelReason: `Confirmed as ${bill.invoiceNo}` } });
    return bill;
  }

  async recordPayment(id: string, amount: number, mode = 'cash') {
    const bill = await this.billModel.findById(id);
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status === 'cancelled') throw new BadRequestException('Cannot record payment on cancelled bill');

    const newPaid = Math.min(bill.amountPaid + amount, bill.grandTotal);
    const newDue = Math.round((bill.grandTotal - newPaid) * 100) / 100;
    const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

    const prevDue = bill.amountDue;
    const prevPaidPaise = Math.round(bill.amountPaid * 100);
    bill.amountPaid = newPaid;
    bill.amountDue = newDue;
    bill.amountPaidPaise = Math.round(newPaid * 100);
    bill.amountDuePaise = Math.round(newDue * 100);
    // legacy bill with no payments array: keep what was paid at creation as its INITIAL payment
    if (!bill.payments.length && prevPaidPaise > 0) {
      bill.payments.push({ mode: bill.paymentMode || 'cash', amountPaise: prevPaidPaise, at: (bill as any).createdAt, kind: 'INITIAL' });
    }
    bill.payments.push({ mode, amountPaise: Math.round((prevDue - newDue) * 100), at: new Date(), kind: 'LATER' });
    bill.paymentStatus = newStatus as any;
    await bill.save();

    // Update outstanding on User
    const reduction = prevDue - newDue;
    if (reduction > 0) {
      await this.userModel.findByIdAndUpdate(bill.customerId, {
        $inc: { outstanding: -reduction },
      });
    }

    return bill;
  }
}
