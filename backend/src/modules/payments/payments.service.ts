import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentRepository } from './repositories/payment.repository';
import { OrderRepository } from '../orders/repositories/order.repository';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallet/wallet.service';
import { StoreSalesService } from '../store-sales/store-sales.service';
import { parseObjectId } from '../../common/utils/objectid.util';
import { WhatsAppCheckoutVerifyDto } from './dto/whatsapp-pay.dto';

/** Signed payload for public /pay page (WhatsApp checkout link). */
interface WhatsAppPayTokenPayload {
  orderId: string;
  userId: string;
  exp: number;
}

const WHATSAPP_PAY_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export interface WhatsAppCheckoutPrepareResult {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  orderNumber: string;
  alreadyPaid: boolean;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpay: RazorpayClient | null = null;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
    private readonly ordersService: OrdersService,
    private configService: ConfigService,
    private readonly walletService: WalletService,
    private readonly storeSalesService: StoreSalesService,
  ) {
    const keyId = this.configService.get<string>('razorpay.keyId');
    const keySecret = this.configService.get<string>('razorpay.keySecret');

    if (keyId && keySecret) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const RazorpayCtor = require('razorpay') as new (cfg: { key_id: string; key_secret: string }) => RazorpayClient;
        this.razorpay = new RazorpayCtor({ key_id: keyId, key_secret: keySecret });
        this.logger.log('Razorpay initialized successfully');
      } catch (error) {
        this.logger.warn('Razorpay initialization failed - payment features will be unavailable');
      }
    } else {
      this.logger.warn('Razorpay credentials not configured');
    }
  }

  isRazorpayConfigured(): boolean {
    return this.razorpay !== null;
  }

  private getRazorpayOrThrow(): RazorpayClient {
    const client = this.razorpay;
    if (!client) {
      throw new BadRequestException('Payment gateway not configured');
    }
    return client;
  }

  async createOrder(orderId: string, userId: string) {
    const razorpay = this.getRazorpayOrThrow();

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
      typeof order.paymentGatewayAmount === 'number' && order.paymentGatewayAmount > 0
        ? order.paymentGatewayAmount
        : Math.round(order.total * 100);

    if (amountPaise <= 0) {
      throw new BadRequestException('No online payment required for this order');
    }

    const razorpayOrder = await razorpay.orders.create({
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
  }, userId: string) {
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
      // Bind verification to the authenticated user.
      const userObjId = parseObjectId(userId, 'userId');
      if (existingPayment.user?.toString() !== userObjId.toString()) {
        throw new BadRequestException('Unauthorized');
      }

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

    await this.ordersService.recordRazorpayPaymentApplied(
      payment.order.toString(),
      'Payment received via Razorpay',
    );

    return payment;
  }

  /**
   * HMAC-signed token so customers can open /pay/:orderId without web session cookies.
   * Secret: JWT_SECRET (same as auth signing secret).
   */
  signWhatsAppPayToken(orderId: string, userId: string): string {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      throw new BadRequestException('Server misconfiguration: JWT secret missing');
    }
    const exp = Date.now() + WHATSAPP_PAY_TOKEN_TTL_MS;
    const payload: WhatsAppPayTokenPayload = { orderId, userId, exp };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');
    return `${payloadB64}.${sig}`;
  }

  verifyWhatsAppPayToken(token: string): WhatsAppPayTokenPayload | null {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      return null;
    }
    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }
    const [payloadB64, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    let parsed: WhatsAppPayTokenPayload;
    try {
      parsed = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as WhatsAppPayTokenPayload;
    } catch {
      return null;
    }
    if (
      typeof parsed.orderId !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  }

  async prepareWhatsAppCheckout(
    orderId: string,
    token: string,
  ): Promise<WhatsAppCheckoutPrepareResult> {
    const payload = this.verifyWhatsAppPayToken(token);
    if (!payload) {
      throw new BadRequestException('Invalid or expired payment link');
    }
    if (payload.orderId !== orderId) {
      throw new BadRequestException('Order does not match payment link');
    }

    const orderIdObj = parseObjectId(orderId, 'orderId');
    const order = await this.orderRepository.findById(orderIdObj);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.user.toString() !== payload.userId) {
      throw new BadRequestException('Unauthorized');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestException('This order has been cancelled');
    }

    if (order.paymentMethod !== 'prepaid') {
      throw new BadRequestException('This order does not require online payment');
    }

    if (order.paymentStatus === 'paid') {
      return {
        razorpayOrderId: '',
        amount: 0,
        currency: 'INR',
        keyId: this.configService.get<string>('razorpay.keyId') || '',
        orderNumber: order.orderNumber,
        alreadyPaid: true,
      };
    }

    const checkout = await this.createOrder(orderId, payload.userId);
    return {
      razorpayOrderId: checkout.razorpayOrderId,
      amount: checkout.amount,
      currency: checkout.currency,
      keyId: checkout.keyId || '',
      orderNumber: order.orderNumber,
      alreadyPaid: false,
    };
  }

  async verifyWhatsAppCheckoutPayment(dto: WhatsAppCheckoutVerifyDto): Promise<void> {
    const payload = this.verifyWhatsAppPayToken(dto.payToken);
    if (!payload) {
      throw new BadRequestException('Invalid or expired payment link');
    }
    await this.verifyPayment(
      {
        razorpay_order_id: dto.razorpay_order_id,
        razorpay_payment_id: dto.razorpay_payment_id,
        razorpay_signature: dto.razorpay_signature,
      },
      payload.userId,
    );
  }

  async handleWebhook(input: {
    body: object;
    rawBody: string;
    signature: string;
  }): Promise<{ received: true }> {
    const webhookSecret = this.configService.get<string>('razorpay.webhookSecret') ?? '';
    if (!webhookSecret) {
      throw new BadRequestException('Webhook secret not configured');
    }

    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(input.rawBody, 'utf8')
      .digest('hex');

    if (expected !== input.signature) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const evt = input.body as RazorpayWebhookEvent;
    const event = evt.event;
    const entity = evt.payload?.payment?.entity;
    if (!event || !entity?.order_id) {
      return { received: true };
    }

    if (event === 'payment.captured') {
      const razorpayPaymentId = entity.id;
      const razorpayOrderId = entity.order_id;

      // Replay protection: if we've already processed this payment id, skip safely.
      const existingByPaymentId =
        razorpayPaymentId && razorpayPaymentId.trim()
          ? await this.paymentRepository.findOneByGatewayPaymentId(razorpayPaymentId)
          : null;
      if (existingByPaymentId && existingByPaymentId.status === 'success') {
        return { received: true };
      }

      const payment = await this.paymentRepository.findOneAndUpdateByGatewayOrderId(razorpayOrderId, {
        status: 'success',
        gatewayPaymentId: razorpayPaymentId,
        gatewayResponse: entity,
      });

      if (!payment) {
        const notedOrderId = entity.notes?.orderId?.trim() ?? '';
        const notedUserId = entity.notes?.userId?.trim() ?? '';
        if (notedOrderId && notedUserId) {
          const orderIdObj = parseObjectId(notedOrderId, 'orderId');
          const userIdObj = parseObjectId(notedUserId, 'userId');
          const order = await this.orderRepository.findById(orderIdObj);
          if (order && order.status !== 'cancelled') {
            const amountPaise =
              typeof order.paymentGatewayAmount === 'number' && order.paymentGatewayAmount > 0
                ? order.paymentGatewayAmount
                : Math.round(order.total * 100);
            await this.paymentRepository.createOne({
              order: orderIdObj,
              user: userIdObj,
              amount: amountPaise / 100,
              gateway: 'razorpay',
              status: 'success',
              gatewayOrderId: razorpayOrderId,
            });
            await this.paymentRepository.findOneAndUpdateByGatewayOrderId(razorpayOrderId, {
              gatewayPaymentId: razorpayPaymentId,
              gatewayResponse: entity,
            });
            if (order.paymentStatus !== 'paid') {
              await this.ordersService.recordRazorpayPaymentApplied(
                notedOrderId,
                'Payment received (webhook)',
              );
            }
          }
        }
        return { received: true };
      }

      const order = await this.orderRepository.findById(payment.order);
      if (order && order.paymentStatus !== 'paid' && order.status !== 'cancelled') {
        await this.ordersService.recordRazorpayPaymentApplied(
          payment.order.toString(),
          'Payment received (webhook)',
        );
      }
    }

    if (event === 'payment.failed') {
      const razorpayOrderId = entity.order_id;

      await this.paymentRepository.findOneAndUpdateByGatewayOrderId(razorpayOrderId, {
        status: 'failed',
        failureReason: entity.error_description,
        gatewayResponse: entity,
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
    const razorpay = this.getRazorpayOrThrow();

    const orderIdObj = parseObjectId(orderId, 'orderId');
    const anyPayment = await this.paymentRepository.findOneByOrder(orderIdObj);
    if (anyPayment && (anyPayment.status === 'refunded' || Boolean(anyPayment.refundId))) {
      throw new BadRequestException('This order has already been refunded');
    }

    const payment = await this.paymentRepository.findOneByOrderAndStatus(orderIdObj, 'success');
    if (!payment) {
      throw new NotFoundException('No successful payment found for this order');
    }

    const refundAmount = amount || payment.amount;

    const refund = await razorpay.payments.refund(payment.gatewayPaymentId, {
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
    if (order && !amount && typeof order.walletUsed === 'number' && order.walletUsed > 0) {
      const walletUsedPaise = order.walletUsed;
      if (walletUsedPaise > 0) {
        await this.walletService.credit(
          payment.user.toString(),
          walletUsedPaise,
          'order_refund',
          { orderId: orderIdObj },
        );
      }
    }

    await this.ordersService.recordRefundOnOrder(payment.order.toString(), refundAmount);

    try {
      await this.storeSalesService.voidByLinkedOrder(orderId, 'order_refunded');
    } catch (voidErr) {
      this.logger.warn(`Failed to void store sale for refunded order: ${voidErr.message}`);
    }

    return { refundId: refund.id, amount: refundAmount };
  }
}

type RazorpayOrderCreateResult = { id: string; amount: number; currency: string };

type RazorpayClient = {
  orders: {
    create(input: {
      amount: number;
      currency: 'INR';
      receipt: string;
      notes: { orderId: string; userId: string };
    }): Promise<RazorpayOrderCreateResult>;
  };
  payments: {
    refund(
      paymentId: string,
      input: { amount: number; notes: { reason: string } },
    ): Promise<{ id: string }>;
  };
};

type RazorpayWebhookPaymentEntity = {
  id: string;
  order_id: string;
  error_description?: string;
  notes?: { orderId?: string; userId?: string };
};

type RazorpayWebhookEvent = {
  event: 'payment.captured' | 'payment.failed' | string;
  payload?: {
    payment?: {
      entity?: RazorpayWebhookPaymentEntity;
    };
  };
};
