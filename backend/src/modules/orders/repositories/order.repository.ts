import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession, PipelineStage } from 'mongoose';
import { ORDER_STATUSES_PENDING_FULFILLMENT } from '../../../common/constants/order-status';
import { Order, OrderDocument, OrderStatus } from '../schemas/order.schema';
import { BaseRepository } from '../../../common/repository/base.repository';
import { OrderQueryDto } from '../dto/order.dto';
import { PaginatedResult, paginate } from '../../../common/types/pagination.types';
import { buildCreatedAtFilter, buildSearchOrFilter } from '../../../common/utils/query.util';
import { parseObjectId, isValidObjectIdString } from '../../../common/utils/objectid.util';

@Injectable()
export class OrderRepository extends BaseRepository<OrderDocument> {
  constructor(
    @InjectModel(Order.name) model: Model<OrderDocument>,
  ) {
    super(model);
  }

  async createWithSession(
    data: Partial<Order>,
    session: ClientSession,
  ): Promise<OrderDocument> {
    const doc = new this.model(data);
    return doc.save({ session });
  }

  /**
   * Counts orders the user has placed (excluding cancelled). Used to enforce
   * coupon `isFirstOrderOnly` rules at coupon-validation time.
   */
  async countNonCancelledOrdersByUser(userId: string): Promise<number> {
    if (!isValidObjectIdString(userId)) return 0;
    return this.model.countDocuments({
      user: parseObjectId(userId, 'userId'),
      status: { $ne: 'cancelled' },
    }).exec();
  }

  /**
   * Counts how many times this user has redeemed a specific coupon code on
   * non-cancelled orders. Case-insensitive (legacy records may not be
   * normalized to uppercase).
   */
  async countCouponUsesByUser(userId: string, couponCode: string): Promise<number> {
    if (!isValidObjectIdString(userId) || !couponCode) return 0;
    const escaped = couponCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.model.countDocuments({
      user: parseObjectId(userId, 'userId'),
      couponCode: { $regex: `^${escaped}$`, $options: 'i' },
      status: { $ne: 'cancelled' },
    }).exec();
  }

  async findAllPaginated(query: OrderQueryDto): Promise<PaginatedResult<Order>> {
    const {
      page = 1,
      limit = 20,
      userId,
      status,
      paymentStatus,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      forPacking,
      forBilling,
      forDelivery,
    } = query;
    const filter: Record<string, unknown> = {};
    if (isValidObjectIdString(userId)) {
      filter.user = parseObjectId(userId, 'userId');
    }
    if (forPacking) {
      filter.$or = [
        { status: { $in: ['placed', 'confirmed'] } },
        {
          status: 'preparing',
          $or: [{ packedAt: null }, { packedAt: { $exists: false } }],
        },
      ];
    } else if (forBilling) {
      filter.status = 'preparing';
      filter.packedAt = { $ne: null };
    } else if (forDelivery) {
      filter.status = 'out_for_delivery';
    } else if (status) {
      filter.status = status;
    }
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    const searchOr = buildSearchOrFilter(search, ['orderNumber', 'shippingAddress.name', 'shippingAddress.phone']);
    if (searchOr.length) filter.$or = searchOr;
    const createdAtFilter = buildCreatedAtFilter(startDate, endDate);
    if (createdAtFilter) filter.createdAt = createdAtFilter;
    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    const [orders, total] = await Promise.all([
      this.model
        .find(filter)
        .populate('user', 'phone name email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter),
    ]);
    return paginate(orders, total, { page, limit });
  }

  async findByIdWithUserAndItems(id: Types.ObjectId): Promise<OrderDocument | null> {
    return this.model
      .findById(id)
      .populate('user', 'phone name email addresses')
      .populate('items.product', 'name slug images')
      .exec();
  }

  async findOneByOrderNumber(orderNumber: string): Promise<OrderDocument | null> {
    return this.model.findOne({ orderNumber }).populate('user', 'phone name email').exec();
  }

  async findUserOrders(userId: Types.ObjectId, limit: number): Promise<OrderDocument[]> {
    return this.model.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).exec();
  }

  /**
   * Like findUserOrders but excludes cancelled orders. Used by the chatbot's
   * recent-order cooldown so a customer who just cancelled isn't blocked from
   * placing a fresh order by the cooldown popup.
   */
  async findUserOrdersExcludingCancelled(
    userId: Types.ObjectId,
    limit: number,
  ): Promise<OrderDocument[]> {
    return this.model
      .find({ user: userId, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findOneByOrderNumberPrefix(prefix: string): Promise<OrderDocument | null> {
    return this.model
      .findOne({ orderNumber: { $regex: `^${prefix}` } })
      .sort({ orderNumber: -1 })
      .exec();
  }

  async getOrderStats(startDate?: Date, endDate?: Date): Promise<Record<string, unknown>> {
    const matchStage: Record<string, unknown> = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) {
        (matchStage.createdAt as Record<string, Date>).$gte = startDate;
      }
      if (endDate) {
        (matchStage.createdAt as Record<string, Date>).$lte = endDate;
      }
    }
    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          avgOrderValue: { $avg: '$total' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          pendingOrders: {
            $sum: {
              $cond: [
                { $in: ['$status', [...ORDER_STATUSES_PENDING_FULFILLMENT]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ];
    const stats = await this.aggregate<Record<string, unknown>>(pipeline);
    return stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      pendingOrders: 0,
    };
  }

  async getOrdersByStatus(): Promise<Record<OrderStatus, number>> {
    const result = await this.aggregate<{ _id: OrderStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const statusCounts: Partial<Record<OrderStatus, number>> = {};
    result.forEach((item) => {
      statusCounts[item._id] = item.count;
    });
    return statusCounts as Record<OrderStatus, number>;
  }

  async findByUserIdAndIdempotencyKey(
    userId: Types.ObjectId,
    idempotencyKey: string,
  ): Promise<OrderDocument | null> {
    return this.model
      .findOne({ user: userId, 'metadata.idempotencyKey': idempotencyKey })
      .exec();
  }

  /** One-time migration: legacy status strings → Phase 1 canonical values. */
  async migrateLegacyOrderStatuses(): Promise<number> {
    let n = 0;
    const rShipped = await this.model
      .updateMany({ status: 'shipped' }, { $set: { status: 'out_for_delivery' } })
      .exec();
    n += rShipped.modifiedCount ?? 0;
    const rPlaced = await this.model
      .updateMany({ status: 'pending' }, { $set: { status: 'placed' } })
      .exec();
    n += rPlaced.modifiedCount ?? 0;
    const rPrep = await this.model
      .updateMany({ status: 'processing' }, { $set: { status: 'preparing' } })
      .exec();
    n += rPrep.modifiedCount ?? 0;
    return n;
  }

  /** Normalize historical timeline.status values to match current OrderStatus vocabulary. */
  async migrateTimelineEntryStatuses(): Promise<number> {
    const res = await this.model.collection.updateMany(
      {
        $or: [
          { 'timeline.status': 'pending' },
          { 'timeline.status': 'processing' },
          { 'timeline.status': 'shipped' },
        ],
      },
      [
        {
          $set: {
            timeline: {
              $map: {
                input: { $ifNull: ['$timeline', []] },
                as: 't',
                in: {
                  $mergeObjects: [
                    '$$t',
                    {
                      status: {
                        $switch: {
                          branches: [
                            { case: { $eq: ['$$t.status', 'pending'] }, then: 'placed' },
                            { case: { $eq: ['$$t.status', 'processing'] }, then: 'preparing' },
                            { case: { $eq: ['$$t.status', 'shipped'] }, then: 'out_for_delivery' },
                          ],
                          default: '$$t.status',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    );
    return res.modifiedCount ?? 0;
  }

  /**
   * Find orders that were delivered between the min/max age window and haven't had
   * a feedback request sent yet. Used by the post-delivery feedback cron.
   */
  async findDeliveredPendingFeedback(input: {
    olderThan: Date;
    newerThan: Date;
    limit: number;
  }): Promise<OrderDocument[]> {
    return this.model
      .find({
        status: 'delivered',
        deliveredAt: { $gte: input.newerThan, $lte: input.olderThan },
        feedbackRequestedAt: { $exists: false },
      })
      .limit(input.limit)
      .exec();
  }

  async markFeedbackRequested(orderId: Types.ObjectId): Promise<void> {
    await this.model
      .updateOne({ _id: orderId }, { $set: { feedbackRequestedAt: new Date() } })
      .exec();
  }
}
