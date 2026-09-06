import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillingCustomer, BillingCustomerDocument, CustomerTag, TAG_PRIORITY } from './schemas/billing-customer.schema';
import { BillingTagPrice, BillingTagPriceDocument } from './schemas/billing-tag-price.schema';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(BillingCustomer.name) private customerModel: Model<BillingCustomerDocument>,
    @InjectModel(BillingTagPrice.name) private tagPriceModel: Model<BillingTagPriceDocument>,
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

    // duplicate name → suffix last 3 digits
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
    // name intentionally excluded — display name is controlled by dedup logic at create time
    const c = await this.customerModel.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  async addAddress(id: string, address: { label: string; line: string; isDefault?: boolean }) {
    const customer = await this.customerModel.findById(id);
    if (!customer) throw new NotFoundException('Customer not found');

    const makeDefault = address.isDefault ?? false;
    // rebuild array so Mongoose detects the mutation (forEach mutation isn't always tracked)
    customer.addresses = customer.addresses.map(a => ({
      label: a.label, line: a.line, isDefault: makeDefault ? false : a.isDefault,
    }));
    customer.addresses.push({ label: address.label, line: address.line, isDefault: makeDefault });
    customer.markModified('addresses');
    return customer.save();
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
        // Mongoose timestamps middleware doesn't run on bulkWrite — set manually
        update: {
          $set: { price: r.price, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));
    return this.tagPriceModel.bulkWrite(ops);
  }

  /** Returns the effective price for a product given a customer's tags. */
  resolvePrice(basePrice: number, customerTags: CustomerTag[], tagPrices: Array<{ tag: string; price: number }>) {
    for (const tag of TAG_PRIORITY) {
      if (!customerTags.includes(tag)) continue;
      const tp = tagPrices.find(p => p.tag === tag);
      if (tp) return tp.price;
    }
    return basePrice;
  }
}
