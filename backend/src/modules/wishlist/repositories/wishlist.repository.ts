import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wishlist, WishlistDocument } from '../schemas/wishlist.schema';
import { BaseRepository } from '@/common/repository/base.repository';

@Injectable()
export class WishlistRepository extends BaseRepository<WishlistDocument> {
  constructor(
    @InjectModel(Wishlist.name) model: Model<WishlistDocument>,
  ) {
    super(model);
  }

  async findOneByUser(userId: Types.ObjectId): Promise<WishlistDocument | null> {
    return this.model.findOne({ user: userId }).exec();
  }
}

