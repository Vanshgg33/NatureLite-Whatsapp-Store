import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument } from '../schemas/cart.schema';
import { BaseRepository } from '../../../common/repository/base.repository';

@Injectable()
export class CartRepository extends BaseRepository<CartDocument> {
  constructor(
    @InjectModel(Cart.name) model: Model<CartDocument>,
  ) {
    super(model);
  }

  async findOneByUser(userId: Types.ObjectId): Promise<CartDocument | null> {
    return this.model.findOne({ user: userId }).exec();
  }

  async findOneByIdAndUser(cartId: Types.ObjectId, userId: Types.ObjectId): Promise<CartDocument | null> {
    return this.model.findOne({ _id: cartId, user: userId }).exec();
  }

  async pullProductFromAllCarts(productId: Types.ObjectId): Promise<void> {
    await this.model.updateMany(
      { 'items.product': productId },
      { $pull: { items: { product: productId } } },
    ).exec();
  }

  async findAbandonedCarts(
    cutoffTime: Date,
    limit: number,
  ): Promise<CartDocument[]> {
    return this.model
      .find({
        updatedAt: { $lt: cutoffTime },
        abandonedAt: { $exists: false },
        abandonedReminderCount: { $lt: 2 },
        $or: [
          { abandonedLastReminderAt: { $exists: false } },
          { abandonedLastReminderAt: { $lt: cutoffTime } },
        ],
        'items.0': { $exists: true },
      })
      .populate('user', 'phone name isBlocked')
      .limit(limit)
      .exec();
  }
}
