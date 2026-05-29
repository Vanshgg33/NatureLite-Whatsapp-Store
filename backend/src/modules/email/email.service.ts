import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private fromAddress: string;

  constructor(private configService: ConfigService) {
    const smtpUser = this.configService.get<string>('smtp.user');
    this.fromAddress = this.configService.get<string>('smtp.from');

    if (smtpUser) {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('smtp.host'),
        port: this.configService.get<number>('smtp.port'),
        secure: this.configService.get<boolean>('smtp.secure'),
        auth: {
          user: smtpUser,
          pass: this.configService.get<string>('smtp.pass'),
        },
      });
      this.logger.log('Email transporter initialized');
    } else {
      this.logger.warn('SMTP not configured - emails will be logged to console');
    }
  }

  private async send(to: string, subject: string, html: string, retries = 3): Promise<void> {
    if (!to) return;

    if (this.transporter) {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await this.transporter.sendMail({ from: this.fromAddress, to, subject, html });
          this.logger.log(`Email sent to ${to}: ${subject}`);
          return;
        } catch (error) {
          this.logger.error(
            `Failed to send email to ${to} (attempt ${attempt}/${retries}): ${error.message}`,
          );
          if (attempt < retries) {
            // Exponential backoff: 1s, 2s, 4s
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
          }
        }
      }
      this.logger.error(`All ${retries} attempts to send email to ${to} failed: ${subject}`);
    } else {
      this.logger.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    }
  }

  async sendOrderConfirmation(order: any, customerEmail: string): Promise<void> {
    const itemsHtml = (order.items || [])
      .map(
        (item: any) =>
          `<tr>
            <td style="padding:8px;border-bottom:1px solid #eee">${item.name}${item.variantName ? ` (${item.variantName})` : ''}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₹${item.price.toFixed(2)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₹${item.total.toFixed(2)}</td>
          </tr>`,
      )
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#D4A574;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">Order Confirmed!</h1>
        </div>
        <div style="padding:20px">
          <p>Hi ${order.shippingAddress?.name || 'Customer'},</p>
          <p>Thank you for your order! Your order <strong>#${order.orderNumber}</strong> has been confirmed.</p>

          <h3 style="color:#8B5A2B">Order Summary</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#f5f0e8">
                <th style="padding:8px;text-align:left">Item</th>
                <th style="padding:8px;text-align:center">Qty</th>
                <th style="padding:8px;text-align:right">Price</th>
                <th style="padding:8px;text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div style="margin-top:16px;text-align:right">
            <p>Subtotal: ₹${order.subtotal?.toFixed(2)}</p>
            ${order.discount > 0 ? `<p style="color:green">Discount: -₹${order.discount.toFixed(2)}</p>` : ''}
            <p>Shipping: ${order.shippingCharge > 0 ? `₹${order.shippingCharge.toFixed(2)}` : 'FREE'}</p>
            ${order.gstTotal > 0 ? `<p>GST: ₹${order.gstTotal.toFixed(2)}</p>` : ''}
            <p style="font-size:18px;font-weight:bold;color:#8B5A2B">Total: ₹${order.total?.toFixed(2)}</p>
          </div>

          <div style="margin-top:20px;padding:16px;background:#f5f0e8;border-radius:8px">
            <h4 style="margin:0 0 8px">Shipping Address</h4>
            <p style="margin:0">${order.shippingAddress?.street || ''}<br>
            ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} - ${order.shippingAddress?.pincode || ''}</p>
          </div>

          <p style="margin-top:20px;color:#666">Payment Method: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod?.toUpperCase()}</p>
          <p style="color:#666;font-size:12px">If you have any questions, reply to this email.</p>
        </div>
      </div>
    `;

    await this.send(customerEmail, `Order Confirmed - #${order.orderNumber}`, html);
  }

  async sendShippingUpdate(order: any, customerEmail: string): Promise<void> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#2A5A3A;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">Your Order Is Out for Delivery</h1>
        </div>
        <div style="padding:20px">
          <p>Hi ${order.shippingAddress?.name || 'Customer'},</p>
          <p>Your order <strong>#${order.orderNumber}</strong> is on its way — our delivery team is handling it.</p>

          ${order.awbNumber ? `<div style="padding:16px;background:#f5f0e8;border-radius:8px;margin:16px 0">
            <p style="margin:0"><strong>Tracking Number:</strong> ${order.awbNumber}</p>
            ${order.courierName ? `<p style="margin:4px 0 0"><strong>Courier:</strong> ${order.courierName}</p>` : ''}
            ${order.expectedDeliveryDate ? `<p style="margin:4px 0 0"><strong>Expected Delivery:</strong> ${new Date(order.expectedDeliveryDate).toLocaleDateString('en-IN')}</p>` : ''}
            ${order.trackingUrl ? `<p style="margin:8px 0 0"><a href="${order.trackingUrl}" style="color:#D4A574">Track Your Order</a></p>` : ''}
          </div>` : ''}

          <p style="color:#666;font-size:12px">If you have any questions, reply to this email.</p>
        </div>
      </div>
    `;

    await this.send(customerEmail, `Out for delivery - #${order.orderNumber}`, html);
  }

  async sendDeliveryConfirmation(order: any, customerEmail: string): Promise<void> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#2A5A3A;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">Order Delivered!</h1>
        </div>
        <div style="padding:20px">
          <p>Hi ${order.shippingAddress?.name || 'Customer'},</p>
          <p>Your order <strong>#${order.orderNumber}</strong> has been delivered successfully.</p>
          <p>We hope you enjoy your purchase! If you have any feedback, we'd love to hear from you.</p>
          <p style="color:#666;font-size:12px">If you have any issues with your order, please contact our support team.</p>
        </div>
      </div>
    `;

    await this.send(customerEmail, `Order Delivered - #${order.orderNumber}`, html);
  }

  async sendAdminReport(to: string, subject: string, html: string): Promise<void> {
    await this.send(to, subject, html);
  }

  async sendReportEmail(to: string, subject: string, filename: string, pdfBuffer: Buffer): Promise<void> {
    const now = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#F0F4F1;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F1;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HEADER CARD -->
          <tr>
            <td style="border-radius:20px 20px 0 0;overflow:hidden;background:linear-gradient(135deg,#0A1A10 0%,#1A3526 45%,#265C3A 100%);padding:0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:40px 40px 0 40px;">
                    <!-- Top bar -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="background:rgba(212,160,23,0.18);border:1px solid rgba(212,160,23,0.35);border-radius:8px;padding:7px 14px;">
                                <span style="color:#D4A017;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Nature Lite</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td align="right">
                          <span style="color:rgba(255,255,255,0.35);font-size:11px;letter-spacing:0.5px;">Admin Panel Report</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 40px 0 40px;">
                    <!-- Decorative line -->
                    <div style="height:1px;background:linear-gradient(90deg,rgba(212,160,23,0.6),rgba(212,160,23,0.1),transparent);margin-bottom:28px;"></div>
                    <!-- Title -->
                    <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;line-height:1.2;letter-spacing:-0.5px;">${subject}</h1>
                    <p style="margin:10px 0 0;color:rgba(255,255,255,0.55);font-size:14px;line-height:1.5;">Your requested report is attached to this email and ready to view.</p>
                  </td>
                </tr>
                <!-- Decorative bottom wave -->
                <tr>
                  <td style="padding:32px 0 0 0;line-height:0;">
                    <svg viewBox="0 0 600 40" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;">
                      <path d="M0,20 Q150,40 300,20 T600,20 L600,40 L0,40 Z" fill="#F0F4F1"/>
                    </svg>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY CARD -->
          <tr>
            <td style="background:#ffffff;padding:32px 40px 0 40px;">

              <!-- Attachment block -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#F4F8F5,#EAF2EC);border:1.5px solid #C8DDD0;border-radius:16px;padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="44">
                          <div style="height:44px;width:44px;background:linear-gradient(135deg,#1E3D2B,#2F6B47);border-radius:12px;display:flex;align-items:center;justify-content:center;">
                            <table cellpadding="0" cellspacing="0" style="margin:auto;">
                              <tr><td align="center" style="padding:10px;">
                                <!-- PDF icon SVG -->
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                  <path d="M14 2V8H20" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                  <path d="M9 13H15M9 17H15M9 9H10" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                              </td></tr>
                            </table>
                          </div>
                        </td>
                        <td style="padding-left:16px;">
                          <p style="margin:0;color:#1E3D2B;font-size:13px;font-weight:700;">${filename}</p>
                          <p style="margin:3px 0 0;color:#6B7C72;font-size:12px;">PDF Document &nbsp;·&nbsp; Attached</p>
                        </td>
                        <td align="right">
                          <span style="display:inline-block;background:#D4EFDF;color:#1A6B3A;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;">ATTACHED</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
                <tr>
                  <td style="border-top:1px solid #E8EFE9;padding:0;"></td>
                </tr>
              </table>

              <!-- Info section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td width="50%" style="padding-right:12px;">
                    <div style="background:#F8FBF9;border-radius:12px;padding:16px;">
                      <p style="margin:0;color:#8A9E92;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Generated</p>
                      <p style="margin:6px 0 0;color:#1A2E20;font-size:13px;font-weight:600;">${now}</p>
                    </div>
                  </td>
                  <td width="50%" style="padding-left:12px;">
                    <div style="background:#F8FBF9;border-radius:12px;padding:16px;">
                      <p style="margin:0;color:#8A9E92;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Source</p>
                      <p style="margin:6px 0 0;color:#1A2E20;font-size:13px;font-weight:600;">Nature Lite Admin Panel</p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <div style="background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border-left:3px solid #D4A017;border-radius:0 12px 12px 0;padding:16px 20px;margin-bottom:28px;">
                <p style="margin:0;color:#92400E;font-size:13px;line-height:1.6;">
                  <strong style="color:#78350F;">Please note:</strong> This report contains confidential business data. Handle it with care and do not share it with unauthorized parties.
                </p>
              </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#ffffff;padding:0 40px 32px 40px;border-radius:0 0 20px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid #E8EFE9;padding-top:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin:0;color:#1E3D2B;font-size:13px;font-weight:700;">Nature Lite</p>
                          <p style="margin:2px 0 0;color:#9CA3AF;font-size:11px;">Automated Admin Report System</p>
                        </td>
                        <td align="right">
                          <p style="margin:0;color:#C4D4C9;font-size:11px;">Do not reply to this email</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bottom spacing -->
          <tr><td style="height:24px;"></td></tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to,
          subject,
          html,
          attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
        });
        this.logger.log(`Report email sent to ${to}: ${subject}`);
      } catch (error) {
        this.logger.error(`Failed to send report email to ${to}: ${error.message}`);
        throw error;
      }
    } else {
      this.logger.log(`[EMAIL] To: ${to} | Subject: ${subject} | Attachment: ${filename}`);
    }
  }

  async sendOrderCancelled(order: any, customerEmail: string): Promise<void> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#CD7F32;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">Order Cancelled</h1>
        </div>
        <div style="padding:20px">
          <p>Hi ${order.shippingAddress?.name || 'Customer'},</p>
          <p>Your order <strong>#${order.orderNumber}</strong> has been cancelled.</p>
          ${order.cancelReason ? `<p><strong>Reason:</strong> ${order.cancelReason}</p>` : ''}
          ${order.paymentStatus === 'paid' ? '<p>Your refund will be processed within 5-7 business days.</p>' : ''}
          <p style="color:#666;font-size:12px">If you have any questions, reply to this email.</p>
        </div>
      </div>
    `;

    await this.send(customerEmail, `Order Cancelled - #${order.orderNumber}`, html);
  }
}
