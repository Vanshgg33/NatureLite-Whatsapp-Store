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
  customerName?: string;
  customerPhone?: string;
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
        // Print the keyId prefix only — never the secret. Lets the operator
        // verify in deploy logs which key (test vs live) is actually loaded.
        const mode = keyId.startsWith('rzp_live_') ? 'LIVE' : keyId.startsWith('rzp_test_') ? 'TEST' : 'unknown';
        const safeId = `${keyId.slice(0, 12)}…${keyId.slice(-4)}`;
        this.logger.log(`Razorpay initialized (mode=${mode}, keyId=${safeId})`);
        const webhookSecret = this.configService.get<string>('razorpay.webhookSecret') ?? '';
        if (!webhookSecret) {
          this.logger.warn(
            'Razorpay webhook secret not configured — payment.captured webhook deliveries will be rejected (400). Set RAZORPAY_WEBHOOK_SECRET to enable.',
          );
        }
      } catch (error) {
        this.logger.error('Razorpay initialization failed - payment features will be unavailable', error as Error);
      }
    } else {
      this.logger.warn(
        `Razorpay credentials not configured (keyId set=${Boolean(keyId)}, keySecret set=${Boolean(keySecret)}). Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (or razorpay_key / razorpay_secret) on the backend service.`,
      );
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

    if (order.paymentStatus === 'refunded' || order.status === 'refunded') {
      throw new BadRequestException('Order has been refunded');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestException('Order has been cancelled');
    }

    // Prefer paymentGatewayAmount (already in paise) when combining wallet + online.
    const amountPaise =
      typeof order.paymentGatewayAmount === 'number' && order.paymentGatewayAmount > 0
        ? order.paymentGatewayAmount
        : Math.round(order.total * 100);

    if (amountPaise <= 0) {
      throw new BadRequestException('No online payment required for this order');
    }

    // Reuse a recent unspent Razorpay order if one exists. Without this, every
    // pay-page reload or "Pay now" tap creates a new Razorpay order, polluting
    // the dashboard and leaving zombie `initiated` rows in our DB. Cap the
    // freshness window so a stale order from 2 days ago doesn't get reused.
    const REUSE_WINDOW_MS = 15 * 60 * 1000;
    const reusable = await this.paymentRepository.findRecentInitiatedForOrder(orderIdObj, REUSE_WINDOW_MS);
    if (
      reusable &&
      reusable.gatewayOrderId &&
      Math.round(reusable.amount * 100) === amountPaise
    ) {
      return {
        razorpayOrderId: reusable.gatewayOrderId,
        amount: amountPaise,
        currency: reusable.currency || 'INR',
        keyId: this.configService.get<string>('razorpay.keyId'),
      };
    }

    // Stash customer name/phone in notes so support can read it directly from
    // the Razorpay dashboard without joining our DB. Razorpay caps notes at
    // ~256 chars per value; truncate defensively.
    const customerName = (order.shippingAddress?.name ?? '').slice(0, 100);
    const customerPhone = (order.shippingAddress?.phone ?? '').slice(0, 20);

    const razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        orderId,
        userId,
        orderNumber: order.orderNumber,
        ...(customerName ? { customerName } : {}),
        ...(customerPhone ? { customerPhone } : {}),
      },
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

    // Fetch the payment from Razorpay to confirm it is actually captured and
    // that the order_id on the Razorpay side matches what the client sent.
    // Signature alone only proves the two IDs belong together; it does not
    // confirm the payment was captured (vs. just authorized) or that the
    // amount matches the order amount stored in our DB.
    const razorpay = this.getRazorpayOrThrow();
    let rzpPayment: RazorpayFetchedPayment;
    try {
      rzpPayment = await razorpay.payments.fetch(data.razorpay_payment_id);
    } catch (err) {
      throw new BadRequestException('Could not verify payment with gateway');
    }

    if (rzpPayment.order_id !== data.razorpay_order_id) {
      throw new BadRequestException('Payment does not belong to this order');
    }
    if (rzpPayment.status !== 'captured' && rzpPayment.status !== 'authorized') {
      throw new BadRequestException(`Payment not captured (status: ${rzpPayment.status})`);
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

      // Verify that the captured amount matches what we expect for this order.
      const expectedPaise =
        typeof order?.paymentGatewayAmount === 'number' && order.paymentGatewayAmount > 0
          ? order.paymentGatewayAmount
          : Math.round((order?.total ?? 0) * 100);
      if (expectedPaise > 0 && rzpPayment.amount !== expectedPaise) {
        this.logger.error(
          `Amount mismatch on verifyPayment: expected=${expectedPaise} captured=${rzpPayment.amount} order=${order?._id?.toString()}`,
        );
        throw new BadRequestException('Payment amount does not match order amount');
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

    if (order.status === 'refunded' || order.paymentStatus === 'refunded') {
      throw new BadRequestException('This order has been refunded');
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
      customerName: order.shippingAddress?.name,
      customerPhone: order.shippingAddress?.phone,
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
      this.logger.warn('RAZORPAY_WEBHOOK_SECRET not set — skipping signature verification');
    } else {
      const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(input.rawBody, 'utf8')
        .digest('hex');

      if (expected !== input.signature) {
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    const evt = input.body as RazorpayWebhookEvent;
    const event = evt.event;
    if (!event) {
      return { received: true };
    }

    const paymentEntity = evt.payload?.payment?.entity;
    const refundEntity = evt.payload?.refund?.entity;
    const disputeEntity = evt.payload?.dispute?.entity;

    if (event === 'payment.captured' && paymentEntity?.order_id) {
      await this.handlePaymentCaptured(paymentEntity);
    } else if (event === 'payment.failed' && paymentEntity?.order_id) {
      await this.handlePaymentFailed(paymentEntity);
    } else if (
      (event === 'refund.created' || event === 'refund.processed' || event === 'refund.failed') &&
      refundEntity?.payment_id
    ) {
      await this.handleRefundEvent(event, refundEntity);
    } else if (event === 'payment.dispute.created' && disputeEntity?.payment_id) {
      await this.handleDisputeCreated(disputeEntity);
    }

    return { received: true };
  }

  private async handlePaymentCaptured(entity: RazorpayWebhookPaymentEntity): Promise<void> {
    const razorpayPaymentId = entity.id;
    const razorpayOrderId = entity.order_id;

    // Replay protection: if we've already processed this payment id, skip safely.
    const existingByPaymentId =
      razorpayPaymentId && razorpayPaymentId.trim()
        ? await this.paymentRepository.findOneByGatewayPaymentId(razorpayPaymentId)
        : null;
    if (existingByPaymentId && existingByPaymentId.status === 'success') {
      return;
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
        if (order) {
          const amountPaise =
            typeof order.paymentGatewayAmount === 'number' && order.paymentGatewayAmount > 0
              ? order.paymentGatewayAmount
              : Math.round(order.total * 100);
          // Always record the payment row so the captured money is traceable —
          // even if the order is cancelled/refunded (in which case we trigger
          // an automatic refund below).
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
          if (order.status === 'cancelled' || order.status === 'refunded' || order.paymentStatus === 'refunded') {
            await this.autoRefundOrphanCapture(razorpayPaymentId, entity.amount, notedOrderId, order.status);
          } else if (order.paymentStatus !== 'paid') {
            await this.ordersService.recordRazorpayPaymentApplied(
              notedOrderId,
              'Payment received (webhook)',
            );
          }
        }
      }
      return;
    }

    const order = await this.orderRepository.findById(payment.order);
    if (!order) {
      return;
    }
    if (order.status === 'cancelled' || order.status === 'refunded' || order.paymentStatus === 'refunded') {
      await this.autoRefundOrphanCapture(
        razorpayPaymentId,
        entity.amount,
        payment.order.toString(),
        order.status,
      );
      return;
    }
    if (order.paymentStatus !== 'paid') {
      await this.ordersService.recordRazorpayPaymentApplied(
        payment.order.toString(),
        'Payment received (webhook)',
      );
    }
  }

  /**
   * Money was captured at Razorpay AFTER the order was cancelled or refunded
   * (admin cancel race, or stale pay-link reused). Issue an automatic Razorpay
   * refund so the customer is made whole. If the refund call itself fails,
   * log loudly so an operator can resolve manually — never silently swallow it.
   */
  private async autoRefundOrphanCapture(
    razorpayPaymentId: string,
    amountPaise: number | undefined,
    orderId: string,
    orderStatus: string,
  ): Promise<void> {
    this.logger.error(
      `🚨 ORPHAN CAPTURE: payment ${razorpayPaymentId} captured AFTER order ${orderId} reached status=${orderStatus}. Auto-refunding.`,
    );

    if (!razorpayPaymentId || !amountPaise || amountPaise <= 0) {
      this.logger.error(
        `Cannot auto-refund orphan capture for order ${orderId}: missing paymentId or amount (paymentId=${razorpayPaymentId}, amount=${amountPaise})`,
      );
      return;
    }

    const razorpay = this.razorpay;
    if (!razorpay) {
      this.logger.error(
        `Cannot auto-refund orphan capture for order ${orderId}: Razorpay client not initialized`,
      );
      return;
    }

    try {
      const refund = await razorpay.payments.refund(razorpayPaymentId, {
        amount: amountPaise,
        notes: { reason: `Order ${orderStatus} before capture - auto-refund` },
      });
      const payment = await this.paymentRepository.findOneByGatewayPaymentId(razorpayPaymentId);
      if (payment) {
        await this.paymentRepository.findByIdAndUpdateDoc(payment._id, {
          status: 'refunded',
          refundId: refund.id,
          refundAmount: amountPaise / 100,
          refundedAt: new Date(),
          refundReason: `Auto-refund: order was ${orderStatus} before capture`,
        });
      }
      this.logger.log(
        `Auto-refund issued: payment=${razorpayPaymentId} refund=${refund.id} order=${orderId}`,
      );
    } catch (err) {
      this.logger.error(
        `Auto-refund FAILED for orphan capture: payment=${razorpayPaymentId} order=${orderId} — manual intervention required`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async handlePaymentFailed(entity: RazorpayWebhookPaymentEntity): Promise<void> {
    const razorpayOrderId = entity.order_id;
    const razorpayPaymentId = entity.id;

    // Razorpay can deliver payment.failed out-of-order during retries.
    // - If the payment is already success/refunded, a late `failed` would
    //   wrongly flip a paid order back to failed.
    // - If we've already recorded the same paymentId as `failed`, a duplicate
    //   delivery would just rewrite the same row — skip the no-op.
    if (razorpayPaymentId && razorpayPaymentId.trim()) {
      const existingByPaymentId = await this.paymentRepository.findOneByGatewayPaymentId(razorpayPaymentId);
      if (
        existingByPaymentId &&
        (existingByPaymentId.status === 'success' ||
          existingByPaymentId.status === 'refunded' ||
          existingByPaymentId.status === 'failed')
      ) {
        if (existingByPaymentId.status !== 'failed') {
          this.logger.warn(
            `Ignoring late payment.failed for ${razorpayPaymentId}: payment already ${existingByPaymentId.status}`,
          );
        }
        return;
      }
    }
    const existingByOrderId = await this.paymentRepository.findOneByGatewayOrderId(razorpayOrderId);
    if (existingByOrderId && (existingByOrderId.status === 'success' || existingByOrderId.status === 'refunded')) {
      this.logger.warn(
        `Ignoring late payment.failed for order ${razorpayOrderId}: payment already ${existingByOrderId.status}`,
      );
      return;
    }

    await this.paymentRepository.findOneAndUpdateByGatewayOrderId(razorpayOrderId, {
      status: 'failed',
      gatewayPaymentId: razorpayPaymentId,
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

  private async handleRefundEvent(
    event: 'refund.created' | 'refund.processed' | 'refund.failed',
    entity: RazorpayWebhookRefundEntity,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOneByGatewayPaymentId(entity.payment_id);
    if (!payment) {
      this.logger.warn(`Refund webhook ${event} for unknown payment ${entity.payment_id} (refund ${entity.id})`);
      return;
    }

    // Two refunds against the same payment isn't supported in this codebase.
    // If we see a different refundId arrive, log and skip rather than overwrite.
    if (payment.refundId && payment.refundId !== entity.id) {
      this.logger.warn(
        `Ignoring ${event}: payment ${entity.payment_id} already has refund ${payment.refundId}, incoming ${entity.id}`,
      );
      return;
    }

    const amountInRupees = entity.amount / 100;

    if (event === 'refund.created') {
      // Replay protection: refund.created may arrive after admin path already wrote refundId.
      if (payment.refundId === entity.id && payment.status === 'refunded') {
        return;
      }
      await this.paymentRepository.findByIdAndUpdateDoc(payment._id, {
        status: 'refunded',
        refundId: entity.id,
        refundAmount: amountInRupees,
        refundedAt: payment.refundedAt ?? new Date(),
        gatewayResponse: entity,
      });
      await this.ordersService.recordRefundOnOrder(payment.order.toString(), amountInRupees);
      return;
    }

    if (event === 'refund.processed') {
      // Replay protection: skip if already settled.
      if (payment.refundProcessedAt) {
        return;
      }
      await this.paymentRepository.findByIdAndUpdateDoc(payment._id, {
        status: 'refunded',
        refundId: entity.id,
        refundAmount: amountInRupees,
        refundedAt: payment.refundedAt ?? new Date(),
        refundProcessedAt: new Date(),
        gatewayResponse: entity,
      });
      // Idempotent — order may already be marked refunded by refund.created or admin path.
      await this.ordersService.recordRefundOnOrder(payment.order.toString(), amountInRupees);
      return;
    }

    if (event === 'refund.failed') {
      if (payment.refundFailedAt) {
        return;
      }
      this.logger.error(
        `Refund FAILED at bank: payment=${entity.payment_id} refund=${entity.id} reason=${entity.error_description ?? 'unknown'}`,
      );
      // Don't auto-revert order status — admin must inspect and decide whether to retry
      // or settle out-of-band. We just mark the payment row so the failure is visible.
      await this.paymentRepository.findByIdAndUpdateDoc(payment._id, {
        refundFailedAt: new Date(),
        refundFailureReason: entity.error_description ?? 'Refund failed at bank',
        gatewayResponse: entity,
      });
    }
  }

  private async handleDisputeCreated(entity: RazorpayWebhookDisputeEntity): Promise<void> {
    const payment = await this.paymentRepository.findOneByGatewayPaymentId(entity.payment_id);
    if (!payment) {
      this.logger.error(
        `Dispute received for unknown payment ${entity.payment_id} (dispute ${entity.id}) — cannot link to an order`,
      );
      return;
    }

    if (payment.disputeId === entity.id) {
      return;
    }

    // Chargebacks have hard deadlines (typically ~7 days) — log loudly so it
    // shows up in alerting before it auto-debits.
    this.logger.error(
      `🚨 DISPUTE OPENED: payment=${entity.payment_id} order=${payment.order.toString()} ` +
        `disputeId=${entity.id} amount=₹${entity.amount / 100} ` +
        `reason=${entity.reason_code ?? 'n/a'} phase=${entity.phase ?? 'n/a'}`,
    );

    await this.paymentRepository.findByIdAndUpdateDoc(payment._id, {
      disputeId: entity.id,
      disputeStatus: entity.status ?? 'open',
      disputeAmount: entity.amount,
      disputeReasonCode: entity.reason_code ?? '',
      disputePhase: entity.phase ?? '',
      disputeRaisedAt: new Date(),
    });
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

    // Block partial refunds on orders that used wallet credit. The wallet+gateway
    // split is fixed at order time; a partial refund can't be cleanly attributed
    // to one source, so the wallet portion would silently be lost. Force admins
    // to issue a full refund (which restores wallet) instead.
    if (typeof amount === 'number' && amount > 0 && amount < payment.amount) {
      const orderForGuard = await this.orderRepository.findById(orderIdObj);
      if (orderForGuard && typeof orderForGuard.walletUsed === 'number' && orderForGuard.walletUsed > 0) {
        throw new BadRequestException(
          'Partial refund not supported on orders that used wallet credit. Issue a full refund instead.',
        );
      }
    }

    if (typeof amount === 'number' && amount > payment.amount) {
      throw new BadRequestException(
        `Refund amount (₹${amount}) exceeds captured amount (₹${payment.amount})`,
      );
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

type RazorpayFetchedPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
};

type RazorpayClient = {
  orders: {
    create(input: {
      amount: number;
      currency: 'INR';
      receipt: string;
      notes: Record<string, string>;
    }): Promise<RazorpayOrderCreateResult>;
  };
  payments: {
    fetch(paymentId: string): Promise<RazorpayFetchedPayment>;
    refund(
      paymentId: string,
      input: { amount: number; notes: { reason: string } },
    ): Promise<{ id: string }>;
  };
};

type RazorpayWebhookPaymentEntity = {
  id: string;
  order_id: string;
  amount?: number;
  error_description?: string;
  notes?: { orderId?: string; userId?: string };
};

type RazorpayWebhookRefundEntity = {
  id: string;
  payment_id: string;
  amount: number;
  status?: string;
  error_description?: string;
};

type RazorpayWebhookDisputeEntity = {
  id: string;
  payment_id: string;
  amount: number;
  status?: string;
  reason_code?: string;
  phase?: string;
};

type RazorpayWebhookEvent = {
  event:
    | 'payment.captured'
    | 'payment.failed'
    | 'refund.created'
    | 'refund.processed'
    | 'refund.failed'
    | 'payment.dispute.created'
    | string;
  payload?: {
    payment?: {
      entity?: RazorpayWebhookPaymentEntity;
    };
    refund?: {
      entity?: RazorpayWebhookRefundEntity;
    };
    dispute?: {
      entity?: RazorpayWebhookDisputeEntity;
    };
  };
};
