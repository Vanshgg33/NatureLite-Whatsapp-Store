import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerTag, TAG_PRIORITY } from './schemas/billing-customer.schema';
import { BillingTagPrice, BillingTagPriceDocument } from './schemas/billing-tag-price.schema';
import { BillingBill, BillingBillDocument, BillLineItem } from './schemas/billing-bill.schema';
import { BillingCounter, BillingCounterDocument } from './schemas/billing-counter.schema';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(User.name) private userModel: Model<any>,
    @InjectModel(BillingTagPrice.name) private tagPriceModel: Model<BillingTagPriceDocument>,
    @InjectModel(BillingBill.name) private billModel: Model<BillingBillDocument>,
    @InjectModel(BillingCounter.name) private counterModel: Model<BillingCounterDocument>,
    @InjectModel('Product') private productModel: Model<any>,
  ) {}

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
      name: u.name ?? '',
      phone: displayPhone,
      gstNo: u.gstNo,
      tags: u.tags ?? [],
      addresses,
      orderCount: u.totalOrders ?? 0,
      totalPurchase: u.totalSpent ?? 0,
      outstanding: u.outstanding ?? 0,
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

    const billingAddresses = (data.addresses ?? []).map((a, i) => ({
      label: a.label,
      line: a.line,
      isDefault: a.isDefault ?? i === 0,
    }));

    const u = await this.userModel.create({
      name: data.name.trim(),
      phone: normalizedPhone,
      gstNo: data.gstNo,
      tags: data.tags ?? [],
      billingAddresses,
      isActive: true,
    });
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

  async searchProductsForBilling(q: string) {
    const filter = q?.trim()
      ? { isActive: true, $or: [{ name: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } }] }
      : { isActive: true };

    const products = await this.productModel
      .find(filter, 'name sku price hsnCode')
      .limit(30)
      .lean();

    if (!products.length) return [];

    const productIds = products.map(p => p._id);
    const tagPrices = await this.tagPriceModel.find({ productId: { $in: productIds } }).lean();

    // group tag prices by productId
    const tpMap: Record<string, Array<{ tag: string; price: number }>> = {};
    for (const tp of tagPrices) {
      const pid = tp.productId.toString();
      if (!tpMap[pid]) tpMap[pid] = [];
      tpMap[pid].push({ tag: tp.tag, price: tp.price });
    }

    return products.map(p => ({
      ...p,
      tagPrices: tpMap[p._id.toString()] ?? [],
    }));
  }

  // ─── Tag Prices ──────────────────────────────────────────────────────────

  async getTagPrices(productId?: string) {
    const filter = productId ? { productId: new Types.ObjectId(productId) } : {};
    return this.tagPriceModel.find(filter).populate('productId', 'name sku price hsnCode').lean();
  }

  async upsertTagPrice(productId: string, tag: CustomerTag, price: number) {
    return this.tagPriceModel.findOneAndUpdate(
      { productId: new Types.ObjectId(productId), tag },
      { price },
      { upsert: true, new: true },
    ).lean();
  }

  async deleteTagPrice(id: string) {
    const r = await this.tagPriceModel.findByIdAndDelete(id).lean();
    if (!r) throw new NotFoundException('Tag price not found');
    return { deleted: true };
  }

  async bulkUpsertTagPrices(rows: Array<{ productId: string; tag: CustomerTag; price: number }>) {
    const now = new Date();
    const ops = rows.map(r => ({
      updateOne: {
        filter: { productId: new Types.ObjectId(r.productId), tag: r.tag },
        update: {
          $set: { price: r.price, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));
    return this.tagPriceModel.bulkWrite(ops);
  }

  resolvePrice(basePrice: number, customerTags: CustomerTag[], tagPrices: Array<{ tag: string; price: number }>) {
    for (const tag of TAG_PRIORITY) {
      if (!customerTags.includes(tag)) continue;
      const tp = tagPrices.find(p => p.tag === tag);
      if (tp) return tp.price;
    }
    return basePrice;
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

  // ─── Bills ───────────────────────────────────────────────────────────────

  async createBill(data: {
    customerId: string;
    billingAddress?: string;
    orderTag: string;
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

    return bill;
  }

  async getBills(filters: {
    customerId?: string;
    paymentStatus?: string;
    orderTag?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const q: any = { status: 'active' };
    if (filters.customerId) q.customerId = new Types.ObjectId(filters.customerId);
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
      this.billModel.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.billModel.countDocuments(q),
    ]);

    return { items, total, page: filters.page ?? 1, limit };
  }

  async getBill(id: string) {
    const bill = await this.billModel.findById(id).lean();
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  // ─── Dues ────────────────────────────────────────────────────────────────

  async getDues() {
    const [bills, summary] = await Promise.all([
      this.billModel
        .find({ status: 'active', paymentStatus: { $in: ['unpaid', 'partial'] } })
        .sort({ createdAt: 1 })
        .limit(500)
        .lean(),
      this.billModel.aggregate([
        { $match: { status: 'active', paymentStatus: { $in: ['unpaid', 'partial'] } } },
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

  async getTopCustomers(limit = 50) {
    // Aggregate billing stats from BillingBill, then join User name/phone
    const rows = await this.billModel.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$customerId',
          customerName: { $first: '$customerName' },
          customerPhone: { $first: '$customerPhone' },
          totalPurchase: { $sum: '$grandTotal' },
          orderCount: { $sum: 1 },
          outstanding: { $sum: '$amountDue' },
        },
      },
      { $sort: { totalPurchase: -1 } },
      { $limit: limit },
    ]);
    return rows;
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
    return this.billModel.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: { hsnCode: '$items.hsnCode', gstRate: '$items.gstRate' },
          taxableAmount: { $sum: '$items.taxableAmount' },
          gstAmount: { $sum: '$items.gstAmount' },
          totalValue: { $sum: '$items.total' },
          qty: { $sum: '$items.qty' },
          b2bTaxable: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$customerGstNo', null] }, { $ne: ['$customerGstNo', ''] }] },
                '$items.taxableAmount', 0,
              ],
            },
          },
          b2cTaxable: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ['$customerGstNo', null] }, { $eq: ['$customerGstNo', ''] }] },
                '$items.taxableAmount', 0,
              ],
            },
          },
          b2bGst: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$customerGstNo', null] }, { $ne: ['$customerGstNo', ''] }] },
                '$items.gstAmount', 0,
              ],
            },
          },
          b2cGst: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ['$customerGstNo', null] }, { $eq: ['$customerGstNo', ''] }] },
                '$items.gstAmount', 0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          hsnCode: '$_id.hsnCode',
          gstRate: '$_id.gstRate',
          taxableAmount: { $round: ['$taxableAmount', 2] },
          gstAmount: { $round: ['$gstAmount', 2] },
          totalValue: { $round: ['$totalValue', 2] },
          qty: 1,
          b2bTaxable: { $round: ['$b2bTaxable', 2] },
          b2cTaxable: { $round: ['$b2cTaxable', 2] },
          b2bGst: { $round: ['$b2bGst', 2] },
          b2cGst: { $round: ['$b2cGst', 2] },
        },
      },
      { $sort: { hsnCode: 1, gstRate: 1 } },
    ]);
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard() {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    const startOfToday = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_OFFSET_MS);
    const startOfMonth = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - IST_OFFSET_MS);

    const [todayStats, monthStats, outstandingAgg, customerCount, recentBills] = await Promise.all([
      this.billModel.aggregate([
        { $match: { status: 'active', createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, collected: { $sum: '$amountPaid' } } },
      ]),
      this.billModel.aggregate([
        { $match: { status: 'active', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, collected: { $sum: '$amountPaid' }, due: { $sum: '$amountDue' } } },
      ]),
      this.billModel.aggregate([
        { $match: { status: 'active', paymentStatus: { $in: ['unpaid', 'partial'] } } },
        { $group: { _id: null, totalOutstanding: { $sum: '$amountDue' } } },
      ]),
      this.userModel.countDocuments({}),
      this.billModel.find({ status: 'active' }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    return {
      today: todayStats[0] ?? { total: 0, count: 0, collected: 0 },
      month: monthStats[0] ?? { total: 0, count: 0, collected: 0, due: 0 },
      outstanding: outstandingAgg[0]?.totalOutstanding ?? 0,
      customerCount,
      recentBills,
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
          totalValue: { $sum: '$items.total' },
          uniqueCustomers: { $addToSet: '$customerId' },
        },
      },
      {
        $project: {
          _id: 0,
          sku: '$_id.sku',
          name: '$_id.name',
          hsnCode: '$_id.hsnCode',
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
  }) {
    const match: any = { status: 'active' };
    if (filters.startDate || filters.endDate) {
      match.createdAt = {};
      if (filters.startDate) match.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) match.createdAt.$lte = new Date(filters.endDate);
    }
    if (filters.orderTag) match.orderTag = filters.orderTag;

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
          value: { $sum: '$items.total' },
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
            },
          },
        },
      },
      { $sort: { totalValue: -1 } },
    );

    return this.billModel.aggregate(pipeline);
  }

  async recordPayment(id: string, amount: number) {
    const bill = await this.billModel.findById(id);
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status === 'cancelled') throw new BadRequestException('Cannot record payment on cancelled bill');

    const newPaid = Math.min(bill.amountPaid + amount, bill.grandTotal);
    const newDue = Math.round((bill.grandTotal - newPaid) * 100) / 100;
    const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

    const prevDue = bill.amountDue;
    bill.amountPaid = newPaid;
    bill.amountDue = newDue;
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
