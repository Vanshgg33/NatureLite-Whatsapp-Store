import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import * as PDFDocument from 'pdfkit';
import { ReportConfig, ReportConfigDocument } from './schemas/report-config.schema';
import { MediaService } from '../media/media.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { EmailService } from '../email/email.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyReportData {
  date: string;
  orders:         { today: number; yesterday: number };
  revenue:        { today: number; yesterday: number };
  delivered:      { today: number; yesterday: number };
  pendingDispatch: number;
  newCustomers:   { today: number; yesterday: number };
  repeatCustomers: { today: number; yesterday: number };
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

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

    const subject  = `NatureLite Daily Report — ${data.date}`;
    const filename = `daily-report-${data.date}.pdf`;
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
    const now = new Date();
    const todayStart  = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd    = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const yestStart   = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1);
    const yestEnd     = new Date(yestStart); yestEnd.setHours(23, 59, 59, 999);

    const [todayOrders, yestOrders, topProducts] = await Promise.all([
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
        { $group: {
          _id: null,
          count:     { $sum: 1 },
          revenue:   { $sum: '$total' },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          pending:   { $sum: { $cond: [{ $in: ['$status', ['placed', 'confirmed', 'packed']] }, 1, 0] } },
          userIds:   { $addToSet: '$user' },
        }},
      ]),
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: yestStart, $lte: yestEnd } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.total' } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const t = todayOrders[0] ?? { count: 0, revenue: 0, delivered: 0, pending: 0, userIds: [] };
    const y = yestOrders[0] ?? { count: 0, revenue: 0 };

    // New customers = today's order user_ids not in orders before today
    const todayUserIds: string[] = (t.userIds ?? []).map((id: any) => id.toString());
    let newCount = 0;
    if (todayUserIds.length) {
      const returning = await this.orderModel.distinct('user', {
        user: { $in: t.userIds },
        createdAt: { $lt: todayStart },
      });
      newCount = todayUserIds.length - returning.length;
    }

    return {
      date: todayStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      orders:          { today: t.count,     yesterday: y.count },
      revenue:         { today: t.revenue,   yesterday: y.revenue },
      delivered:       { today: t.delivered, yesterday: 0 },
      pendingDispatch: t.pending,
      newCustomers:    { today: newCount,                  yesterday: 0 },
      repeatCustomers: { today: todayUserIds.length - newCount, yesterday: 0 },
      topProducts: topProducts.map((p: any) => ({ name: p._id, qty: p.qty, revenue: p.revenue })),
    };
  }

  // ─── PDF generation ───────────────────────────────────────────────────────

  private generatePdf(data: DailyReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = 595.28;
      const FOREST = '#1B4332';
      const GOLD   = '#D4A543';
      const PAPER  = '#FAFAF7';
      const INK    = '#1C1C1A';
      const MUTED  = '#6B7280';
      const GREEN  = '#16A34A';
      const RED    = '#DC2626';
      const LINE   = '#E5E7EB';

      const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
      const delta = (today: number, yest: number) => {
        if (!yest) return '';
        const pct = Math.round(((today - yest) / yest) * 100);
        return (pct >= 0 ? `+${pct}` : `${pct}`) + '%';
      };

      // ── Header ──
      doc.rect(0, 0, W, 90).fill(FOREST);
      doc.fontSize(22).font('Helvetica-Bold').fillColor(GOLD).text('NatureLite', 40, 28);
      doc.fontSize(11).font('Helvetica').fillColor('#A7C4A0').text('Daily Business Report', 40, 54);
      doc.fontSize(11).font('Helvetica').fillColor(GOLD).text(data.date, W - 40, 38, { align: 'right', width: 150 });

      // ── Background ──
      doc.rect(0, 90, W, 751.89).fill(PAPER);

      // ── Section: Today's Performance ──
      doc.fontSize(10).font('Helvetica-Bold').fillColor(MUTED).text('TODAY\'S PERFORMANCE', 40, 112, { characterSpacing: 1.2 });

      const stats = [
        { label: 'Orders Received', today: data.orders.today,   yest: data.orders.yesterday,   fmt: (n: number) => String(n) },
        { label: 'Revenue',         today: data.revenue.today,  yest: data.revenue.yesterday,  fmt },
        { label: 'Delivered',       today: data.delivered.today, yest: 0,                      fmt: (n: number) => String(n) },
        { label: 'Pending Dispatch',today: data.pendingDispatch, yest: 0,                      fmt: (n: number) => String(n) },
        { label: 'New Customers',   today: data.newCustomers.today, yest: 0,                   fmt: (n: number) => String(n) },
        { label: 'Repeat Customers',today: data.repeatCustomers.today, yest: 0,                fmt: (n: number) => String(n) },
      ];

      const cols = 3;
      const cardW = (W - 80 - (cols - 1) * 12) / cols;
      const cardH = 72;
      stats.forEach((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 40 + col * (cardW + 12);
        const y = 130 + row * (cardH + 10);
        const d = delta(s.today, s.yest);
        const isUp = d.startsWith('+');

        doc.roundedRect(x, y, cardW, cardH, 6).fill('#FFFFFF').stroke(LINE);
        doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(s.label.toUpperCase(), x + 14, y + 12, { characterSpacing: 0.6, width: cardW - 28 });
        doc.fontSize(20).font('Helvetica-Bold').fillColor(INK).text(s.fmt(s.today), x + 14, y + 26, { width: cardW - 28 });
        if (d) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(isUp ? GREEN : RED).text(d + ' vs yesterday', x + 14, y + 52, { width: cardW - 28 });
        }
      });

      // ── Section: Top Products ──
      const tableY = 330;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(MUTED).text('TOP PRODUCTS TODAY', 40, tableY, { characterSpacing: 1.2 });

      if (data.topProducts.length === 0) {
        doc.fontSize(12).font('Helvetica').fillColor(MUTED).text('No orders today', 40, tableY + 20);
      } else {
        // Table header
        const tY = tableY + 18;
        doc.rect(40, tY, W - 80, 24).fill(FOREST);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(GOLD)
          .text('Product', 54, tY + 7, { width: 280 })
          .text('Qty', 54 + 290, tY + 7, { width: 60, align: 'right' })
          .text('Revenue', 54 + 360, tY + 7, { width: 110, align: 'right' });

        data.topProducts.forEach((p, i) => {
          const rY = tY + 24 + i * 28;
          doc.rect(40, rY, W - 80, 28).fill(i % 2 === 0 ? '#FFFFFF' : '#F9FAF8').stroke(LINE);
          doc.fontSize(11).font('Helvetica').fillColor(INK).text(p.name, 54, rY + 8, { width: 280 });
          doc.fontSize(11).font('Helvetica-Bold').fillColor(MUTED).text(String(p.qty), 54 + 290, rY + 8, { width: 60, align: 'right' });
          doc.fontSize(11).font('Helvetica-Bold').fillColor(FOREST).text(fmt(p.revenue), 54 + 360, rY + 8, { width: 110, align: 'right' });
        });
      }

      // ── Footer ──
      const footerY = 720;
      doc.rect(0, footerY, W, 82).fill(FOREST);
      doc.fontSize(9).font('Helvetica').fillColor('#A7C4A0')
        .text('Generated automatically by NatureLite Admin · Confidential', 0, footerY + 20, { align: 'center', width: W })
        .text('naturelite.in', 0, footerY + 38, { align: 'center', width: W });

      doc.end();
    });
  }

  // ─── WhatsApp text summary ────────────────────────────────────────────────

  private async sendWhatsApp(phone: string, data: DailyReportData, pdfUrl: string) {
    const d = (t: number, y: number) => {
      if (!y) return '';
      const p = Math.round(((t - y) / y) * 100);
      return ` (${p >= 0 ? '+' : ''}${p}%)`;
    };
    const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

    const msg = [
      `📊 *NatureLite Daily Report — ${data.date}*`,
      '',
      `📦 Orders: ${data.orders.today}${d(data.orders.today, data.orders.yesterday)}`,
      `💰 Revenue: ${fmt(data.revenue.today)}${d(data.revenue.today, data.revenue.yesterday)}`,
      `🚚 Delivered: ${data.delivered.today}`,
      `⏳ Pending Dispatch: ${data.pendingDispatch}`,
      `🛒 New Customers: ${data.newCustomers.today}`,
      `🔁 Repeat Customers: ${data.repeatCustomers.today}`,
      '',
      data.topProducts.length
        ? `*Top Products:*\n${data.topProducts.map((p, i) => `${i + 1}. ${p.name} — ${p.qty} units — ${fmt(p.revenue)}`).join('\n')}`
        : '',
      '',
      '📄 Full PDF report attached below 👇',
    ].filter(l => l !== undefined).join('\n');

    await this.whatsapp.sendTextMessage({ phone, message: msg }).catch(() => {});
    await this.whatsapp.sendMediaMessage({ phone, mediaType: 'document', mediaUrl: pdfUrl, caption: `Daily Report ${data.date}` }).catch(() => {});
  }

  // ─── Config CRUD ─────────────────────────────────────────────────────────

  async getConfig() {
    return this.configModel.findOne().lean() ?? { recipients: [], enabled: true };
  }

  async updateConfig(dto: { recipients?: { name: string; email?: string; phone?: string }[]; enabled?: boolean }) {
    return this.configModel.findOneAndUpdate({}, { $set: dto }, { upsert: true, new: true }).lean();
  }
}
