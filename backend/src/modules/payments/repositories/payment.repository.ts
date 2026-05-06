import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentDocument, PaymentGateway, TransactionStatus } from '../schemas/payment.schema';
import { BaseRepository } from '../../../common/repository/base.repository';
import { parseObjectId } from '../../../common/utils/objectid.util';

@Injectable()
export class PaymentRepository extends BaseRepository<PaymentDocument> {
  constructor(
    @InjectModel(Payment.name) model: Model<PaymentDocument>,
  ) {
    super(model);
  }

  async createOne(data: {
    order: Types.ObjectId;
    user: Types.ObjectId;
    amount: number;
    gateway: PaymentGateway;
    status: TransactionStatus;
    gatewayOrderId: string;
  }): Promise<PaymentDocument> {
    return this.create({
      order: data.order,
      user: data.user,
      amount: data.amount,
      gateway: data.gateway,
      status: data.status,
      gatewayOrderId: data.gatewayOrderId,
    } as Partial<PaymentDocument>);
  }

  async findOneByGatewayOrderId(gatewayOrderId: string): Promise<PaymentDocument | null> {
    return this.model.findOne({ gatewayOrderId }).exec();
  }

  async findOneByGatewayPaymentId(gatewayPaymentId: string): Promise<PaymentDocument | null> {
    return this.model.findOne({ gatewayPaymentId }).exec();
  }

  async findOneAndUpdateByGatewayOrderId(
    gatewayOrderId: string,
    update: Record<string, unknown>,
  ): Promise<PaymentDocument | null> {
    return this.model
      .findOneAndUpdate({ gatewayOrderId }, update, { new: true })
      .exec();
  }

  async findOneByOrder(orderId: Types.ObjectId): Promise<PaymentDocument | null> {
    return this.model.findOne({ order: orderId }).sort({ createdAt: -1 }).exec();
  }

  /**
   * Find the most recent `initiated` Razorpay payment row for an order that
   * was created within `withinMs`. Used to reuse an existing Razorpay order
   * id when a customer reopens the pay page within the freshness window —
   * avoids creating a fresh Razorpay order on every retry.
   */
  async findRecentInitiatedForOrder(
    orderId: Types.ObjectId,
    withinMs: number,
  ): Promise<PaymentDocument | null> {
    const cutoff = new Date(Date.now() - withinMs);
    return this.model
      .findOne({
        order: orderId,
        gateway: 'razorpay',
        status: 'initiated',
        gatewayOrderId: { $exists: true, $ne: null },
        createdAt: { $gte: cutoff },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOneByOrderAndStatus(
    orderId: Types.ObjectId,
    status: string,
  ): Promise<PaymentDocument | null> {
    return this.model.findOne({ order: orderId, status }).exec();
  }

  async findByIdAndUpdateDoc(
    id: Types.ObjectId,
    update: Record<string, unknown>,
  ): Promise<PaymentDocument | null> {
    return this.model.findByIdAndUpdate(id, update, { new: true }).exec();
  }
}
