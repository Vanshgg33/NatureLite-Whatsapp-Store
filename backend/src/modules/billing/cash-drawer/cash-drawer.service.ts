import { HttpException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { checkTender, isValidCounts, sumCounts, type Counts, type DenomDef } from './cashChange';
import { DEFAULT_DENOMS, TXN_TYPES, type TxnType } from './cash-drawer.schema';
import { escapeCsvField } from '../../../common/utils/csv.util';
import { escapeRegex } from '../../../common/utils/query.util';

const MESSAGES: Record<string, string> = {
  DRAWER_NOT_INITIALISED: 'The cash drawer for this store has not been counted yet. Record the opening count first.',
  ALREADY_INITIALISED: 'This drawer already has its opening count. Use End-of-day count to correct it.',
  DRAWER_STOCK_INSUFFICIENT: 'The drawer no longer holds those notes/coins. The counts were refreshed: check the change and try again.',
  STOCK_INSUFFICIENT: 'The drawer no longer holds those notes/coins. The counts were refreshed: check the change and try again.',
  CASH_BLOCK_REQUIRED: 'Count the cash on the cash counter before saving (reload the page if you do not see it).',
  CASH_PAYMENT_MISMATCH: 'The cash amount does not match the notes counted on the cash counter.',
  CHANGE_MISMATCH: 'The change does not add up to what is due back.',
  BAD_COUNTS: 'Note and coin counts must be whole numbers from 0 to 100000.',
  INACTIVE_DENOMINATION: 'One of the notes/coins is switched off for this drawer.',
  UPI_EXCEEDS_TOTAL: 'UPI cannot be more than the bill total (UPI cannot give change).',
  SKIP_REASON_REQUIRED: 'Give a reason for skipping the cash count.',
  COUNTING_REQUIRED: 'This drawer is in strict mode: the cash must be counted.',
  CASH_EDIT_BLOCKED: 'The cash on this bill went through the cash drawer and cannot be edited. Use Record Payment, or cancel the bill (which refunds the cash).',
  CASH_REFUND_REQUIRED: 'This bill was paid in counted cash: pick the notes/coins handed back before cancelling.',
  REFUND_MISMATCH: 'The refund notes/coins do not add up to the cash taken on this bill.',
  CREDIT_NOTE_CASH_BLOCKED: 'Cash refunds on a credit note are not supported while the cash drawer is on. Save it without cash.',
  REASON_REQUIRED: 'A reason is required.',
  DENOM_HAS_STOCK: 'A note/coin that is still in the drawer cannot be switched off. Remove it first.',
  BAD_REQUEST: 'Invalid request.',
};

/** HttpException with a stable `code` (and extra `details`, e.g. fresh counts) that the HTTP filter passes to the client. */
export class DrawerError extends HttpException {
  constructor(status: number, public code: string, public details: Record<string, unknown> = {}) {
    super({ message: MESSAGES[code] ?? code, error: code, code, details }, status);
  }
}

export interface DrawerUser { userId: string; name?: string }

export interface TxnInput {
  storeId: string | Types.ObjectId;
  type: TxnType;
  received?: Counts;
  returned?: Counts;
  billId?: Types.ObjectId;
  invoiceNo?: string;
  clientRequestId?: string;
  reason?: string;
  billTotalRupees?: number;
  cashDueRupees?: number;
  user: DrawerUser;
}

/** what a bill / payment / refund sends: counted cash, or (SOFT mode) a skip with a reason */
export type CashBlock = { received?: Counts; returned?: Counts; skip?: { reason?: string } } | undefined;
type CashPlan = { type: TxnType; received?: Counts; returned?: Counts; reason?: string; billTotalRupees?: number; cashDueRupees?: number };

/** active denominations at or below their Min in a balance (same rule as the drawer's Low status) */
export const lowIn = (counts: Counts, denoms: any[]) => denoms.filter(d => d.active && (counts?.[d.id] || 0) <= (d.minLevel || 0)).map(d => d.id as string);

const DAY = 86_400_000;

@Injectable()
export class CashDrawerService {
  constructor(
    @InjectModel('CashDrawer') private drawers: Model<any>,
    @InjectModel('CashDrawerTxn') private txns: Model<any>,
    @InjectModel('BillingAuditLog') private audit: Model<any>,
    @InjectConnection() private conn: Connection,
  ) {}

  private oid(id: string | Types.ObjectId) {
    if (!Types.ObjectId.isValid(String(id))) throw new DrawerError(422, 'BAD_REQUEST', { field: 'storeId' });
    return new Types.ObjectId(String(id));
  }

  /** the drawer that bills must count cash into, or null (no drawer / not counted yet / mode OFF = today's behaviour) */
  async activeFor(storeId?: string | Types.ObjectId | null, session?: ClientSession) {
    if (!storeId || !Types.ObjectId.isValid(String(storeId))) return null;
    return this.drawers.findOne({ storeId: new Types.ObjectId(String(storeId)), initialisedAt: { $ne: null }, mode: { $ne: 'OFF' } })
      .session(session ?? null).lean() as Promise<any>;
  }

  async get(storeId: string) {
    const d = await this.drawers.findOne({ storeId: this.oid(storeId) }).lean() as any;
    if (!d) return { drawer: null, defaultDenoms: DEFAULT_DENOMS }; // the opening-count screen counts these
    const counts: Counts = d.counts ?? {};
    return {
      drawer: {
        id: String(d._id), storeId: String(d.storeId), name: d.name, mode: d.mode, denoms: d.denoms, counts,
        totalRupees: sumCounts(counts, d.denoms), version: d.version, initialised: !!d.initialisedAt,
        initialisedAt: d.initialisedAt, lastReconciledAt: d.lastReconciledAt,
        lowStock: lowIn(counts, d.denoms),
        uncountedSales: await this.txns.countDocuments({ drawerId: d._id, type: 'UNCOUNTED_SALE', createdAt: { $gt: d.lastReconciledAt ?? new Date(0) } }),
      },
    };
  }

  /** Must run INSIDE the Mongo transaction that saves the bill/payment/refund. Atomic $gte guard: no denomination ever goes negative. */
  async applyCashTxn(session: ClientSession, p: TxnInput) {
    const drawer = await this.drawers.findOne({ storeId: this.oid(p.storeId) }).session(session).lean() as any;
    if (!drawer || !drawer.initialisedAt) throw new DrawerError(409, 'DRAWER_NOT_INITIALISED');
    if (p.clientRequestId) {
      const dup = await this.txns.findOne({ drawerId: drawer._id, clientRequestId: p.clientRequestId, type: p.type }).session(session).lean();
      if (dup) return { txn: dup, replayed: true as const, counts: drawer.counts as Counts };
    }
    const received = p.received ?? {};
    const returned = p.returned ?? {};
    if (!isValidCounts(received, drawer.denoms) || !isValidCounts(returned, drawer.denoms)) throw new DrawerError(422, 'BAD_COUNTS');
    const delta: Counts = {};
    const filter: Record<string, unknown> = { _id: drawer._id };
    const inc: Record<string, number> = { version: 1 };
    for (const id of new Set([...Object.keys(received), ...Object.keys(returned)])) {
      const r = received[id] || 0;
      const x = returned[id] || 0;
      if (r === x) continue;
      delta[id] = r - x;
      inc[`counts.${id}`] = r - x;
      // a missing field does not match $gte, so an empty denomination can't be taken from either
      if (r - x < 0) filter[`counts.${id}`] = { $gte: x - r };
    }
    const updated = await this.drawers.findOneAndUpdate(filter, { $inc: inc }, { new: true, session }).lean() as any;
    if (!updated) {
      const fresh = await this.drawers.findById(drawer._id).session(session).lean() as any;
      throw new DrawerError(409, 'DRAWER_STOCK_INSUFFICIENT', { counts: fresh?.counts ?? {} });
    }
    const [txn] = await this.txns.create([{
      drawerId: updated._id, storeId: updated.storeId, seq: updated.version, type: p.type,
      billId: p.billId, invoiceNo: p.invoiceNo, received, returned, delta,
      netRupees: sumCounts(delta, updated.denoms), balanceAfter: updated.counts,
      billTotalRupees: p.billTotalRupees, cashDueRupees: p.cashDueRupees,
      clientRequestId: p.clientRequestId, reason: p.reason, createdBy: p.user,
    }], { session });
    return { txn, replayed: false as const, counts: updated.counts as Counts };
  }

  /** one write = one transaction (drawer page actions) */
  private async run(p: TxnInput) {
    try {
      return await this.conn.transaction(s => this.applyCashTxn(s, p));
    } catch (e: any) {
      // the same request raced itself: hand back the row the winner wrote
      if (e?.code === 11000 && p.clientRequestId) {
        const txn = await this.txns.findOne({ storeId: this.oid(p.storeId), clientRequestId: p.clientRequestId, type: p.type }).lean();
        if (txn) return { txn, replayed: true as const };
      }
      throw e;
    }
  }

  private async log(drawerId: Types.ObjectId, action: 'create' | 'update', after: Record<string, unknown>, user: DrawerUser) {
    await this.audit.create({ targetCollection: 'CashDrawer', docId: drawerId, action, before: null, after, userId: user.userId, userName: user.name, at: new Date(), ip: '' }).catch(() => undefined);
  }

  async openingCount(storeId: string, counts: Counts, clientRequestId: string | undefined, user: DrawerUser) {
    const sid = this.oid(storeId);
    const existing = await this.drawers.findOne({ storeId: sid }).lean() as any;
    if (existing?.initialisedAt) throw new DrawerError(409, 'ALREADY_INITIALISED');
    // created OFF: bills behave as today until a superadmin switches the mode on
    const drawer = existing ?? await this.drawers.findOneAndUpdate({ storeId: sid }, { $setOnInsert: { storeId: sid } }, { upsert: true, new: true }).lean();
    if (!isValidCounts(counts, drawer.denoms)) throw new DrawerError(422, 'BAD_COUNTS');
    const res = await this.conn.transaction(async s => {
      // claim initialisation atomically: two superadmins counting at once can't both open the drawer
      const claimed = await this.drawers.findOneAndUpdate({ _id: drawer._id, initialisedAt: null }, { $set: { initialisedAt: new Date(), lastReconciledAt: new Date() } }, { session: s });
      if (!claimed) throw new DrawerError(409, 'ALREADY_INITIALISED');
      return this.applyCashTxn(s, { storeId: sid, type: 'OPENING_COUNT', received: counts, clientRequestId, reason: 'Opening count', user });
    });
    await this.log(drawer._id, 'create', { opening: counts }, user);
    return { ...(await this.get(storeId)), txnId: String(res.txn._id) };
  }

  async adjust(storeId: string, b: { type: string; received?: Counts; returned?: Counts; reason?: string; clientRequestId?: string }, user: DrawerUser) {
    if (!['DEPOSIT', 'WITHDRAWAL', 'REPLENISH', 'ADJUSTMENT'].includes(b.type)) throw new DrawerError(422, 'BAD_REQUEST', { field: 'type' });
    if (!b.reason?.trim()) throw new DrawerError(422, 'REASON_REQUIRED');
    // cash only leaves for a deposit/withdrawal and only arrives for a top-up; ADJUSTMENT may do both
    const received = b.type === 'DEPOSIT' || b.type === 'WITHDRAWAL' ? {} : b.received ?? {};
    const returned = b.type === 'REPLENISH' ? {} : b.returned ?? {};
    const res = await this.run({ storeId, type: b.type as TxnType, received, returned, reason: b.reason.trim(), clientRequestId: b.clientRequestId, user });
    return { ...(await this.get(storeId)), txnId: String(res.txn._id) };
  }

  /** end-of-day: counted - system becomes a RECONCILE row; counts become what was counted */
  async reconcile(storeId: string, b: { counted: Counts; note?: string; clientRequestId?: string }, user: DrawerUser) {
    const sid = this.oid(storeId);
    let variance: Counts = {};
    const res = await this.conn.transaction(async s => {
      const d = await this.drawers.findOne({ storeId: sid }).session(s).lean() as any;
      if (!d?.initialisedAt) throw new DrawerError(409, 'DRAWER_NOT_INITIALISED');
      if (!isValidCounts(b.counted, d.denoms)) throw new DrawerError(422, 'BAD_COUNTS');
      const received: Counts = {}, returned: Counts = {};
      variance = {};
      for (const x of d.denoms) {
        const diff = (b.counted[x.id] || 0) - (d.counts?.[x.id] || 0);
        if (diff > 0) received[x.id] = diff;
        if (diff < 0) returned[x.id] = -diff;
        if (diff) variance[x.id] = diff;
      }
      const r = await this.applyCashTxn(s, { storeId: sid, type: 'RECONCILE', received, returned, reason: b.note?.trim() || 'End-of-day count', clientRequestId: b.clientRequestId, user });
      if (!r.replayed) await this.drawers.updateOne({ _id: d._id }, { $set: { lastReconciledAt: new Date() } }, { session: s });
      return r;
    });
    const drawer = (await this.get(storeId)).drawer!;
    return { drawer, txnId: String(res.txn._id), variance, varianceRupees: sumCounts(variance, drawer.denoms) };
  }

  /** billing rows store only the user id: look the names up (admin users) for display and the user filter */
  private adminUsers() {
    return this.conn.models?.AdminUser as Model<any> | undefined;
  }

  async listTxns(storeId: string, q: { type?: string; from?: string; to?: string; cursor?: string; limit?: string; format?: string; user?: string; ref?: string; low?: string }) {
    const sid = this.oid(storeId);
    const filter: Record<string, any> = { storeId: sid };
    const and: Record<string, any>[] = [];
    if (q.type && (TXN_TYPES as readonly string[]).includes(q.type)) filter.type = q.type;
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(+new Date(q.to) + (q.to.length <= 10 ? DAY : 0)) : null; // a bare date includes that whole day
    if ((from && !isNaN(+from)) || (to && !isNaN(+to))) filter.createdAt = { ...(from && !isNaN(+from) ? { $gte: from } : {}), ...(to && !isNaN(+to) ? { $lt: to } : {}) };
    if (q.cursor && Number.isSafeInteger(Number(q.cursor))) filter.seq = { $lt: Number(q.cursor) };
    const ref = typeof q.ref === 'string' ? q.ref.trim().slice(0, 60) : '';
    if (ref) filter.invoiceNo = { $regex: escapeRegex(ref), $options: 'i' };
    const user = typeof q.user === 'string' ? q.user.trim().slice(0, 60) : '';
    if (user) {
      const rx = { $regex: escapeRegex(user), $options: 'i' };
      const ids = ((await this.adminUsers()?.find({ $or: [{ name: rx }, { email: rx }] }).select('_id').limit(50).lean()) ?? []) as any[];
      and.push({ $or: [{ 'createdBy.name': rx }, { 'createdBy.userId': { $in: [user, ...ids.map(u => String(u._id))] } }] });
    }
    const drawer = await this.drawers.findOne({ storeId: sid }).select('denoms').lean() as any;
    const denoms: any[] = drawer?.denoms ?? [];
    if (q.low === '1' || q.low === 'true') {
      // a missing count is 0, and `$not: { $gt }` matches a missing field too
      const any = denoms.filter(d => d.active).map(d => ({ [`balanceAfter.${d.id}`]: { $not: { $gt: d.minLevel || 0 } } }));
      and.push(any.length ? { $or: any } : { _id: null });
    }
    if (and.length) filter.$and = and;
    const csv = q.format === 'csv';
    const limit = csv ? 10_000 : Math.min(200, Math.max(1, Number(q.limit) || 50));
    const found = await this.txns.find(filter).sort({ seq: -1 }).limit(limit).lean() as any[];
    const uids = [...new Set(found.filter(r => !r.createdBy?.name && Types.ObjectId.isValid(r.createdBy?.userId ?? '')).map(r => r.createdBy.userId))];
    const names = new Map<string, string>();
    if (uids.length) for (const u of ((await this.adminUsers()?.find({ _id: { $in: uids } }).select('name email').lean()) ?? []) as any[]) names.set(String(u._id), u.name || u.email);
    const rows = found.map(r => ({
      ...r,
      operator: r.createdBy?.name || names.get(r.createdBy?.userId) || r.createdBy?.userId || '',
      receivedRupees: sumCounts(r.received ?? {}, denoms),
      returnedRupees: sumCounts(r.returned ?? {}, denoms),
      lowAfter: lowIn(r.balanceAfter ?? {}, denoms), // judged against today's Min (Min is not versioned)
    }));
    if (csv) {
      const fmt = (c: Counts) => Object.entries(c ?? {}).filter(([, n]) => n).map(([k, n]) => `${k}x${n}`).join(' ');
      const head = 'seq,time,type,invoice,bill_total,cash_due,cash_received,change_returned,net_rupees,received,returned,balance_after,low_after,reason,by';
      return [head, ...rows.map(r => [r.seq, new Date(r.createdAt).toISOString(), r.type, r.invoiceNo ?? '', r.billTotalRupees ?? '', r.cashDueRupees ?? '', r.receivedRupees, r.returnedRupees, r.netRupees,
        fmt(r.received), fmt(r.returned), fmt(r.balanceAfter), r.lowAfter.join(' '), r.reason ?? '', r.operator]
        .map(v => escapeCsvField(String(v))).join(','))].join('\n');
    }
    return { rows, nextCursor: found.length === limit ? found[found.length - 1].seq : null };
  }

  /** rebuild the balance from the ledger and compare with the cached counts; also checks seq has no gaps */
  async verify(storeId: string) {
    const d = await this.drawers.findOne({ storeId: this.oid(storeId) }).lean() as any;
    if (!d) throw new DrawerError(409, 'DRAWER_NOT_INITIALISED');
    const rows = await this.txns.find({ drawerId: d._id }).sort({ seq: 1 }).select('delta seq').lean() as any[];
    const rebuilt: Counts = {};
    const gaps: number[] = [];
    let expected = 1;
    for (const r of rows) {
      if (r.seq !== expected) gaps.push(r.seq);
      expected = r.seq + 1;
      for (const [id, n] of Object.entries(r.delta as Counts)) rebuilt[id] = (rebuilt[id] || 0) + n;
    }
    const counts: Counts = d.counts ?? {};
    const mismatches = Object.keys({ ...rebuilt, ...counts }).filter(id => (rebuilt[id] || 0) !== (counts[id] || 0));
    const versionOk = rows.length ? rows[rows.length - 1].seq === d.version : d.version === 0;
    return { ok: !mismatches.length && !gaps.length && versionOk, mismatches, gaps, versionOk, rebuilt, counts, txnCount: rows.length };
  }

  async updateSettings(storeId: string, b: { mode?: string; denoms?: Array<{ id: string; active?: boolean; par?: number; minLevel?: number }> }, user: DrawerUser) {
    const d = await this.drawers.findOne({ storeId: this.oid(storeId) }).lean() as any;
    if (!d?.initialisedAt) throw new DrawerError(409, 'DRAWER_NOT_INITIALISED');
    const set: Record<string, unknown> = {};
    if (b.mode !== undefined) {
      if (!['OFF', 'SOFT', 'HARD'].includes(b.mode)) throw new DrawerError(422, 'BAD_REQUEST', { field: 'mode' });
      set.mode = b.mode;
    }
    const guard: Record<string, unknown> = { _id: d._id };
    if (b.denoms) {
      if (!Array.isArray(b.denoms)) throw new DrawerError(422, 'BAD_REQUEST', { field: 'denoms' });
      const int = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 100000;
      const denoms = d.denoms.map((x: any) => {
        const c = b.denoms!.find(y => y?.id === x.id);
        if (!c) return x;
        if ((c.par !== undefined && !int(c.par)) || (c.minLevel !== undefined && !int(c.minLevel))) throw new DrawerError(422, 'BAD_REQUEST', { field: 'denoms' });
        if (c.active === false && x.active) guard[`counts.${x.id}`] = { $in: [0, null] }; // checked again at write time
        return { ...x, active: c.active ?? x.active, par: c.par ?? x.par, minLevel: c.minLevel ?? x.minLevel };
      });
      set.denoms = denoms;
    }
    const ok = await this.drawers.findOneAndUpdate(guard, { $set: set }, { new: true });
    if (!ok) throw new DrawerError(409, 'DENOM_HAS_STOCK');
    await this.log(d._id, 'update', set, user);
    return this.get(storeId);
  }

  // ─── Bill flows ──────────────────────────────────────────────────────────

  /**
   * Server authority for a sale's cash block (validated before any stock moves). Returns the drawer step to apply in the
   * bill's transaction, or null when the drawer is not involved.
   */
  async planSale(p: { storeId?: string; docType: string; cashPaise: number; upiPaise: number; grandTotalPaise: number; cash: CashBlock }): Promise<CashPlan | null> {
    if (p.docType === 'SALE_ORDER') return null;
    const drawer = await this.activeFor(p.storeId);
    if (!drawer) return null;
    if (p.docType === 'CREDIT_NOTE') {
      if (p.cashPaise > 0) throw new DrawerError(422, 'CREDIT_NOTE_CASH_BLOCKED');
      return null;
    }
    if (p.cashPaise === 0 && !p.cash) return null; // UPI-only / credit bill: no cash moves
    if (p.upiPaise > p.grandTotalPaise) throw new DrawerError(422, 'UPI_EXCEEDS_TOTAL');
    const plan = this.planCash(drawer, Math.floor((p.grandTotalPaise - p.upiPaise) / 100), p.cashPaise, p.cash, 'BILL_SALE');
    return { ...plan, billTotalRupees: p.grandTotalPaise / 100 };
  }

  /** shared by sale and later payment: cashDue in whole rupees, cashPaise = what the payment line says */
  private planCash(drawer: any, cashDueRupees: number, cashPaise: number, cash: CashBlock, type: TxnType): CashPlan {
    if (cash?.skip) {
      if (drawer.mode === 'HARD') throw new DrawerError(422, 'COUNTING_REQUIRED');
      const reason = typeof cash.skip.reason === 'string' ? cash.skip.reason.trim() : '';
      if (!reason) throw new DrawerError(422, 'SKIP_REASON_REQUIRED');
      return { type: 'UNCOUNTED_SALE', reason: reason.slice(0, 300) };
    }
    if (!cash || typeof cash !== 'object') throw new DrawerError(422, 'CASH_BLOCK_REQUIRED');
    const received = cash.received ?? {}, returned = cash.returned ?? {};
    const res = checkTender({
      cashDue: cashDueRupees, received, returned, stock: drawer.counts ?? {}, defs: drawer.denoms as DenomDef[],
      activeIds: drawer.denoms.filter((d: any) => d.active).map((d: any) => d.id),
    });
    if (!res.ok) {
      if (res.code === 'STOCK_INSUFFICIENT') throw new DrawerError(409, 'DRAWER_STOCK_INSUFFICIENT', { counts: drawer.counts ?? {} });
      throw new DrawerError(422, res.code!, { changeDue: res.changeDue });
    }
    if (res.applied * 100 !== cashPaise) throw new DrawerError(422, 'CASH_PAYMENT_MISMATCH', { applied: res.applied });
    return { type, received, returned, cashDueRupees: res.applied };
  }

  async planPayment(p: { storeId?: string; amountPaise: number; mode: string; cash: CashBlock }): Promise<CashPlan | null> {
    if (p.mode !== 'cash') return null;
    const drawer = await this.activeFor(p.storeId);
    if (!drawer) return null;
    // the counter collects exactly the payment; an overpayment comes back as change
    return this.planCash(drawer, Math.floor(p.amountPaise / 100), p.amountPaise, p.cash, 'BILL_PAYMENT');
  }

  /** net counted cash a bill put into the drawer (sale + later payments - refunds), whole rupees */
  async netCashForBill(billId: Types.ObjectId | string) {
    const rows = await this.txns.find({ billId: new Types.ObjectId(String(billId)), type: { $in: ['BILL_SALE', 'BILL_PAYMENT', 'BILL_REFUND'] } }).select('netRupees').lean() as any[];
    return { count: rows.length, net: rows.reduce((s, r) => s + (r.netRupees || 0), 0) };
  }

  async billHasTxns(billId: Types.ObjectId | string) {
    return !!(await this.txns.exists({ billId: new Types.ObjectId(String(billId)) }));
  }

  /** cancel: the counted cash on the bill must leave the drawer in the notes the cashier picked */
  async planRefund(p: { storeId?: string; billId: Types.ObjectId | string; cash: CashBlock }): Promise<CashPlan | null> {
    const drawer = await this.activeFor(p.storeId);
    if (!drawer) return null;
    const { net } = await this.netCashForBill(p.billId);
    if (net <= 0) return null;
    const returned = p.cash?.returned;
    if (!returned) throw new DrawerError(422, 'CASH_REFUND_REQUIRED', { refundRupees: net });
    const activeIds = drawer.denoms.filter((d: any) => d.active).map((d: any) => d.id);
    if (!isValidCounts(returned, drawer.denoms)) throw new DrawerError(422, 'BAD_COUNTS');
    if (Object.keys(returned).some(id => returned[id] && !activeIds.includes(id))) throw new DrawerError(422, 'INACTIVE_DENOMINATION');
    if (sumCounts(returned, drawer.denoms) !== net) throw new DrawerError(422, 'REFUND_MISMATCH', { refundRupees: net });
    return { type: 'BILL_REFUND', returned };
  }

  /** run `work` and the drawer step in ONE transaction: both commit or neither does */
  async withCash<T>(plan: CashPlan | null, meta: { storeId: string | Types.ObjectId; billId: Types.ObjectId; invoiceNo?: string; clientRequestId?: string; user: DrawerUser }, work: (s?: ClientSession) => Promise<T>): Promise<T> {
    if (!plan) return work();
    return this.conn.transaction(async s => {
      const out = await work(s);
      await this.applyCashTxn(s, { ...plan, ...meta });
      return out;
    });
  }
}
