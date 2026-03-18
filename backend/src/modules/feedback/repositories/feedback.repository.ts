import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Feedback, FeedbackDocument } from '../schemas/feedback.schema';
import { BaseRepository } from '../../../common/repository/base.repository';
import { paginate } from '../../../common/types/pagination.types';
import { FeedbackQueryDto } from '../dto/feedback.dto';
import { parseObjectId, isValidObjectIdString } from '../../../common/utils/objectid.util';

@Injectable()
export class FeedbackRepository extends BaseRepository<FeedbackDocument> {
  constructor(
    @InjectModel(Feedback.name) model: Model<FeedbackDocument>,
  ) {
    super(model);
  }

  async findAllPaginated(query: FeedbackQueryDto) {
    const { page = 1, limit = 20, type, status, productId } = query;
    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (isValidObjectIdString(productId)) filter.product = parseObjectId(productId, 'productId');

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .populate('user', 'name phone email')
        .populate('product', 'name slug')
        .populate('order', 'orderNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter),
    ]);

    return paginate(items, total, { page, limit });
  }

  async findByIdWithPopulate(id: Types.ObjectId): Promise<FeedbackDocument | null> {
    return this.model
      .findById(id)
      .populate('user', 'name phone email')
      .populate('product', 'name slug')
      .populate('order', 'orderNumber')
      .exec();
  }

  async findPublicReviewsByProduct(productId: Types.ObjectId): Promise<unknown[]> {
    return this.model
      .find({
        product: productId,
        isPublic: true,
        type: 'product_review',
      })
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findUserFeedback(userId: Types.ObjectId): Promise<unknown[]> {
    return this.model
      .find({ user: userId })
      .populate('product', 'name slug')
      .populate('order', 'orderNumber')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}
