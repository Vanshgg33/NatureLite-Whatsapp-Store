import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { toCsvRow } from '../../common/utils/csv.util';
import { AuditService } from '../audit/audit.service';
import {
  MoveType, ProdBalance, ProdBalanceDocument, ProdCounter, ProdCounterDocument, ProdEntry, ProdEntryDocument,
  ProdEvidence, ProdEvidenceDocument, ProdItem, ProdItemDocument, ProdLocation, ProdLocationDocument, ProdMachine,
  ProdMachineDocument, ProdMovement, ProdMovementDocument, ProdOutbox, ProdOutboxDocument, ProdSettings, ProdSettingsDocument,
} from './production.schemas';

// shortcut: plain JS numbers rounded to 6 dp instead of Decimal128; upgrade if quantities need exact decimals beyond that.
export const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const bad = (m: string) => new BadRequestException(m);
const oid = (v: unknown, label: string) => {
  if (typeof v !== 'string' || !Types.ObjectId.isValid(v)) throw bad(`${label} is invalid`);
  return new Types.ObjectId(v);
};
const posNum = (v: unknown, label: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw bad(`${label} must be a positive number`);
  return n;
};
const txt = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const reqTxt = (v: unknown, label: string, max = 200) => txt(v, max) ?? (() => { throw bad(`${label} is required`); })();
const dateOr = (v: unknown, label: string, fallback = new Date()) => {
  if (v === undefined || v === null || v === '') return fallback;
  const d = new Date(v as string);
  if (isNaN(+d)) throw bad(`${label} is not a valid date`);
  return d;
};
const evKeys = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && /^[\w\-./]{3,200}$/.test(x)).slice(0, 10) as string[]) : []);
/** Stops spreadsheet formula injection from user-entered text (=, +, -, @ at the start of a cell). */
const safeCell = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const csvRow = (cells: unknown[]) => toCsvRow(cells.map(safeCell));
const rx = (s: unknown) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EVENTS = ['receipt', 'issue', 'return', 'production', 'packing', 'eod', 'lowstock'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PHOTO = 8 * 1024 * 1024;

/** Start of the factory-local day (YYYY-MM-DD) as a UTC instant, for a fixed UTC offset in minutes. */
export const dayStart = (date: string, offsetMin: number) => new Date(Date.parse(`${date}T00:00:00.000Z`) - offsetMin * 60_000);
export const localDate = (now: Date, offsetMin: number) => new Date(+now + offsetMin * 60_000).toISOString().slice(0, 10);
const tzString = (off: number) => `${off < 0 ? '-' : '+'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`;

/** Entered qty/unit -> base qty. A kg<->L conversion needs the item's configured factor and is flagged as an estimate. */
export function toBase(item: Pick<ProdItem, 'baseUnit' | 'kgPerL' | 'name'>, qty: number, unit: string) {
  if (unit === item.baseUnit) return { base: r6(qty), converted: false, factor: undefined as number | undefined };
  if (unit !== 'kg' && unit !== 'L') throw bad(`Unsupported unit "${unit}" for ${item.name}`);
  if (!item.kgPerL) throw bad(`No kg/L factor configured for ${item.name}; set it in Items before entering ${unit}`);
  if (unit === 'kg' && item.baseUnit === 'L') return { base: r6(qty / item.kgPerL), converted: true, factor: item.kgPerL };
  if (unit === 'L' && item.baseUnit === 'kg') return { base: r6(qty * item.kgPerL), converted: true, factor: item.kgPerL };
  throw bad(`Cannot convert ${unit} to ${item.baseUnit} for ${item.name}`);
}

export interface Ctx { storeId: string; user: JwtPayload }

interface Spec {
  type: MoveType;
  itemId: Types.ObjectId;
  locationId: Types.ObjectId;
  sign: 1 | -1;
  qty: number;
  unit: string;
  prefix: string;
  eventAt?: Date;
  performedBy?: string;
  supplier?: string; lot?: string; destination?: string; reason?: string; note?: string;
  machine?: string; sourceRef?: string; evidence?: string[]; idemKey?: string;
  allowNegative?: boolean; reverses?: Types.ObjectId;
  email?: { event: string; title: string; extra?: [string, string][] };
}

const kvTable = (rows: [string, string][]) =>
  `<table cellpadding="6" style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="border:1px solid #ddd;background:#f4f7f4"><b>${esc(k)}</b></td><td style="border:1px solid #ddd">${esc(v)}</td></tr>`).join('')}</table>`;
const gridTable = (head: string[], rows: unknown[][]) =>
  `<table cellpadding="5" style="border-collapse:collapse;font-size:13px"><tr>${head.map((h) => `<th style="border:1px solid #ddd;background:#f4f7f4">${esc(h)}</th>`).join('')}</tr>${rows
    .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #ddd">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;

@Injectable()
export class ProductionService {
  private readonly log = new Logger(ProductionService.name);

  constructor(
    @InjectModel(ProdItem.name) private items: Model<ProdItemDocument>,
    @InjectModel(ProdLocation.name) private locs: Model<ProdLocationDocument>,
    @InjectModel(ProdMachine.name) private machines: Model<ProdMachineDocument>,
    @InjectModel(ProdMovement.name) private moves: Model<ProdMovementDocument>,
    @InjectModel(ProdBalance.name) private bals: Model<ProdBalanceDocument>,
    @InjectModel(ProdEntry.name) private entries: Model<ProdEntryDocument>,
    @InjectModel(ProdCounter.name) private counters: Model<ProdCounterDocument>,
    @InjectModel(ProdOutbox.name) private outbox: Model<ProdOutboxDocument>,
    @InjectModel(ProdSettings.name) private settings: Model<ProdSettingsDocument>,
    @InjectModel(ProdEvidence.name) private evidence: Model<ProdEvidenceDocument>,
    @InjectConnection() private conn: Connection,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  /** Store settings with defaults applied. */
  private async cfg(storeId: string, session?: ClientSession) {
    const s = await this.settings.findOne({ store: storeId }).lean().session(session ?? null);
    return {
      recipients: s?.recipients ?? {}, tagVocab: s?.tagVocab ?? [], requireReceiptPhoto: !!s?.requireReceiptPhoto,
      utcOffsetMinutes: s?.utcOffsetMinutes ?? 330, eodTime: s?.eodTime ?? '', lastEodDate: s?.lastEodDate ?? '',
    };
  }

  // ───────── master data ─────────
  listItems(c: Ctx, kind?: string) {
    return this.items.find({ store: c.storeId, ...(kind ? { kind } : {}) }).sort({ name: 1 }).lean();
  }

  async saveItem(c: Ctx, b: any, id?: string) {
    const doc: Record<string, unknown> = {};
    if (!id || b.name !== undefined) doc.name = reqTxt(b.name, 'Name');
    if (!id) {
      doc.kind = b.kind === 'product' ? 'product' : 'material';
      doc.code = reqTxt(b.code, 'Code', 30).toUpperCase();
      if (!['kg', 'L', 'pcs'].includes(b.baseUnit)) throw bad('Base unit must be kg, L or pcs');
      doc.baseUnit = b.baseUnit;
    }
    if (b.lowStockThreshold !== undefined) doc.lowStockThreshold = Math.max(0, Number(b.lowStockThreshold) || 0);
    if (Array.isArray(b.tags)) {
      const tags = [...new Set<string>(b.tags.map((t: unknown) => txt(t, 40)).filter(Boolean) as string[])];
      const vocab = (await this.cfg(c.storeId)).tagVocab;
      const unknown = vocab.length ? tags.filter((t) => !vocab.includes(t)) : [];
      if (unknown.length) throw bad(`Unknown tag(s): ${unknown.join(', ')}. Add them to the tag list first.`);
      doc.tags = tags;
    }
    if (b.form) doc.form = b.form === 'packed' ? 'packed' : 'bulk';
    if (b.active !== undefined) doc.active = !!b.active;
    const by = c.user.name || c.user.sub;
    try {
      if (!id) {
        if (b.kgPerL) doc.kgPerL = posNum(b.kgPerL, 'kg/L factor');
        if (doc.kgPerL) doc.conversionHistory = [{ kgPerL: doc.kgPerL, effectiveFrom: new Date(), by }];
        const created = await this.items.create({ ...doc, store: c.storeId });
        await this.logAudit(c, 'production.item.create', created._id, undefined, doc);
        return created;
      }
      const cur = await this.items.findOne({ _id: oid(id, 'Item id'), store: c.storeId });
      if (!cur) throw new NotFoundException('Item not found');
      const upd: any = { $set: doc };
      if (b.kgPerL !== undefined && Number(b.kgPerL) !== cur.kgPerL) {
        const f = posNum(b.kgPerL, 'kg/L factor');
        doc.kgPerL = f; // history is append-only; old ledger rows keep the factor they were posted with
        upd.$push = { conversionHistory: { kgPerL: f, effectiveFrom: new Date(), by } };
      }
      await this.items.updateOne({ _id: cur._id }, upd);
      await this.logAudit(c, 'production.item.update', cur._id, { name: cur.name, kgPerL: cur.kgPerL }, doc);
      return this.items.findById(cur._id).lean();
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('An item with that code already exists');
      throw e;
    }
  }

  async getTags(c: Ctx) { return (await this.cfg(c.storeId)).tagVocab; }

  async saveTags(c: Ctx, tags: unknown) {
    if (!Array.isArray(tags)) throw bad('tags must be a list');
    const clean = [...new Set<string>(tags.map((t) => txt(t, 40)).filter(Boolean) as string[])].sort();
    await this.settings.updateOne({ store: c.storeId }, { $set: { tagVocab: clean } }, { upsert: true });
    await this.logAudit(c, 'production.tags', c.storeId, undefined, { tags: clean });
    return clean;
  }

  listLocations(c: Ctx) { return this.locs.find({ store: c.storeId }).sort({ name: 1 }).lean(); }
  async saveLocation(c: Ctx, b: any, id?: string) {
    try {
      if (!id) return await this.locs.create({ store: c.storeId, name: reqTxt(b.name, 'Name', 80) });
      await this.locs.updateOne({ _id: oid(id, 'Location id'), store: c.storeId }, { $set: { ...(b.name ? { name: reqTxt(b.name, 'Name', 80) } : {}), ...(b.active !== undefined ? { active: !!b.active } : {}) } });
      return this.locs.findById(id).lean();
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('A location with that name already exists');
      throw e;
    }
  }

  listMachines(c: Ctx) { return this.machines.find({ store: c.storeId }).sort({ code: 1 }).lean(); }
  async saveMachine(c: Ctx, b: any, id?: string) {
    const doc: Record<string, unknown> = {};
    if (!id) { doc.code = reqTxt(b.code, 'Code', 30).toUpperCase(); }
    if (!id || b.name !== undefined) doc.name = reqTxt(b.name, 'Name', 80);
    for (const k of ['type', 'location', 'capacityUnit']) if (b[k] !== undefined) doc[k] = txt(b[k], 60);
    if (b.capacity !== undefined && b.capacity !== '') doc.capacity = posNum(b.capacity, 'Capacity');
    if (b.active !== undefined) doc.active = !!b.active;
    try {
      if (!id) return await this.machines.create({ ...doc, store: c.storeId });
      await this.machines.updateOne({ _id: oid(id, 'Machine id'), store: c.storeId }, { $set: doc });
      return this.machines.findById(id).lean();
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('A machine with that code already exists');
      throw e;
    }
  }

  // ───────── private evidence photos ─────────
  /** Stores a scale photo as a private (authenticated) Cloudinary asset and records its metadata. */
  async uploadEvidence(c: Ctx, file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw bad('No photo received');
    if (file.size > MAX_PHOTO) throw bad('Photo is larger than 8 MB');
    const b = file.buffer;
    const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    const isWebp = b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP';
    if (!isJpg && !isPng && !isWebp) throw bad('Only JPEG, PNG or WebP photos are allowed');
    const cl: any = this.config.get('cloudinary');
    cloudinary.config({ cloud_name: cl?.cloudName, api_key: cl?.apiKey, api_secret: cl?.apiSecret });
    const up: any = await new Promise((resolve, reject) =>
      cloudinary.uploader.upload_stream({ folder: `production/${c.storeId}`, type: 'authenticated', resource_type: 'image' }, (e, r) => (e ? reject(e) : resolve(r))).end(b));
    const doc = await this.evidence.create({
      store: c.storeId, key: up.public_id, format: up.format, mime: isJpg ? 'image/jpeg' : isPng ? 'image/png' : 'image/webp',
      size: file.size, checksum: createHash('sha256').update(b).digest('hex'), uploader: c.user.sub, uploaderName: c.user.name,
    });
    return { key: doc.key, size: doc.size, checksum: doc.checksum };
  }

  /** Short-lived signed download URL; only issued to authenticated users with access to this store's evidence. */
  async evidenceUrl(c: Ctx, key: unknown) {
    const ev = await this.evidence.findOne({ store: c.storeId, key: reqTxt(key, 'Key') });
    if (!ev) throw new NotFoundException('Photo not found');
    const cl: any = this.config.get('cloudinary');
    cloudinary.config({ cloud_name: cl?.cloudName, api_key: cl?.apiKey, api_secret: cl?.apiSecret });
    const expires = Math.floor(Date.now() / 1000) + 300;
    return { url: cloudinary.utils.private_download_url(ev.key, ev.format ?? 'jpg', { type: 'authenticated', resource_type: 'image', expires_at: expires }), expiresIn: 300 };
  }

  // ───────── ledger core ─────────
  /**
   * Allocated outside the transaction on purpose: a counter write inside it would make every concurrent
   * movement conflict on one hot document. A rolled-back movement just leaves a gap in the numbering.
   */
  private async nextRef(prefix: string, storeId: string) {
    const key = `${storeId}:${prefix}`;
    for (let i = 0; ; i++) {
      try {
        const c = await this.counters.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, new: true });
        return `${prefix}-${String(c!.seq).padStart(5, '0')}`;
      } catch (e: any) {
        if (e?.code !== 11000 || i > 2) throw e; // two first-ever upserts racing on the unique key
      }
    }
  }

  /** Runs inside a transaction: balance guard + immutable movement + outbox rows commit together. */
  private async move(c: Ctx, s: Spec, session: ClientSession) {
    if (s.idemKey) {
      const dup = await this.moves.findOne({ idemKey: s.idemKey }).session(session);
      if (dup) return { movement: dup, balance: undefined as number | undefined, unit: undefined as string | undefined, duplicate: true, notification: 'none' };
    }
    // Sequential on purpose: operations on one transaction session must not run concurrently.
    const item = await this.items.findOne({ _id: s.itemId, store: c.storeId }).session(session);
    const loc = await this.locs.findOne({ _id: s.locationId, store: c.storeId }).session(session);
    if (!item) throw new NotFoundException('Item not found');
    if (!loc) throw new NotFoundException('Location not found');
    if (!item.active) throw bad(`${item.name} is inactive`);
    if (!loc.active && s.type !== 'REVERSAL') throw bad(`Location ${loc.name} is inactive`);
    if (s.evidence?.length) {
      const n = await this.evidence.countDocuments({ store: c.storeId, key: { $in: s.evidence } }).session(session);
      if (n !== new Set(s.evidence).size) throw bad('A photo was not found; upload it again');
    }

    const { base, converted, factor } = toBase(item, s.qty, s.unit);
    const delta = r6(s.sign * base);
    const key = { store: c.storeId, item: item._id, location: loc._id };
    let bal: ProdBalanceDocument | null;
    if (delta < 0 && !s.allowNegative) {
      bal = await this.bals.findOneAndUpdate({ ...key, qty: { $gte: -delta - 1e-9 } }, { $inc: { qty: delta } }, { new: true, session });
      if (!bal) {
        const cur = await this.bals.findOne(key).session(session);
        throw new BadRequestException({
          code: 'INSUFFICIENT_STOCK',
          message: `Insufficient ${item.name} at ${loc.name}: available ${r6(cur?.qty ?? 0)} ${item.baseUnit}, requested ${base} ${item.baseUnit}`,
          available: r6(cur?.qty ?? 0),
        });
      }
    } else {
      bal = await this.bals.findOneAndUpdate(key, { $inc: { qty: delta } }, { new: true, upsert: true, session });
    }

    const ref = await this.nextRef(s.prefix, c.storeId);
    const [movement] = await this.moves.create([{
      store: c.storeId, type: s.type, ref, item: item._id, location: loc._id, qty: delta,
      enteredQty: s.qty, enteredUnit: s.unit, converted, factor, runningAfter: r6(bal!.qty),
      supplier: s.supplier, lot: s.lot, destination: s.destination, reason: s.reason, note: s.note,
      machine: s.machine, sourceRef: s.sourceRef, performedBy: s.performedBy,
      enteredBy: c.user.sub, enteredByName: c.user.name, eventAt: s.eventAt ?? new Date(),
      evidence: s.evidence ?? [], reverses: s.reverses, idemKey: s.idemKey,
    }], { session });

    let notification = 'none';
    if (s.email) {
      const rows: [string, string][] = [
        ['Reference', ref], ['Item', item.name],
        ['Quantity', `${s.sign > 0 ? '+' : '-'}${s.qty} ${s.unit}${converted ? ` (≈ ${base} ${item.baseUnit}, converted at ${factor} kg/L - estimate)` : ''}`],
        ['Location', loc.name], ['Event time', (s.eventAt ?? new Date()).toISOString()],
        ['Entered by', c.user.name || ''], ['Balance after', `${r6(bal!.qty)} ${item.baseUnit}`],
        ...(s.performedBy ? [['Performed by', s.performedBy] as [string, string]] : []),
        ...(s.supplier ? [['Supplier / reference', s.supplier] as [string, string]] : []),
        ...(s.destination ? [['Destination', s.destination] as [string, string]] : []),
        ...(s.sourceRef ? [['Linked reference', s.sourceRef] as [string, string]] : []),
        ...(s.evidence?.length ? [['Evidence', `${this.config.get('frontendUrl')}/admin/production?tab=ledger&q=${ref} (sign-in required)`] as [string, string]] : []),
        ...(s.email.extra ?? []),
      ];
      notification = await this.enqueue(c.storeId, s.email.event, ref, `${s.email.title} ${ref}`, kvTable(rows), session);
    }
    // Low-stock alert fires once, when this movement takes the balance across the threshold.
    if (delta < 0 && item.lowStockThreshold > 0 && bal!.qty <= item.lowStockThreshold && bal!.qty - delta > item.lowStockThreshold) {
      await this.enqueue(c.storeId, 'lowstock', `LOW-${ref}`, `Low stock: ${item.name} at ${loc.name}`,
        kvTable([['Item', item.name], ['Location', loc.name], ['On hand', `${r6(bal!.qty)} ${item.baseUnit}`], ['Threshold', `${item.lowStockThreshold} ${item.baseUnit}`], ['Caused by', ref]]), session);
    }
    return { movement, balance: r6(bal!.qty), unit: item.baseUnit as string | undefined, duplicate: false, notification };
  }

  private async enqueue(storeId: string, event: string, ref: string, subject: string, bodyHtml: string, session?: ClientSession) {
    const st = await this.cfg(storeId, session);
    const to = [...new Set(st.recipients[event] ?? [])];
    if (!to.length) return 'no recipients configured';
    const html = `<div style="font-family:Arial,sans-serif"><h3>${esc(subject)}</h3>${bodyHtml}
      <p style="color:#777;font-size:12px">Notification copy of a saved event. Sign in to the ERP to view it.</p></div>`;
    // Duplicate idem keys (same event + recipient) are ignored, so retries never double-send.
    await this.outbox.insertMany(
      to.map((addr) => ({ store: storeId, event, ref, to: addr, subject, html, idemKey: `${event}:${ref}:${addr}` })),
      { session, ordered: false },
    ).catch((e: any) => { if (e?.code !== 11000 && !e?.writeErrors?.every?.((w: any) => w.code === 11000)) throw e; });
    return 'queued';
  }

  private async tx<T>(fn: (s: ClientSession) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.conn.transaction(fn);
      } catch (e: any) {
        // A duplicate key here is a race (first-ever balance row for an item/location, or the same idempotency key
        // submitted twice at once). One retry sees the winner's row and proceeds, or returns the saved duplicate.
        if (e?.code !== 11000) throw e;
        if (attempt >= 1) {
          if (/idemKey/.test(String(e.message))) throw new ConflictException('Duplicate request in progress; retry to see the saved result');
          throw e;
        }
      }
    }
  }

  private async logAudit(c: Ctx, action: string, target: unknown, prev?: object, next?: object) {
    await this.audit.log({ action, performedBy: c.user.sub, performedByName: c.user.name, targetId: String(target), targetModel: 'Production', previousValues: prev as any, newValues: next as any });
  }

  /** Audit every committed movement (after the transaction, so rolled-back attempts leave no trace). */
  private async audited<T extends { movement?: any; duplicate?: boolean }>(c: Ctx, p: Promise<T>): Promise<T> {
    const r = await p;
    if (r.movement && !r.duplicate) {
      await this.logAudit(c, `production.${String(r.movement.type).toLowerCase()}`, r.movement._id, undefined,
        { ref: r.movement.ref, qty: r.movement.qty, item: String(r.movement.item), location: String(r.movement.location) });
    }
    return r;
  }

  private common(b: any) {
    const eventAt = dateOr(b.eventAt, 'Event time');
    if (+eventAt > Date.now() + 5 * 60_000) throw bad('Event time cannot be in the future');
    return {
      itemId: oid(b.item, 'Item'), locationId: oid(b.location, 'Location'),
      qty: posNum(b.qty, 'Quantity'), unit: reqTxt(b.unit, 'Unit', 5),
      eventAt, performedBy: txt(b.performedBy, 80), note: txt(b.note, 500),
      evidence: evKeys(b.evidence), idemKey: txt(b.idemKey, 100),
    };
  }

  // ───────── RMS workflows ─────────
  async receive(c: Ctx, b: any) {
    const s: Spec = { ...this.common(b), type: 'RECEIPT', sign: 1, prefix: 'RCV', supplier: txt(b.supplier), lot: txt(b.lot, 60),
      email: { event: 'receipt', title: 'Material receipt' } };
    if (!s.evidence?.length && (await this.cfg(c.storeId)).requireReceiptPhoto) throw bad('A scale photo is required for receipts');
    return this.audited(c, this.tx((ses) => this.move(c, s, ses)));
  }

  issue(c: Ctx, b: any) {
    const s: Spec = { ...this.common(b), type: 'ISSUE', sign: -1, prefix: 'ISS', destination: reqTxt(b.destination, 'Destination', 120),
      lot: txt(b.lot, 60), machine: txt(b.machine, 30), sourceRef: txt(b.entryRef, 40),
      email: { event: 'issue', title: 'Production issue' } };
    if (b.override) {
      // Explicit, audited override of the insufficient-stock block; superadmin only.
      if (c.user.role !== 'superadmin') throw new BadRequestException('Only a superadmin can override insufficient stock');
      s.allowNegative = true;
      s.reason = `OVERRIDE: ${reqTxt(b.overrideReason, 'Override reason', 300)}`;
    }
    return this.audited(c, this.tx((ses) => this.move(c, s, ses)));
  }

  returnMaterial(c: Ctx, b: any) {
    return this.audited(c, this.tx(async (ses) => {
      const issue = await this.moves.findOne({ ref: reqTxt(b.issueRef, 'Issue reference', 40), store: c.storeId, type: 'ISSUE', reversed: false }).session(ses);
      if (!issue) throw bad('Issue reference not found (or it was reversed)');
      const item = await this.items.findById(issue.item).session(ses);
      const unit = reqTxt(b.unit, 'Unit', 5);
      const qty = posNum(b.qty, 'Quantity');
      const { base } = toBase(item!, qty, unit);
      const upd = await this.moves.findOneAndUpdate(
        { _id: issue._id, $expr: { $lte: [{ $add: ['$returnedQty', base] }, { $add: [{ $abs: '$qty' }, 1e-9] }] } },
        { $inc: { returnedQty: base } }, { session: ses, new: true },
      );
      if (!upd) {
        throw bad(`Return exceeds the unreturned balance of ${issue.ref}: issued ${Math.abs(issue.qty)}, already returned ${issue.returnedQty} ${item!.baseUnit}`);
      }
      const s: Spec = { ...this.common({ ...b, item: String(issue.item), location: b.location || String(issue.location) }),
        type: 'RETURN', sign: 1, prefix: 'RET', sourceRef: issue.ref, destination: txt(b.destinationBin, 80),
        reason: [txt(b.condition, 60) && `Condition: ${txt(b.condition, 60)}`, txt(b.reason, 200)].filter(Boolean).join('. ') || undefined,
        email: { event: 'return', title: 'Material return', extra: [
          ['Issued', `${Math.abs(issue.qty)} ${item!.baseUnit}`], ['Returned so far', `${r6(upd.returnedQty)} ${item!.baseUnit}`],
          ['Net consumed', `${r6(Math.abs(issue.qty) - upd.returnedQty)} ${item!.baseUnit}`]] } };
      return this.move(c, s, ses);
    }));
  }

  adjust(c: Ctx, b: any) {
    const delta = Number(b.delta);
    if (!Number.isFinite(delta) || delta === 0) throw bad('Delta must be a non-zero number');
    const s: Spec = { ...this.common({ ...b, qty: Math.abs(delta) }), type: 'ADJUST', sign: delta > 0 ? 1 : -1, prefix: 'ADJ', reason: reqTxt(b.reason, 'Reason', 300) };
    return this.audited(c, this.tx((ses) => this.move(c, s, ses)));
  }

  waste(c: Ctx, b: any) {
    const s: Spec = { ...this.common(b), type: 'WASTE', sign: -1, prefix: 'WST', reason: reqTxt(b.reason, 'Reason', 300) };
    return this.audited(c, this.tx((ses) => this.move(c, s, ses)));
  }

  /** EOD: record a physical count as an adjustment (variance = counted - system). Caller needs adjust permission. */
  countAdjust(c: Ctx, b: any) {
    const itemId = oid(b.item, 'Item'); const locationId = oid(b.location, 'Location');
    const counted = Number(b.counted);
    if (!Number.isFinite(counted) || counted < 0) throw bad('Counted quantity must be zero or more');
    return this.audited(c, this.tx(async (ses) => {
      const item = await this.items.findOne({ _id: itemId, store: c.storeId }).session(ses);
      if (!item) throw new NotFoundException('Item not found');
      const { base } = toBase(item, counted, reqTxt(b.unit ?? item.baseUnit, 'Unit', 5));
      const cur = await this.bals.findOne({ store: c.storeId, item: itemId, location: locationId }).session(ses);
      const diff = r6(base - (cur?.qty ?? 0));
      if (diff === 0) return { movement: null as any, balance: r6(cur?.qty ?? 0), unit: item.baseUnit as string | undefined, duplicate: false, notification: 'none' };
      const s: Spec = { itemId, locationId, qty: Math.abs(diff), unit: item.baseUnit, type: 'ADJUST', sign: diff > 0 ? 1 : -1, prefix: 'ADJ',
        reason: `Physical count ${counted} (system ${r6(cur?.qty ?? 0)}). ${txt(b.reason, 200) ?? ''}`.trim(), eventAt: dateOr(b.eventAt, 'Event time') };
      return this.move(c, s, ses);
    }));
  }

  reverse(c: Ctx, b: any) {
    const reason = reqTxt(b.reason, 'Reason', 300);
    return this.audited(c, this.tx(async (ses) => {
      const o = await this.moves.findOne({ _id: oid(b.movementId, 'Movement'), store: c.storeId }).session(ses);
      if (!o) throw new NotFoundException('Movement not found');
      if (o.type === 'REVERSAL') throw bad('A reversal cannot be reversed; post a new entry instead');
      if (o.type === 'ISSUE' && o.returnedQty > 0) throw bad('Reverse the returns for this issue first');
      if (o.type === 'PACK_ISSUE' && await this.moves.exists({ store: c.storeId, type: 'PACK_RECEIPT', sourceRef: o.ref, reversed: false }).session(ses)) {
        throw bad('Reverse the packed-goods receipt for this packing issue first');
      }
      const flagged = await this.moves.updateOne({ _id: o._id, reversed: false }, { $set: { reversed: true } }, { session: ses });
      if (!flagged.modifiedCount) throw new ConflictException('Movement is already reversed');
      if (o.type === 'RETURN') await this.moves.updateOne({ ref: o.sourceRef, store: c.storeId }, { $inc: { returnedQty: -Math.abs(o.qty) } }, { session: ses });
      const item = await this.items.findById(o.item).session(ses);
      const s: Spec = { type: 'REVERSAL', itemId: o.item, locationId: o.location, sign: o.qty > 0 ? -1 : 1, qty: Math.abs(o.qty), unit: item!.baseUnit,
        prefix: 'REV', reason: `Reversal of ${o.ref}: ${reason}`, sourceRef: o.ref, reverses: o._id, eventAt: new Date(),
        email: { event: o.type === 'RECEIPT' ? 'receipt' : o.type === 'PACK_ISSUE' ? 'packing' : o.type === 'PROD_OUTPUT' ? 'production' : 'issue', title: 'Reversal' } };
      const r = await this.move(c, s, ses);
      if (o.type === 'PROD_OUTPUT') await this.entries.updateOne({ movement: o._id }, { $set: { status: 'reversed' } }, { session: ses });
      return r;
    }));
  }

  // ───────── PMS ─────────
  async saveEntry(c: Ctx, b: any, id?: string) {
    const product = await this.items.findOne({ _id: oid(b.product, 'Product'), store: c.storeId });
    if (!product || product.kind !== 'product') throw bad('Select a finished product');
    if (!product.active) throw bad(`${product.name} is inactive`);
    if (!Array.isArray(b.rows) || !b.rows.length) throw bad('Add at least one machine row');
    const off = (await this.cfg(c.storeId)).utcOffsetMinutes;
    // <input type=datetime-local> has no zone; read it as factory-local time, not server time.
    const localDT = (v: unknown, label: string) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(Date.parse(v + ':00Z') - off * 60_000) : dateOr(v, label));
    const codes = new Set<string>();
    const rows = [];
    for (const r of b.rows) {
      const code = reqTxt(r.machine, 'Machine', 30).toUpperCase();
      if (codes.has(code)) throw bad(`Machine ${code} appears twice; use one row per machine`);
      codes.add(code);
      const m = await this.machines.findOne({ store: c.storeId, code });
      if (!m || !m.active) throw bad(`Machine ${code} is unknown or inactive`);
      const qty = posNum(r.qty, `Output for ${code}`);
      const unit = reqTxt(r.unit ?? product.baseUnit, 'Unit', 5);
      const startAt = r.startAt ? localDT(r.startAt, 'Start') : undefined;
      const endAt = r.endAt ? localDT(r.endAt, 'End') : undefined;
      if (startAt && endAt && endAt < startAt) throw bad(`End time is before start time for ${code}`);
      rows.push({ machine: code, qty, unit, baseQty: toBase(product, qty, unit).base, operator: txt(r.operator, 80), startAt, endAt, notes: txt(r.notes, 300) });
    }
    const issueRefs: string[] = Array.isArray(b.issueRefs) ? b.issueRefs.map((x: unknown) => txt(x, 40)).filter(Boolean) as string[] : [];
    if (issueRefs.length) {
      const found = await this.moves.countDocuments({ store: c.storeId, type: 'ISSUE', ref: { $in: issueRefs } });
      if (found !== new Set(issueRefs).size) throw bad('One or more linked issue references do not exist');
    }
    const evidence = evKeys(b.evidence);
    if (evidence.length && (await this.evidence.countDocuments({ store: c.storeId, key: { $in: evidence } })) !== new Set(evidence).size) throw bad('A photo was not found; upload it again');
    const doc = { product: product._id, location: oid(b.location, 'Location'), producedAt: dateOr(b.producedAt, 'Production time'), operator: txt(b.operator, 80),
      notes: txt(b.notes, 500), rows, total: r6(rows.reduce((t, r) => t + r.baseQty, 0)), issueRefs, evidence, enteredByName: c.user.name };
    if (id) {
      const u = await this.entries.findOneAndUpdate({ _id: oid(id, 'Entry'), store: c.storeId, status: 'draft' }, { $set: doc }, { new: true });
      if (!u) throw new ConflictException('Only draft entries can be edited; posted entries are immutable');
      return u;
    }
    return this.tx(async (ses) => {
      const ref = await this.nextRef('PRD', c.storeId);
      return (await this.entries.create([{ ...doc, store: c.storeId, ref, status: 'draft' }], { session: ses }))[0];
    });
  }

  postEntry(c: Ctx, id: string) {
    return this.audited(c, this.tx(async (ses) => {
      const e = await this.entries.findOneAndUpdate({ _id: oid(id, 'Entry'), store: c.storeId, status: 'draft' }, { $set: { status: 'posted', postedByName: c.user.name } }, { new: true, session: ses });
      if (!e) throw new ConflictException('Entry is not a draft (already posted or reversed)');
      const product = await this.items.findById(e.product).session(ses);
      const s: Spec = { type: 'PROD_OUTPUT', itemId: e.product, locationId: e.location, sign: 1, qty: e.total, unit: product!.baseUnit, prefix: 'FGR',
        eventAt: e.producedAt, performedBy: e.operator, sourceRef: e.ref, machine: e.rows.map((r) => r.machine).join(','), evidence: e.evidence, idemKey: `entry:${e._id}`,
        email: { event: 'production', title: `Production posted ${e.ref} -`, extra: [
          ['Product', `${product!.name}${product!.tags.length ? ` (${product!.tags.join(', ')})` : ''}`],
          ...e.rows.map((r) => [`Machine ${r.machine}`, `${r.qty} ${r.unit}`] as [string, string]),
          ['Total', `${e.total} ${product!.baseUnit}`], ['Operator', e.operator ?? '']] } };
      const r = await this.move(c, s, ses);
      await this.entries.updateOne({ _id: e._id }, { $set: { movement: r.movement._id } }, { session: ses });
      return { entry: { ...e.toObject(), movement: r.movement._id }, ...r };
    }));
  }

  async listEntries(c: Ctx, q: any) {
    const f: any = { store: c.storeId };
    if (q.status) f.status = q.status;
    if (q.product) f.product = oid(q.product, 'Product');
    if (q.from || q.to) f.producedAt = { ...(q.from ? { $gte: dateOr(q.from, 'From') } : {}), ...(q.to ? { $lte: dateOr(q.to, 'To') } : {}) };
    return this.entries.find(f).populate('product', 'name code tags baseUnit').populate('location', 'name').sort({ producedAt: -1 }).limit(200).lean();
  }

  /** Entry with the RMS issues linked to it: issued / returned / net used, and a labelled yield figure. */
  async entryDetail(c: Ctx, id: string) {
    const e: any = await this.entries.findOne({ _id: oid(id, 'Entry'), store: c.storeId }).populate('product', 'name code baseUnit tags').populate('location', 'name').lean();
    if (!e) throw new NotFoundException('Entry not found');
    const issues: any[] = await this.moves.find({ store: c.storeId, type: 'ISSUE', ref: { $in: e.issueRefs ?? [] } }).populate('item', 'name baseUnit').lean();
    const consumption = issues.map((m) => {
      const issued = Math.abs(m.qty); const net = r6(issued - m.returnedQty);
      return { ref: m.ref, material: m.item?.name, unit: m.item?.baseUnit, issued, returned: m.returnedQty, net,
        yield: e.status === 'posted' && net > 0 ? { value: r6(e.total / net), definition: `posted output (${e.product?.baseUnit}) ÷ net material used (${m.item?.baseUnit}) for this entry only; not a configured or expected yield` } : null };
    });
    return { entry: e, consumption };
  }

  pack(c: Ctx, b: any) {
    const dest = reqTxt(b.destination, 'Destination / batch reference', 120);
    const s: Spec = { ...this.common(b), type: 'PACK_ISSUE', sign: -1, prefix: 'PKI', destination: dest, sourceRef: txt(b.batchRef, 60),
      email: { event: 'packing', title: 'Packing issue' } };
    return this.audited(c, this.tx(async (ses) => {
      const r = await this.move(c, s, ses);
      if (!r.duplicate && b.packedItem) {
        // Optional: record the packed goods as a distinct stock form.
        await this.move(c, { type: 'PACK_RECEIPT', itemId: oid(b.packedItem, 'Packed item'), locationId: s.locationId, sign: 1, prefix: 'PKR',
          qty: posNum(b.packedQty, 'Packed quantity'), unit: reqTxt(b.packedUnit, 'Packed unit', 5), sourceRef: r.movement.ref, destination: dest, eventAt: s.eventAt,
          idemKey: s.idemKey ? `${s.idemKey}:packed` : undefined }, ses);
      }
      return r;
    }));
  }

  // ───────── reads ─────────
  private ledgerFilter(c: Ctx, q: any, r: { from?: Date; to?: Date }) {
    const f: any = { store: c.storeId };
    if (q.item) f.item = oid(q.item, 'Item');
    if (q.location) f.location = oid(q.location, 'Location');
    if (q.type) f.type = { $in: String(q.type).split(',') };
    if (q.lot) f.lot = String(q.lot);
    if (q.user) f.enteredByName = { $regex: rx(q.user), $options: 'i' };
    if (q.q) f.ref = { $regex: '^' + rx(q.q), $options: 'i' };
    if (r.from || r.to) f.eventAt = { ...(r.from ? { $gte: r.from } : {}), ...(r.to ? { $lt: r.to } : {}) };
    return f;
  }

  async ledger(c: Ctx, q: any, maxLimit = 100) {
    const f = this.ledgerFilter(c, q, await this.range(c, q)); // from/to are factory-local YYYY-MM-DD, inclusive
    const page = Math.max(1, Number(q.page) || 1); const limit = Math.min(maxLimit, Math.max(1, Number(q.limit) || 30));
    const [data, total] = await Promise.all([
      this.moves.find(f).populate('item', 'name code baseUnit').populate('location', 'name').sort({ eventAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.moves.countDocuments(f),
    ]);
    return { data, total, page, limit };
  }

  async exportLedger(c: Ctx, q: any) {
    const { data } = await this.ledger(c, { ...q, page: 1, limit: 5000 }, 5000);
    const head = ['Ref', 'Event time (UTC)', 'Type', 'Item', 'Code', 'Location', 'Qty (base)', 'Base unit', 'Entered qty', 'Entered unit', 'Converted (estimate)', 'kg/L factor',
      'Balance after', 'Supplier', 'Lot', 'Destination', 'Linked ref', 'Reason', 'Performed by', 'Entered by', 'Reversed'];
    const lines = (data as any[]).map((m) => csvRow([m.ref, new Date(m.eventAt).toISOString(), m.type, m.item?.name, m.item?.code, m.location?.name, m.qty, m.item?.baseUnit,
      m.enteredQty, m.enteredUnit, m.converted ? 'yes' : 'no', m.factor ?? '', m.runningAfter, m.supplier, m.lot, m.destination, m.sourceRef, m.reason, m.performedBy, m.enteredByName, m.reversed ? 'yes' : '']));
    return { filename: 'production-ledger.csv', csv: [csvRow(head), ...lines].join('\n') };
  }

  async balances(c: Ctx, q: any) {
    const rows = await this.bals.find({ store: c.storeId }).populate('item', 'name code baseUnit kind lowStockThreshold form tags').populate('location', 'name').lean();
    return rows
      .filter((r: any) => r.item && (!q.kind || r.item.kind === q.kind))
      .map((r: any) => ({ ...r, qty: r6(r.qty), low: r.item.lowStockThreshold > 0 && r.qty <= r.item.lowStockThreshold }));
  }

  /** Issues with issued / returned / net-consumed side by side. */
  async issues(c: Ctx, q: any) {
    const f: any = { store: c.storeId, type: 'ISSUE', reversed: false };
    if (q.open === 'true') f.$expr = { $gt: [{ $abs: '$qty' }, { $add: ['$returnedQty', 1e-9] }] };
    const rows = await this.moves.find(f).populate('item', 'name code baseUnit').populate('location', 'name').sort({ eventAt: -1 }).limit(100).lean();
    return rows.map((m: any) => ({ ...m, issued: Math.abs(m.qty), returned: m.returnedQty, net: r6(Math.abs(m.qty) - m.returnedQty) }));
  }

  /** opening + receipts + returns + output - issues - waste - packing ± adjustments = closing, per item/location for a factory-local day. */
  async eod(c: Ctx, q: any) {
    const off = (await this.cfg(c.storeId)).utcOffsetMinutes;
    const date = DAY.test(q.date) ? q.date : localDate(new Date(), off);
    const start = dayStart(date, off); const end = new Date(+start + 86400e3);
    const match: any = { store: new Types.ObjectId(c.storeId), eventAt: { $lt: end } };
    if (q.location) match.location = oid(q.location, 'Location');
    const inDay = (types: string[]) => ({ $sum: { $cond: [{ $and: [{ $gte: ['$eventAt', start] }, { $in: ['$type', types] }] }, '$qty', 0] } });
    const agg = await this.moves.aggregate([
      { $match: match },
      { $group: { _id: { item: '$item', location: '$location' },
        opening: { $sum: { $cond: [{ $lt: ['$eventAt', start] }, '$qty', 0] } },
        receipts: inDay(['RECEIPT']), returns: inDay(['RETURN']), issues: inDay(['ISSUE']), waste: inDay(['WASTE']),
        adjustments: inDay(['ADJUST', 'REVERSAL']), output: inDay(['PROD_OUTPUT', 'PACK_RECEIPT']), packing: inDay(['PACK_ISSUE']),
        closing: { $sum: '$qty' } } },
    ]);
    const [items, locs] = await Promise.all([this.items.find({ store: c.storeId }).lean(), this.locs.find({ store: c.storeId }).lean()]);
    const im = new Map(items.map((i) => [String(i._id), i])); const lm = new Map(locs.map((l) => [String(l._id), l]));
    const rows = agg.map((a) => {
      const item = im.get(String(a._id.item)); const n = (x: number) => r6(x);
      return { item: item?.name, code: item?.code, unit: item?.baseUnit, location: lm.get(String(a._id.location))?.name,
        itemId: a._id.item, locationId: a._id.location, opening: n(a.opening), receipts: n(a.receipts), returns: n(a.returns),
        issues: n(-a.issues), waste: n(-a.waste), adjustments: n(a.adjustments), output: n(a.output), packing: n(-a.packing), closing: n(a.closing),
        netConsumed: n(-a.issues - a.returns) };
    }).sort((x, y) => String(x.item).localeCompare(String(y.item)));
    const [noEvidence, openIssues] = await Promise.all([
      this.moves.find({ store: c.storeId, type: 'RECEIPT', reversed: false, eventAt: { $gte: start, $lt: end }, evidence: { $size: 0 } }, { ref: 1 }).lean(),
      this.moves.find({ store: c.storeId, type: 'ISSUE', reversed: false, eventAt: { $lt: end }, $expr: { $gt: [{ $abs: '$qty' }, { $add: ['$returnedQty', 1e-9] }] } }, { ref: 1 }).lean(),
    ]);
    return { date, rows, exceptions: {
      receiptsWithoutEvidence: noEvidence.map((m) => m.ref),
      negativeClosing: rows.filter((r) => r.closing < 0).map((r) => `${r.item} @ ${r.location}`),
      openIssues: openIssues.map((m) => m.ref) } };
  }

  async exportEod(c: Ctx, q: any) {
    const e = await this.eod(c, q);
    const head = ['Item', 'Code', 'Location', 'Unit', 'Opening', 'Receipts', 'Returns', 'Issues', 'Net consumed', 'Waste', 'Adjustments', 'Output', 'Packing', 'Closing'];
    const lines = e.rows.map((r) => csvRow([r.item, r.code, r.location, r.unit, r.opening, r.receipts, r.returns, r.issues, r.netConsumed, r.waste, r.adjustments, r.output, r.packing, r.closing]));
    return { filename: `production-eod-${e.date}.csv`, csv: [csvRow(head), ...lines].join('\n') };
  }

  // ───────── reports ─────────
  private async range(c: Ctx, q: any) {
    const off = (await this.cfg(c.storeId)).utcOffsetMinutes;
    const from = DAY.test(q.from) ? dayStart(q.from, off) : undefined;
    const to = DAY.test(q.to) ? new Date(+dayStart(q.to, off) + 86400e3) : undefined;
    return { off, from, to };
  }

  /** Posted production output, grouped by an optional period and one dimension. Units are never mixed (unit is part of the group). */
  async reportOutput(c: Ctx, q: any) {
    const { off, from, to } = await this.range(c, q);
    const match: any = { store: new Types.ObjectId(c.storeId), status: 'posted' };
    if (from || to) match.producedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
    if (q.product) match.product = oid(q.product, 'Product');
    const fmt = ({ day: '%Y-%m-%d', month: '%Y-%m', week: '%G-W%V' } as Record<string, string>)[String(q.period)];
    const opExpr = { $ifNull: ['$rows.operator', '$operator'] };
    const dim = ({ product: '$p.name', machine: '$rows.machine', tag: { $ifNull: ['$p.tags', 'untagged'] }, operator: { $ifNull: [opExpr, '-'] } } as Record<string, unknown>)[String(q.dimension)] ?? 'all';
    const pipe: any[] = [
      { $match: match },
      { $lookup: { from: this.items.collection.name, localField: 'product', foreignField: '_id', as: 'p' } }, { $unwind: '$p' },
      { $unwind: '$rows' },
    ];
    if (q.machine) pipe.push({ $match: { 'rows.machine': String(q.machine).toUpperCase() } });
    // $literal: a value starting with "$" must never be read as a field path.
    if (q.operator) pipe.push({ $match: { $expr: { $eq: [opExpr, { $literal: String(q.operator) }] } } });
    if (q.dimension === 'tag') pipe.push({ $unwind: { path: '$p.tags', preserveNullAndEmptyArrays: true } });
    pipe.push(
      { $group: { _id: { period: fmt ? { $dateToString: { format: fmt, date: '$producedAt', timezone: tzString(off) } } : 'all', dim, unit: '$p.baseUnit' },
        qty: { $sum: '$rows.baseQty' }, entries: { $addToSet: '$_id' } } },
      { $project: { _id: 0, period: '$_id.period', key: '$_id.dim', unit: '$_id.unit', qty: 1, entries: { $size: '$entries' } } },
      { $sort: { period: -1, key: 1 } },
    );
    const rows = (await this.entries.aggregate(pipe)).map((r) => ({ ...r, qty: r6(r.qty) }));
    return { period: fmt ? q.period : 'all', dimension: dim === 'all' ? 'none' : q.dimension, rows,
      definition: 'Sum of machine output rows of POSTED entries, converted to each product base unit. Drafts and reversed entries are excluded.' };
  }

  /** Finished goods: on hand per product/form/location plus produced / packed-out / packed-in in the range. */
  async reportFinished(c: Ctx, q: any) {
    const { from, to } = await this.range(c, q);
    const prods = await this.items.find({ store: c.storeId, kind: 'product' }).lean();
    const ids = prods.map((p) => p._id);
    const match: any = { store: new Types.ObjectId(c.storeId), item: { $in: ids } };
    if (from || to) match.eventAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
    const [agg, bals] = await Promise.all([
      this.moves.aggregate([{ $match: match }, { $group: { _id: { item: '$item', type: '$type' }, qty: { $sum: '$qty' } } }]),
      this.bals.find({ store: c.storeId, item: { $in: ids } }).populate('location', 'name').lean(),
    ]);
    const by = new Map<string, Record<string, number>>();
    for (const a of agg) { const k = String(a._id.item); by.set(k, { ...(by.get(k) ?? {}), [a._id.type]: a.qty }); }
    return prods.map((p) => {
      const t = by.get(String(p._id)) ?? {}; const mine = (bals as any[]).filter((b) => String(b.item) === String(p._id));
      return { item: p.name, code: p.code, form: p.form, unit: p.baseUnit, tags: p.tags,
        onHand: r6(mine.reduce((s, b) => s + b.qty, 0)), byLocation: mine.map((b) => ({ location: b.location?.name, qty: r6(b.qty) })),
        produced: r6(t.PROD_OUTPUT ?? 0), packedOut: r6(-(t.PACK_ISSUE ?? 0)), packedIn: r6(t.PACK_RECEIPT ?? 0), adjustments: r6((t.ADJUST ?? 0) + (t.REVERSAL ?? 0)) };
    });
  }

  /** Daily factory overview. Every figure maps to a ledger type so the UI can drill down. */
  async overview(c: Ctx, q: any) {
    const off = (await this.cfg(c.storeId)).utcOffsetMinutes;
    const date = DAY.test(q.date) ? q.date : localDate(new Date(), off);
    const start = dayStart(date, off); const end = new Date(+start + 86400e3);
    const [mv, output, low, outq, eod] = await Promise.all([
      this.moves.aggregate([
        { $match: { store: new Types.ObjectId(c.storeId), eventAt: { $gte: start, $lt: end } } },
        { $lookup: { from: this.items.collection.name, localField: 'item', foreignField: '_id', as: 'i' } }, { $unwind: '$i' },
        { $group: { _id: { type: '$type', unit: '$i.baseUnit' }, qty: { $sum: '$qty' }, count: { $sum: 1 } } },
        { $project: { _id: 0, type: '$_id.type', unit: '$_id.unit', qty: 1, count: 1 } },
      ]),
      this.reportOutput(c, { from: date, to: date, dimension: 'product' }),
      this.balances(c, {}).then((b) => b.filter((x: any) => x.low)),
      this.outbox.aggregate([{ $match: { store: new Types.ObjectId(c.storeId), status: { $in: ['queued', 'failed'] } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      this.eod(c, { date }),
    ]);
    return { date, from: start.toISOString(), to: end.toISOString(), movements: mv.map((m) => ({ ...m, qty: r6(m.qty) })), output: output.rows,
      lowStock: low.map((r: any) => ({ item: r.item.name, location: r.location.name, qty: r.qty, unit: r.item.baseUnit })),
      outbox: Object.fromEntries(outq.map((o) => [o._id, o.n])), exceptions: eod.exceptions };
  }

  // ───────── settings / outbox ─────────
  async getSettings(c: Ctx) {
    const s = await this.cfg(c.storeId);
    return { recipients: s.recipients, tagVocab: s.tagVocab, requireReceiptPhoto: s.requireReceiptPhoto, utcOffsetMinutes: s.utcOffsetMinutes, eodTime: s.eodTime };
  }
  async saveSettings(c: Ctx, b: any) {
    const set: Record<string, unknown> = {};
    if (b?.recipients) {
      const rec: Record<string, string[]> = {};
      for (const k of EVENTS) {
        const list = (Array.isArray(b.recipients[k]) ? b.recipients[k] : []).map((x: unknown) => String(x).trim().toLowerCase()).filter(Boolean);
        for (const e of list) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad(`"${e}" is not a valid email`);
        rec[k] = [...new Set<string>(list)];
      }
      set.recipients = rec;
    }
    if (b?.requireReceiptPhoto !== undefined) set.requireReceiptPhoto = !!b.requireReceiptPhoto;
    if (b?.utcOffsetMinutes !== undefined) {
      const o = Number(b.utcOffsetMinutes);
      if (!Number.isInteger(o) || o < -720 || o > 840) throw bad('UTC offset must be whole minutes between -720 and 840');
      set.utcOffsetMinutes = o;
    }
    if (b?.eodTime !== undefined) {
      if (b.eodTime !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.eodTime)) throw bad('EOD time must be HH:mm');
      set.eodTime = b.eodTime;
    }
    await this.settings.updateOne({ store: c.storeId }, { $set: set }, { upsert: true });
    await this.logAudit(c, 'production.settings', c.storeId, undefined, { keys: Object.keys(set) });
    return this.getSettings(c);
  }
  listOutbox(c: Ctx, status?: string) {
    return this.outbox.find({ store: c.storeId, ...(status ? { status } : {}) }, { html: 0 }).sort({ createdAt: -1 }).limit(100).lean();
  }
  async retryOutbox(c: Ctx, id: string) {
    await this.outbox.updateOne({ _id: oid(id, 'Id'), store: c.storeId, status: 'failed' }, { $set: { attempts: 0, nextAttemptAt: new Date() } });
    return { ok: true };
  }

  // ───────── scheduled EOD summary ─────────
  /** Once a minute: any store whose local time has passed its eodTime and hasn't sent today gets the summary queued. */
  @Interval(60_000)
  async scheduledEod() {
    try {
      // $ne:'' alone would also match documents with no eodTime at all and fire the summary at any hour.
      const due = await this.settings.find({ eodTime: { $regex: /^\d\d:\d\d$/ } }).lean();
      for (const s of due) {
        if (!s.eodTime) continue;
        const off = s.utcOffsetMinutes ?? 330; const now = new Date(+new Date() + off * 60_000);
        const date = now.toISOString().slice(0, 10); const hm = now.toISOString().slice(11, 16);
        if (hm < s.eodTime || s.lastEodDate === date) continue;
        // The claim makes it single-sender even with several app instances; outbox idem keys are a second guard.
        const claimed = await this.settings.updateOne({ _id: s._id, lastEodDate: { $ne: date } }, { $set: { lastEodDate: date } });
        if (!claimed.modifiedCount) continue;
        const storeId = String(s.store);
        const eod = await this.eod({ storeId, user: { sub: 'system', name: 'System' } as any }, { date });
        const html = gridTable(['Item', 'Location', 'Opening', 'Receipts', 'Returns', 'Issues', 'Waste', 'Adjust', 'Output', 'Packing', 'Closing'],
          eod.rows.map((r) => [r.item, r.location, r.opening, r.receipts, r.returns, r.issues, r.waste, r.adjustments, r.output, r.packing, `${r.closing} ${r.unit}`]))
          + (eod.exceptions.negativeClosing.length || eod.exceptions.openIssues.length || eod.exceptions.receiptsWithoutEvidence.length
            ? `<p><b>Exceptions</b><br>${esc(`Negative closing: ${eod.exceptions.negativeClosing.join(', ') || 'none'}`)}<br>${esc(`Open issues: ${eod.exceptions.openIssues.join(', ') || 'none'}`)}<br>${esc(`Receipts without photo: ${eod.exceptions.receiptsWithoutEvidence.join(', ') || 'none'}`)}</p>` : '');
        await this.enqueue(storeId, 'eod', date, `Daily production summary ${date}`, html);
      }
    } catch (e) {
      this.log.error(`Scheduled EOD failed: ${(e as Error).message}`);
    }
  }
}
