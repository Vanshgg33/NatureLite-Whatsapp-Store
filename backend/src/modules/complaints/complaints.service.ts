import { BadRequestException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import {
  Complaint, ComplaintCategory, ComplaintDocument, ComplaintSeverity, ComplaintSource, ComplaintStatus,
  COMPLAINT_CATEGORIES, COMPLAINT_SOURCES, COMPLAINT_STATUSES, RESOLUTION_TYPES, ResolutionType,
} from './schemas/complaint.schema';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallet/wallet.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { parseObjectId } from '../../common/utils/objectid.util';

const HOUR = 3_600_000;
const CRM_ROLES = ['crm_head', 'crm_manager', 'crm_senior'];
export const OPEN_STATUSES: ComplaintStatus[] = ['new', 'investigating', 'awaiting_customer', 'reopened'];

const SEVERITY_BY_CATEGORY: Record<ComplaintCategory, ComplaintSeverity> = {
  damaged: 'medium', wrong_item: 'medium', missing_item: 'medium', quality: 'high',
  late_delivery: 'low', delivery_behaviour: 'high', payment: 'high', other: 'low',
};
// [first response, resolution] hours
const SLA_HOURS: Record<ComplaintSeverity, [number, number]> = {
  low: [4, 72], medium: [2, 48], high: [1, 24], critical: [1, 12],
};

export interface CreateComplaintInput {
  customerId: string;
  orderId?: string;
  category: ComplaintCategory;
  description?: string;
  media?: string[];
  source: ComplaintSource;
  createdByName?: string;
  /** Send the "ticket registered" WhatsApp. Default true. */
  notify?: boolean;
}

export interface ResolveComplaintInput {
  type: ResolutionType;
  reason: string;
  /** Rupees, for wallet_credit / refund. */
  amount?: number;
  /** Replacement only: subset of the original order's items. Omit to re-ship everything. */
  items?: { productId: string; quantity: number }[];
}

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    @InjectModel(Complaint.name) private readonly model: Model<ComplaintDocument>,
    @InjectModel('AdminUser') private readonly adminUserModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('Order') private readonly orderModel: Model<any>,
    // forwardRef: orders/whatsapp/chatbot import each other, so these can be undefined at decoration time otherwise.
    @Inject(forwardRef(() => OrdersService)) private readonly ordersService: OrdersService,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => WhatsAppService)) private readonly whatsapp: WhatsAppService,
  ) {}

  // ─── Create / assign ─────────────────────────────────────────────────────

  async create(input: CreateComplaintInput): Promise<ComplaintDocument> {
    if (!COMPLAINT_CATEGORIES.includes(input.category)) throw new BadRequestException('Invalid category');
    if (!COMPLAINT_SOURCES.includes(input.source)) throw new BadRequestException('Invalid source');
    const customerId = parseObjectId(input.customerId, 'customerId');

    let order: any = null;
    if (input.orderId) {
      order = await this.orderModel.findById(parseObjectId(input.orderId, 'orderId')).select('orderNumber user').lean();
      if (!order || order.user.toString() !== input.customerId) throw new BadRequestException('Order does not belong to this customer');
    }

    const severity = SEVERITY_BY_CATEGORY[input.category];
    const [firstH, resH] = SLA_HOURS[severity];
    const now = Date.now();
    const assignee = await this.pickAssignee();

    let doc: ComplaintDocument | null = null;
    for (let attempt = 0; attempt < 5 && !doc; attempt += 1) {
      try {
        doc = await this.model.create({
          ticketNo: await this.nextTicketNo(attempt),
          customerId,
          orderId: order?._id ?? null,
          orderNumber: order?.orderNumber ?? '',
          category: input.category,
          severity,
          source: input.source,
          description: (input.description ?? '').trim().slice(0, 2000),
          media: input.media ?? [],
          assignedTo: assignee?._id ?? null,
          assignedToName: assignee?.name ?? '',
          firstResponseDueAt: new Date(now + firstH * HOUR),
          resolutionDueAt: new Date(now + resH * HOUR),
          events: [
            { kind: 'status', text: `Ticket opened via ${input.source}`, byName: input.createdByName ?? 'Customer', at: new Date() },
            ...(assignee ? [{ kind: 'assign', text: `Auto-assigned to ${assignee.name}`, byName: 'System', at: new Date() }] : []),
          ],
        });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    if (!doc) throw new BadRequestException('Could not create ticket, please try again');

    if (input.notify !== false) await this.notifyCustomer(
      input.customerId,
      `✅ *Complaint registered*\n\nTicket *${doc.ticketNo}*${doc.orderNumber ? ` for order ${doc.orderNumber}` : ''}.\n` +
        `Our team will get back to you within ${firstH} hour${firstH > 1 ? 's' : ''}. Type *complaint status* anytime to check.`,
    );
    return doc;
  }

  /** Raised by the delivery person at the door; only for an order assigned to them. */
  async createFromDelivery(
    user: { sub: string; role: string; name?: string },
    dto: { orderId: string; issue: 'damaged' | 'wrong_item' | 'missing_item' | 'refused'; note?: string; photoUrl?: string },
  ): Promise<ComplaintDocument> {
    const order = await this.orderModel.findById(parseObjectId(dto.orderId, 'orderId')).select('user assignedDeliveryUserId').lean<{ user: Types.ObjectId; assignedDeliveryUserId?: string }>();
    if (!order) throw new NotFoundException('Order not found');
    if (user.role !== 'superadmin' && order.assignedDeliveryUserId !== user.sub) throw new BadRequestException('This order is not assigned to you');
    if (!['damaged', 'wrong_item', 'missing_item', 'refused'].includes(dto.issue)) throw new BadRequestException('Invalid issue');
    const category: ComplaintCategory = dto.issue === 'refused' ? 'other' : dto.issue;
    // A double tap or a second report for the same problem returns the existing ticket instead of opening another.
    const existing = await this.model.findOne({ orderId: parseObjectId(dto.orderId, 'orderId'), source: 'delivery', category, status: { $in: OPEN_STATUSES } });
    if (existing) return existing;
    const note = (dto.note ?? '').trim();
    return this.create({
      customerId: order.user.toString(),
      orderId: dto.orderId,
      category,
      description: `${dto.issue === 'refused' ? 'Customer refused delivery. ' : 'Reported by delivery person at the door. '}${note}`.trim(),
      media: dto.photoUrl ? [dto.photoUrl] : [],
      source: 'delivery',
      createdByName: user.name ?? 'Delivery',
      notify: dto.issue !== 'refused', // "complaint registered" makes no sense to someone who refused the parcel
    });
  }

  /** Alternates between CRM staff: whoever has the fewest open tickets, random on a tie. */
  private async pickAssignee(excludeId?: Types.ObjectId): Promise<{ _id: Types.ObjectId; name: string } | null> {
    const agents = await this.adminUserModel
      .find({ departmentType: { $in: CRM_ROLES }, isActive: true, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
      .select('name')
      .lean<{ _id: Types.ObjectId; name: string }[]>();
    if (!agents.length) return null;
    const counts = await this.model.aggregate([
      { $match: { assignedTo: { $in: agents.map((a) => a._id) }, status: { $in: OPEN_STATUSES } } },
      { $group: { _id: '$assignedTo', n: { $sum: 1 } } },
    ]);
    const load = new Map(counts.map((c: any) => [c._id.toString(), c.n as number]));
    const min = Math.min(...agents.map((a) => load.get(a._id.toString()) ?? 0));
    const lightest = agents.filter((a) => (load.get(a._id.toString()) ?? 0) === min);
    return lightest[Math.floor(Math.random() * lightest.length)];
  }

  /** `attempt` skips ahead after a duplicate-key collision from a concurrent create. */
  private async nextTicketNo(attempt = 0): Promise<string> {
    const year = new Date().getFullYear();
    const n = await this.model.countDocuments({ ticketNo: new RegExp(`^CMP-${year}-`) });
    return `CMP-${year}-${String(n + 1 + attempt).padStart(4, '0')}`;
  }

  async reassign(id: string, agentId: string, byName: string) {
    const agent = await this.adminUserModel.findOne({ _id: parseObjectId(agentId, 'agentId'), departmentType: { $in: CRM_ROLES }, isActive: true }).select('name').lean<{ _id: Types.ObjectId; name: string }>();
    if (!agent) throw new BadRequestException('Agent not found');
    const c = await this.mustFind(id);
    c.assignedTo = agent._id;
    c.assignedToName = agent.name;
    c.events.push({ kind: 'assign', text: `Assigned to ${agent.name}`, byName, at: new Date() } as any);
    return c.save();
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  async list(q: { status?: string; assignedTo?: string; search?: string; overdue?: boolean; page?: number; limit?: number }) {
    const filter: any = {};
    if (q.status === 'open') filter.status = { $in: OPEN_STATUSES };
    else if (q.status === 'resolved') filter.status = { $in: ['resolved', 'closed'] };
    else if (q.status && (COMPLAINT_STATUSES as readonly string[]).includes(q.status)) filter.status = q.status;
    if (q.assignedTo) filter.assignedTo = parseObjectId(q.assignedTo, 'assignedTo');
    if (q.overdue) {
      filter.status = { $in: OPEN_STATUSES };
      filter.$or = [
        { firstRespondedAt: null, firstResponseDueAt: { $lt: new Date() } },
        { resolutionDueAt: { $lt: new Date() } },
      ];
    }
    if (q.search?.trim()) {
      const s = q.search.trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escaped: user input must not be a regex
      const digits = s.replace(/\D/g, '');
      const users = await this.userModel.find({ $or: [{ name: new RegExp(s, 'i') }, ...(digits ? [{ phone: new RegExp(digits) }] : [])] }).select('_id').limit(50).lean();
      const sFilter = [{ ticketNo: new RegExp(s, 'i') }, { orderNumber: new RegExp(s, 'i') }, { customerId: { $in: users.map((u: any) => u._id) } }];
      filter.$and = [...(filter.$and ?? []), { $or: sFilter }];
    }
    const page = Math.max(q.page ?? 1, 1);
    const limit = Math.min(q.limit ?? 30, 100);
    const [data, total, openCount, overdueCount] = await Promise.all([
      // open tickets: most urgent deadline first; finished tickets: most recently resolved first
      this.model.find(filter).sort(q.status === 'resolved' ? { resolvedAt: -1 } : { resolutionDueAt: 1 }).skip((page - 1) * limit).limit(limit)
        .populate('customerId', 'name phone').lean(),
      this.model.countDocuments(filter),
      this.model.countDocuments({ status: { $in: OPEN_STATUSES } }),
      this.model.countDocuments({
        status: { $in: OPEN_STATUSES },
        $or: [{ firstRespondedAt: null, firstResponseDueAt: { $lt: new Date() } }, { resolutionDueAt: { $lt: new Date() } }],
      }),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit), openCount, overdueCount };
  }

  /** CRM staff a ticket can be handed to, with their current open load. */
  async agents(): Promise<{ _id: string; name: string; open: number }[]> {
    const agents = await this.adminUserModel.find({ departmentType: { $in: CRM_ROLES }, isActive: true }).select('name').lean<{ _id: Types.ObjectId; name: string }[]>();
    const counts = await this.model.aggregate([
      { $match: { assignedTo: { $in: agents.map((a) => a._id) }, status: { $in: OPEN_STATUSES } } },
      { $group: { _id: '$assignedTo', n: { $sum: 1 } } },
    ]);
    const load = new Map(counts.map((c: any) => [c._id.toString(), c.n as number]));
    return agents.map((a) => ({ _id: a._id.toString(), name: a.name, open: load.get(a._id.toString()) ?? 0 }));
  }

  /** Cheap counts for the sidebar badge. */
  async summary(userId: string) {
    const now = new Date();
    const [open, overdue, mine] = await Promise.all([
      this.model.countDocuments({ status: { $in: OPEN_STATUSES } }),
      this.model.countDocuments({ status: { $in: OPEN_STATUSES }, $or: [{ firstRespondedAt: null, firstResponseDueAt: { $lt: now } }, { resolutionDueAt: { $lt: now } }] }),
      this.model.countDocuments({ status: { $in: OPEN_STATUSES }, assignedTo: parseObjectId(userId, 'userId') }),
    ]);
    return { open, overdue, mine };
  }

  async get(id: string) {
    const c = await this.model.findById(parseObjectId(id, 'id')).populate('customerId', 'name phone').lean();
    if (!c) throw new NotFoundException('Complaint not found');
    return c;
  }

  forCustomer(customerId: string) {
    return this.model.find({ customerId: parseObjectId(customerId, 'customerId') }).sort({ createdAt: -1 }).limit(20).lean();
  }

  openForCustomer(customerId: string) {
    return this.model.find({ customerId: parseObjectId(customerId, 'customerId'), status: { $in: OPEN_STATUSES } }).sort({ createdAt: -1 }).lean();
  }

  private async mustFind(id: string) {
    const c = await this.model.findById(parseObjectId(id, 'id'));
    if (!c) throw new NotFoundException('Complaint not found');
    return c;
  }

  // ─── Work the ticket ─────────────────────────────────────────────────────

  async reply(id: string, text: string, byName: string, internal: boolean): Promise<Record<string, unknown>> {
    const body = (text ?? '').trim().slice(0, 2000);
    if (!body) throw new BadRequestException('Message is empty');
    const c = await this.mustFind(id);
    if (c.status === 'closed') throw new BadRequestException('Ticket is closed, reopen it first');
    c.events.push({ kind: internal ? 'note' : 'reply', text: body, byName, at: new Date() } as any);
    let customerNotified = true;
    if (!internal) {
      if (!c.firstRespondedAt) c.firstRespondedAt = new Date();
      if (c.status === 'new' || c.status === 'reopened') c.status = 'investigating';
      customerNotified = await this.notifyCustomer(c.customerId.toString(), `💬 *${c.ticketNo}*\n\n${body}`);
    }
    await c.save();
    return { ...c.toObject(), customerNotified };
  }

  /** Allowed manual moves. Resolving goes through resolve() so a resolution is always recorded. */
  private static readonly TRANSITIONS: Record<string, ComplaintStatus[]> = {
    new: ['investigating', 'awaiting_customer'],
    reopened: ['investigating', 'awaiting_customer'],
    investigating: ['awaiting_customer'],
    awaiting_customer: ['investigating'],
    resolved: ['closed', 'reopened'],
    closed: ['reopened'],
  };

  async setStatus(id: string, status: ComplaintStatus, byName: string) {
    if (!(COMPLAINT_STATUSES as readonly string[]).includes(status)) throw new BadRequestException('Invalid status');
    const c = await this.mustFind(id);
    if (!ComplaintsService.TRANSITIONS[c.status]?.includes(status)) {
      throw new BadRequestException(status === 'resolved' ? 'Use Resolve to close a ticket with an outcome' : `Cannot move from ${c.status} to ${status}`);
    }
    if (status === 'reopened') {
      // A reopened ticket gets a fresh deadline, otherwise it would reappear already overdue.
      c.resolvedAt = null;
      c.resolutionDueAt = new Date(Date.now() + 24 * HOUR);
    }
    c.status = status;
    c.events.push({ kind: 'status', text: `Status → ${status.replace(/_/g, ' ')}`, byName, at: new Date() } as any);
    return c.save();
  }

  async setRootCause(id: string, rootCause: string) {
    return this.model.findByIdAndUpdate(parseObjectId(id, 'id'), { $set: { rootCause: (rootCause ?? '').slice(0, 200) } }, { new: true });
  }

  async resolve(id: string, input: ResolveComplaintInput, byName: string, byId: string): Promise<Record<string, unknown>> {
    if (!RESOLUTION_TYPES.includes(input.type)) throw new BadRequestException('Invalid resolution type');
    const reason = (input.reason ?? '').trim().slice(0, 500);
    if (!reason) throw new BadRequestException('A reason is required');
    const c = await this.mustFind(id);
    if (!OPEN_STATUSES.includes(c.status)) throw new BadRequestException('Ticket is already resolved');

    const money = input.type === 'wallet_credit' || input.type === 'refund';
    const amount = Number(input.amount);
    if (money && (!Number.isFinite(amount) || amount <= 0)) throw new BadRequestException('Enter a valid amount');
    if (input.type === 'replacement' && !c.orderId) throw new BadRequestException('Replacement needs a linked order');

    // Claim the ticket atomically first: a double click or two agents can't both run the side effects
    // below (a second replacement order, a second wallet credit).
    const now = new Date();
    const before = await this.model.findOneAndUpdate(
      { _id: c._id, status: { $in: OPEN_STATUSES } },
      { $set: { status: 'resolved', resolvedAt: now } },
      { new: false },
    );
    if (!before) throw new BadRequestException('Ticket is already resolved');

    const resolution: NonNullable<Complaint['resolution']> = { type: input.type, reason, byName, at: now };
    let customerText: string;
    try {
      if (input.type === 'replacement') {
        const o = await this.ordersService.createReplacementOrder(c.orderId!.toString(), c.ticketNo, byName, input.items);
        resolution.replacementOrderId = (o as any)._id.toString();
        resolution.replacementOrderNumber = o.orderNumber;
        customerText = `We're sorry for the trouble. A *free replacement* (order ${o.orderNumber}) is on its way. You'll get delivery updates as usual.`;
      } else if (input.type === 'wallet_credit') {
        resolution.amount = amount;
        await this.walletService.credit(c.customerId.toString(), Math.round(amount * 100), `complaint ${c.ticketNo}`, { complaintId: c._id.toString() });
        customerText = `₹${amount} has been added to your *wallet* for this issue.`;
      } else if (input.type === 'refund') {
        // shortcut: the refund to the original payment method is sent manually by staff; this only records it. Automate via Razorpay refund later.
        resolution.amount = amount;
        customerText = `A refund of ₹${amount} has been initiated to your original payment method.`;
      } else if (input.type === 'apology') {
        customerText = 'We sincerely apologise for the experience and have noted your feedback to improve.';
      } else {
        customerText = `After review we could not take this forward: ${reason}`;
      }
    } catch (err) {
      // Nothing was given to the customer: put the ticket back so it can be retried.
      await this.model.updateOne({ _id: c._id }, { $set: { status: before.status, resolvedAt: before.resolvedAt ?? null } });
      throw err;
    }

    const summary = `${input.type.replace(/_/g, ' ')}${resolution.amount ? ` ₹${resolution.amount}` : ''}${resolution.replacementOrderNumber ? ` (${resolution.replacementOrderNumber})` : ''} — ${reason}`;
    await this.model.updateOne({ _id: c._id }, {
      $set: { resolution, firstRespondedAt: before.firstRespondedAt ?? now },
      $push: { events: { kind: 'resolution', text: summary, byName, at: now } },
    });
    const customerNotified = await this.notifyCustomer(c.customerId.toString(), `✅ *${c.ticketNo} resolved*\n\n${customerText}`);
    this.logger.log(`Complaint ${c.ticketNo} resolved (${input.type}) by ${byId}`);
    return { ...(await this.model.findById(c._id).lean()), customerNotified };
  }

  // ─── SLA ─────────────────────────────────────────────────────────────────

  /** First-response breach: hand the ticket to the other agent once. */
  @Cron('*/15 * * * *')
  async escalateBreached(): Promise<void> {
    const breached = await this.model.find({
      status: { $in: OPEN_STATUSES }, firstRespondedAt: null, reassignedOnBreach: false, firstResponseDueAt: { $lt: new Date() },
    }).select('assignedTo').limit(50).lean();
    for (const c of breached) {
      try {
        const next = await this.pickAssignee(c.assignedTo ?? undefined);
        // Conditional update: skipped if an agent replied since we read the ticket.
        await this.model.updateOne(
          { _id: c._id, firstRespondedAt: null, reassignedOnBreach: false },
          {
            $set: { reassignedOnBreach: true, ...(next ? { assignedTo: next._id, assignedToName: next.name } : {}) },
            ...(next ? { $push: { events: { kind: 'assign', text: `First-response SLA missed, moved to ${next.name}`, byName: 'System', at: new Date() } } } : {}),
          },
        );
      } catch (err) {
        this.logger.warn(`SLA escalation failed for ${c._id}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** Returns false when the message could not be delivered (e.g. outside WhatsApp's 24h window). */
  /** shortcut: free text only works inside WhatsApp's 24h window; switch to approved templates once they exist. */
  private async notifyCustomer(customerId: string, message: string): Promise<boolean> {
    try {
      const u = await this.userModel.findById(customerId).select('phone').lean<{ phone?: string }>();
      if (!u?.phone) return false;
      return !!(await this.whatsapp.sendTextMessage({ phone: u.phone, message }));
    } catch (err) {
      this.logger.warn(`Complaint notify failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return false;
    }
  }
}
