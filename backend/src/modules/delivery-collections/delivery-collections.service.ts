import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { AdminUser, AdminUserDocument } from '../admin/schemas/admin-user.schema';
import { GetLedgerDto, SettleCollectionDto } from './dto/delivery-collections.dto';

@Injectable()
export class DeliveryCollectionsService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUserDocument>,
  ) {}

  async getLedger(dto: GetLedgerDto) {
    const { startDate, endDate, deliveryUserId } = dto;

    const start = startDate ? new Date(startDate) : (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d;
    })();
    const end = endDate ? new Date(endDate) : (() => {
      const d = new Date(); d.setHours(23, 59, 59, 999); return d;
    })();

    const match: Record<string, unknown> = {
      status: 'delivered',
      deliveredAt: { $gte: start, $lte: end },
      assignedDeliveryUserId: { $exists: true, $ne: null },
    };
    if (deliveryUserId) match.assignedDeliveryUserId = deliveryUserId;

    const rows = await this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$assignedDeliveryUserId',
          totalOrders: { $sum: 1 },
          totalCashCollected: {
            $sum: {
              $cond: [{ $in: ['$paymentMethod', ['cash', 'cod']] }, { $ifNull: ['$amountCollected', 0] }, 0],
            },
          },
          totalUpiCollected: {
            $sum: {
              $cond: [{ $eq: ['$paymentMethod', 'upi'] }, { $ifNull: ['$amountCollected', 0] }, 0],
            },
          },
          pendingCash: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$paymentMethod', ['cash', 'cod']] },
                    { $ne: ['$collectionStatus', 'settled'] },
                  ],
                },
                { $ifNull: ['$amountCollected', 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    // Fetch all-time outstanding per delivery boy (not date-filtered)
    const outstandingRows = await this.orderModel.aggregate([
      {
        $match: {
          status: 'delivered',
          assignedDeliveryUserId: { $exists: true, $ne: null },
          paymentMethod: { $in: ['cash', 'cod'] },
          collectionStatus: { $ne: 'settled' },
          amountCollected: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: '$assignedDeliveryUserId',
          totalOutstanding: { $sum: '$amountCollected' },
        },
      },
    ]);

    const outstandingMap = new Map(outstandingRows.map((r) => [r._id, r.totalOutstanding]));

    const userIds = rows.map((r) => r._id).filter(Boolean);
    const users = userIds.length
      ? await this.adminUserModel.find({ _id: { $in: userIds } }, 'name email').lean()
      : [];
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    return rows.map((r) => ({
      deliveryUserId: r._id,
      name: userMap.get(r._id)?.name ?? r._id,
      email: userMap.get(r._id)?.email,
      totalOrders: r.totalOrders,
      totalCashCollected: r.totalCashCollected,
      totalUpiCollected: r.totalUpiCollected,
      pendingCashInPeriod: r.pendingCash,
      totalOutstandingAllTime: outstandingMap.get(r._id) ?? 0,
    }));
  }

  async getLedgerSummary(startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d;
    })();
    const end = endDate ? new Date(endDate) : (() => {
      const d = new Date(); d.setHours(23, 59, 59, 999); return d;
    })();

    const [result] = await this.orderModel.aggregate([
      { $match: { status: 'delivered', deliveredAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalCash: {
            $sum: {
              $cond: [{ $in: ['$paymentMethod', ['cash', 'cod']] }, { $ifNull: ['$amountCollected', 0] }, 0],
            },
          },
          totalUpi: {
            $sum: {
              $cond: [{ $eq: ['$paymentMethod', 'upi'] }, { $ifNull: ['$amountCollected', 0] }, 0],
            },
          },
        },
      },
    ]);

    const [outstanding] = await this.orderModel.aggregate([
      {
        $match: {
          status: 'delivered',
          paymentMethod: { $in: ['cash', 'cod'] },
          collectionStatus: { $ne: 'settled' },
          amountCollected: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$amountCollected' } } },
    ]);

    return {
      totalCashToday: result?.totalCash ?? 0,
      totalUpiToday: result?.totalUpi ?? 0,
      totalOutstandingAllTime: outstanding?.total ?? 0,
    };
  }

  async getBreakdown(deliveryUserId: string, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d;
    })();
    const end = endDate ? new Date(endDate) : (() => {
      const d = new Date(); d.setHours(23, 59, 59, 999); return d;
    })();

    const orders = await this.orderModel
      .find({
        status: 'delivered',
        assignedDeliveryUserId: deliveryUserId,
        deliveredAt: { $gte: start, $lte: end },
      })
      .select('orderNumber shippingAddress total amountCollected paymentMethod collectionStatus deliveredAt paymentProofUrl deliveryProofUrl collectionStatus settledAt')
      .sort({ deliveredAt: -1 })
      .lean();

    return orders;
  }

  async settle(dto: SettleCollectionDto, adminId: string) {
    const objectIds = dto.orderIds.map((id) => new Types.ObjectId(id));

    const result = await this.orderModel.updateMany(
      { _id: { $in: objectIds }, collectionStatus: { $ne: 'settled' } },
      {
        $set: {
          collectionStatus: 'settled',
          settledAt: new Date(),
          settledBy: adminId,
        },
      },
    );

    return { settled: result.modifiedCount };
  }

  async getPendingOrdersForUser(deliveryUserId: string) {
    return this.orderModel
      .find({
        assignedDeliveryUserId: deliveryUserId,
        status: 'delivered',
        paymentMethod: { $in: ['cash', 'cod'] },
        collectionStatus: { $ne: 'settled' },
        amountCollected: { $gt: 0 },
      })
      .select('orderNumber shippingAddress total amountCollected paymentMethod deliveredAt paymentProofUrl collectionStatus')
      .sort({ deliveredAt: -1 })
      .lean();
  }
}
