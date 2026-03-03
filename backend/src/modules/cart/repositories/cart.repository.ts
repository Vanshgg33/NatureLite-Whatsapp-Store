import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument } from '../schemas/cart.schema';
import { BaseRepository } from '@/common/repository/base.repository';

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

  async findAbandonedCarts(
    cutoffTime: Date,
    limit: number,
  ): Promise<CartDocument[]> {
    return this.model
      .find({
        updatedAt: { $lt: cutoffTime },
        abandonedAt: { $exists: false },
        abandonedReminderSent: false,
        'items.0': { $exists: true },
      })
      .populate('user', 'phone name')
      .limit(limit)
      .exec();
  }
}
