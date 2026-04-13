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
