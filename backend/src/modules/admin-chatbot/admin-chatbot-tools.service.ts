import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RedisService } from '../redis/redis.service';
import { ProductRepository } from '../products/repositories/product.repository';
import { ChatSessionRepository } from '../chatbot/repositories/chat-session.repository';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { AnalyticsService } from '../analytics/analytics.service';
import { OrderRepository } from '../orders/repositories/order.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { FeedbackRepository } from '../feedback/repositories/feedback.repository';
import { CouponRepository } from '../coupons/repositories/coupon.repository';
import { CartRepository } from '../cart/repositories/cart.repository';
import { WalletRepository } from '../wallet/repositories/wallet.repository';
import { WalletTransactionRepository } from '../wallet/repositories/wallet-transaction.repository';
import { PaymentRepository } from '../payments/repositories/payment.repository';
import { StoreSaleRepository } from '../store-sales/repositories/store-sale.repository';
import { ReminderRepository } from '../reminders/repositories/reminder.repository';
import { MessageLogRepository } from '../whatsapp/repositories/message-log.repository';
import { StoreStockRepository } from '../store-stock/repositories/store-stock.repository';
import { CategoryRepository } from '../categories/repositories/category.repository';
import { AdminUserRepository } from '../admin/repositories/admin-user.repository';
import { Subscription } from '../subscriptions/schemas/subscription.schema';
import { RawMaterial } from '../raw-materials/schemas/raw-material.schema';
import { RawMaterialDailyEntry } from '../raw-materials/schemas/raw-material-snapshot.schema';
import { Store } from '../stores/schemas/store.schema';
import { BillingBill } from '../billing/schemas/billing-bill.schema';
import { BillingCustomer } from '../billing/schemas/billing-customer.schema';
import { Godown } from '../billing/schemas/godown.schema';
import { CrmCustomerStats } from '../crm/schemas/crm-customer-stats.schema';
import { CrmCallLog } from '../crm/schemas/crm-call-log.schema';
import { CrmCampaign } from '../crm/schemas/crm-campaign.schema';
import { PurchaseRequest } from '../purchase/schemas/purchase-request.schema';
import { PurchaseVendor } from '../purchase/schemas/purchase-vendor.schema';
import { PurchaseMaterial } from '../purchase/schemas/purchase-material.schema';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';

const UNCACHED_TOOLS = new Set(['send_email_report', 'preview_email_report']);

const TOOL_TTL: Record<string, number> = {
  get_dashboard_summary: 45, search_orders: 45, get_order_detail: 30,
  get_orders_by_status: 45, compare_periods: 90, search_products: 120,
  get_product_detail: 120, get_products_by_stock: 90, get_store_stock: 60,
  get_raw_materials: 90, get_raw_material_snapshots: 120, get_categories: 300,
  get_stores: 300, search_customers: 120, get_customer_orders: 60,
  get_top_customers: 300, get_customers_filtered: 90, get_revenue_trend: 90,
  get_analytics_period: 300, get_top_selling_products: 300, search_abandoned_carts: 90,
  get_store_sales: 90, get_sale_detail: 60, get_delivery_data: 60,
  get_wallet: 60, get_subscriptions: 90, get_payments: 60,
  search_audit_logs: 60, get_admin_users: 300, get_coupon_list: 180,
  get_coupon_usage: 90, get_feedback_list: 60, get_whatsapp_queue: 30,
  get_whatsapp_messages: 30, get_reminders: 30,
  // billing
  get_billing_bills: 45, get_billing_customers: 120, get_billing_godowns: 300,
  // crm
  get_crm_overview: 60, get_crm_customer_detail: 60, get_crm_call_logs: 60, get_crm_campaigns: 120,
  // purchase
  get_purchase_requests: 45, get_purchase_request_detail: 30,
  get_purchase_vendors: 300, get_purchase_materials: 300,
};

/** Tool implementations shared by every chatbot specialist agent. */
@Injectable()
export class AdminChatbotToolsService {
  private readonly logger = new Logger(AdminChatbotToolsService.name);

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly analyticsService: AnalyticsService,
    private readonly orderRepository: OrderRepository,
    private readonly userRepository: UserRepository,
    private readonly feedbackRepository: FeedbackRepository,
    private readonly couponRepository: CouponRepository,
    private readonly cartRepository: CartRepository,
    private readonly walletRepository: WalletRepository,
    private readonly walletTransactionRepository: WalletTransactionRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly storeSaleRepository: StoreSaleRepository,
    private readonly reminderRepository: ReminderRepository,
    private readonly messageLogRepository: MessageLogRepository,
    private readonly storeStockRepository: StoreStockRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly adminUserRepository: AdminUserRepository,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    @InjectModel(Subscription.name) private readonly subscriptionModel: Model<any>,
    @InjectModel(RawMaterial.name) private readonly rawMaterialModel: Model<any>,
    @InjectModel(RawMaterialDailyEntry.name) private readonly rawMaterialEntryModel: Model<any>,
    @InjectModel(Store.name) private readonly storeModel: Model<any>,
    @InjectModel(BillingBill.name) private readonly billingBillModel: Model<any>,
    @InjectModel(BillingCustomer.name) private readonly billingCustomerModel: Model<any>,
    @InjectModel(Godown.name) private readonly godownModel: Model<any>,
    @InjectModel(CrmCustomerStats.name) private readonly crmStatsModel: Model<any>,
    @InjectModel(CrmCallLog.name) private readonly crmCallLogModel: Model<any>,
    @InjectModel(CrmCampaign.name) private readonly crmCampaignModel: Model<any>,
    @InjectModel(PurchaseRequest.name) private readonly purchaseRequestModel: Model<any>,
    @InjectModel(PurchaseVendor.name) private readonly purchaseVendorModel: Model<any>,
    @InjectModel(PurchaseMaterial.name) private readonly purchaseMaterialModel: Model<any>,
    private readonly redisService: RedisService,
  ) {}

  // ─── Public dispatcher ────────────────────────────────────────────────────────

  async execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (UNCACHED_TOOLS.has(name)) {
      return this._runTool(name, args);
    }

    return this.cachedTool(name, args, () => this._runTool(name, args), TOOL_TTL[name] ?? 90);
  }

  sanitize(message: string): string {
    return message.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 500);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private resolveRange(params: Record<string, unknown>): { from: Date; to: Date } {
    if (params?.from && params?.to) {
      const from = new Date(params.from as string);
      const to = new Date(params.to as string);
      if (!isNaN(from.getTime()) && !isNaN(to.getTime())) return { from, to };
    }
    const days = Math.max(1, Number(params?.days ?? 14));
    const to = new Date();
    const from = new Date(Date.now() - days * 86_400_000);
    return { from, to };
  }

  /** Mongo date filter from explicit from/to args; undefined (= no filter) when absent or unparseable. */
  private dateFilter(params: Record<string, unknown>): { $gte: Date; $lte: Date } | undefined {
    if (!params?.from || !params?.to) return undefined;
    const from = this.parseBound(params.from, false);
    const to = this.parseBound(params.to, true);
    return from && to ? { $gte: from, $lte: to } : undefined;
  }

  /** A bare YYYY-MM-DD means that whole day in IST; anything else is parsed as given. */
  private parseBound(value: unknown, endOfDay: boolean): Date | null {
    const s = String(value);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`)
      : new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Max list rows: the tool loop shows the model at most 25 entries of any array, so ask for no more. */
  private clampLimit(value: unknown, fallback = 20, max = 25): number {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
  }

  private escape(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private toIST(d: Date | string | null | undefined, dateOnly = false): string {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d as string);
    if (isNaN(date.getTime())) return '';
    const ist = new Date(date.getTime() + 19_800_000); // UTC+5:30
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dd = String(ist.getUTCDate()).padStart(2, '0');
    const mon = months[ist.getUTCMonth()];
    const yyyy = ist.getUTCFullYear();
    if (dateOnly) return `${dd} ${mon} ${yyyy}`;
    let h = ist.getUTCHours();
    const min = String(ist.getUTCMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${dd} ${mon} ${yyyy}, ${h}:${min} ${ampm} IST`;
  }

  private async cachedTool<T>(
    name: string,
    params: Record<string, unknown>,
    fn: () => Promise<T>,
    ttl = 90,
  ): Promise<T> {
    // Digest of the full args: a truncated prefix made e.g. customerName "Rahul"/"Rohan" share one entry.
    const paramStr = Object.keys(params).length
      ? ':' + createHash('sha1').update(JSON.stringify(params)).digest('base64url').slice(0, 22)
      : '';
    const key = `admin:tool:${name}${paramStr}`;

    const hit = await this.redisService.getJson<T>(key);
    if (hit !== null) return hit;

    const value = await fn();
    // Errors and "not found" answers are transient: caching them would hide a record created a moment later.
    const transient = value !== null && typeof value === 'object' && ('error' in value || 'message' in value);
    if (!transient) await this.redisService.setJson(key, value, ttl);
    return value;
  }

  // ─── Tool dispatcher ──────────────────────────────────────────────────────────

  private async _runTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (name) {
      case 'get_dashboard_summary':    return this.toolDashboard();
      case 'search_orders':            return this.toolSearchOrders(args);
      case 'get_order_detail':         return this.toolOrderDetail(args);
      case 'get_orders_by_status':     return this.toolOrdersByStatus(args);
      case 'compare_periods':          return this.toolComparePeriods(args);
      case 'search_products':          return this.toolSearchProducts(args);
      case 'get_product_detail':       return this.toolProductDetail(args);
      case 'get_products_by_stock': {
        const s = String(args.status ?? '').toLowerCase();
        if (s === 'out') return this.toolOutOfStock(args);
        if (s === 'in')  return this.toolInStock(args);
        return this.toolLowStock(args); // 'low' default
      }
      case 'get_store_stock':          return this.toolStoreStock(args);
      case 'get_raw_materials':        return this.toolRawMaterials(args);
      case 'get_raw_material_snapshots': return this.toolRawMaterialSnapshots(args);
      case 'get_categories':           return this.toolCategories();
      case 'get_stores':               return this.toolStores();
      case 'search_customers':         return this.toolSearchCustomers(args);
      case 'get_customer_orders':      return this.toolCustomerOrders(args);
      case 'get_top_customers':        return this.toolTopCustomers(args);
      case 'get_customers_filtered': {
        const t = String(args.type ?? '').toLowerCase();
        if (t === 'new')     return this.toolNewCustomers(args);
        if (t === 'blocked') return this.toolBlockedCustomers();
        return this.toolInactiveCustomers(args); // 'inactive' default
      }
      case 'get_revenue_trend':        return this.toolRevenueTrend(args);
      case 'get_analytics_period':     return this.toolAnalyticsPeriod(args);
      case 'get_top_selling_products': return this.toolTopSelling(args);
      case 'search_abandoned_carts':   return this.toolAbandonedCarts(args);
      case 'get_store_sales':          return this.toolStoreSales(args);
      case 'get_sale_detail':          return this.toolSaleDetail(args);
      case 'get_delivery_data': {
        const v = String(args.view ?? '').toLowerCase();
        if (v === 'collections') return this.toolDeliveryCollections(args);
        if (v === 'pending')     return this.toolPendingCollections(args);
        return this.toolDeliveryHistory(args); // 'history' default
      }
      case 'get_wallet':
        return String(args.type ?? '').toLowerCase() === 'transactions'
          ? this.toolWalletTransactions(args)
          : this.toolWalletBalances(args);
      case 'get_subscriptions':
        return (args.phone || args.customerName)
          ? this.toolSubscriptionDetail(args)
          : this.toolSubscriptionData();
      case 'get_payments':
        return String(args.status ?? '').toLowerCase() === 'refunded'
          ? this.toolRefundHistory(args)
          : this.toolPayments(args);
      case 'search_audit_logs':        return this.toolAuditLogs(args);
      case 'get_admin_users':          return this.toolAdminUsers(args);
      case 'get_coupon_list':          return this.toolCouponList(args);
      case 'get_coupon_usage':         return this.toolCouponUsage(args);
      case 'get_feedback_list':        return this.toolFeedbackList(args);
      case 'get_whatsapp_queue':       return this.toolWhatsAppQueue();
      case 'get_whatsapp_messages':    return this.toolWhatsAppMessages(args);
      case 'get_reminders':            return this.toolReminders();
      case 'preview_email_report':     return this.toolPreviewEmail(args);
      case 'send_email_report':        return this.toolSendEmail(args);

      // Billing
      case 'get_billing_bills':        return this.toolBillingBills(args);
      case 'get_billing_customers':    return this.toolBillingCustomers(args);
      case 'get_billing_godowns':      return this.toolBillingGodowns();

      // CRM
      case 'get_crm_overview':         return this.toolCrmOverview();
      case 'get_crm_customer_detail':  return this.toolCrmCustomerDetail(args);
      case 'get_crm_call_logs':        return this.toolCrmCallLogs(args);
      case 'get_crm_campaigns':        return this.toolCrmCampaigns(args);

      // Purchase
      case 'get_purchase_requests':        return this.toolPurchaseRequests(args);
      case 'get_purchase_request_detail':  return this.toolPurchaseRequestDetail(args);
      case 'get_purchase_vendors':         return this.toolPurchaseVendors();
      case 'get_purchase_materials':       return this.toolPurchaseMaterials(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  // ─── Tool implementations ─────────────────────────────────────────────────────

  private async toolDashboard() {
    const stats = await this.analyticsService.getDashboardStats() as any;
    return {
      todayOrders: stats.todayOrders ?? 0,
      todayRevenue: stats.todayRevenue ?? 0,
      monthOrders: stats.monthOrders ?? 0,
      monthRevenue: stats.monthRevenue ?? 0,
      totalCustomers: stats.totalCustomers ?? 0,
      pendingOrders: stats.pendingOrders ?? 0,
      recentOrders: (stats.recentOrders ?? []).slice(0, 5).map((o: any) => ({
        orderNumber: o.orderNumber,
        customer: o.user?.name ?? 'Guest',
        total: o.total,
        status: o.status,
      })),
    };
  }

  private async toolSearchOrders(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 15);
    const STATUS_MAP: Record<string, string> = { shipped: 'out_for_delivery', pending: 'placed', processing: 'preparing', dispatched: 'out_for_delivery', completed: 'delivered', done: 'delivered' };
    // cash and cod are used interchangeably in the DB; online orders may be stored as 'online' or 'prepaid'
    const PAYMENT_ALIASES: Record<string, string[]> = {
      cash: ['cash', 'cod'],
      cod: ['cash', 'cod'],
      'cash on delivery': ['cash', 'cod'],
      online: ['online', 'prepaid'],
      prepaid: ['online', 'prepaid'],
    };
    const rawStatus = args.status as string | undefined;
    const status = rawStatus ? (STATUS_MAP[rawStatus.toLowerCase()] ?? rawStatus.toLowerCase()) : undefined;
    const customerName = String(args.customerName ?? '').trim();
    const paymentRaw = String(args.paymentMethod ?? '').trim().toLowerCase();
    const paymentValues = paymentRaw ? (PAYMENT_ALIASES[paymentRaw] ?? [paymentRaw]) : null;
    const orderNumber = String(args.orderNumber ?? '').trim();

    const filter: Record<string, unknown> = {};
    if (orderNumber) filter.orderNumber = { $regex: this.escape(orderNumber), $options: 'i' };
    if (status) filter.status = status;
    if (paymentValues) filter.paymentMethod = { $in: paymentValues };
    if (args.from && args.to) {
      const fromD = new Date(args.from as string);
      const toD = new Date(args.to as string);
      if (!isNaN(fromD.getTime()) && !isNaN(toD.getTime()))
        filter.createdAt = { $gte: fromD, $lte: toD };
    }

    if (customerName) {
      const esc = this.escape(customerName);
      const users = await this.userRepository.getModel()
        .find({ $or: [{ name: { $regex: esc, $options: 'i' } }, { phone: { $regex: esc, $options: 'i' } }] })
        .select('_id').limit(20).lean();
      if (!users.length) return { orders: [], total: 0, message: `No customer found matching "${customerName}"` };
      filter.user = { $in: users.map((u: any) => u._id) };
    }

    const orders = await this.orderRepository.getModel()
      .find(filter).sort({ createdAt: -1 }).limit(limit)
      .populate('user', 'name phone').lean();

    return {
      total: orders.length,
      orders: orders.map((o: any) => ({
        orderNumber: o.orderNumber,
        customer: o.user?.name ?? 'Guest',
        phone: o.user?.phone ?? '',
        total: o.total,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        createdAt: this.toIST(o.createdAt),
        couponCode: o.couponCode,
        discount: o.discount,
        walletUsed: o.walletUsed,
        items: (o.items ?? []).map((i: any) => `${i.name}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity} @₹${i.price}`),
      })),
    };
  }

  private async toolOrderDetail(args: Record<string, unknown>) {
    const orderNum = String(args.orderNumber ?? '').trim();
    const order = await this.orderRepository.getModel()
      .findOne({ orderNumber: { $regex: this.escape(orderNum), $options: 'i' } })
      .populate('user', 'name phone email')
      .lean();

    if (!order) return { error: `Order "${orderNum}" not found` };

    const o = order as any;
    let agentName = '';
    if (o.assignedDeliveryUserId) {
      const agent = await this.adminUserRepository.getModel().findById(o.assignedDeliveryUserId).select('name').lean().catch(() => null);
      agentName = (agent as any)?.name ?? String(o.assignedDeliveryUserId);
    }

    return {
      orderNumber: o.orderNumber,
      customer: { name: o.user?.name, phone: o.user?.phone, email: o.user?.email },
      status: o.status,
      total: o.total,
      gstTotal: o.gstTotal,
      shippingCharge: o.shippingCharge,
      discount: o.discount,
      walletUsed: o.walletUsed,
      couponCode: o.couponCode,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      shippingAddress: o.shippingAddress,
      items: (o.items ?? []).map((i: any) => ({ name: i.name, variant: i.variantName, qty: i.quantity, price: i.price, total: i.total })),
      timeline: (o.timeline ?? []).map((t: any) => ({ status: t.status, at: this.toIST(t.changedAt), by: t.changedBy })),
      assignedDeliveryAgent: agentName,
      deliveredAt: this.toIST(o.deliveredAt),
      packedAt: this.toIST(o.packedAt),
      packedBy: o.packedBy,
      adminNotes: o.adminNotes,
      amountCollected: o.amountCollected,
      collectionStatus: o.collectionStatus,
      createdAt: this.toIST(o.createdAt),
    };
  }

  private async toolOrdersByStatus(args: Record<string, unknown> = {}) {
    const dateMatch: any = {};
    if (args.from && args.to) {
      const fromD = new Date(args.from as string);
      const toD = new Date(args.to as string);
      if (!isNaN(fromD.getTime()) && !isNaN(toD.getTime()))
        dateMatch.createdAt = { $gte: fromD, $lte: toD };
    }
    const hasPeriod = Object.keys(dateMatch).length > 0;

    const [statusCounts, paymentAgg] = await Promise.all([
      hasPeriod
        ? this.orderRepository.getModel().aggregate([
            { $match: dateMatch },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]).exec().then((rows: any[]) => Object.fromEntries(rows.map((r: any) => [r._id, r.count])))
        : this.orderRepository.getOrdersByStatus(),
      this.orderRepository.getModel().aggregate([
        ...(hasPeriod ? [{ $match: dateMatch }] : []),
        { $group: { _id: '$paymentMethod', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $sort: { orders: -1 } },
      ]).exec(),
    ]);

    const total = Object.values(statusCounts as Record<string, number>).reduce((s: number, n: any) => s + (n || 0), 0);
    const paymentMap = new Map<string, { orders: number; revenue: number }>();
    for (const r of paymentAgg as any[]) {
      const key = (r._id === 'cash' || r._id === 'cod') ? 'cash/cod' : (r._id ?? 'unknown');
      const ex = paymentMap.get(key);
      if (ex) { ex.orders += r.orders; ex.revenue += r.revenue; }
      else paymentMap.set(key, { orders: r.orders, revenue: r.revenue });
    }
    return {
      scope: hasPeriod ? `${this.toIST(new Date(args.from as string), true)} – ${this.toIST(new Date(args.to as string), true)}` : 'all-time',
      total,
      byStatus: statusCounts,
      byPaymentMethod: [...paymentMap.entries()].map(([method, v]) => ({ method, orders: v.orders, revenue: v.revenue })),
    };
  }

  private async toolComparePeriods(args: Record<string, unknown>) {
    const days = Number(args.days ?? 7);
    const now = new Date();
    const aEnd = now;
    const aStart = new Date(now.getTime() - days * 86_400_000);
    const bEnd = new Date(aStart.getTime());
    const bStart = new Date(bEnd.getTime() - days * 86_400_000);

    const [ma, mb, ca, cb] = await Promise.all([
      this.analyticsService.getOrderMetrics(aStart, aEnd),
      this.analyticsService.getOrderMetrics(bStart, bEnd),
      this.analyticsService.getCustomerMetrics(aStart, aEnd),
      this.analyticsService.getCustomerMetrics(bStart, bEnd),
    ]);

    const a = ma as any; const b = mb as any;
    return {
      periodA: { from: this.toIST(aStart, true), to: this.toIST(aEnd, true), days },
      periodB: { from: this.toIST(bStart, true), to: this.toIST(bEnd, true), days },
      orders: { current: a.totalOrders ?? 0, previous: b.totalOrders ?? 0 },
      revenue: { current: a.totalRevenue ?? 0, previous: b.totalRevenue ?? 0 },
      avgOrderValue: { current: Math.round(a.avgOrderValue ?? 0), previous: Math.round(b.avgOrderValue ?? 0) },
      newCustomers: { current: (ca as any).newCustomers ?? 0, previous: (cb as any).newCustomers ?? 0 },
      delivered: { current: a.completedOrders ?? 0, previous: b.completedOrders ?? 0 },
      cancelled: { current: a.cancelledOrders ?? 0, previous: b.cancelledOrders ?? 0 },
    };
  }

  private async toolSearchProducts(args: Record<string, unknown>) {
    const term = String(args.searchTerm ?? '').trim();
    const items = await this.productRepository.searchByText(term);
    return {
      total: items.length,
      products: items.map((p: any) => ({
        name: p.name,
        sku: p.sku,
        price: p.price,
        mrp: p.mrp,
        stock: p.stock,
        isActive: p.isActive,
        updatedAt: this.toIST(p.updatedAt),
        category: (p.category as any)?.name ?? '',
        variants: Array.isArray(p.variants) ? p.variants.map((v: any) => ({ name: v.name, sku: v.sku, price: v.price, stock: v.stock })) : [],
      })),
    };
  }

  private async toolProductDetail(args: Record<string, unknown>) {
    const name = String(args.productName ?? '').trim();
    const product = await this.productRepository.getModel()
      .findOne({ name: { $regex: this.escape(name), $options: 'i' } })
      .populate('category', 'name')
      .lean();
    if (!product) return { error: `Product "${name}" not found` };
    const p = product as any;
    return {
      name: p.name, sku: p.sku, price: p.price, mrp: p.mrp,
      stock: p.stock, isActive: p.isActive, trackStock: p.trackStock,
      lowStockThreshold: p.lowStockThreshold, gstPercentage: p.gstPercentage,
      category: (p.category as any)?.name ?? '',
      description: p.description,
      updatedAt: this.toIST(p.updatedAt), createdAt: this.toIST(p.createdAt),
      variants: Array.isArray(p.variants) ? p.variants.map((v: any) => ({
        name: v.name, sku: v.sku, price: v.price, mrp: v.mrp, stock: v.stock, isActive: v.isActive,
      })) : [],
    };
  }

  private async toolLowStock(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const nameFilter = searchTerm ? { name: { $regex: this.escape(searchTerm), $options: 'i' } } : {};
    const THRESHOLD = 10;
    const items = await this.productRepository.getModel().aggregate([
      { $match: { isActive: true, trackStock: { $ne: false }, ...nameFilter } },
      { $addFields: {
        totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] },
        effectiveThreshold: { $cond: [{ $and: [{ $eq: ['$trackStock', true] }, { $gt: ['$lowStockThreshold', 0] }] }, '$lowStockThreshold', THRESHOLD] },
      }},
      { $match: { $expr: { $lte: ['$totalStock', '$effectiveThreshold'] } } },
      { $sort: { totalStock: 1 } }, { $limit: 20 },
    ]).exec();
    return {
      count: items.length,
      products: items.map((p: any) => ({ name: p.name, sku: p.sku, stock: p.totalStock, threshold: p.lowStockThreshold || THRESHOLD })),
    };
  }

  private async toolOutOfStock(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const nameFilter = searchTerm ? { name: { $regex: this.escape(searchTerm), $options: 'i' } } : {};
    const items = await this.productRepository.getModel().aggregate([
      { $match: { isActive: true, trackStock: { $ne: false }, ...nameFilter } },
      { $addFields: { totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] } } },
      { $match: { totalStock: { $lte: 0 } } },
      { $sort: { name: 1 } }, { $limit: 50 },
    ]).exec();
    return {
      count: items.length,
      products: items.map((p: any) => ({ name: p.name, sku: p.sku ?? 'N/A', price: p.price })),
    };
  }

  private async toolInStock(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const nameFilter = searchTerm ? { name: { $regex: this.escape(searchTerm), $options: 'i' } } : {};
    const items = await this.productRepository.getModel().aggregate([
      { $match: { isActive: true, ...nameFilter } },
      { $addFields: { totalStock: { $add: ['$stock', { $ifNull: [{ $sum: '$variants.stock' }, 0] }] } } },
      { $match: { $or: [{ trackStock: false }, { totalStock: { $gt: 0 } }] } },
      { $sort: { name: 1 } }, { $limit: 30 },
    ]).exec();
    return {
      count: items.length,
      products: items.map((p: any) => ({ name: p.name, sku: p.sku, stock: p.trackStock === false ? 'unlimited' : p.totalStock, price: p.price })),
    };
  }

  private async toolStoreStock(args: Record<string, unknown>) {
    const storeName = String(args.storeName ?? '').trim();
    const productName = String(args.productName ?? '').trim();
    const lowStockOnly = Boolean(args.lowStockOnly);

    const pipeline: any[] = [
      {
        $lookup: {
          from: 'stores', localField: 'store', foreignField: '_id',
          pipeline: [{ $project: { name: 1, code: 1 } }], as: 'storeInfo',
        },
      },
      { $unwind: '$storeInfo' },
      {
        $lookup: {
          from: 'products', localField: 'product', foreignField: '_id',
          pipeline: [{ $project: { name: 1, sku: 1 } }], as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
    ];

    const matchConds: any[] = [];
    if (storeName) matchConds.push({ $or: [{ 'storeInfo.name': { $regex: this.escape(storeName), $options: 'i' } }, { 'storeInfo.code': { $regex: this.escape(storeName), $options: 'i' } }] });
    if (productName) matchConds.push({ 'productInfo.name': { $regex: this.escape(productName), $options: 'i' } });
    if (lowStockOnly) matchConds.push({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } });
    if (matchConds.length) pipeline.push({ $match: { $and: matchConds } });

    pipeline.push({ $sort: { 'storeInfo.name': 1, 'productInfo.name': 1 } }, { $limit: 100 });

    const rows = await this.storeStockRepository.getModel().aggregate(pipeline).exec();
    return {
      count: rows.length,
      items: rows.map((r: any) => ({
        store: r.storeInfo?.name ?? 'Unknown',
        product: r.productInfo?.name ?? 'Unknown',
        sku: r.productInfo?.sku,
        stock: r.stock,
        stockIn: r.stockIn,
        returned: r.returned,
        damaged: r.damaged,
        threshold: r.lowStockThreshold,
        updatedAt: this.toIST(r.updatedAt),
      })),
    };
  }

  private async toolRawMaterials(args: Record<string, unknown>) {
    const storeName = String(args.storeName ?? '').trim();
    const searchTerm = String(args.searchTerm ?? '').trim();

    let storeIds: any[] = [];
    if (storeName) {
      const stores = await this.storeModel.find({ $or: [{ name: { $regex: this.escape(storeName), $options: 'i' } }, { code: { $regex: this.escape(storeName), $options: 'i' } }] }).select('_id').lean();
      storeIds = stores.map((s: any) => s._id);
      if (!storeIds.length) return { materials: [], message: `No store found matching "${storeName}"` };
    }

    const filter: any = { isActive: true };
    if (storeIds.length) filter.store = { $in: storeIds };
    if (searchTerm) filter.name = { $regex: this.escape(searchTerm), $options: 'i' };

    const materials = await this.rawMaterialModel.find(filter).populate('store', 'name code').sort({ name: 1 }).lean();
    return {
      count: materials.length,
      materials: materials.map((m: any) => ({
        name: m.name,
        unit: m.unit,
        totalStock: m.totalStock,
        store: (m.store as any)?.name ?? 'Unknown',
        updatedAt: this.toIST(m.updatedAt),
      })),
    };
  }

  private async toolRawMaterialSnapshots(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange({ ...args, days: args.days ?? 7 });
    const storeName = String(args.storeName ?? '').trim();
    const materialName = String(args.materialName ?? '').trim();

    const pipeline: any[] = [
      { $match: { date: { $gte: from.toISOString().split('T')[0], $lte: to.toISOString().split('T')[0] } } },
      { $lookup: { from: 'rawmaterials', localField: 'rawMaterial', foreignField: '_id', pipeline: [{ $project: { name: 1, unit: 1 } }], as: 'mat' } },
      { $unwind: { path: '$mat', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'stores', localField: 'store', foreignField: '_id', pipeline: [{ $project: { name: 1, code: 1 } }], as: 'storeInfo' } },
      { $unwind: { path: '$storeInfo', preserveNullAndEmptyArrays: true } },
    ];

    const matchConds: any[] = [];
    if (storeName) matchConds.push({ $or: [{ 'storeInfo.name': { $regex: this.escape(storeName), $options: 'i' } }, { 'storeInfo.code': { $regex: this.escape(storeName), $options: 'i' } }] });
    if (materialName) matchConds.push({ 'mat.name': { $regex: this.escape(materialName), $options: 'i' } });
    if (matchConds.length) pipeline.push({ $match: { $and: matchConds } });

    pipeline.push({ $sort: { date: -1 } }, { $limit: 50 });

    const entries = await this.rawMaterialEntryModel.aggregate(pipeline).exec();
    return {
      count: entries.length,
      period: `${from.toDateString()} to ${to.toDateString()}`,
      entries: entries.map((e: any) => ({
        date: e.date,
        material: e.mat?.name ?? 'Unknown',
        unit: e.mat?.unit,
        store: e.storeInfo?.name ?? 'Unknown',
        openingStock: e.openingStock,
        stockIn: e.stockIn,
        processed: e.processed,
        outputLitres: e.outputLitres,
        closing: e.closing,
      })),
    };
  }

  private async toolCategories() {
    const cats = await this.categoryRepository.getModel().find({}).lean();
    const counts = await this.productRepository.getModel().aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]).exec();
    const countMap = new Map(counts.map((c: any) => [c._id?.toString(), c.count]));
    return {
      count: cats.length,
      categories: cats.map((c: any) => ({ name: c.name, slug: c.slug, productCount: countMap.get(c._id?.toString()) ?? 0 })),
    };
  }

  private async toolStores() {
    const stores = await this.storeModel.find({}).sort({ isActive: -1, name: 1 }).lean();
    return {
      count: stores.length,
      stores: stores.map((s: any) => ({
        name: s.name, code: s.code, address: s.address, phone: s.phone,
        isActive: s.isActive, isMainStore: s.isMainStore,
      })),
    };
  }

  private async toolSearchCustomers(args: Record<string, unknown>) {
    const term = String(args.searchTerm ?? '').trim();
    const limit = Number(args.limit ?? 10);
    if (!term) return { error: 'searchTerm required' };
    const esc = this.escape(term);
    const customers = await this.userRepository.getModel()
      .find({ $or: [{ name: { $regex: esc, $options: 'i' } }, { phone: { $regex: esc, $options: 'i' } }, { email: { $regex: esc, $options: 'i' } }] })
      .sort({ totalSpent: -1 }).limit(limit).lean();
    return {
      count: customers.length,
      customers: customers.map((c: any) => {
        const addr = c.addresses?.find((a: any) => a.isDefault) ?? c.addresses?.[0];
        return {
          name: c.name, phone: c.phone, email: c.email,
          totalOrders: c.totalOrders, totalSpent: c.totalSpent,
          isBlocked: c.isBlocked, blockedReason: c.blockedReason,
          isActive: c.isActive, tags: c.tags, notes: c.notes,
          lastOrderAt: this.toIST(c.lastOrderAt), createdAt: this.toIST(c.createdAt),
          defaultAddress: addr ? `${addr.street ?? ''}, ${addr.city ?? ''}, ${addr.state ?? ''} ${addr.pincode ?? ''}`.trim() : null,
        };
      }),
    };
  }

  private async toolCustomerOrders(args: Record<string, unknown>) {
    const phone = String(args.phone ?? '').trim();
    const name = String(args.name ?? '').trim();
    const limit = Number(args.limit ?? 10);

    let user: any = null;
    if (phone) {
      user = await this.userRepository.getModel().findOne({ phone: { $regex: this.escape(phone), $options: 'i' } }).lean().catch(() => null);
    }
    if (!user && name) {
      user = await this.userRepository.getModel().findOne({ name: { $regex: this.escape(name), $options: 'i' } }).sort({ totalOrders: -1 }).lean().catch(() => null);
    }
    if (!user) return { error: `No customer found for ${phone || name}` };

    const orders = await this.orderRepository.getModel().find({ user: user._id }).sort({ createdAt: -1 }).limit(limit).lean();
    const addr = user.addresses?.find((a: any) => a.isDefault) ?? user.addresses?.[0];

    return {
      customer: {
        name: user.name, phone: user.phone, email: user.email,
        totalOrders: user.totalOrders, totalSpent: user.totalSpent,
        isBlocked: user.isBlocked, blockedReason: user.blockedReason,
        lastOrderAt: this.toIST(user.lastOrderAt), createdAt: this.toIST(user.createdAt),
        address: addr ? `${addr.street ?? ''}, ${addr.city ?? ''}, ${addr.state ?? ''} ${addr.pincode ?? ''}`.trim() : null,
        tags: user.tags, notes: user.notes,
      },
      orders: orders.map((o: any) => ({
        orderNumber: o.orderNumber, total: o.total, status: o.status,
        paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
        createdAt: this.toIST(o.createdAt), deliveredAt: this.toIST(o.deliveredAt),
        items: (o.items ?? []).map((i: any) => `${i.name}${i.variantName ? ` (${i.variantName})` : ''} x${i.quantity} @₹${i.price}`),
      })),
    };
  }

  private async toolTopCustomers(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 10);
    const minSpent = args.minSpent ? Number(args.minSpent) : 0;
    const filter: any = { totalOrders: { $gt: 0 } };
    if (minSpent > 0) filter.totalSpent = { $gte: minSpent };
    const customers = await this.userRepository.getModel().find(filter).sort({ totalSpent: -1 }).limit(limit).lean();
    return {
      count: customers.length,
      customers: customers.map((c: any, i: number) => ({
        rank: i + 1, name: c.name, phone: c.phone,
        totalOrders: c.totalOrders, totalSpent: c.totalSpent,
        lastOrderAt: this.toIST(c.lastOrderAt),
      })),
    };
  }

  private async toolNewCustomers(args: Record<string, unknown>) {
    const { from } = this.resolveRange({ ...args, days: args.days ?? 7 });
    const to = args.to ? new Date(args.to as string) : new Date();
    const [count, customers] = await Promise.all([
      this.userRepository.getModel().countDocuments({ createdAt: { $gte: from, $lte: to } }),
      this.userRepository.getModel().find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    return {
      count,
      customers: customers.map((c: any) => ({
        name: c.name, phone: c.phone, email: c.email,
        totalOrders: c.totalOrders, totalSpent: c.totalSpent, createdAt: this.toIST(c.createdAt),
      })),
    };
  }

  private async toolInactiveCustomers(args: Record<string, unknown>) {
    const days = Number(args.days ?? 30);
    const limit = Number(args.limit ?? 20);
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const customers = await this.userRepository.getModel()
      .find({ totalOrders: { $gt: 0 }, $or: [{ lastOrderAt: { $lt: cutoff } }, { lastOrderAt: { $exists: false } }] })
      .sort({ lastOrderAt: 1 }).limit(limit).lean();
    return {
      count: customers.length,
      inactiveDays: days,
      customers: customers.map((c: any) => ({
        name: c.name, phone: c.phone,
        totalOrders: c.totalOrders, totalSpent: c.totalSpent,
        lastOrderAt: this.toIST(c.lastOrderAt),
      })),
    };
  }

  private async toolBlockedCustomers() {
    const customers = await this.userRepository.getModel()
      .find({ isBlocked: true }).sort({ updatedAt: -1 }).limit(50).lean();
    return {
      count: customers.length,
      customers: customers.map((c: any) => ({
        name: c.name, phone: c.phone, email: c.email,
        blockedReason: c.blockedReason, updatedAt: this.toIST(c.updatedAt),
      })),
    };
  }

  private async toolRevenueTrend(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);

    const [orderResult, storeResult] = await Promise.all([
      this.orderRepository.getModel().aggregate([
        { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      ]),
      this.storeSaleRepository.getModel().aggregate([
        { $addFields: { effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] } } },
        { $match: { effectiveDate: { $gte: from, $lte: to }, $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }] } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$effectiveDate', timezone: '+05:30' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      ]),
    ]);

    const dateMap = new Map<string, { revenue: number; orders: number }>();
    for (const r of orderResult) dateMap.set(r._id, { revenue: r.revenue, orders: r.orders });
    for (const r of storeResult) {
      const ex = dateMap.get(r._id);
      if (ex) { ex.revenue += r.revenue; ex.orders += r.orders; }
      else dateMap.set(r._id, { revenue: r.revenue, orders: r.orders });
    }

    const days = [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, revenue: v.revenue, orders: v.orders }));
    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      totalRevenue: days.reduce((s, d) => s + d.revenue, 0),
      totalOrders: days.reduce((s, d) => s + d.orders, 0),
      days,
    };
  }

  private async toolAnalyticsPeriod(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const [orders, customers, products, topSellers, topCustomersAgg] = await Promise.all([
      this.analyticsService.getOrderMetrics(from, to),
      this.analyticsService.getCustomerMetrics(from, to),
      this.analyticsService.getProductMetrics(from, to),
      this.analyticsService.getTopSellingOverall(from, to, 5),
      this.orderRepository.getModel().aggregate([
        { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$user', revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
        { $sort: { revenue: -1 } }, { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', pipeline: [{ $project: { name: 1, phone: 1 } }], as: 'u' } },
        { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
      ]).exec(),
    ]);
    const o = orders as any; const c = customers as any; const p = products as any;
    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      orders: { total: o.totalOrders, revenue: o.totalRevenue, avgOrderValue: Math.round(o.avgOrderValue ?? 0), delivered: o.completedOrders, pending: o.pendingOrders, cancelled: o.cancelledOrders, cod: o.codOrders, prepaid: o.prepaidOrders },
      customers: { total: c.totalCustomers, newCustomers: c.newCustomers, returning: c.returningCustomers },
      inventory: { outOfStock: p.outOfStockProducts, lowStock: p.lowStockProducts },
      topProducts: topSellers.map((s: any) => ({ name: s.name, unitsSold: s.quantitySold, revenue: s.revenue })),
      topCustomers: topCustomersAgg.map((tc: any) => ({ name: tc.u?.name ?? 'Unknown', phone: tc.u?.phone, revenueInPeriod: tc.revenue, ordersInPeriod: tc.orders })),
    };
  }

  private async toolTopSelling(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const limit = Number(args.limit ?? 8);
    const searchTerm = String(args.searchTerm ?? '').trim();

    // When a product name is given, query the raw collections directly so we
    // don't miss products that fall outside the top-N overall ranking.
    if (searchTerm) {
      const nameRegex = { $regex: this.escape(searchTerm), $options: 'i' };
      const [onlineRows, storeRows] = await Promise.all([
        this.orderRepository.getModel().aggregate([
          { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
          { $unwind: '$items' },
          { $match: { 'items.name': nameRegex } },
          { $group: { _id: '$items.name', unitsSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.total' } } },
          { $sort: { unitsSold: -1 } },
        ]).exec(),
        this.storeSaleRepository.getModel().aggregate([
          { $addFields: { effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] } } },
          { $match: { effectiveDate: { $gte: from, $lte: to }, $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }] } },
          { $unwind: '$items' },
          { $match: { 'items.name': nameRegex } },
          { $group: { _id: '$items.name', unitsSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.total' } } },
          { $sort: { unitsSold: -1 } },
        ]).exec(),
      ]);
      const fmt = (r: any) => ({ name: r._id, unitsSold: r.unitsSold, revenue: r.revenue });
      return {
        period: { from: this.toIST(from, true), to: this.toIST(to, true) },
        searchTerm,
        online: onlineRows.map(fmt),
        store: storeRows.map(fmt),
        totalUnitsSold: [...onlineRows, ...storeRows].reduce((s: number, r: any) => s + r.unitsSold, 0),
        totalRevenue: [...onlineRows, ...storeRows].reduce((s: number, r: any) => s + r.revenue, 0),
      };
    }
    const [onlineMetrics, storeTop] = await Promise.all([
      this.analyticsService.getProductMetrics(from, to),
      this.analyticsService.getTopSellingOverall(from, to, limit * 2),
    ]);
    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      online: ((onlineMetrics as any).topSellingProducts ?? []).slice(0, limit).map((p: any) => ({ name: p.name, unitsSold: p.quantitySold, revenue: p.revenue })),
      store: storeTop.slice(0, limit).map((p: any) => ({ name: p.name, unitsSold: p.quantitySold, revenue: p.revenue })),
    };
  }

  private async toolAbandonedCarts(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 30);
    const productSearch = String(args.productSearch ?? '').trim().toLowerCase();
    const whatsappSettings = await this.settingsService.getWhatsAppSettings();
    const delayMinutes = whatsappSettings.abandonedCartReminderDelayMinutes ?? 60;
    const cutoff = new Date(Date.now() - delayMinutes * 60_000);

    const carts = await this.cartRepository.getModel().aggregate([
      { $match: { 'items.0': { $exists: true }, updatedAt: { $lt: cutoff } } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', pipeline: [{ $project: { name: 1, phone: 1, isBlocked: 1 } }], as: 'userInfo' } },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      { $match: { 'userInfo.isBlocked': { $ne: true } } },
      { $lookup: { from: 'orders', let: { userId: '$user', cartUpdatedAt: '$updatedAt' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$user', '$$userId'] }, { $gt: ['$createdAt', '$$cartUpdatedAt'] }, { $ne: ['$status', 'cancelled'] }] } } }, { $limit: 1 }], as: 'ordersAfterCart' } },
      { $match: { ordersAfterCart: { $size: 0 } } },
      { $sort: { updatedAt: -1 } }, { $limit: limit },
    ]).exec();

    const filtered = productSearch ? carts.filter((c: any) => c.items.some((i: any) => i.name?.toLowerCase().includes(productSearch))) : carts;

    return {
      count: filtered.length,
      inactiveMinutes: delayMinutes,
      carts: filtered.map((c: any) => ({
        customer: c.userInfo?.name ?? c.userInfo?.phone ?? 'Unknown',
        phone: c.userInfo?.phone,
        cartTotal: c.total ?? 0,
        idleHours: Math.round((Date.now() - new Date(c.updatedAt).getTime()) / 3_600_000),
        items: c.items.slice(0, 8).map((i: any) => `${i.name} x${i.quantity}`),
      })),
    };
  }

  private async toolStoreSales(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const limit = Number(args.limit ?? 20);
    const [sales, totalAgg] = await Promise.all([
      this.storeSaleRepository.getModel().find({
        $and: [
          { $or: [{ dueDate: { $exists: true, $ne: null, $gte: from, $lte: to } }, { $or: [{ dueDate: { $exists: false } }, { dueDate: null }], createdAt: { $gte: from, $lte: to } }] },
          { $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }] },
        ],
      }).populate('store', 'name code').sort({ createdAt: -1 }).limit(limit).lean(),
      this.storeSaleRepository.getModel().aggregate([
        { $addFields: { effectiveDate: { $ifNull: ['$dueDate', '$createdAt'] } } },
        { $match: { effectiveDate: { $gte: from, $lte: to }, $or: [{ voidedAt: { $exists: false } }, { voidedAt: null }] } },
        { $group: { _id: null, totalRevenue: { $sum: '$total' }, count: { $sum: 1 }, walkIn: { $sum: { $cond: [{ $eq: ['$saleType', 'walk_in'] }, 1, 0] } }, delivery: { $sum: { $cond: [{ $eq: ['$saleType', 'delivery'] }, 1, 0] } } } },
      ]).exec(),
    ]);
    const agg = totalAgg[0] ?? { totalRevenue: 0, count: 0, walkIn: 0, delivery: 0 };
    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      summary: { count: agg.count, totalRevenue: agg.totalRevenue, walkIn: agg.walkIn, delivery: agg.delivery },
      sales: sales.map((s: any) => ({
        saleNumber: s.saleNumber,
        store: (s.store as any)?.name ?? 'Unknown',
        type: s.saleType,
        total: s.total,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        paymentMethod: s.paymentMethod,
        date: this.toIST(s.dueDate ?? s.createdAt),
        loggedBy: s.loggedBy,
      })),
    };
  }

  private async toolSaleDetail(args: Record<string, unknown>) {
    const saleNum = String(args.saleNumber ?? '').trim();
    const sale = await this.storeSaleRepository.getModel()
      .findOne({ saleNumber: { $regex: this.escape(saleNum), $options: 'i' } })
      .populate('store', 'name code').lean();
    if (!sale) return { error: `Sale "${saleNum}" not found` };
    const s = sale as any;
    return {
      saleNumber: s.saleNumber,
      store: (s.store as any)?.name,
      type: s.saleType,
      total: s.total,
      discount: s.discount,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      customerAddress: s.customerAddress,
      paymentMethod: s.paymentMethod,
      notes: s.notes,
      loggedBy: s.loggedBy,
      date: this.toIST(s.dueDate ?? s.createdAt),
      items: (s.items ?? []).map((i: any) => ({ name: i.name, qty: i.quantity, price: i.price, total: i.total })),
    };
  }

  private async toolDeliveryCollections(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const agentName = String(args.agentName ?? '').trim();

    let agentIds: any[] | null = null;
    if (agentName) {
      const agents = await this.adminUserRepository.getModel()
        .find({ name: { $regex: this.escape(agentName), $options: 'i' } }).select('_id name').lean();
      agentIds = agents.map((a: any) => a._id.toString());
      if (!agentIds.length) return { agents: [], message: `No agent found matching "${agentName}"` };
    }

    const match: any = { status: 'delivered', deliveredAt: { $gte: from, $lte: to }, assignedDeliveryUserId: { $exists: true, $ne: null } };
    if (agentIds) match.assignedDeliveryUserId = { $in: agentIds };

    const rows = await this.orderRepository.getModel().aggregate([
      { $match: match },
      { $group: {
        _id: { $toString: '$assignedDeliveryUserId' },
        totalOrders: { $sum: 1 },
        totalCashCollected: { $sum: { $cond: [{ $in: ['$paymentMethod', ['cash', 'cod']] }, { $ifNull: ['$amountCollected', 0] }, 0] } },
        totalUpiCollected: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'upi'] }, { $ifNull: ['$amountCollected', 0] }, 0] } },
        pendingCash: { $sum: { $cond: [{ $and: [{ $in: ['$paymentMethod', ['cash', 'cod']] }, { $ne: ['$collectionStatus', 'settled'] }] }, { $ifNull: ['$amountCollected', 0] }, 0] } },
      }},
    ]).exec();

    const userIds = rows.map((r: any) => r._id).filter(Boolean);
    const users = userIds.length ? await this.adminUserRepository.getModel().find({ _id: { $in: userIds } }, 'name email').lean() : [];
    const userMap = new Map((users as any[]).map((u: any) => [u._id.toString(), u]));

    const [outstanding] = await this.orderRepository.getModel().aggregate([
      { $match: { status: 'delivered', paymentMethod: { $in: ['cash', 'cod'] }, collectionStatus: { $ne: 'settled' }, amountCollected: { $gt: 0 } } },
      { $group: { _id: { $toString: '$assignedDeliveryUserId' }, total: { $sum: '$amountCollected' } } },
    ]).exec().then((r: any[]) => [new Map(r.map((x: any) => [x._id, x.total]))]).catch(() => [new Map()]);

    return {
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      agents: rows.map((r: any) => {
        const u = userMap.get(r._id);
        return {
          agentId: r._id,
          name: (u as any)?.name ?? r._id,
          totalOrders: r.totalOrders,
          cashCollected: r.totalCashCollected,
          upiCollected: r.totalUpiCollected,
          pendingCashInPeriod: r.pendingCash,
          totalOutstandingAllTime: (outstanding as Map<string, number>).get(r._id) ?? 0,
        };
      }),
    };
  }

  private async toolDeliveryHistory(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const limit = Number(args.limit ?? 20);
    const agentName = String(args.agentName ?? '').trim();

    const filter: any = { status: 'delivered', deliveredAt: { $gte: from, $lte: to } };
    if (agentName) {
      const agents = await this.adminUserRepository.getModel().find({ name: { $regex: this.escape(agentName), $options: 'i' } }).select('_id').lean();
      if (!agents.length) return { count: 0, orders: [], message: `No delivery agent found matching "${agentName}"` };
      filter.assignedDeliveryUserId = { $in: agents.map((a: any) => a._id.toString()) };
    }

    const orders = await this.orderRepository.getModel()
      .find(filter)
      .select('orderNumber shippingAddress total amountCollected paymentMethod collectionStatus deliveredAt assignedDeliveryUserId')
      .sort({ deliveredAt: -1 }).limit(limit).lean();

    const agentIdSet = [...new Set(orders.map((o: any) => o.assignedDeliveryUserId).filter(Boolean))];
    const agentsData = agentIdSet.length ? await this.adminUserRepository.getModel().find({ _id: { $in: agentIdSet } }, 'name').lean() : [];
    const agentMap = new Map((agentsData as any[]).map((a: any) => [a._id.toString(), a.name]));

    return {
      count: orders.length,
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      orders: orders.map((o: any) => ({
        orderNumber: o.orderNumber,
        customer: (o.shippingAddress as any)?.name ?? 'N/A',
        total: o.total,
        amountCollected: o.amountCollected,
        paymentMethod: o.paymentMethod,
        collectionStatus: o.collectionStatus,
        deliveredAt: this.toIST(o.deliveredAt),
        agent: agentMap.get(String(o.assignedDeliveryUserId)) ?? 'Unassigned',
      })),
    };
  }

  private async toolPendingCollections(args: Record<string, unknown>) {
    const agentName = String(args.agentName ?? '').trim();
    let agentFilter: any = {};
    if (agentName) {
      const agents = await this.adminUserRepository.getModel().find({ name: { $regex: this.escape(agentName), $options: 'i' } }).select('_id name').lean();
      if (!agents.length) return { orders: [], message: `No agent found matching "${agentName}"` };
      agentFilter = { assignedDeliveryUserId: { $in: agents.map((a: any) => a._id.toString()) } };
    }
    const orders = await this.orderRepository.getModel()
      .find({ status: 'delivered', paymentMethod: { $in: ['cash', 'cod'] }, collectionStatus: { $ne: 'settled' }, amountCollected: { $gt: 0 }, ...agentFilter })
      .select('orderNumber shippingAddress total amountCollected paymentMethod deliveredAt assignedDeliveryUserId')
      .sort({ deliveredAt: -1 }).limit(50).lean();
    return {
      count: orders.length,
      totalPending: orders.reduce((s: number, o: any) => s + (o.amountCollected ?? 0), 0),
      orders: orders.map((o: any) => ({
        orderNumber: o.orderNumber,
        customer: (o.shippingAddress as any)?.name ?? 'N/A',
        amountCollected: o.amountCollected,
        paymentMethod: o.paymentMethod,
        deliveredAt: this.toIST(o.deliveredAt),
      })),
    };
  }

  private async toolWalletBalances(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 20);
    const wallets = await this.walletRepository.getModel()
      .find({ balance: { $gt: 0 } }).sort({ balance: -1 }).limit(limit)
      .populate('user', 'name phone').lean();
    const total = wallets.reduce((s: number, w: any) => s + (w.balance ?? 0), 0);
    return {
      count: wallets.length,
      totalOutstandingRupees: +(total / 100).toFixed(2),
      wallets: wallets.map((w: any) => ({
        customer: (w.user as any)?.name ?? (w.user as any)?.phone ?? 'N/A',
        phone: (w.user as any)?.phone,
        balanceRupees: +((w.balance ?? 0) / 100).toFixed(2),
      })),
    };
  }

  private async toolWalletTransactions(args: Record<string, unknown>) {
    const phone = String(args.phone ?? '').trim();
    const customerName = String(args.customerName ?? '').trim();
    const limit = Number(args.limit ?? 20);

    let user: any = null;
    if (phone) user = await this.userRepository.getModel().findOne({ phone: { $regex: this.escape(phone), $options: 'i' } }).lean().catch(() => null);
    if (!user && customerName) user = await this.userRepository.getModel().findOne({ name: { $regex: this.escape(customerName), $options: 'i' } }).lean().catch(() => null);
    if (!user) return { error: `No customer found for ${phone || customerName}` };

    const txns = await this.walletTransactionRepository.getModel()
      .find({ user: user._id }).sort({ createdAt: -1 }).limit(limit).lean();
    return {
      customer: { name: user.name, phone: user.phone },
      count: txns.length,
      transactions: txns.map((t: any) => ({
        type: t.type,
        amountRupees: +((t.amount ?? 0) / 100).toFixed(2),
        reason: t.reason,
        orderId: t.orderId,
        createdAt: this.toIST(t.createdAt),
      })),
    };
  }

  private async toolSubscriptionData() {
    const [active, paused, upcoming] = await Promise.all([
      this.subscriptionModel.find({ status: 'active' }).populate('user', 'name phone').sort({ nextDeliveryDate: 1 }).limit(30).lean(),
      this.subscriptionModel.find({ status: 'paused' }).populate('user', 'name phone').limit(10).lean(),
      this.subscriptionModel.find({ status: 'active', nextDeliveryDate: { $lte: new Date(Date.now() + 3 * 86_400_000) } }).populate('user', 'name phone').sort({ nextDeliveryDate: 1 }).lean(),
    ]);
    const fmt = (s: any) => ({
      customer: (s.user as any)?.name ?? (s.user as any)?.phone ?? 'N/A',
      phone: (s.user as any)?.phone,
      frequency: s.frequency,
      totalAmount: s.totalAmount,
      nextDeliveryDate: this.toIST(s.nextDeliveryDate, true),
      items: (s.items ?? []).map((i: any) => `${i.name} x${i.quantity}`),
    });
    return {
      activeCount: active.length,
      pausedCount: paused.length,
      active: active.slice(0, 20).map(fmt),
      paused: paused.map(fmt),
      upcomingDeliveries3Days: upcoming.map(fmt),
    };
  }

  private async toolSubscriptionDetail(args: Record<string, unknown>) {
    const phone = String(args.phone ?? '').trim();
    const customerName = String(args.customerName ?? '').trim();

    let user: any = null;
    if (phone) user = await this.userRepository.getModel().findOne({ phone: { $regex: this.escape(phone), $options: 'i' } }).lean().catch(() => null);
    if (!user && customerName) user = await this.userRepository.getModel().findOne({ name: { $regex: this.escape(customerName), $options: 'i' } }).lean().catch(() => null);
    if (!user) return { error: `No customer found for ${phone || customerName}` };

    const sub = await this.subscriptionModel.findOne({ user: user._id }).lean();
    if (!sub) return { error: `No subscription found for ${user.name ?? phone}` };
    const s = sub as any;
    return {
      customer: { name: user.name, phone: user.phone },
      status: s.status, frequency: s.frequency,
      totalAmount: s.totalAmount, nextDeliveryDate: this.toIST(s.nextDeliveryDate, true),
      items: (s.items ?? []).map((i: any) => ({ name: i.name, qty: i.quantity, price: i.price })),
      createdAt: this.toIST(s.createdAt), updatedAt: this.toIST(s.updatedAt),
    };
  }

  private async toolPayments(args: Record<string, unknown>) {
    const status = String(args.status ?? 'failed').trim();
    const limit = Number(args.limit ?? 20);
    const filter: any = {};
    if (status) filter.status = status;
    if (args.from && args.to) {
      const fromD = new Date(args.from as string);
      const toD = new Date(args.to as string);
      if (!isNaN(fromD.getTime()) && !isNaN(toD.getTime())) filter.createdAt = { $gte: fromD, $lte: toD };
    }
    const payments = await this.paymentRepository.getModel()
      .find(filter).sort({ createdAt: -1 }).limit(limit)
      .populate('user', 'name phone').populate('order', 'orderNumber total').lean();
    return {
      count: payments.length,
      status,
      payments: payments.map((p: any) => ({
        customer: (p.user as any)?.name ?? (p.user as any)?.phone ?? 'N/A',
        phone: (p.user as any)?.phone,
        orderNumber: (p.order as any)?.orderNumber ?? 'N/A',
        amountRupees: p.amount,
        status: p.status,
        gateway: p.gateway,
        failureReason: p.failureReason,
        refundAmount: p.refundAmount,
        refundedAt: this.toIST(p.refundedAt),
        createdAt: this.toIST(p.createdAt),
      })),
    };
  }

  private async toolRefundHistory(args: Record<string, unknown>) {
    const { from, to } = this.resolveRange(args);
    const limit = Number(args.limit ?? 20);
    const payments = await this.paymentRepository.getModel()
      .find({ status: 'refunded', refundedAt: { $gte: from, $lte: to } })
      .sort({ refundedAt: -1 }).limit(limit)
      .populate('user', 'name phone').populate('order', 'orderNumber').lean();
    const total = payments.reduce((s: number, p: any) => s + (p.refundAmount ?? 0), 0);
    return {
      count: payments.length,
      totalRefundedRupees: total,
      period: { from: this.toIST(from, true), to: this.toIST(to, true) },
      refunds: payments.map((p: any) => ({
        customer: (p.user as any)?.name ?? (p.user as any)?.phone ?? 'N/A',
        phone: (p.user as any)?.phone,
        orderNumber: (p.order as any)?.orderNumber,
        refundAmount: p.refundAmount,
        refundReason: p.refundReason,
        refundedAt: this.toIST(p.refundedAt),
      })),
    };
  }

  private async toolAuditLogs(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 20);
    const filter: any = {};
    if (args.action) filter.action = args.action;
    if (args.targetName) filter.targetName = { $regex: this.escape(String(args.targetName)), $options: 'i' };
    if (args.from && args.to) {
      const fromD = new Date(args.from as string);
      const toD = new Date(args.to as string);
      if (!isNaN(fromD.getTime()) && !isNaN(toD.getTime())) filter.createdAt = { $gte: fromD, $lte: toD };
    }
    const [count, logs] = await Promise.all([
      this.auditLogRepository.getModel().countDocuments(filter),
      this.auditLogRepository.getModel().find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    ]);
    return {
      count,
      logs: logs.map((l: any) => ({
        action: l.action,
        performer: l.performedByName ?? l.performedBy,
        target: l.targetName,
        ipAddress: l.ipAddress,
        previousValues: l.previousValues ? JSON.stringify(l.previousValues).slice(0, 300) : null,
        newValues: l.newValues ? JSON.stringify(l.newValues).slice(0, 300) : null,
        timestamp: this.toIST(l.createdAt),
      })),
    };
  }

  private async toolAdminUsers(args: Record<string, unknown>) {
    const filter: any = {};
    if (args.role) filter.role = args.role;
    if (args.department) filter.departmentType = args.department;
    const users = await this.adminUserRepository.getModel()
      .find(filter).select('-password').populate('store', 'name code').sort({ role: 1, name: 1 }).lean();
    return {
      count: users.length,
      staff: users.map((u: any) => ({
        name: u.name, email: u.email, phone: u.phone,
        role: u.role, department: u.departmentType,
        store: (u.store as any)?.name,
        isActive: u.isActive, lastLoginAt: this.toIST(u.lastLoginAt), lastLoginIp: u.lastLoginIp,
      })),
    };
  }

  private async toolCouponList(args: Record<string, unknown>) {
    const statusFilter = String(args.status ?? '').trim().toLowerCase();
    const coupons = await this.couponRepository.getModel().find({}).sort({ createdAt: -1 }).limit(50).lean();
    const now = new Date();
    const rows = coupons.map((c: any) => {
      const notYetValid = new Date(c.validFrom) > now;
      const expired = new Date(c.validUntil) < now;
      const active = c.isActive && !expired && !notYetValid;
      const statusKey = active ? 'active' : notYetValid ? 'upcoming' : expired ? 'expired' : 'inactive';
      return { statusKey, coupon: { code: c.code, discountType: c.discountType, discountValue: c.discountValue, usedCount: c.usedCount ?? 0, maxUsageCount: c.maxUsageCount, status: statusKey, minOrderAmount: c.minOrderAmount, validFrom: this.toIST(c.validFrom, true), validUntil: this.toIST(c.validUntil, true) } };
    });
    const filtered = statusFilter ? rows.filter((r) => r.statusKey === statusFilter) : rows;
    const summary = { total: rows.length, active: rows.filter((r) => r.statusKey === 'active').length, upcoming: rows.filter((r) => r.statusKey === 'upcoming').length, expired: rows.filter((r) => r.statusKey === 'expired').length };
    return { summary, coupons: filtered.map((r) => r.coupon) };
  }

  private async toolCouponUsage(args: Record<string, unknown>) {
    const couponCode = String(args.couponCode ?? '').trim().toUpperCase();
    const orders = await this.orderRepository.getModel()
      .find({ couponCode: { $regex: `^${this.escape(couponCode)}$`, $options: 'i' } })
      .select('orderNumber user couponCode discount createdAt')
      .sort({ createdAt: -1 }).limit(50)
      .populate('user', 'name phone').lean();
    return {
      couponCode,
      usageCount: orders.length,
      totalDiscountGiven: orders.reduce((s: number, o: any) => s + (o.discount ?? 0), 0),
      usages: orders.map((o: any) => ({
        customer: (o.user as any)?.name ?? 'Guest',
        phone: (o.user as any)?.phone,
        orderNumber: o.orderNumber,
        discount: o.discount,
        usedAt: this.toIST(o.createdAt),
      })),
    };
  }

  private async toolFeedbackList(args: Record<string, unknown>) {
    const limit = Number(args.limit ?? 15);
    const filter: any = {};
    if (args.minRating != null || args.maxRating != null) {
      filter.rating = { ...(args.minRating != null ? { $gte: Number(args.minRating) } : {}), ...(args.maxRating != null ? { $lte: Number(args.maxRating) } : {}) };
    }
    if (args.type) filter.type = { $regex: String(args.type), $options: 'i' };
    const productName = String(args.productName ?? '').trim();
    if (productName) {
      // Resolve product IDs in DB — don't post-filter in JS (would miss products outside top-N)
      const products = await this.productRepository.getModel()
        .find({ name: { $regex: this.escape(productName), $options: 'i' } }).select('_id').lean();
      if (!products.length) return { count: 0, feedback: [], message: `No product found matching "${productName}"` };
      filter.product = { $in: products.map((p: any) => p._id) };
    }
    const feedbacks = await this.feedbackRepository.getModel()
      .find(filter).populate('user', 'name phone').populate('product', 'name')
      .sort({ createdAt: -1 }).limit(limit).lean();
    return {
      count: feedbacks.length,
      feedback: feedbacks.map((f: any) => ({
        customer: (f.user as any)?.name ?? 'Anonymous',
        product: (f.product as any)?.name ?? 'General',
        rating: f.rating,
        type: f.type,
        message: (f.message ?? '').slice(0, 150),
        status: f.status,
        createdAt: this.toIST(f.createdAt),
      })),
    };
  }

  private async toolWhatsAppQueue() {
    const [support, recent] = await Promise.all([
      this.chatSessionRepository.getModel()
        .find({ isHandedOffToSupport: true, isExpired: { $ne: true } })
        .sort({ supportHandoffAt: -1 }).limit(30).populate('user', 'name phone').lean(),
      this.messageLogRepository.getModel()
        .find({ direction: 'inbound', createdAt: { $gte: new Date(Date.now() - 60 * 60_000) } })
        .sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    const activePhones = [...new Set((recent as any[]).map((m: any) => m.phone))];
    return {
      supportQueueCount: support.length,
      sessions: (support as any[]).map((s: any) => ({
        customer: (s.user as any)?.name ?? s.metadata?.contactName ?? s.phone,
        phone: s.phone,
        waitingMinutes: s.supportHandoffAt ? Math.round((Date.now() - new Date(s.supportHandoffAt).getTime()) / 60_000) : 0,
        hasAgent: Boolean(s.supportAgentId),
      })),
      activeLastHour: activePhones.length,
    };
  }

  private async toolWhatsAppMessages(args: Record<string, unknown>) {
    const phone = String(args.phone ?? '').trim();
    const limit = Number(args.limit ?? 20);
    const msgs = await this.messageLogRepository.getModel()
      .find({ phone }).sort({ createdAt: -1 }).limit(limit).lean();
    return {
      phone,
      count: msgs.length,
      messages: msgs.reverse().map((m: any) => ({
        direction: m.direction,
        type: m.messageType,
        text: m.content?.text ?? m.content?.caption ?? m.content?.templateName ?? '[media]',
        timestamp: this.toIST(m.createdAt),
      })),
    };
  }

  private async toolReminders() {
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 60 * 60_000);
    const [overdue, upcoming] = await Promise.all([
      this.reminderRepository.getModel().find({ dueAt: { $lt: now }, isDismissed: false }).sort({ dueAt: 1 }).limit(20).populate('sale', 'saleNumber customerName total').populate('store', 'name code').lean(),
      this.reminderRepository.getModel().find({ dueAt: { $gte: now, $lte: soon }, isDismissed: false }).sort({ dueAt: 1 }).limit(20).populate('sale', 'saleNumber customerName total').populate('store', 'name code').lean(),
    ]);
    const fmt = (r: any) => ({
      store: (r.store as any)?.name ?? 'Unknown',
      saleNumber: (r.sale as any)?.saleNumber,
      saleTotal: (r.sale as any)?.total,
      message: r.message,
      dueAt: this.toIST(r.dueAt),
    });
    return {
      overdueCount: overdue.length,
      upcomingCount: upcoming.length,
      overdue: overdue.map(fmt),
      upcoming: upcoming.map(fmt),
    };
  }

  private async toolPreviewEmail(args: Record<string, unknown>) {
    const to = String(args.to ?? '').trim();
    const reportType = String(args.reportType ?? 'dashboard').trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
      return { status: 'error', message: `Invalid email address: "${to}"` };
    try {
      const preview = await this.buildReportPreview(reportType);
      return { status: 'preview', to, reportType, subject: preview.subject, summary: preview.summary, readyToSend: true };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  private async toolSendEmail(args: Record<string, unknown>) {
    const to = String(args.to ?? '').trim();
    const reportType = String(args.reportType ?? 'dashboard').trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
      return { status: 'error', message: `Invalid email address: "${to}"` };
    try {
      const report = await this.buildReportPreview(reportType);
      await this.emailService.sendAdminReport(to, report.subject, report.html);
      this.logger.log(`Admin report "${reportType}" sent to ${to}`);
      return { status: 'sent', to, subject: report.subject };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  // ─── Billing tools ────────────────────────────────────────────────────────────

  private async toolBillingBills(args: Record<string, unknown>) {
    const limit = this.clampLimit(args.limit);
    const filter: Record<string, unknown> = { status: { $ne: 'cancelled' } };

    if (args.invoiceNo) filter.invoiceNo = { $regex: this.escape(String(args.invoiceNo)), $options: 'i' };
    if (args.customerName) filter.customerName = { $regex: this.escape(String(args.customerName)), $options: 'i' };
    if (args.customerPhone) {
      const digits = String(args.customerPhone).replace(/\D/g, '');
      if (digits) filter.customerPhone = { $regex: digits };
    }
    if (args.paymentStatus) filter.paymentStatus = String(args.paymentStatus).toLowerCase();
    if (args.orderTag) filter.orderTag = args.orderTag;
    const createdAt = this.dateFilter(args);
    if (createdAt) filter.createdAt = createdAt;

    // Totals cover every matching bill; `bills` is only the most recent page of them.
    const [bills, totals] = await Promise.all([
      this.billingBillModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      this.billingBillModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: {
              $sum: {
                $cond: [
                  { $ne: ['$paymentStatus', 'paid'] },
                  { $ifNull: ['$amountDue', { $subtract: ['$grandTotal', { $ifNull: ['$amountPaid', 0] }] }] },
                  0,
                ],
              },
            },
          },
        },
      ]).exec(),
    ]);
    const agg = (totals as any[])[0];

    return {
      totalMatching: agg?.count ?? 0,
      totalOutstanding: Math.round(agg?.total ?? 0),
      showing: bills.length,
      bills: bills.map((b: any) => ({
        invoiceNo: b.invoiceNo,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        customerGstNo: b.customerGstNo,
        orderTag: b.orderTag,
        grandTotal: b.grandTotal,
        amountPaid: b.amountPaid ?? 0,
        outstanding: Math.round(b.amountDue ?? (b.grandTotal - (b.amountPaid ?? 0))),
        paymentStatus: b.paymentStatus,
        itemCount: (b.items ?? []).length,
        createdAt: this.toIST(b.createdAt),
      })),
    };
  }

  private async toolBillingCustomers(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const tag = String(args.tag ?? '').trim();
    const hasOutstanding = args.hasOutstanding === true || args.hasOutstanding === 'true';
    const limit = this.clampLimit(args.limit);

    const filter: Record<string, unknown> = {};
    if (searchTerm) {
      const esc = this.escape(searchTerm);
      filter.$or = [{ name: { $regex: esc, $options: 'i' } }, { phone: { $regex: esc, $options: 'i' } }];
    }
    if (tag) filter.tags = tag;
    if (hasOutstanding) filter.outstanding = { $gt: 0 };

    const [customers, totals] = await Promise.all([
      this.billingCustomerModel.find(filter).sort({ outstanding: -1 }).limit(limit).lean(),
      this.billingCustomerModel.aggregate([
        { $match: filter },
        { $group: { _id: null, count: { $sum: 1 }, outstanding: { $sum: '$outstanding' } } },
      ]).exec(),
    ]);
    const agg = (totals as any[])[0];

    return {
      totalMatching: agg?.count ?? 0,
      totalOutstanding: Math.round(agg?.outstanding ?? 0),
      showing: customers.length,
      customers: customers.map((c: any) => ({
        name: c.name,
        phone: c.phone,
        gstNo: c.gstNo ?? c.gstin ?? '',
        tags: c.tags ?? [],
        outstanding: c.outstanding ?? 0,
        totalOrders: c.orderCount ?? 0,
        totalPurchase: c.totalPurchase ?? 0,
      })),
    };
  }

  private async toolBillingGodowns() {
    const godowns = await this.godownModel.find({}).sort({ name: 1 }).lean();
    return {
      count: godowns.length,
      godowns: godowns.map((g: any) => ({ name: g.name, code: g.code, address: g.address, isDefault: !!g.isDefault })),
    };
  }

  // ─── CRM tools ────────────────────────────────────────────────────────────────

  /** Resolve a storefront customer by phone digits or (partial) name. */
  private async findCustomer(term: string): Promise<any | null> {
    const digits = term.replace(/\D/g, '');
    const filter = /^\d{7,}$/.test(digits)
      ? { phone: { $regex: digits } }
      : { name: { $regex: this.escape(term), $options: 'i' } };
    return this.userRepository.getModel().findOne(filter).select('_id name phone').lean();
  }

  private async toolCrmOverview() {
    const [segmentCounts, vipCount, totalTracked] = await Promise.all([
      this.crmStatsModel.aggregate([
        { $group: { _id: '$segment', count: { $sum: 1 } } },
      ]).exec(),
      this.crmStatsModel.countDocuments({ isVip: true }),
      this.crmStatsModel.countDocuments({}),
    ]);

    // Older rows store "At Risk"; newer ones "at_risk" — report them as one segment.
    const merged = new Map<string, number>();
    for (const s of segmentCounts as any[]) {
      const key = String(s._id ?? 'unknown').toLowerCase().replace(/\s+/g, '_');
      merged.set(key, (merged.get(key) ?? 0) + s.count);
    }

    return {
      totalTracked,
      vipCount,
      segments: [...merged.entries()]
        .map(([segment, count]) => ({ segment, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private async toolCrmCustomerDetail(args: Record<string, unknown>) {
    const term = String(args.customerName ?? args.phone ?? '').trim();
    if (!term) return { error: 'customerName or phone required' };

    const user = await this.findCustomer(term);
    if (!user) return { error: `Customer "${term}" not found` };

    const s: any = await this.crmStatsModel.findOne({ userId: user._id }).lean();
    if (!s) return { name: user.name, phone: user.phone, message: 'No CRM data yet' };

    return {
      name: user.name,
      phone: user.phone,
      segment: s.segment,
      isVip: s.isVip,
      daysLate: s.daysLate,
      predictedReorderDate: this.toIST(s.predictedReorderDate, true),
      personalCycle: s.personalCycle,
      cycleSource: s.cycleSource,
      topCategory: s.topCategory,
      topProduct: s.topProduct,
      ltv: s.ltv,
      aov: s.aov,
      priorityScore: s.priorityScore,
      priorityBand: s.priorityBand,
      lastCallAt: this.toIST(s.lastCallAt),
      lastCallOutcome: s.lastCallOutcome,
      callbackAt: this.toIST(s.callbackAt),
      segmentUpdatedAt: this.toIST(s.segmentUpdatedAt),
    };
  }

  private async toolCrmCallLogs(args: Record<string, unknown>) {
    const limit = this.clampLimit(args.limit);
    const filter: Record<string, unknown> = {};

    const term = String(args.customerName ?? args.phone ?? '').trim();
    if (term) {
      const user = await this.findCustomer(term);
      if (!user) return { logs: [], message: `Customer "${term}" not found` };
      filter.customerId = user._id;
    }
    if (args.outcome) filter.outcome = args.outcome;
    if (args.type) filter.type = args.type;
    const createdAt = this.dateFilter(args);
    if (createdAt) filter.createdAt = createdAt;

    const logs = await this.crmCallLogModel
      .find(filter)
      .populate('customerId', 'name phone')
      .populate('agentId', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return {
      total: logs.length,
      logs: logs.map((l: any) => ({
        customer: l.customerId?.name ?? 'Unknown',
        phone: String(l.customerId?.phone ?? '').replace(/^91/, ''),
        agent: l.agentId?.name ?? 'Unknown',
        type: l.type,
        outcome: l.outcome,
        notes: l.notes,
        callbackAt: this.toIST(l.callbackAt),
        createdAt: this.toIST(l.createdAt),
      })),
    };
  }

  private async toolCrmCampaigns(args: Record<string, unknown>) {
    const filter: Record<string, unknown> = {};
    if (args.status) filter.status = args.status;

    const campaigns = await this.crmCampaignModel
      .find(filter)
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return {
      total: campaigns.length,
      campaigns: campaigns.map((c: any) => ({
        name: c.name,
        status: c.status,
        segmentFilter: c.segmentFilter,
        recipientCount: c.recipientCount,
        sentCount: c.sentCount,
        sentAt: this.toIST(c.sentAt),
        createdBy: c.createdBy?.name ?? '',
        approvedBy: c.approvedBy?.name ?? '',
        createdAt: this.toIST(c.createdAt),
      })),
    };
  }

  // ─── Purchase tools ───────────────────────────────────────────────────────────

  private async toolPurchaseRequests(args: Record<string, unknown>) {
    const limit = this.clampLimit(args.limit);
    // Same scope as the Purchase module's own list: top-level requests, test data hidden.
    const filter: Record<string, unknown> = { parentId: { $exists: false }, isTest: { $ne: true } };
    if (args.status) filter.status = String(args.status).toUpperCase();
    if (args.stage) filter.stage = String(args.stage).toUpperCase();
    if (args.department) filter.department = String(args.department).toUpperCase();
    if (args.priority) filter.priority = String(args.priority).toUpperCase();
    const createdAt = this.dateFilter(args);
    if (createdAt) filter.createdAt = createdAt;

    const requests = await this.purchaseRequestModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

    return {
      total: requests.length,
      requests: requests.map((r: any) => ({
        reqNo: r.reqNo,
        status: r.status,
        stage: r.stage,
        department: r.department,
        priority: r.priority,
        pendingLineCount: r.pendingLineCount,
        requiredBy: this.toIST(r.requiredBy, true),
        note: r.note,
        requestedBy: r.requestedByName,
        itemCount: (r.items ?? []).length,
        items: (r.items ?? []).slice(0, 5).map((i: any) => `${i.materialName} ${i.qtyKg}${i.uom ?? 'kg'}`),
        createdAt: this.toIST(r.createdAt),
      })),
    };
  }

  private async toolPurchaseRequestDetail(args: Record<string, unknown>) {
    const reqNo = String(args.reqNo ?? '').trim();
    if (!reqNo) return { error: 'reqNo required' };

    const r: any = await this.purchaseRequestModel
      .findOne({ reqNo: { $regex: `^${this.escape(reqNo)}$`, $options: 'i' } })
      .lean();
    if (!r) return { error: `Purchase request "${reqNo}" not found` };

    return {
      reqNo: r.reqNo,
      status: r.status,
      stage: r.stage,
      department: r.department,
      priority: r.priority,
      purpose: r.purpose,
      note: r.note,
      requiredBy: this.toIST(r.requiredBy, true),
      pendingLineCount: r.pendingLineCount,
      cancelReason: r.cancelReason,
      items: (r.items ?? []).map((i: any) => ({
        material: i.materialName,
        qty: `${i.qtyKg} ${i.uom ?? 'kg'}`,
        lineStatus: i.lineStatus,
        tag: i.tagName,
      })),
      po: r.po
        ? { poNo: r.po.poNo, vendorName: r.po.vendorName, totalAmount: r.po.totalAmount, expectedDelivery: r.po.expectedDelivery }
        : undefined,
      requestedBy: r.requestedByName,
      poRaisedBy: r.poRaisedBy?.name ?? '',
      approvedBy: r.approvedBy?.name ?? '',
      receivedBy: r.receivedBy?.name ?? '',
      closedBy: r.closedBy?.name ?? '',
      cancelledBy: r.cancelledBy?.name ?? '',
      timeline: (r.timeline ?? []).slice(-5).map((t: any) => ({ action: t.action, by: t.byName, at: this.toIST(t.at) })),
      createdAt: this.toIST(r.createdAt),
    };
  }

  private async toolPurchaseVendors() {
    const vendors = await this.purchaseVendorModel.find({ isActive: true }).sort({ name: 1 }).lean();
    return {
      count: vendors.length,
      vendors: vendors.map((v: any) => ({
        name: v.name,
        phone: v.phone,
        email: v.email,
        gstin: v.gstin,
        paymentTerms: v.paymentTerms,
      })),
    };
  }

  private async toolPurchaseMaterials(args: Record<string, unknown>) {
    const searchTerm = String(args.searchTerm ?? '').trim();
    const filter: Record<string, unknown> = { isActive: true };
    if (searchTerm) filter.name = { $regex: this.escape(searchTerm), $options: 'i' };

    const materials = await this.purchaseMaterialModel.find(filter).sort({ name: 1 }).limit(200).lean();
    return {
      count: materials.length,
      materials: materials.map((m: any) => ({
        name: m.name,
        uom: m.uom,
        category: m.category,
        notes: m.notes,
        lastRate: m.lastRate,
      })),
    };
  }

  // ─── Email report builder ─────────────────────────────────────────────────────

  private async buildReportPreview(reportType: string): Promise<{ subject: string; summary: string; html: string }> {
    const REPORT_MAP: Record<string, { label: string; tools: Array<[string, Record<string, unknown>]> }> = {
      dashboard:   { label: 'Dashboard Summary',  tools: [['get_dashboard_summary', {}], ['get_orders_by_status', {}], ['get_products_by_stock', { status: 'low' }]] },
      analytics:   { label: 'Analytics Report',   tools: [['get_analytics_period', { days: 30 }]] },
      monthly:     { label: 'Monthly Analytics',  tools: [['get_analytics_period', { days: 30 }]] },
      weekly:      { label: 'Weekly Analytics',   tools: [['get_analytics_period', { days: 7 }]] },
      orders:      { label: 'Orders Summary',     tools: [['search_orders', { limit: 20 }], ['get_orders_by_status', {}]] },
      revenue:     { label: 'Revenue Report',     tools: [['get_revenue_trend', { days: 14 }]] },
      customers:   { label: 'Customer Report',    tools: [['get_customers_filtered', { type: 'new', days: 7 }], ['get_top_customers', { limit: 10 }]] },
      feedback:    { label: 'Feedback Report',    tools: [['get_feedback_list', { limit: 20 }]] },
      coupons:     { label: 'Coupon Report',      tools: [['get_coupon_list', {}]] },
      store_sales: { label: 'Store Sales Report', tools: [['get_store_sales', { days: 30 }]] },
      inventory:   { label: 'Inventory Report',   tools: [['get_products_by_stock', { status: 'low' }], ['get_products_by_stock', { status: 'out' }]] },
      abandoned:   { label: 'Abandoned Carts',    tools: [['search_abandoned_carts', { limit: 30 }]] },
      payments:    { label: 'Payment Report',     tools: [['get_payments', { status: 'failed', limit: 20 }]] },
    };

    const config = REPORT_MAP[reportType] ?? REPORT_MAP['dashboard'];
    const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const subject = `Naturelite — ${config.label} | ${date}`;

    const blocks = await Promise.all(
      config.tools.map(async ([toolName, toolArgs]) => {
        try { return { tool: toolName, data: await this.execute(toolName, toolArgs) }; }
        catch { return null; }
      })
    );
    const validBlocks = blocks.filter(Boolean) as Array<{ tool: string; data: any }>;

    const firstData = validBlocks[0]?.data;
    const summary = firstData ? JSON.stringify(firstData).slice(0, 280) : 'No data available.';

    const sectionsHtml = validBlocks.map(({ tool, data }) => {
      const title = tool.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const body = JSON.stringify(data, null, 2)
        .split('\n')
        .map((line) => `<p style="margin:2px 0;font-size:12px;font-family:monospace;color:#333">${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('');
      return `<div style="margin-bottom:24px"><h3 style="color:#1E3D2B;border-bottom:2px solid #E8A838;padding-bottom:6px;font-size:15px">${title}</h3><div style="background:#f5f5f5;padding:12px;border-radius:8px;overflow-wrap:break-word">${body}</div></div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f0;font-family:sans-serif">
      <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden">
        <div style="background:#1E3D2B;padding:28px 32px;text-align:center">
          <h1 style="margin:0;color:#E8A838;font-size:22px">Naturelite</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">${config.label}</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.45);font-size:11px">${date}</p>
        </div>
        <div style="padding:28px 32px">${sectionsHtml}</div>
        <div style="background:#f0f0ea;padding:16px 32px;text-align:center;border-top:1px solid #e8e8e0">
          <p style="margin:0;font-size:11px;color:#888">AI Admin · Naturelite</p>
        </div>
      </div>
    </body></html>`;

    return { subject, summary, html };
  }
}
