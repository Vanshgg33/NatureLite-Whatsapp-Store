import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PurchaseMaterial, PurchaseMaterialDocument } from './schemas/purchase-material.schema';
import { PurchaseRequest, PurchaseRequestDocument } from './schemas/purchase-request.schema';
import { AdminUser, AdminUserDocument } from '../admin/schemas/admin-user.schema';
import { EmailService } from '../email/email.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

const TRANSITIONS: Record<string, { next: string[]; roles: string[] }> = {
  REQUESTED: { next: ['PO_CREATED', 'CANCELLED'], roles: ['po_creator', 'superadmin'] },
  PO_CREATED: { next: ['APPROVED', 'REJECTED'], roles: ['approver', 'superadmin'] },
  REJECTED: { next: ['PO_CREATED'], roles: ['po_creator', 'superadmin'] },
  APPROVED: { next: ['VENDOR_BILL_UPLOADED'], roles: ['approver', 'superadmin'] },
  VENDOR_BILL_UPLOADED: { next: ['COMPLETED'], roles: ['receiver', 'superadmin'] },
};

function canTransition(current: string, target: string, role: string): boolean {
  const rule = TRANSITIONS[current];
  if (!rule) return false;
  return rule.next.includes(target) && rule.roles.includes(role);
}

function effectiveRole(user: JwtPayload): string {
  if (user.role === 'superadmin') return 'superadmin';
  return user.purchaseRole || 'none';
}

@Injectable()
export class PurchaseService {
  constructor(
    @InjectModel(PurchaseMaterial.name) private materialModel: Model<PurchaseMaterialDocument>,
    @InjectModel(PurchaseRequest.name) private requestModel: Model<PurchaseRequestDocument>,
    @InjectModel(AdminUser.name) private adminModel: Model<AdminUserDocument>,
    private emailService: EmailService,
  ) {}

  // ─── Materials ────────────────────────────────────────────────────────────

  async seedDefaultMaterials() {
    const defaults = [
      { name: 'Groundnut (Bold)',   category: 'Oilseed' },
      { name: 'Sesame White',       category: 'Oilseed' },
      { name: 'Sesame Black',       category: 'Oilseed' },
      { name: 'Coconut Copra',      category: 'Oilseed' },
      { name: 'Mustard Seed',       category: 'Oilseed' },
      { name: 'Wheat (Sharbati)',   category: 'Grain'   },
      { name: 'Chana (Desi)',       category: 'Pulse'   },
      { name: 'Toor Dal Raw',       category: 'Pulse'   },
      { name: 'Jaggery Bulk',       category: 'General' },
      { name: 'Turmeric Finger',    category: 'Spice'   },
      { name: 'Sunflower Seeds',    category: 'Oilseed' },
      { name: 'Flax Seeds',         category: 'Oilseed' },
      { name: 'Packaging Pouches',  category: 'Packaging'},
      { name: 'Packaging Boxes',    category: 'Packaging'},
    ];
    let created = 0;
    for (const mat of defaults) {
      try {
        await this.materialModel.create(mat);
        created++;
      } catch { /* skip duplicates */ }
    }
    return { created, total: defaults.length };
  }

  async getMaterials(activeOnly = true) {
    const filter = activeOnly ? { isActive: true } : {};
    return this.materialModel.find(filter).sort({ name: 1 }).lean();
  }

  async createMaterial(data: { name: string; category?: string }) {
    return this.materialModel.create({
      name: data.name.trim(),
      category: data.category || 'General',
    });
  }

  async updateMaterial(id: string, data: { name?: string; category?: string; isActive?: boolean }) {
    const mat = await this.materialModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    if (!mat) throw new NotFoundException('Material not found');
    return mat;
  }

  // ─── Requests ─────────────────────────────────────────────────────────────

  async getRequests(filters: { status?: string; mine?: boolean; userId?: string }) {
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.mine && filters.userId) query.requestedById = filters.userId;
    return this.requestModel.find(query).sort({ createdAt: -1 }).lean();
  }

  async getStats(userId: string, purchaseRole: string | undefined, isSuperadmin: boolean) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [open, completedThisMonth, total] = await Promise.all([
      this.requestModel.countDocuments({ status: { $nin: ['COMPLETED', 'CANCELLED'] } }),
      this.requestModel.countDocuments({ status: 'COMPLETED', updatedAt: { $gte: startOfMonth } }),
      this.requestModel.countDocuments(),
    ]);

    const roleToStatuses: Record<string, string[]> = {
      po_creator: ['REQUESTED', 'REJECTED'],
      approver: ['PO_CREATED', 'APPROVED'],
      receiver: ['VENDOR_BILL_UPLOADED'],
    };

    const myActionStatuses = purchaseRole ? roleToStatuses[purchaseRole] : null;
    const myAction = isSuperadmin
      ? open
      : myActionStatuses
      ? await this.requestModel.countDocuments({ status: { $in: myActionStatuses } })
      : 0;

    return { open, myAction, completedThisMonth, total };
  }

  async getRequest(id: string) {
    const req = await this.requestModel.findById(id).lean();
    if (!req) throw new NotFoundException('Request not found');
    return req;
  }

  async createRequest(
    user: JwtPayload,
    data: {
      items: Array<{ materialId: string; materialName: string; qtyKg: number }>;
      note?: string;
    },
  ) {
    const role = effectiveRole(user);
    if (role !== 'requester' && role !== 'superadmin') {
      throw new ForbiddenException('Only requesters can create purchase requests');
    }
    if (!data.items?.length) throw new BadRequestException('At least one item required');
    for (const item of data.items) {
      if (!item.qtyKg || item.qtyKg <= 0) throw new BadRequestException('Quantity must be > 0');
    }

    const year = new Date().getFullYear();
    const count = await this.requestModel.countDocuments();
    const reqNo = `PR-${year}-${String(count + 1).padStart(4, '0')}`;

    const req = await this.requestModel.create({
      reqNo,
      items: data.items,
      note: data.note || '',
      status: 'REQUESTED',
      requestedById: user.sub,
      requestedByName: user.name || 'Unknown',
      requestedByEmail: '',
      timeline: [
        { action: 'Purchase request created', status: 'REQUESTED', byName: user.name || 'System', at: new Date() },
      ],
    });

    this.sendStatusEmail(req.toObject(), 'REQUESTED').catch(() => null);
    return req;
  }

  async createPO(
    id: string,
    user: JwtPayload,
    data: {
      vendorName: string;
      vendorPhone?: string;
      vendorAddress?: string;
      items: Array<{ materialId: string; materialName: string; qtyKg: number; ratePerKg: number }>;
      expectedDelivery?: string;
      terms?: string;
    },
  ) {
    const role = effectiveRole(user);
    const req = await this.requestModel.findById(id);
    if (!req) throw new NotFoundException('Request not found');
    if (!canTransition(req.status, 'PO_CREATED', role)) {
      throw new ForbiddenException(`Cannot create PO from status ${req.status} with role ${role}`);
    }

    const year = new Date().getFullYear();
    const poCount = await this.requestModel.countDocuments({ 'po.poNo': { $exists: true } });
    const poNo = `PO-${year}-${String(poCount + 1).padStart(4, '0')}`;

    const poItems = data.items.map((item) => ({
      ...item,
      amount: item.qtyKg * item.ratePerKg,
    }));
    const totalAmount = poItems.reduce((s, i) => s + i.amount, 0);

    req.po = {
      poNo,
      vendorName: data.vendorName,
      vendorPhone: data.vendorPhone || '',
      vendorAddress: data.vendorAddress || '',
      items: poItems,
      totalAmount,
      expectedDelivery: data.expectedDelivery || '',
      terms: data.terms || '',
      createdByName: user.name || 'System',
      createdAt: new Date(),
    };
    req.status = 'PO_CREATED';
    req.timeline.push({
      action: `PO ${poNo} created — ₹${totalAmount.toLocaleString('en-IN')}`,
      status: 'PO_CREATED',
      byName: user.name || 'System',
      at: new Date(),
    });
    await req.save();

    this.sendStatusEmail(req.toObject(), 'PO_CREATED').catch(() => null);
    return req;
  }

  async makeDecision(
    id: string,
    user: JwtPayload,
    data: { action: 'APPROVED' | 'REJECTED'; reason?: string },
  ) {
    const role = effectiveRole(user);
    const req = await this.requestModel.findById(id);
    if (!req) throw new NotFoundException('Request not found');
    if (!canTransition(req.status, data.action, role)) {
      throw new ForbiddenException(`Cannot ${data.action} from status ${req.status} with role ${role}`);
    }
    if (data.action === 'REJECTED' && !data.reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    req.decision = {
      action: data.action,
      reason: data.reason || '',
      byName: user.name || 'System',
      at: new Date(),
    };
    req.status = data.action;
    req.timeline.push({
      action: data.action === 'APPROVED' ? 'PO Approved' : `PO Rejected: ${data.reason}`,
      status: data.action,
      byName: user.name || 'System',
      at: new Date(),
    });
    await req.save();

    this.sendStatusEmail(req.toObject(), data.action).catch(() => null);
    return req;
  }

  async uploadVendorBill(
    id: string,
    user: JwtPayload,
    fileData: { url: string; name: string; mime: string; publicId: string },
  ) {
    const role = effectiveRole(user);
    const req = await this.requestModel.findById(id);
    if (!req) throw new NotFoundException('Request not found');
    if (!canTransition(req.status, 'VENDOR_BILL_UPLOADED', role)) {
      throw new ForbiddenException(`Cannot upload vendor bill from status ${req.status} with role ${role}`);
    }

    req.vendorBill = fileData;
    req.status = 'VENDOR_BILL_UPLOADED';
    req.timeline.push({
      action: 'Vendor bill uploaded',
      status: 'VENDOR_BILL_UPLOADED',
      byName: user.name || 'System',
      at: new Date(),
    });
    await req.save();

    this.sendStatusEmail(req.toObject(), 'VENDOR_BILL_UPLOADED').catch(() => null);
    return req;
  }

  async receiveGoods(
    id: string,
    user: JwtPayload,
    data: {
      gateBill: { url: string; name: string; mime: string; publicId: string };
      receivedItems: Array<{ materialName: string; orderedKg: number; receivedKg: number }>;
      remarks?: string;
    },
  ) {
    const role = effectiveRole(user);
    const req = await this.requestModel.findById(id);
    if (!req) throw new NotFoundException('Request not found');
    if (!canTransition(req.status, 'COMPLETED', role)) {
      throw new ForbiddenException(`Cannot complete from status ${req.status} with role ${role}`);
    }

    req.receipt = {
      gateBill: data.gateBill,
      receivedItems: data.receivedItems.map((i) => ({
        ...i,
        varianceKg: i.receivedKg - i.orderedKg,
      })),
      remarks: data.remarks || '',
      byName: user.name || 'System',
      at: new Date(),
    };
    req.status = 'COMPLETED';
    req.timeline.push({
      action: 'Goods received — order closed',
      status: 'COMPLETED',
      byName: user.name || 'System',
      at: new Date(),
    });
    await req.save();

    this.sendStatusEmail(req.toObject(), 'COMPLETED').catch(() => null);
    return req;
  }

  async setDeadline(id: string, user: JwtPayload, dueAt: string) {
    const req = await this.requestModel.findById(id);
    if (!req) throw new NotFoundException('Request not found');
    if (['COMPLETED', 'CANCELLED'].includes(req.status)) {
      throw new BadRequestException('Cannot set deadline on a closed request');
    }
    const due = new Date(dueAt);
    if (isNaN(due.getTime())) throw new BadRequestException('Invalid date');

    req.deadline = { stage: req.status, dueAt: due, setByName: user.name || 'System', setAt: new Date() };
    await req.save();
    return req;
  }

  async cancelRequest(id: string, user: JwtPayload, reason: string) {
    const req = await this.requestModel.findById(id);
    if (!req) throw new NotFoundException('Request not found');

    const role = effectiveRole(user);
    if (role !== 'superadmin' && req.requestedById !== user.sub) {
      throw new ForbiddenException('Only the requester or superadmin can cancel');
    }
    if (['COMPLETED', 'CANCELLED'].includes(req.status)) {
      throw new BadRequestException('Cannot cancel a completed or already-cancelled request');
    }

    req.status = 'CANCELLED';
    req.timeline.push({
      action: `Cancelled: ${reason}`,
      status: 'CANCELLED',
      byName: user.name || 'System',
      at: new Date(),
    });
    await req.save();

    this.sendStatusEmail(req.toObject(), 'CANCELLED').catch(() => null);
    return req;
  }

  // ─── Email ────────────────────────────────────────────────────────────────

  private async sendStatusEmail(req: any, event: string) {
    const purchaseUsers = await this.adminModel
      .find({ purchaseRole: { $exists: true, $ne: null }, isActive: true })
      .select('email purchaseRole')
      .lean();

    const superadmins = await this.adminModel
      .find({ role: 'superadmin', isActive: true })
      .select('email')
      .lean();

    const allEmails = [
      ...new Set([
        ...purchaseUsers.map((u) => u.email),
        ...superadmins.map((u) => u.email),
      ]),
    ].filter(Boolean);

    if (!allEmails.length) return;

    const subject = this.buildSubject(req, event);
    const html = this.buildHtml(req, event);

    for (const email of allEmails) {
      await this.emailService.sendAdminReport(email, subject, html).catch(() => null);
    }
  }

  private buildSubject(req: any, event: string): string {
    const map: Record<string, string> = {
      REQUESTED: `[NEW] ${req.reqNo} — PO needed`,
      PO_CREATED: `[PO] ${req.po?.poNo || req.reqNo} awaiting approval`,
      APPROVED: `[OK] ${req.reqNo} APPROVED — send to vendor`,
      REJECTED: `[REJ] ${req.reqNo} REJECTED`,
      VENDOR_BILL_UPLOADED: `[BILL] ${req.reqNo} — gate alert`,
      COMPLETED: `[DONE] ${req.reqNo} CLOSED`,
      CANCELLED: `[CANCELLED] ${req.reqNo}`,
    };
    return map[event] || `[FMS] ${req.reqNo} — ${event}`;
  }

  private fmtIST(d: Date): string {
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    }) + ' IST';
  }

  private buildHtml(req: any, event: string): string {
    const colors: Record<string, string> = {
      REQUESTED: '#64748B', PO_CREATED: '#3B82F6', APPROVED: '#22C55E',
      REJECTED: '#EF4444', VENDOR_BILL_UPLOADED: '#8B5CF6',
      COMPLETED: '#10B981', CANCELLED: '#6B7280',
    };
    const color = colors[event] || '#1E3D2B';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const detailUrl = `${frontendUrl}/admin/purchase/${req._id}`;
    const now = this.fmtIST(new Date());

    const itemsList = (req.items || [])
      .map((i: any) => `<li>${i.materialName} — ${i.qtyKg} KG</li>`)
      .join('');

    const lastEntry = req.timeline?.[req.timeline.length - 1];
    const lastActionTime = lastEntry?.at ? this.fmtIST(new Date(lastEntry.at)) : now;

    const nextAction: Record<string, string> = {
      REQUESTED: 'PO Creator must generate a Purchase Order.',
      PO_CREATED: 'Approver must review and approve or reject the PO.',
      APPROVED: 'Approver must upload the Vendor Bill.',
      REJECTED: 'PO Creator must rework and resubmit the PO.',
      VENDOR_BILL_UPLOADED: 'Gate / Receiver must enter received quantities and close the order.',
      COMPLETED: 'Order is closed. No further action required.',
      CANCELLED: 'Order has been cancelled.',
    };

    const receiptRows = event === 'COMPLETED' && req.receipt?.receivedItems?.length
      ? `<h3 style="color:#1E3D2B;margin:16px 0 4px">Receipt Summary:</h3>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           <tr style="background:#1E3D2B;color:#fff">
             <th style="padding:6px 8px;text-align:left">Material</th>
             <th style="padding:6px 8px;text-align:right">Ordered (KG)</th>
             <th style="padding:6px 8px;text-align:right">Received (KG)</th>
             <th style="padding:6px 8px;text-align:right">Variance</th>
           </tr>
           ${req.receipt.receivedItems.map((i: any) => {
             const v = i.receivedKg - i.orderedKg;
             const vc = v < 0 ? '#EF4444' : v > 0 ? '#22C55E' : '#666';
             return `<tr style="border-bottom:1px solid #eee">
               <td style="padding:5px 8px">${i.materialName}</td>
               <td style="padding:5px 8px;text-align:right">${i.orderedKg}</td>
               <td style="padding:5px 8px;text-align:right;font-weight:bold">${i.receivedKg}</td>
               <td style="padding:5px 8px;text-align:right;color:${vc};font-weight:bold">${v > 0 ? '+' : ''}${v.toFixed(1)}</td>
             </tr>`;
           }).join('')}
         </table>`
      : '';

    return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:#1E3D2B;padding:20px 24px">
    <h1 style="color:#E8A838;margin:0;font-size:20px;font-weight:bold">Nature Lite — Purchase FMS</h1>
    <p style="color:rgba(255,255,255,0.6);margin:2px 0 0;font-size:11px;font-style:italic">Sehat ka Vaada Swaad ke Saath</p>
  </div>
  <div style="padding:24px;background:#f9f9f9">
    <div style="display:inline-block;background:${color};color:#fff;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:bold;margin-bottom:16px;letter-spacing:0.5px">${event.replace(/_/g, ' ')}</div>
    <h2 style="margin:0 0 4px;color:#1E3D2B;font-size:22px">${req.reqNo}</h2>
    ${req.po?.poNo ? `<p style="margin:0 0 2px;color:#555;font-size:13px">PO: <strong>${req.po.poNo}</strong>${req.po.totalAmount ? ` — ₹${req.po.totalAmount.toLocaleString('en-IN')}` : ''}</p>` : ''}
    ${req.po?.vendorName ? `<p style="margin:0 0 12px;color:#555;font-size:13px">Vendor: ${req.po.vendorName}</p>` : ''}
    <p style="color:#333;font-size:13px;margin:8px 0">Requested by: <strong>${req.requestedByName}</strong></p>
    <p style="color:#888;font-size:12px;margin:4px 0 16px">Last updated: ${lastActionTime}</p>
    <h3 style="color:#1E3D2B;margin:0 0 4px;font-size:14px">Items:</h3>
    <ul style="margin:0 0 16px;padding-left:20px;color:#333;font-size:13px">${itemsList}</ul>
    ${lastEntry ? `<p style="margin:0 0 8px;color:#555;font-size:13px">Action: <em>${lastEntry.action}</em> by <strong>${lastEntry.byName}</strong></p>` : ''}
    ${req.decision?.reason ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:10px 14px;margin:8px 0"><p style="color:#EF4444;margin:0;font-size:13px">Rejection reason: ${req.decision.reason}</p></div>` : ''}
    ${receiptRows}
    ${req.deadline?.dueAt ? `<p style="color:#D97706;font-size:12px;margin:12px 0 0">⏰ Deadline: ${this.fmtIST(new Date(req.deadline.dueAt))}</p>` : ''}
    <div style="margin:20px 0 0;padding:14px;background:#EDF7F0;border-radius:6px;border-left:3px solid #1E3D2B">
      <p style="margin:0;color:#1E3D2B;font-size:13px;font-weight:bold">Next step:</p>
      <p style="margin:4px 0 0;color:#374151;font-size:13px">${nextAction[event] || ''}</p>
    </div>
    <div style="margin:20px 0 0;text-align:center">
      <a href="${detailUrl}" style="display:inline-block;background:#1E3D2B;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold">View Request →</a>
    </div>
  </div>
  <div style="background:#1E3D2B;padding:12px 24px;display:flex;justify-content:space-between;align-items:center">
    <p style="color:rgba(255,255,255,0.5);font-size:11px;margin:0">Purchase FMS — Nature Lite Admin Panel</p>
    <p style="color:rgba(255,255,255,0.4);font-size:10px;margin:0">${now}</p>
  </div>
</div>`;
  }
}
