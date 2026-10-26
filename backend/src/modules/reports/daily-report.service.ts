import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import * as PDFDocument from 'pdfkit';
import { ReportConfig, ReportConfigDocument } from './schemas/report-config.schema';
import { MediaService } from '../media/media.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { EmailService } from '../email/email.service';

interface DailyReportData {
  date: string;
  orders:          { today: number; yesterday: number };
  revenue:         { today: number; yesterday: number };
  aov:             { today: number; yesterday: number };
  subtotal:        { today: number; yesterday: number };
  discount:        { today: number; yesterday: number };
  shipping:        { today: number; yesterday: number };
  gst:             { today: number; yesterday: number };
  delivered:       { today: number; yesterday: number };
  pendingDispatch: number;
  cancelled:       { today: number; yesterday: number; revenueLost: number };
  newCustomers:    { today: number; yesterday: number };
  repeatCustomers: { today: number; yesterday: number };
  itemsQty:        number;
  couponOrders:    number;
  pipeline: { placed: number; confirmed: number; packed: number; outForDelivery: number; delivered: number; cancelled: number };
  payment: { cod: { today: number; yesterday: number }; online: { today: number; yesterday: number }; codCollected: number; codOutstanding: number };
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  topCities:   Array<{ city: string; orders: number; revenue: number }>;
  trend:       Array<{ label: string; orders: number; revenue: number }>;
}

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    @InjectModel(ReportConfig.name) private configModel: Model<ReportConfigDocument>,
    @InjectModel('Order') private orderModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    private readonly media: MediaService,
    private readonly whatsapp: WhatsAppService,
    private readonly email: EmailService,
  ) {}

  // ─── Cron: 10 PM IST = 16:30 UTC ─────────────────────────────────────────

  @Cron('30 16 * * *')
  async scheduledSend() {
    const cfg = await this.configModel.findOne().lean();
    if (!cfg?.enabled || !cfg.recipients?.length) return;
    this.logger.log('Daily report cron triggered');
    await this.sendReport().catch(e => this.logger.error('Daily report failed', e.stack));
  }

  // ─── Public: manual trigger ───────────────────────────────────────────────

  async sendReport() {
    const [cfg, data] = await Promise.all([
      this.configModel.findOne().lean(),
      this.aggregateData(),
    ]);
    const recipients = cfg?.recipients ?? [];
    if (!recipients.length) return { skipped: true, reason: 'no recipients' };

    const subject   = `NatureLite Daily Report — ${data.date}`;
    const filename  = `daily-report-${data.date}.pdf`;
    const pdfBuffer = await this.generatePdf(data);
    const pdfUrl    = await this.media.uploadRawBuffer(pdfBuffer, 'reports', filename, 'application/pdf');

    await Promise.allSettled(
      recipients.flatMap(r => {
        const tasks: Promise<any>[] = [];
        if (r.phone) tasks.push(this.sendWhatsApp(r.phone, data, pdfUrl));
        if (r.email) tasks.push(this.email.sendReportEmail(r.email, subject, filename, pdfBuffer));
        return tasks;
      }),
    );

    this.logger.log(`Daily report sent to ${recipients.length} recipients`);
    return { ok: true, date: data.date, recipients: recipients.length, pdfUrl };
  }

  // ─── Data aggregation ─────────────────────────────────────────────────────

  private async aggregateData(): Promise<DailyReportData> {
    const now      = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const yestStart  = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1);
    const yestEnd    = new Date(yestStart);  yestEnd.setHours(23, 59, 59, 999);
    const sevenAgo   = new Date(todayStart); sevenAgo.setDate(sevenAgo.getDate() - 6);

    const [todayAgg, yestAgg, topProducts, topCities, trendRaw] = await Promise.all([
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
        { $group: {
          _id:            null,
          count:          { $sum: 1 },
          revenue:        { $sum: '$total' },
          subtotal:       { $sum: '$subtotal' },
          discount:       { $sum: '$discount' },
          shipping:       { $sum: '$shippingCharge' },
          gst:            { $sum: '$gstTotal' },
          placed:         { $sum: { $cond: [{ $eq: ['$status', 'placed'] }, 1, 0] } },
          confirmed:      { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
          packed:         { $sum: { $cond: [{ $eq: ['$status', 'packed'] }, 1, 0] } },
          outForDelivery: { $sum: { $cond: [{ $eq: ['$status', 'out_for_delivery'] }, 1, 0] } },
          delivered:      { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          cancelled:      { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          revenueLost:    { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, '$total', 0] } },
          cod:            { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cod'] }, 1, 0] } },
          online:         { $sum: { $cond: [{ $ne: ['$paymentMethod', 'cod'] }, 1, 0] } },
          codCollected:   { $sum: { $cond: [{ $and: [{ $eq: ['$paymentMethod', 'cod'] }, { $eq: ['$collectionStatus', 'settled'] }] }, { $ifNull: ['$amountCollected', 0] }, 0] } },
          codOutstanding: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentMethod', 'cod'] }, { $ne: ['$collectionStatus', 'settled'] }] }, 1, 0] } },
          couponOrders:   { $sum: { $cond: [{ $and: [{ $ne: ['$couponCode', null] }, { $ne: ['$couponCode', ''] }] }, 1, 0] } },
          itemsQty:       { $sum: { $reduce: { input: '$items', initialValue: 0, in: { $add: ['$$value', '$$this.quantity'] } } } },
          pendingDispatch: { $sum: { $cond: [{ $in: ['$status', ['placed', 'confirmed', 'packed']] }, 1, 0] } },
          userIds:        { $addToSet: '$user' },
        }},
      ]),
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: yestStart, $lte: yestEnd } } },
        { $group: {
          _id:       null,
          count:     { $sum: 1 },
          revenue:   { $sum: '$total' },
          subtotal:  { $sum: '$subtotal' },
          discount:  { $sum: '$discount' },
          shipping:  { $sum: '$shippingCharge' },
          gst:       { $sum: '$gstTotal' },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          cod:       { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cod'] }, 1, 0] } },
          online:    { $sum: { $cond: [{ $ne: ['$paymentMethod', 'cod'] }, 1, 0] } },
          userIds:   { $addToSet: '$user' },
        }},
      ]),
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.total' } } },
        { $sort: { revenue: -1 } },
        { $limit: 7 },
      ]),
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: '$shippingAddress.city', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $sort: { orders: -1 } },
        { $limit: 5 },
      ]),
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: sevenAgo, $lte: todayEnd } } },
        { $group: {
          _id:     { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } },
          orders:  { $sum: 1 },
          revenue: { $sum: '$total' },
        }},
        { $sort: { _id: 1 } },
      ]),
    ]);

    const t = todayAgg[0] ?? {
      count: 0, revenue: 0, subtotal: 0, discount: 0, shipping: 0, gst: 0,
      placed: 0, confirmed: 0, packed: 0, outForDelivery: 0, delivered: 0,
      cancelled: 0, revenueLost: 0, cod: 0, online: 0,
      codCollected: 0, codOutstanding: 0, couponOrders: 0, itemsQty: 0,
      pendingDispatch: 0, userIds: [],
    };
    const y = yestAgg[0] ?? {
      count: 0, revenue: 0, subtotal: 0, discount: 0, shipping: 0, gst: 0,
      delivered: 0, cancelled: 0, cod: 0, online: 0, userIds: [],
    };

    const todayUserIds: string[] = (t.userIds ?? []).map((id: any) => id.toString());
    let newToday = 0;
    if (todayUserIds.length) {
      const ret = await this.orderModel.distinct('user', { user: { $in: t.userIds }, createdAt: { $lt: todayStart } });
      newToday = todayUserIds.length - ret.length;
    }

    const yestUserIds: string[] = (y.userIds ?? []).map((id: any) => id.toString());
    let newYest = 0;
    if (yestUserIds.length) {
      const ret = await this.orderModel.distinct('user', { user: { $in: y.userIds }, createdAt: { $lt: yestStart } });
      newYest = yestUserIds.length - ret.length;
    }

    const trendMap = new Map<string, { orders: number; revenue: number }>(
      trendRaw.map((r: any) => [r._id as string, { orders: r.orders as number, revenue: r.revenue as number }]),
    );
    const trend: DailyReportData['trend'] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const key   = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
      const entry = trendMap.get(key) ?? { orders: 0, revenue: 0 };
      trend.push({ label, ...entry });
    }

    return {
      date:            todayStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      orders:          { today: t.count,     yesterday: y.count },
      revenue:         { today: t.revenue,   yesterday: y.revenue },
      aov:             { today: t.count  ? Math.round(t.revenue / t.count) : 0, yesterday: y.count ? Math.round(y.revenue / y.count) : 0 },
      subtotal:        { today: t.subtotal,  yesterday: y.subtotal },
      discount:        { today: t.discount,  yesterday: y.discount },
      shipping:        { today: t.shipping,  yesterday: y.shipping },
      gst:             { today: t.gst,       yesterday: y.gst },
      delivered:       { today: t.delivered, yesterday: y.delivered },
      pendingDispatch: t.pendingDispatch,
      cancelled:       { today: t.cancelled, yesterday: y.cancelled, revenueLost: t.revenueLost },
      newCustomers:    { today: newToday,                        yesterday: newYest },
      repeatCustomers: { today: todayUserIds.length - newToday,  yesterday: yestUserIds.length - newYest },
      itemsQty:        t.itemsQty,
      couponOrders:    t.couponOrders,
      pipeline:  { placed: t.placed, confirmed: t.confirmed, packed: t.packed, outForDelivery: t.outForDelivery, delivered: t.delivered, cancelled: t.cancelled },
      payment:   { cod: { today: t.cod, yesterday: y.cod }, online: { today: t.online, yesterday: y.online }, codCollected: t.codCollected, codOutstanding: t.codOutstanding },
      topProducts: topProducts.map((p: any) => ({ name: p._id, qty: p.qty, revenue: p.revenue })),
      topCities:   topCities.map((c: any) => ({ city: c._id || 'Unknown', orders: c.orders, revenue: c.revenue })),
      trend,
    };
  }

  // ─── PDF generation (2 pages) ─────────────────────────────────────────────

  private generatePdf(data: DailyReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W      = 595.28;
      const PH     = 841.89;
      const FOREST = '#1B4332';
      const GOLD   = '#D4A543';
      const PAPER  = '#FAFAF7';
      const INK    = '#1C1C1A';
      const MUTED  = '#6B7280';
      const GREEN  = '#16A34A';
      const RED    = '#DC2626';
      const LINE   = '#E5E7EB';
      const WHITE  = '#FFFFFF';
      const AMBER  = '#FEF3C7';

      const fmtR = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
      const fmtN = (n: number) => n.toLocaleString('en-IN');

      const delta = (today: number, yest: number): { label: string; up: boolean } | null => {
        if (!yest) return null;
        const pct = Math.round(((today - yest) / yest) * 100);
        return { label: (pct >= 0 ? '+' : '') + pct + '%', up: pct >= 0 };
      };

      // ── Shared helpers ────────────────────────────────────────────

      const pageHeader = (page: number) => {
        doc.rect(0, 0, W, 68).fill(FOREST);
        doc.fontSize(19).font('Helvetica-Bold').fillColor(GOLD).text('NatureLite', 40, 18);
        doc.fontSize(9.5).font('Helvetica').fillColor('#A7C4A0').text('Daily Business Report', 40, 42);
        doc.fontSize(9.5).font('Helvetica').fillColor(GOLD)
          .text(`${data.date}   ·   Page ${page} of 2`, W - 195, 28, { align: 'right', width: 155 });
        doc.rect(0, 68, W, PH - 68).fill(PAPER);
      };

      const sLabel = (text: string, y: number) =>
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(MUTED)
          .text(text, 40, y, { characterSpacing: 1.4, width: W - 80 });

      const card = (
        cx: number, cy: number, cw: number, ch: number,
        label: string, todayStr: string, yestStr: string | null,
        d: { label: string; up: boolean } | null,
        accent: string,
      ) => {
        doc.roundedRect(cx, cy, cw, ch, 4).fill(WHITE);
        doc.roundedRect(cx, cy, cw, ch, 4).stroke(LINE);
        doc.rect(cx, cy + 4, 3, ch - 8).fill(accent);
        doc.fontSize(7).font('Helvetica').fillColor(MUTED)
          .text(label.toUpperCase(), cx + 12, cy + 9, { characterSpacing: 0.4, width: cw - 24 });
        doc.fontSize(16).font('Helvetica-Bold').fillColor(INK)
          .text(todayStr, cx + 12, cy + 21, { width: cw - 24 });
        if (yestStr !== null) {
          doc.fontSize(7.5).font('Helvetica').fillColor(MUTED)
            .text('Yest: ' + yestStr, cx + 12, cy + 43, { width: cw * 0.6 });
        }
        if (d) {
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor(d.up ? GREEN : RED)
            .text(d.label, cx + cw - 46, cy + 43, { width: 38, align: 'right' });
        }
      };

      // ══════════════════════════════════════
      // PAGE 1
      // ══════════════════════════════════════
      pageHeader(1);
      let y = 84;

      // ── 9 stat cards (3 × 3) ─────────────────────────────────────
      sLabel("TODAY'S PERFORMANCE  ·  vs Yesterday", y);
      y += 15;

      const cW = (W - 80 - 20) / 3;
      const cH = 60;
      const cG = 10;

      const cancelDelta = delta(data.cancelled.today, data.cancelled.yesterday);

      const cards = [
        { label: 'Orders Received',  today: fmtN(data.orders.today),           yest: fmtN(data.orders.yesterday),           d: delta(data.orders.today, data.orders.yesterday),           accent: FOREST },
        { label: 'Net Revenue',      today: fmtR(data.revenue.today),           yest: fmtR(data.revenue.yesterday),           d: delta(data.revenue.today, data.revenue.yesterday),          accent: FOREST },
        { label: 'Avg Order Value',  today: fmtR(data.aov.today),               yest: fmtR(data.aov.yesterday),               d: delta(data.aov.today, data.aov.yesterday),                  accent: GOLD },
        { label: 'Delivered',        today: fmtN(data.delivered.today),         yest: fmtN(data.delivered.yesterday),         d: delta(data.delivered.today, data.delivered.yesterday),      accent: GREEN },
        { label: 'Pending Dispatch', today: fmtN(data.pendingDispatch),         yest: null,                                   d: null,                                                       accent: '#D97706' },
        { label: 'Cancelled',        today: fmtN(data.cancelled.today),         yest: fmtN(data.cancelled.yesterday),         d: cancelDelta ? { label: cancelDelta.label, up: !cancelDelta.up } : null, accent: RED },
        { label: 'New Customers',    today: fmtN(data.newCustomers.today),      yest: fmtN(data.newCustomers.yesterday),      d: delta(data.newCustomers.today, data.newCustomers.yesterday),    accent: '#2563EB' },
        { label: 'Repeat Customers', today: fmtN(data.repeatCustomers.today),   yest: fmtN(data.repeatCustomers.yesterday),   d: delta(data.repeatCustomers.today, data.repeatCustomers.yesterday), accent: '#7C3AED' },
        { label: 'Total Items Sold', today: fmtN(data.itemsQty),                yest: null,                                   d: null,                                                       accent: MUTED },
      ];

      cards.forEach((c, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        card(40 + col * (cW + cG), y + row * (cH + 8), cW, cH, c.label, c.today, c.yest, c.d, c.accent);
      });

      y += 3 * (cH + 8) + 12;

      // ── Order Pipeline ────────────────────────────────────────────
      sLabel('ORDER PIPELINE  ·  Current Status Breakdown', y);
      y += 15;

      const pipe = [
        { label: 'Placed',      n: data.pipeline.placed,         color: '#1D4ED8' },
        { label: 'Confirmed',   n: data.pipeline.confirmed,      color: '#0891B2' },
        { label: 'Packed',      n: data.pipeline.packed,         color: '#D97706' },
        { label: 'Out for Del', n: data.pipeline.outForDelivery, color: '#7C3AED' },
        { label: 'Delivered',   n: data.pipeline.delivered,      color: GREEN },
        { label: 'Cancelled',   n: data.pipeline.cancelled,      color: RED },
      ];

      const pW2 = (W - 80 - 5 * 6) / 6;
      pipe.forEach((p, i) => {
        const px = 40 + i * (pW2 + 6);
        doc.roundedRect(px, y, pW2, 46, 4).fill(WHITE);
        doc.roundedRect(px, y, pW2, 46, 4).stroke(LINE);
        doc.rect(px, y, pW2, 3).fill(p.color);
        doc.fontSize(15).font('Helvetica-Bold').fillColor(p.n > 0 ? p.color : MUTED)
          .text(String(p.n), px, y + 9, { width: pW2, align: 'center' });
        doc.fontSize(6.5).font('Helvetica').fillColor(MUTED)
          .text(p.label, px, y + 32, { width: pW2, align: 'center', characterSpacing: 0.2 });
        if (i < 4) {
          doc.fontSize(10).fillColor('#D1D5DB').text('›', px + pW2 + 1, y + 15, { width: 6, align: 'center' });
        }
      });

      y += 46 + 13;

      // ── Revenue Breakdown ─────────────────────────────────────────
      sLabel('REVENUE BREAKDOWN  ·  Today vs Yesterday', y);
      y += 15;

      doc.rect(40, y, W - 80, 21).fill(FOREST);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(GOLD)
        .text('Line Item', 54, y + 6, { width: 190 })
        .text('Today', 54 + 190, y + 6, { width: 120, align: 'right' })
        .text('Yesterday', 54 + 315, y + 6, { width: 90, align: 'right' })
        .text('Δ', 54 + 410, y + 6, { width: 50, align: 'right' });
      y += 21;

      const revRows = [
        { label: 'Gross Subtotal', today: data.subtotal.today,   yest: data.subtotal.yesterday,  neg: false, bold: false },
        { label: '(–) Discounts',  today: data.discount.today,   yest: data.discount.yesterday,  neg: true,  bold: false },
        { label: '(+) Shipping',   today: data.shipping.today,   yest: data.shipping.yesterday,  neg: false, bold: false },
        { label: '(+) GST',        today: data.gst.today,        yest: data.gst.yesterday,       neg: false, bold: false },
        { label: '= Net Revenue',  today: data.revenue.today,    yest: data.revenue.yesterday,   neg: false, bold: true  },
      ];

      revRows.forEach((r, i) => {
        const rH = 23;
        const bg = r.bold ? AMBER : (i % 2 === 0 ? WHITE : '#F9FAF8');
        doc.rect(40, y, W - 80, rH).fill(bg);
        doc.rect(40, y, W - 80, rH).stroke(LINE);

        const valColor = r.neg ? RED : (r.bold ? FOREST : INK);
        const font = r.bold ? 'Helvetica-Bold' : 'Helvetica';
        const d = delta(r.today, r.yest);

        doc.fontSize(9).font(font).fillColor(valColor).text(r.label, 54, y + 7, { width: 190 });
        doc.fontSize(9).font(font).fillColor(valColor).text(fmtR(r.today), 54 + 190, y + 7, { width: 120, align: 'right' });
        doc.fontSize(9).font(r.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(MUTED)
          .text(fmtR(r.yest), 54 + 315, y + 7, { width: 90, align: 'right' });
        if (d && !r.neg) {
          const dc = r.bold ? (d.up ? GREEN : RED) : MUTED;
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor(dc)
            .text(d.label, 54 + 410, y + 8, { width: 50, align: 'right' });
        }
        y += rH;
      });

      if (data.couponOrders > 0) {
        y += 5;
        doc.roundedRect(40, y, W - 80, 21).fill(AMBER);
        doc.roundedRect(40, y, W - 80, 21).stroke('#FDE68A');
        doc.fontSize(8.5).font('Helvetica').fillColor('#92400E')
          .text(`🏷  ${data.couponOrders} coupon order${data.couponOrders > 1 ? 's' : ''} — total discount given: ${fmtR(data.discount.today)}`, 54, y + 6, { width: W - 108 });
        y += 21;
      }

      y += 12;

      // ── 7-Day Revenue Trend ───────────────────────────────────────
      sLabel('7-DAY REVENUE TREND  ·  Last 7 Days incl. Today', y);
      y += 15;

      const maxRev = Math.max(...data.trend.map(t => t.revenue), 1);
      const barArea = W - 80 - 260;

      doc.rect(40, y, W - 80, 21).fill(FOREST);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(GOLD)
        .text('Date', 54, y + 6, { width: 65 })
        .text('Orders', 54 + 65, y + 6, { width: 55, align: 'right' })
        .text('Revenue', 54 + 125, y + 6, { width: 100, align: 'right' })
        .text('Trend', 54 + 235, y + 6, { width: barArea });
      y += 21;

      data.trend.forEach((t, i) => {
        const isToday = i === data.trend.length - 1;
        const rH = 20;
        doc.rect(40, y, W - 80, rH).fill(isToday ? '#ECFDF5' : (i % 2 === 0 ? WHITE : '#F9FAF8'));
        doc.rect(40, y, W - 80, rH).stroke(LINE);
        if (isToday) doc.rect(40, y, 3, rH).fill(FOREST);

        const f = isToday ? 'Helvetica-Bold' : 'Helvetica';
        const c = isToday ? FOREST : INK;

        doc.fontSize(8.5).font(f).fillColor(c).text(isToday ? t.label + ' ★' : t.label, 54, y + 6, { width: 65 });
        doc.fontSize(8.5).font(f).fillColor(c).text(fmtN(t.orders), 54 + 65, y + 6, { width: 55, align: 'right' });
        doc.fontSize(8.5).font(f).fillColor(c).text(fmtR(t.revenue), 54 + 125, y + 6, { width: 100, align: 'right' });

        if (t.revenue > 0) {
          const bW = Math.max(2, Math.round((t.revenue / maxRev) * barArea));
          doc.rect(54 + 235, y + 5, bW, 10).fill(isToday ? FOREST : '#BBF7D0');
        }
        y += rH;
      });

      // Page 1 footer
      doc.rect(0, PH - 26, W, 26).fill(FOREST);
      doc.fontSize(7.5).font('Helvetica').fillColor('#A7C4A0')
        .text('Generated by NatureLite Admin  ·  Confidential  ·  naturelite.in', 0, PH - 16, { align: 'center', width: W });

      // ══════════════════════════════════════
      // PAGE 2
      // ══════════════════════════════════════
      doc.addPage();
      pageHeader(2);
      y = 84;

      // ── Top Products ──────────────────────────────────────────────
      sLabel('TOP PRODUCTS TODAY  ·  By Revenue', y);
      y += 15;

      if (data.topProducts.length === 0) {
        doc.fontSize(10).font('Helvetica').fillColor(MUTED).text('No orders today.', 40, y + 6);
        y += 28;
      } else {
        doc.rect(40, y, W - 80, 22).fill(FOREST);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(GOLD)
          .text('#', 54, y + 7, { width: 18 })
          .text('Product', 76, y + 7, { width: 255 })
          .text('Qty', 76 + 255, y + 7, { width: 60, align: 'right' })
          .text('Revenue', 76 + 320, y + 7, { width: 100, align: 'right' })
          .text('Share', 76 + 425, y + 7, { width: 55, align: 'right' });
        y += 22;

        const totalRevProducts = data.topProducts.reduce((s, p) => s + p.revenue, 0);

        data.topProducts.forEach((p, i) => {
          const rH = 25;
          doc.rect(40, y, W - 80, rH).fill(i % 2 === 0 ? WHITE : '#F9FAF8');
          doc.rect(40, y, W - 80, rH).stroke(LINE);
          const share = totalRevProducts ? Math.round((p.revenue / totalRevProducts) * 100) : 0;
          doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text(String(i + 1), 54, y + 8, { width: 18 });
          doc.fontSize(9).font('Helvetica').fillColor(INK).text(p.name, 76, y + 8, { width: 255 });
          doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text(fmtN(p.qty), 76 + 255, y + 8, { width: 60, align: 'right' });
          doc.fontSize(9).font('Helvetica-Bold').fillColor(FOREST).text(fmtR(p.revenue), 76 + 320, y + 8, { width: 100, align: 'right' });
          doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(share + '%', 76 + 425, y + 8, { width: 55, align: 'right' });
          y += rH;
        });
      }

      y += 14;

      // ── Payment Split (left) + Top Cities (right) ─────────────────
      const halfW = (W - 80 - 12) / 2;
      const rightX = 40 + halfW + 12;

      // Payment split
      sLabel('PAYMENT METHOD  ·  Today vs Yesterday', y);
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(MUTED)
        .text('TOP CITIES  ·  By Orders', rightX, y, { characterSpacing: 1.4, width: halfW });
      y += 15;

      // Payment table
      doc.rect(40, y, halfW, 21).fill(FOREST);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(GOLD)
        .text('Method', 54, y + 6, { width: 70 })
        .text('Today', 54 + 70, y + 6, { width: 50, align: 'right' })
        .text('Yesterday', 54 + 125, y + 6, { width: 55, align: 'right' });

      // Cities table header
      doc.rect(rightX, y, halfW, 21).fill(FOREST);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(GOLD)
        .text('City', rightX + 10, y + 6, { width: halfW * 0.5 })
        .text('Orders', rightX + halfW * 0.5, y + 6, { width: halfW * 0.25, align: 'right' })
        .text('Revenue', rightX + halfW * 0.75, y + 6, { width: halfW * 0.25 - 10, align: 'right' });

      y += 21;

      const payRows = [
        { label: 'Cash on Delivery', today: data.payment.cod.today,    yest: data.payment.cod.yesterday },
        { label: 'Online / Prepaid', today: data.payment.online.today, yest: data.payment.online.yesterday },
      ];

      payRows.forEach((r, i) => {
        const rH = 22;
        doc.rect(40, y + i * rH, halfW, rH).fill(i % 2 === 0 ? WHITE : '#F9FAF8');
        doc.rect(40, y + i * rH, halfW, rH).stroke(LINE);
        doc.fontSize(9).font('Helvetica').fillColor(INK).text(r.label, 54, y + i * rH + 7, { width: 70 });
        doc.fontSize(9).font('Helvetica-Bold').fillColor(FOREST).text(fmtN(r.today), 54 + 70, y + i * rH + 7, { width: 50, align: 'right' });
        doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(fmtN(r.yest), 54 + 125, y + i * rH + 7, { width: 55, align: 'right' });
      });

      const citiesData = data.topCities.length > 0 ? data.topCities : [{ city: '—', orders: 0, revenue: 0 }];
      citiesData.forEach((c, i) => {
        const rH = 22;
        doc.rect(rightX, y + i * rH, halfW, rH).fill(i % 2 === 0 ? WHITE : '#F9FAF8');
        doc.rect(rightX, y + i * rH, halfW, rH).stroke(LINE);
        doc.fontSize(9).font('Helvetica').fillColor(INK).text(c.city, rightX + 10, y + i * rH + 7, { width: halfW * 0.5 });
        doc.fontSize(9).font('Helvetica-Bold').fillColor(FOREST).text(fmtN(c.orders), rightX + halfW * 0.5, y + i * rH + 7, { width: halfW * 0.25, align: 'right' });
        doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(fmtR(c.revenue), rightX + halfW * 0.75, y + i * rH + 7, { width: halfW * 0.25 - 10, align: 'right' });
      });

      const payEndY = y + payRows.length * 22;
      const citiesEndY = y + citiesData.length * 22;
      y = Math.max(payEndY, citiesEndY) + 8;

      // COD collections callout
      doc.roundedRect(40, y, W - 80, 26).fill(AMBER);
      doc.roundedRect(40, y, W - 80, 26).stroke('#FDE68A');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#92400E')
        .text(`COD Collections Today:  ${fmtR(data.payment.codCollected)} collected   ·   ${data.payment.codOutstanding} order${data.payment.codOutstanding !== 1 ? 's' : ''} still outstanding`, 54, y + 8, { width: W - 108 });
      y += 26 + 14;

      // Cancellations
      if (data.cancelled.today > 0 || data.cancelled.revenueLost > 0) {
        doc.roundedRect(40, y, W - 80, 26).fill('#FEF2F2');
        doc.roundedRect(40, y, W - 80, 26).stroke('#FECACA');
        doc.fontSize(9).font('Helvetica').fillColor('#991B1B')
          .text(`Cancellations:  ${data.cancelled.today} today  (yesterday: ${data.cancelled.yesterday})   ·   Revenue lost: ${fmtR(data.cancelled.revenueLost)}`, 54, y + 8, { width: W - 108 });
        y += 26;
      }

      // Page 2 footer
      doc.rect(0, PH - 26, W, 26).fill(FOREST);
      doc.fontSize(7.5).font('Helvetica').fillColor('#A7C4A0')
        .text('Generated by NatureLite Admin  ·  Confidential  ·  naturelite.in', 0, PH - 16, { align: 'center', width: W });

      doc.end();
    });
  }

  // ─── WhatsApp delivery ────────────────────────────────────────────────────
  // Template bypasses the 24-hour session window.
  // Template "daily_report": header = Document, body = "Your NatureLite daily report for {{1}} is ready."

  private async sendWhatsApp(phone: string, data: DailyReportData, pdfUrl: string) {
    await this.whatsapp.sendTemplateMessage({
      phone,
      templateName: 'daily_report',
      languageCode: 'en',
      bodyParams: [data.date],
      headerDocumentUrl: pdfUrl,
      headerDocumentFilename: `NatureLite-Report-${data.date}.pdf`,
    }).catch(() => {});
  }

  // ─── Config CRUD ──────────────────────────────────────────────────────────

  async getConfig() {
    return this.configModel.findOne().lean() ?? { recipients: [], enabled: true };
  }

  async updateConfig(dto: { recipients?: { name: string; email?: string; phone?: string }[]; enabled?: boolean }) {
    return this.configModel.findOneAndUpdate({}, { $set: dto }, { upsert: true, new: true }).lean();
  }
}
