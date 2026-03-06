import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentDocument } from '../schemas/payment.schema';
import { BaseRepository } from '@/common/repository/base.repository';
import { parseObjectId } from '@/common/utils/objectid.util';

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
    gateway: string;
    status: string;
    gatewayOrderId: string;
  }): Promise<PaymentDocument> {
    return this.create(data as Partial<PaymentDocument>);
  }

  async findOneByGatewayOrderId(gatewayOrderId: string): Promise<PaymentDocument | null> {
    return this.model.findOne({ gatewayOrderId }).exec();
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
