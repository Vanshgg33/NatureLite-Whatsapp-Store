import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import * as PDFDocument from 'pdfkit';
import { BillingBill, BillingBillDocument } from './schemas/billing-bill.schema';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { MediaService } from '../media/media.service';
import { SettingsService } from '../settings/settings.service';
import { TaxSettingsService } from './tax-settings/tax-settings.service';
import { parseIntList } from './logics/param-defs';

/** Retry schedule in seconds: 1 min, 5 min, 30 min, 2 h, then the bill shows "failed" with a Retry button. */
export const RETRY_DELAYS_SEC = [60, 300, 1800, 7200] as const;
export const retryDelayFrom = (attempt: number, delays: readonly number[]): number | null => (attempt < delays.length ? delays[attempt] : null);
export const nextRetryDelay = (attempt: number): number | null => retryDelayFrom(attempt, RETRY_DELAYS_SEC);

/** "098765 43210", "+91 98765 43210", "919876543210" -> "919876543210"; null when not an Indian mobile. */
export function normalizeIndianMobile(raw?: string | null): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('091')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `91${d}` : null;
}

const inr = (paise: number) => `Rs ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Sends a saved bill to the customer's WhatsApp. Saving a bill never waits for this and never fails because of it:
 * state lives on bill.whatsapp and a once-a-minute job retries what is due. Reuses the existing WhatsAppService
 * (template + document header), which also de-duplicates on the idempotency key.
 */
@Injectable()
export class BillingWhatsappService {
  private readonly logger = new Logger(BillingWhatsappService.name);

  constructor(
    @InjectModel(BillingBill.name) private readonly billModel: Model<BillingBillDocument>,
    private readonly whatsapp: WhatsAppService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
    private readonly taxSettings: TaxSettingsService,
  ) {}

  /** Admin > Settings > WhatsApp Automation: on/off and template name for the invoice message. */
  private cfg() { return this.settings.getWaAutomation('billing_invoice'); }

  /** Marks the bill queued (or skipped) and starts the first attempt without awaiting it. */
  async queue(billId: string, fresh = false): Promise<string> {
    if (!fresh && !(await this.cfg()).enabled) return 'disabled'; // the switch governs automatic sends only
    const bill = await this.billModel.findById(billId).setOptions({ allDocTypes: true }).lean();
    if (!bill) return 'missing';
    if (!normalizeIndianMobile(bill.customerPhone)) {
      await this.billModel.updateOne({ _id: billId }, { $set: { whatsapp: { status: 'skipped_no_phone', attempts: 0 } } }).setOptions({ allDocTypes: true });
      return 'skipped_no_phone';
    }
    await this.billModel.updateOne({ _id: billId }, { $set: { whatsapp: { status: 'queued', attempts: 0, nextAttemptAt: new Date(), runKey: fresh ? String(Date.now()) : 'v1' } } }).setOptions({ allDocTypes: true });
    this.attempt(billId).catch(e => this.logger.error(`whatsapp attempt ${billId}: ${e?.message}`));
    return 'queued';
  }

  /** Manual Retry button: resets the counter and tries again now. */
  async retry(billId: string) {
    const bill = await this.billModel.findById(billId).setOptions({ allDocTypes: true }).lean();
    if (!bill) throw new NotFoundException('Bill not found');
    // fresh key: a deliberate resend must not be swallowed by the duplicate check
    return { ok: true, status: await this.queue(billId, true) };
  }

  @Cron('* * * * *')
  async retryDue(): Promise<void> {
    // no on/off check: whatever was already queued (auto or manual) still finishes
    const due = await this.billModel
      .find({ 'whatsapp.status': { $in: ['queued', 'retrying', 'sending'] }, 'whatsapp.nextAttemptAt': { $lte: new Date() } })
      .setOptions({ allDocTypes: true }).select('_id').limit(20).lean();
    for (const b of due) await this.attempt(String(b._id)).catch(e => this.logger.error(`whatsapp retry ${b._id}: ${e?.message}`));
  }

  private async attempt(billId: string): Promise<void> {
    // claim: only one worker may send; a crash mid-send is picked up again after 5 minutes
    const claimed = await this.billModel.findOneAndUpdate(
      { _id: billId, 'whatsapp.status': { $in: ['queued', 'retrying', 'sending'] }, 'whatsapp.nextAttemptAt': { $lte: new Date() } },
      { $set: { 'whatsapp.status': 'sending', 'whatsapp.nextAttemptAt': new Date(Date.now() + 5 * 60_000) } },
      { new: true },
    ).setOptions({ allDocTypes: true }).lean();
    if (!claimed) return;
    if (claimed.status === 'cancelled') {
      await this.billModel.updateOne({ _id: billId }, { $set: { 'whatsapp.status': 'skipped_cancelled' } }).setOptions({ allDocTypes: true });
      return;
    }

    const attempts = claimed.whatsapp?.attempts ?? 0;
    const runKey = claimed.whatsapp?.runKey ?? 'v1';
    try {
      const pdf = await this.buildPdf(claimed);
      const url = await this.media.uploadRawBuffer(pdf, 'invoices', `${claimed.invoiceNo.replace(/[^\w-]/g, '_')}-${claimed._id}.pdf`, 'application/pdf');
      const messageId = await this.whatsapp.sendTemplateMessage({
        phone: normalizeIndianMobile(claimed.customerPhone)!,
        templateName: (await this.cfg()).template,
        languageCode: 'en',
        bodyParams: [claimed.invoiceNo, inr(claimed.grandTotalPaise), inr(claimed.amountDuePaise)],
        headerDocumentUrl: url,
        headerDocumentFilename: `${claimed.invoiceNo.replace(/[^\w-]/g, '_')}.pdf`,
        meta: { idempotencyKey: `wa:invoice:${claimed._id}:${runKey}` },
      });
      if (!messageId) throw new Error('WhatsApp provider did not accept the message');
      await this.billModel.updateOne({ _id: billId }, { $set: { whatsapp: { status: 'sent', runKey, attempts: attempts + 1, messageId, sentAt: new Date() } } }).setOptions({ allDocTypes: true });
    } catch (e: any) {
      // a failed settings read must not stop the retry bookkeeping: fall back to the built-in schedule
      const configured = await this.taxSettings.paramOrDefault('whatsappRetryDelaysSec').catch(() => null);
      const delay = retryDelayFrom(attempts, parseIntList(configured, [...RETRY_DELAYS_SEC]));
      await this.billModel.updateOne({ _id: billId }, {
        $set: {
          whatsapp: {
            runKey,
            status: delay === null ? 'failed' : 'retrying',
            attempts: attempts + 1,
            lastError: String(e?.message ?? e).slice(0, 300),
            ...(delay === null ? {} : { nextAttemptAt: new Date(Date.now() + delay * 1000) }),
          },
        },
      }).setOptions({ allDocTypes: true });
    }
  }

  /** Compact tax invoice. Paise integers straight from the saved bill: no recalculation here. */
  private buildPdf(bill: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const inter = bill.isInterState;
      doc.fontSize(16).font('Helvetica-Bold').text('NatureLite Foods');
      doc.fontSize(9).font('Helvetica').text(bill.docType === 'CREDIT_NOTE' ? 'Credit Note' : 'Tax Invoice');
      doc.moveDown(0.5);
      doc.text(`Invoice: ${bill.invoiceNo}    Date: ${new Date(bill.invoiceDate ?? bill.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}    Channel: ${bill.orderTag}`);
      doc.text(`Customer: ${bill.customerName}  ${bill.customerPhone}${bill.customerGstNo ? `  GSTIN ${bill.customerGstNo}` : ''}`);
      doc.moveDown();

      const cols = inter
        ? [['Item', 190], ['HSN', 55], ['Qty', 40], ['Taxable', 70], ['IGST', 60], ['Amount', 70]] as const
        : [['Item', 150], ['HSN', 50], ['Qty', 35], ['Taxable', 65], ['CGST', 55], ['SGST', 55], ['Amount', 65]] as const;
      const row = (vals: string[], bold = false) => {
        let x = 40;
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
        vals.forEach((v, i) => { doc.text(v, x, y, { width: cols[i][1] - 4, align: i >= 2 ? 'right' : 'left' }); x += cols[i][1]; });
        doc.y = y + 14;
      };
      row(cols.map(c => c[0]), true);
      for (const it of bill.items) {
        const v = [it.name, it.hsnCode ?? '', String(it.qty), inr(it.taxable ?? 0)];
        if (inter) v.push(inr(it.igst ?? 0)); else v.push(inr(it.cgst ?? 0), inr(it.sgst ?? 0));
        v.push(inr(it.total ?? 0).replace('Rs ', ''));
        row(v);
      }
      doc.moveDown();
      const line = (label: string, paise: number, bold = false) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(`${label}: ${inr(paise)}`, { align: 'right' });
      if (bill.billDiscountAmtPaise > 0) line('Bill discount', -bill.billDiscountAmtPaise);
      for (const c of bill.charges ?? []) line(c.label || 'Charges', c.amtPaise);
      if (inter) line('IGST', bill.igstTotalPaise); else { line('CGST', bill.cgstTotalPaise); line('SGST', bill.sgstTotalPaise); }
      if (bill.roundOffPaise) line('Round off', bill.roundOffPaise);
      line('Grand total', bill.grandTotalPaise, true);
      line('Paid', bill.amountPaidPaise);
      line('Balance due', bill.amountDuePaise, true);
      doc.end();
    });
  }
}
