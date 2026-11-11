import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { ProdOutbox, ProdOutboxDocument } from './production.schemas';

const MAX_ATTEMPTS = 5;

/** Sends queued outbox rows. SMTP down => rows stay failed/retryable; committed stock is never touched. */
@Injectable()
export class ProductionOutboxService {
  private readonly log = new Logger(ProductionOutboxService.name);
  private transporter?: nodemailer.Transporter;
  private busy = false;

  constructor(@InjectModel(ProdOutbox.name) private outbox: Model<ProdOutboxDocument>, private config: ConfigService) {
    const user = config.get<string>('smtp.user');
    if (user) {
      this.transporter = nodemailer.createTransport({
        host: config.get('smtp.host'), port: config.get('smtp.port'), secure: config.get('smtp.secure'),
        auth: { user, pass: config.get('smtp.pass') },
      });
    }
  }

  async test(to: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.transporter) return { ok: false, error: 'SMTP is not configured on the server' };
    try {
      await this.transporter.verify();
      await this.transporter.sendMail({ from: this.config.get('smtp.from'), to, subject: 'Naturelite production: test email', text: 'SMTP connection works.' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.safe(e) };
    }
  }

  private safe(e: unknown) { return String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 200); }

  @Interval(20_000)
  async drain() {
    if (!this.transporter || this.busy) return;
    this.busy = true;
    try {
      for (let i = 0; i < 20; i++) {
        const now = new Date();
        // Claim atomically so two instances never send the same row; the claim doubles as the retry backoff.
        const row = await this.outbox.findOneAndUpdate(
          { status: { $in: ['queued', 'failed'] }, attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now } },
          { $inc: { attempts: 1 }, $set: { nextAttemptAt: new Date(+now + 5 * 60_000) } }, { new: true },
        );
        if (!row) break;
        try {
          await this.transporter.sendMail({ from: this.config.get('smtp.from'), to: row.to, subject: row.subject, html: row.html });
          await this.outbox.updateOne({ _id: row._id }, { $set: { status: 'sent', sentAt: new Date() }, $unset: { error: 1 } });
        } catch (e) {
          await this.outbox.updateOne({ _id: row._id }, { $set: { status: 'failed', error: this.safe(e), nextAttemptAt: new Date(Date.now() + 2 ** row.attempts * 60_000) } });
          this.log.warn(`Outbox ${row.idemKey} failed (attempt ${row.attempts}): ${this.safe(e)}`);
        }
      }
    } finally { this.busy = false; }
  }
}
