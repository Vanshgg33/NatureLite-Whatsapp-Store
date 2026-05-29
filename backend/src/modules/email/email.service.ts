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
    const dateOnly = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeOnly = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#EAEFE9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#EAEFE9;padding:40px 16px 48px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- ═══════════ GOLD TOP STRIP ═══════════ -->
  <tr>
    <td style="background:linear-gradient(90deg,#C8900A,#E8A838,#D4A017,#C8900A);height:5px;border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td>
  </tr>

  <!-- ═══════════ HERO HEADER ═══════════ -->
  <tr>
    <td style="background:linear-gradient(160deg,#060F09 0%,#0D2116 30%,#142E1C 60%,#1C3D26 100%);padding:0;position:relative;overflow:hidden;">

      <!-- Decorative circle top-right -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:44px 44px 0 44px;">

            <!-- Top nav row: brand + label -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:rgba(212,160,23,0.14);border:1px solid rgba(212,160,23,0.38);border-radius:8px;padding:6px 14px;">
                        <span style="color:#D4A017;font-size:11px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;">Nature Lite</span>
                      </td>
                      <td style="padding-left:10px;">
                        <span style="color:rgba(255,255,255,0.22);font-size:10px;letter-spacing:1px;">|</span>
                      </td>
                      <td style="padding-left:10px;">
                        <span style="color:rgba(255,255,255,0.38);font-size:10px;letter-spacing:1px;text-transform:uppercase;">Admin Panel</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right">
                  <span style="color:rgba(255,255,255,0.25);font-size:10px;letter-spacing:0.5px;">CONFIDENTIAL REPORT</span>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Gold divider line -->
        <tr>
          <td style="padding:20px 44px 0 44px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(90deg,rgba(212,160,23,0.7),rgba(212,160,23,0.15),transparent);height:1px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Main title area -->
        <tr>
          <td style="padding:26px 44px 0 44px;">
            <p style="margin:0 0 10px;color:rgba(255,255,255,0.42);font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;">Analytics Report</p>
            <h1 style="margin:0 0 14px;color:#ffffff;font-size:30px;font-weight:900;line-height:1.15;letter-spacing:-0.5px;">${subject}</h1>
            <p style="margin:0;color:rgba(255,255,255,0.52);font-size:14px;line-height:1.7;max-width:420px;">Your complete analytics report is attached to this email as a PDF and is ready to review.</p>
          </td>
        </tr>

        <!-- Report file chip -->
        <tr>
          <td style="padding:24px 44px 0 44px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.13);border-radius:40px;padding:8px 16px 8px 10px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:rgba(212,160,23,0.2);border-radius:20px;padding:4px 8px;">
                        <span style="color:#D4A017;font-size:10px;font-weight:700;">PDF</span>
                      </td>
                      <td style="padding-left:10px;">
                        <span style="color:rgba(255,255,255,0.6);font-size:12px;">${filename}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Wave separator -->
        <tr>
          <td style="padding:36px 0 0 0;line-height:0;font-size:0;">
            <svg viewBox="0 0 600 50" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;vertical-align:bottom;">
              <defs>
                <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stop-color="#EAEFE9"/>
                  <stop offset="100%" stop-color="#EAEFE9"/>
                </linearGradient>
              </defs>
              <path d="M0,25 C100,50 200,0 300,25 C400,50 500,0 600,25 L600,50 L0,50 Z" fill="#EAEFE9"/>
            </svg>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══════════ WHITE BODY ═══════════ -->
  <tr>
    <td style="background:#ffffff;padding:0;">

      <!-- ── Attachment Hero Block ── -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:36px 44px 0 44px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0D2116,#1C3D26);border-radius:18px;overflow:hidden;">
              <tr>
                <td style="padding:0;">
                  <!-- Gold top micro-strip -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr><td style="background:linear-gradient(90deg,#D4A017,#E8A838,#D4A017);height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 28px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <!-- PDF icon box -->
                      <td width="56" valign="top">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="background:rgba(212,160,23,0.15);border:1px solid rgba(212,160,23,0.3);border-radius:14px;padding:13px;width:56px;height:56px;" align="center">
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="rgba(212,160,23,0.25)" stroke="#D4A017" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M14 2V8H20" stroke="#D4A017" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <line x1="9" y1="13" x2="15" y2="13" stroke="#D4A017" stroke-width="1.5" stroke-linecap="round"/>
                                <line x1="9" y1="17" x2="15" y2="17" stroke="#D4A017" stroke-width="1.5" stroke-linecap="round"/>
                                <line x1="9" y1="9" x2="11" y2="9" stroke="#D4A017" stroke-width="1.5" stroke-linecap="round"/>
                              </svg>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <!-- Text -->
                      <td style="padding-left:18px;" valign="middle">
                        <p style="margin:0 0 4px;color:rgba(255,255,255,0.42);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Attached Document</p>
                        <p style="margin:0 0 3px;color:#ffffff;font-size:15px;font-weight:700;line-height:1.3;">${filename}</p>
                        <p style="margin:0;color:rgba(212,160,23,0.7);font-size:12px;">PDF Report &nbsp;·&nbsp; Analytics Export</p>
                      </td>
                      <!-- Badge -->
                      <td align="right" valign="middle">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="background:rgba(52,199,89,0.15);border:1px solid rgba(52,199,89,0.35);border-radius:20px;padding:5px 12px;">
                              <span style="color:#34C759;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">&#10003; ATTACHED</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- ── Intro text ── -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:28px 44px 0 44px;">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.75;">
              Hi there,
            </p>
            <p style="margin:10px 0 0;color:#374151;font-size:14px;line-height:1.75;">
              Your <strong style="color:#0D2116;">${subject}</strong> has been generated and is attached to this email as a PDF document. Open the attachment to view the complete analytics breakdown including revenue, orders, products, and customer insights.
            </p>
          </td>
        </tr>
      </table>

      <!-- ── Meta info cards ── -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:24px 44px 0 44px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <!-- Generated card -->
                <td width="48%" style="padding-right:8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F9F6;border:1px solid #D8EBE0;border-radius:12px;">
                    <tr>
                      <td style="padding:0;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr><td style="background:linear-gradient(90deg,#2F6B47,#3D8A5C);height:3px;border-radius:12px 12px 0 0;font-size:0;">&nbsp;</td></tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:14px 16px;">
                        <p style="margin:0 0 5px;color:#5A8A6A;font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Generated On</p>
                        <p style="margin:0;color:#0D2116;font-size:13px;font-weight:700;">${dateOnly}</p>
                        <p style="margin:2px 0 0;color:#6B7C72;font-size:11px;">${timeOnly}</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Source card -->
                <td width="4%">&nbsp;</td>
                <td width="48%" style="padding-left:8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBF0;border:1px solid #F0DFA0;border-radius:12px;">
                    <tr>
                      <td style="padding:0;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr><td style="background:linear-gradient(90deg,#D4A017,#E8A838);height:3px;border-radius:12px 12px 0 0;font-size:0;">&nbsp;</td></tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:14px 16px;">
                        <p style="margin:0 0 5px;color:#92670A;font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Source</p>
                        <p style="margin:0;color:#0D2116;font-size:13px;font-weight:700;">Nature Lite</p>
                        <p style="margin:2px 0 0;color:#6B7C72;font-size:11px;">Admin Panel — Analytics</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- ── What's inside section ── -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:28px 44px 0 44px;">
            <p style="margin:0 0 14px;color:#0D2116;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">What's inside the report</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" valign="top" style="padding-right:8px;">
                  <table cellpadding="0" cellspacing="0" style="width:100%;">
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #F0F4F1;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="background:#EEF7F1;border-radius:6px;padding:4px 8px;margin-right:10px;">
                            <span style="color:#2F6B47;font-size:10px;font-weight:700;">&#9650;</span>
                          </td>
                          <td style="padding-left:10px;color:#374151;font-size:13px;">Revenue &amp; Orders Trend</td>
                        </tr></table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #F0F4F1;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="background:#EFF6FF;border-radius:6px;padding:4px 8px;">
                            <span style="color:#3B82F6;font-size:10px;font-weight:700;">&#9650;</span>
                          </td>
                          <td style="padding-left:10px;color:#374151;font-size:13px;">Customer Insights</td>
                        </tr></table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="background:#F5F3FF;border-radius:6px;padding:4px 8px;">
                            <span style="color:#7C3AED;font-size:10px;font-weight:700;">&#9650;</span>
                          </td>
                          <td style="padding-left:10px;color:#374151;font-size:13px;">Payment Mix Analysis</td>
                        </tr></table>
                      </td>
                    </tr>
                  </table>
                </td>
                <td width="50%" valign="top" style="padding-left:8px;">
                  <table cellpadding="0" cellspacing="0" style="width:100%;">
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #F0F4F1;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="background:#FFFBEB;border-radius:6px;padding:4px 8px;">
                            <span style="color:#D97706;font-size:10px;font-weight:700;">&#9650;</span>
                          </td>
                          <td style="padding-left:10px;color:#374151;font-size:13px;">Top Selling Products</td>
                        </tr></table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #F0F4F1;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="background:#EEF7F1;border-radius:6px;padding:4px 8px;">
                            <span style="color:#059669;font-size:10px;font-weight:700;">&#9650;</span>
                          </td>
                          <td style="padding-left:10px;color:#374151;font-size:13px;">IMS · PMS · RMS Logs</td>
                        </tr></table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="background:#FFF0F3;border-radius:6px;padding:4px 8px;">
                            <span style="color:#E11D48;font-size:10px;font-weight:700;">&#9650;</span>
                          </td>
                          <td style="padding-left:10px;color:#374151;font-size:13px;">Executive Narrative</td>
                        </tr></table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- ── Confidentiality banner ── -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:28px 44px 36px 44px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border-radius:12px;border-left:4px solid #D4A017;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td valign="top" style="padding-right:10px;">
                        <span style="font-size:18px;">&#128274;</span>
                      </td>
                      <td>
                        <p style="margin:0 0 2px;color:#78350F;font-size:12px;font-weight:800;letter-spacing:0.5px;">Confidential Business Report</p>
                        <p style="margin:0;color:#92400E;font-size:12px;line-height:1.6;">This report contains sensitive business data. Do not forward or share with unauthorized parties. Store securely and delete when no longer required.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- ═══════════ DARK FOOTER ═══════════ -->
  <tr>
    <td style="background:#0D2116;padding:32px 44px;border-radius:0 0 14px 14px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td valign="middle">
            <!-- Brand -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:rgba(212,160,23,0.12);border:1px solid rgba(212,160,23,0.28);border-radius:6px;padding:5px 12px;">
                  <span style="color:#D4A017;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Nature Lite</span>
                </td>
              </tr>
            </table>
            <p style="margin:10px 0 0;color:rgba(255,255,255,0.35);font-size:11px;line-height:1.6;">Automated Admin Report System</p>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.2);font-size:10px;">Generated on ${now}</p>
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;color:rgba(255,255,255,0.2);font-size:10px;line-height:1.7;">This is an automated email.<br/>Do not reply directly to this message.</p>
          </td>
        </tr>
        <!-- Gold rule -->
        <tr>
          <td colspan="2" style="padding-top:20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="background:rgba(212,160,23,0.15);height:1px;font-size:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:12px;">
            <p style="margin:0;color:rgba(255,255,255,0.15);font-size:10px;text-align:center;">&#169; ${new Date().getFullYear()} Nature Lite &nbsp;·&nbsp; Admin Panel &nbsp;·&nbsp; Confidential Report System</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Bottom spacing -->
  <tr><td style="height:24px;">&nbsp;</td></tr>

</table>
</td></tr>
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
