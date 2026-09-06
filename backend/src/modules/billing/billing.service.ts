import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillingCustomer, BillingCustomerDocument, CustomerTag, TAG_PRIORITY } from './schemas/billing-customer.schema';
import { BillingTagPrice, BillingTagPriceDocument } from './schemas/billing-tag-price.schema';
import { BillingBill, BillingBillDocument, BillLineItem } from './schemas/billing-bill.schema';
import { BillingCounter, BillingCounterDocument } from './schemas/billing-counter.schema';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(BillingCustomer.name) private customerModel: Model<BillingCustomerDocument>,
    @InjectModel(BillingTagPrice.name) private tagPriceModel: Model<BillingTagPriceDocument>,
    @InjectModel(BillingBill.name) private billModel: Model<BillingBillDocument>,
    @InjectModel(BillingCounter.name) private counterModel: Model<BillingCounterDocument>,
    @InjectModel('Product') private productModel: Model<any>,
  ) {}

  // ─── Customers ───────────────────────────────────────────────────────────

  async searchCustomers(q: string) {
    if (!q?.trim()) return this.customerModel.find().sort({ name: 1 }).limit(50).lean();
    return this.customerModel.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { canonicalName: { $regex: q, $options: 'i' } },
      ],
    }).limit(20).lean();
  }

  async getCustomer(id: string) {
    const c = await this.customerModel.findById(id).lean();
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  async createCustomer(data: {
    name: string;
    phone: string;
    altPhone?: string;
    gstNo?: string;
    tags?: CustomerTag[];
    addresses?: Array<{ label: string; line: string; isDefault?: boolean }>;
  }) {
    const existing = await this.customerModel.findOne({ phone: data.phone }).lean();
    if (existing) throw new ConflictException('Customer with this phone already exists');

    const canonicalName = data.name.trim();
    let displayName = canonicalName;

    const nameTaken = await this.customerModel.findOne({ canonicalName }).lean();
    if (nameTaken) displayName = `${canonicalName} (${data.phone.slice(-3)})`;

    const addresses = (data.addresses ?? []).map((a, i) => ({
      label: a.label,
      line: a.line,
      isDefault: a.isDefault ?? i === 0,
    }));

    return this.customerModel.create({
      name: displayName,
      canonicalName,
      phone: data.phone,
      altPhone: data.altPhone,
      gstNo: data.gstNo,
      tags: data.tags ?? [],
      addresses,
    });
  }

  async updateCustomer(id: string, data: Partial<{
    altPhone: string;
    gstNo: string;
    tags: CustomerTag[];
    addresses: Array<{ label: string; line: string; isDefault: boolean }>;
  }>) {
    const c = await this.customerModel.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  async addAddress(id: string, address: { label: string; line: string; isDefault?: boolean }) {
    const customer = await this.customerModel.findById(id);
    if (!customer) throw new NotFoundException('Customer not found');

    const makeDefault = address.isDefault ?? false;
    customer.addresses = customer.addresses.map(a => ({
      label: a.label, line: a.line, isDefault: makeDefault ? false : a.isDefault,
    }));
    customer.addresses.push({ label: address.label, line: address.line, isDefault: makeDefault });
    customer.markModified('addresses');
    return customer.save();
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
    const customer = await this.customerModel.findById(data.customerId).lean();
    if (!customer) throw new NotFoundException('Customer not found');
    if (!data.items?.length) throw new BadRequestException('Bill must have at least one item');

    // Compute line items
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

    // Resolve billing address
    const defaultAddr = customer.addresses.find(a => a.isDefault) ?? customer.addresses[0];
    const billingAddress = data.billingAddress ?? defaultAddr?.line;

    const bill = await this.billModel.create({
      invoiceNo,
      customerId: new Types.ObjectId(data.customerId),
      customerName: customer.name,
      customerPhone: customer.phone,
      customerGstNo: customer.gstNo,
      billingAddress,
      customerTags: customer.tags,
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

    // Update customer stats
    await this.customerModel.findByIdAndUpdate(data.customerId, {
      $inc: { orderCount: 1, totalPurchase: grandTotal, outstanding: amountDue },
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

    // Update customer outstanding
    const reduction = prevDue - newDue;
    if (reduction > 0) {
      await this.customerModel.findByIdAndUpdate(bill.customerId, {
        $inc: { outstanding: -reduction },
      });
    }

    return bill;
  }
}
