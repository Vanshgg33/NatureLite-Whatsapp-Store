import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentRepository } from './repositories/payment.repository';
import { OrderRepository } from '../orders/repositories/order.repository';
import { WalletService } from '../wallet/wallet.service';
import { StoreSalesService } from '../store-sales/store-sales.service';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpay: any;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
    private configService: ConfigService,
    private readonly walletService: WalletService,
    private readonly storeSalesService: StoreSalesService,
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

    const orderIdObj = parseObjectId(orderId, 'orderId');
    const userObjId = parseObjectId(userId, 'userId');
    const order = await this.orderRepository.findById(orderIdObj);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.user.toString() !== userObjId.toString()) {
      throw new BadRequestException('Unauthorized');
    }

    if (order.paymentStatus === 'paid') {
      throw new BadRequestException('Order already paid');
    }

    // Prefer paymentGatewayAmount (already in paise) when combining wallet + online.
    const amountPaise =
      typeof (order as any).paymentGatewayAmount === 'number' && (order as any).paymentGatewayAmount > 0
        ? (order as any).paymentGatewayAmount
        : Math.round(order.total * 100);

    if (amountPaise <= 0) {
      throw new BadRequestException('No online payment required for this order');
    }

    const razorpayOrder = await this.razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderId, userId },
    });

    await this.paymentRepository.createOne({
      order: orderIdObj,
      user: userObjId,
      amount: amountPaise / 100,
      gateway: 'razorpay',
      status: 'initiated',
      gatewayOrderId: razorpayOrder.id,
    });

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

    const generated = crypto
      .createHmac('sha256', keySecret)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`)
      .digest('hex');

    if (generated !== data.razorpay_signature) {
      throw new BadRequestException('Invalid payment signature');
    }

    const existingPayment = await this.paymentRepository.findOneByGatewayOrderId(data.razorpay_order_id);
    if (existingPayment) {
      const order = await this.orderRepository.findById(existingPayment.order);
      if (order?.status === 'cancelled') {
        throw new BadRequestException('Order is cancelled; payment cannot be applied');
      }
    }

    const payment = await this.paymentRepository.findOneAndUpdateByGatewayOrderId(
      data.razorpay_order_id,
      {
        status: 'success',
        gatewayPaymentId: data.razorpay_payment_id,
        gatewaySignature: data.razorpay_signature,
      },
    );

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    await this.orderRepository.findByIdAndUpdate(payment.order, {
      paymentStatus: 'paid',
      paymentMethod: 'prepaid',
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

      const payment = await this.paymentRepository.findOneAndUpdateByGatewayOrderId(razorpayOrderId, {
        status: 'success',
        gatewayPaymentId: razorpayPaymentId,
        gatewayResponse: payload.payment.entity,
      });

      if (payment) {
        const order = await this.orderRepository.findById(payment.order);
        if (order && order.paymentStatus !== 'paid' && order.status !== 'cancelled') {
          await this.orderRepository.findByIdAndUpdate(payment.order, {
            paymentStatus: 'paid',
            paymentMethod: 'prepaid',
            $push: {
              timeline: {
                status: 'confirmed',
                message: 'Payment received (webhook)',
                timestamp: new Date(),
              },
            },
          });
        }
      }
    } else if (event === 'payment.failed') {
      const razorpayOrderId = payload.payment.entity.order_id;

      await this.paymentRepository.findOneAndUpdateByGatewayOrderId(razorpayOrderId, {
        status: 'failed',
        failureReason: payload.payment.entity.error_description,
        gatewayResponse: payload.payment.entity,
      });

      const payment = await this.paymentRepository.findOneByGatewayOrderId(razorpayOrderId);
      if (payment) {
        await this.orderRepository.findByIdAndUpdate(payment.order, {
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

    const orderIdObj = parseObjectId(orderId, 'orderId');
    const anyPayment = await this.paymentRepository.findOneByOrder(orderIdObj);
    if (anyPayment && ((anyPayment as any).status === 'refunded' || (anyPayment as any).refundId)) {
      throw new BadRequestException('This order has already been refunded');
    }

    const payment = await this.paymentRepository.findOneByOrderAndStatus(orderIdObj, 'success');
    if (!payment) {
      throw new NotFoundException('No successful payment found for this order');
    }

    const refundAmount = amount || payment.amount;

    const refund = await this.razorpay.payments.refund(payment.gatewayPaymentId, {
      amount: Math.round(refundAmount * 100),
      notes: { reason: reason || 'Order refund' },
    });

    await this.paymentRepository.findByIdAndUpdateDoc(payment._id, {
      status: 'refunded',
      refundId: refund.id,
      refundAmount,
      refundedAt: new Date(),
      refundReason: reason,
    });

    // Also restore any wallet portion used on this order when doing a full refund
    const order = await this.orderRepository.findById(orderIdObj);
    if (order && !amount && typeof (order as any).walletUsed === 'number' && (order as any).walletUsed > 0) {
      const walletUsedPaise = (order as any).walletUsed as number;
      if (walletUsedPaise > 0) {
        await this.walletService.credit(
          payment.user.toString(),
          walletUsedPaise,
          'order_refund',
          { orderId: orderIdObj },
        );
      }
    }

    await this.orderRepository.findByIdAndUpdate(payment.order, {
      paymentStatus: 'refunded',
      status: 'refunded',
      $push: {
        timeline: {
          status: 'refunded',
          message: `Refund of ₹${refundAmount} initiated`,
          timestamp: new Date(),
        },
      },
    });

    try {
      await this.storeSalesService.voidByLinkedOrder(orderId, 'order_refunded');
    } catch (voidErr) {
      this.logger.warn(`Failed to void store sale for refunded order: ${voidErr.message}`);
    }

    return { refundId: refund.id, amount: refundAmount };
  }
}
