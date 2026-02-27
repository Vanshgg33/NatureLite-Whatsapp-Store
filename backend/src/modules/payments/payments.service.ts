import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Order } from '../orders/schemas/order.schema';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpay: any;

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private orderModel: Model<any>,
    private configService: ConfigService,
  ) {
    const keyId = this.configService.get<string>('razorpay.keyId');
    const keySecret = this.configService.get<string>('razorpay.keySecret');

    if (keyId && keySecret) {
      try {
        const Razorpay = require('razorpay');
        this.razorpay = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });
        this.logger.log('Razorpay initialized successfully');
      } catch (error) {
        this.logger.warn('Razorpay initialization failed - payment features will be unavailable');
      }
    } else {
      this.logger.warn('Razorpay credentials not configured');
    }
  }

  async createOrder(orderId: string, userId: string) {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.user.toString() !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    if (order.paymentStatus === 'paid') {
      throw new BadRequestException('Order already paid');
    }

    // Create Razorpay order
    const razorpayOrder = await this.razorpay.orders.create({
      amount: Math.round(order.total * 100), // convert to paise
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderId: orderId, userId },
    });

    // Save payment record
    await new this.paymentModel({
      order: new Types.ObjectId(orderId),
      user: new Types.ObjectId(userId),
      amount: order.total,
      gateway: 'razorpay',
      status: 'initiated',
      gatewayOrderId: razorpayOrder.id,
    }).save();

    return {
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: this.configService.get<string>('razorpay.keyId'),
    };
  }

  async verifyPayment(data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const keySecret = this.configService.get<string>('razorpay.keySecret');

    // Verify signature
    const generated = crypto
      .createHmac('sha256', keySecret)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`)
      .digest('hex');

    if (generated !== data.razorpay_signature) {
      throw new BadRequestException('Invalid payment signature');
    }

    // Update payment record
    const payment = await this.paymentModel.findOneAndUpdate(
      { gatewayOrderId: data.razorpay_order_id },
      {
        status: 'success',
        gatewayPaymentId: data.razorpay_payment_id,
        gatewaySignature: data.razorpay_signature,
      },
      { new: true },
    );

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    // Update order payment status
    await this.orderModel.findByIdAndUpdate(payment.order, {
      paymentStatus: 'paid',
      paymentMethod: 'razorpay',
      $push: {
        timeline: {
          status: 'confirmed',
          message: 'Payment received via Razorpay',
          timestamp: new Date(),
        },
      },
    });

    return payment;
  }

  async handleWebhook(body: any, signature: string) {
    const webhookSecret = this.configService.get<string>('razorpay.webhookSecret');

    // Verify webhook signature
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(body))
      .digest('hex');

    if (expected !== signature) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = body.event;
    const payload = body.payload;

    if (event === 'payment.captured') {
      const razorpayPaymentId = payload.payment.entity.id;
      const razorpayOrderId = payload.payment.entity.order_id;

      await this.paymentModel.findOneAndUpdate(
        { gatewayOrderId: razorpayOrderId },
        {
          status: 'success',
          gatewayPaymentId: razorpayPaymentId,
          gatewayResponse: payload.payment.entity,
        },
      );
    } else if (event === 'payment.failed') {
      const razorpayOrderId = payload.payment.entity.order_id;

      await this.paymentModel.findOneAndUpdate(
        { gatewayOrderId: razorpayOrderId },
        {
          status: 'failed',
          failureReason: payload.payment.entity.error_description,
          gatewayResponse: payload.payment.entity,
        },
      );

      // Update order payment status
      const payment = await this.paymentModel.findOne({ gatewayOrderId: razorpayOrderId });
      if (payment) {
        await this.orderModel.findByIdAndUpdate(payment.order, {
          paymentStatus: 'failed',
        });
      }
    }

    return { received: true };
  }

  async initiateRefund(orderId: string, amount?: number, reason?: string) {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    const payment = await this.paymentModel.findOne({
      order: new Types.ObjectId(orderId),
      status: 'success',
    });

    if (!payment) {
      throw new NotFoundException('No successful payment found for this order');
    }

    const refundAmount = amount || payment.amount;

    const refund = await this.razorpay.payments.refund(payment.gatewayPaymentId, {
      amount: Math.round(refundAmount * 100),
      notes: { reason: reason || 'Order refund' },
    });

    await this.paymentModel.findByIdAndUpdate(payment._id, {
      status: 'refunded',
      refundId: refund.id,
      refundAmount,
      refundedAt: new Date(),
      refundReason: reason,
    });

    // Update order
    await this.orderModel.findByIdAndUpdate(payment.order, {
      paymentStatus: 'refunded',
      $push: {
        timeline: {
          status: 'refunded',
          message: `Refund of ₹${refundAmount} initiated`,
          timestamp: new Date(),
        },
      },
    });

    return { refundId: refund.id, amount: refundAmount };
  }
}
