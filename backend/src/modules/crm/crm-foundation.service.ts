// Blueprint Phase 1 (M24 orders view + sync health, M06 duplicate detection), mapped onto the existing
// Order / User / BillingBill collections. No new collections: the CRM reads the live store, so there is nothing to sync.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

const BILL_FIELDS = 'invoiceNo invoiceDate createdAt docType status customerName grandTotal amountPaid amountDue paymentStatus';

/** Last 10 digits of an Indian number, or null if it has fewer (+91 / 91 / 0 prefixes, spaces, dashes stripped). */
export const normalisePhone = (p?: string | null): string | null => {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
};

/** Groups users whose normalised phone is the same; groups of one are dropped. */
export function groupDuplicatePhones<T extends { phone?: string | null }>(users: T[]): { phone: string; users: T[] }[] {
  const map = new Map<string, T[]>();
  for (const u of users) {
    const key = normalisePhone(u.phone);
    if (key) map.set(key, [...(map.get(key) ?? []), u]);
  }
  return [...map].filter(([, g]) => g.length > 1).map(([phone, g]) => ({ phone, users: g }));
}

@Injectable()
export class CrmFoundationService {
  constructor(
    @InjectModel('Order') private readonly orderModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('BillingBill') private readonly billModel: Model<any>,
  ) {}

  async listOrders(q: { status?: string; search?: string; from?: string; to?: string; page?: number; limit?: number }) {
    const page = Math.max(1, q.page || 1);
    const limit = Math.min(100, Math.max(1, q.limit || 25));
    const filter: any = {};
    if (q.status) filter.status = q.status;
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    if ((from && isNaN(+from)) || (to && isNaN(+to))) return { items: [], total: 0, page, limit };
    if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
    const s = q.search?.trim();
    if (s) {
      const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ orderNumber: new RegExp(esc, 'i') }, { 'shippingAddress.phone': new RegExp(esc) }, { 'shippingAddress.name': new RegExp(esc, 'i') }];
    }
    const [items, total] = await Promise.all([
      this.orderModel.find(filter).select('orderNumber user total discount status paymentStatus paymentMethod source couponCode createdAt shippingAddress.name shippingAddress.phone shippingAddress.city')
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.orderModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  /** Reconciliation view for the "orders match billing" check: counts and rupee totals, last 90 days. */
  async syncHealth() {
    const since = new Date(Date.now() - 90 * 86_400_000);
    const [orders, bills, latestOrder, latestBill, orphan] = await Promise.all([
      this.orderModel.aggregate([{ $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } }]),
      this.billModel.aggregate([{ $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } }, { $group: { _id: null, count: { $sum: 1 } } }]),
      this.orderModel.findOne().sort({ createdAt: -1 }).select('createdAt').lean(),
      this.billModel.findOne().sort({ createdAt: -1 }).select('createdAt').lean(),
      this.orderModel.aggregate([{ $match: { createdAt: { $gte: since } } }, { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } }, { $match: { u: { $size: 0 } } }, { $count: 'n' }]),
    ]);
    return {
      windowDays: 90,
      orders: { count: orders[0]?.count ?? 0, revenue: orders[0]?.revenue ?? 0, lastAt: (latestOrder as any)?.createdAt ?? null },
      bills: { count: bills[0]?.count ?? 0, lastAt: (latestBill as any)?.createdAt ?? null },
      unmatchedOrders: orphan[0]?.n ?? 0, // orders whose customer record no longer exists
    };
  }

  /** A customer's store bills (sales + credit notes, cancelled ones kept and flagged), newest first. Sale orders are not purchases. */
  customerBills(userId: string) {
    return this.billModel.find({ customerId: new Types.ObjectId(userId), docType: { $in: ['SALE', 'CREDIT_NOTE', null] } })
      .setOptions({ allDocTypes: true })
      .select(`${BILL_FIELDS} subtotal totalGst billDiscountAmtPaise payments paymentMode refInvoiceNo cancelReason items.name items.qty items.unit items.unitPrice items.discountPct items.discountAmt items.gstRate items.gstAmount items.total`)
      .sort({ createdAt: -1 }).limit(500).lean(); // shortcut: capped at 500 bills per customer, paginate if a customer passes that
  }

  /** Newest store bills for the CRM dashboard feed; the page polls this, so payment and cancel changes show up too. */
  liveBills(limit = 20) {
    return this.billModel.find({ docType: { $in: ['SALE', 'CREDIT_NOTE', null] } })
      .setOptions({ allDocTypes: true })
      .select(`${BILL_FIELDS} customerId storeName`)
      .sort({ createdAt: -1 }).limit(Math.min(50, Math.max(1, limit))).lean();
  }

  async findDuplicates() {
    const users = await this.userModel.find({ phone: { $exists: true, $ne: '' } }).select('name phone email createdAt').limit(100_000).lean(); // shortcut: capped scan, switch to an aggregation if users pass 100k
    return groupDuplicatePhones(users as any[]);
  }
}
