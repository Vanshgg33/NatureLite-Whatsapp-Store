import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Feedback, FeedbackDocument } from './schemas/feedback.schema';
import {
  CreateFeedbackDto,
  RespondToFeedbackDto,
  UpdateFeedbackStatusDto,
  FeedbackQueryDto,
} from './dto/feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel(Feedback.name) private feedbackModel: Model<FeedbackDocument>,
  ) {}

  async create(userId: string, dto: CreateFeedbackDto): Promise<Feedback> {
    const feedback = new this.feedbackModel({
      user: new Types.ObjectId(userId),
      type: dto.type,
      order: dto.orderId ? new Types.ObjectId(dto.orderId) : undefined,
      product: dto.productId ? new Types.ObjectId(dto.productId) : undefined,
      rating: dto.rating,
      message: dto.message,
      images: dto.images || [],
      isPublic: dto.type === 'product_review',
    });

    return feedback.save();
  }

  async findAll(query: FeedbackQueryDto) {
    const { page = 1, limit = 20, type, status, productId } = query;
    const filter: Record<string, any> = {};

    if (type) filter.type = type;
    if (status) filter.status = status;
    if (productId) filter.product = new Types.ObjectId(productId);

    const [items, total] = await Promise.all([
      this.feedbackModel
        .find(filter)
        .populate('user', 'name phone email')
        .populate('product', 'name slug')
        .populate('order', 'orderNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.feedbackModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrevious: page > 1,
    };
  }

  async findById(id: string): Promise<Feedback> {
    const feedback = await this.feedbackModel
      .findById(id)
      .populate('user', 'name phone email')
      .populate('product', 'name slug')
      .populate('order', 'orderNumber');

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    return feedback;
  }

  async getPublicReviews(productId: string) {
    return this.feedbackModel
      .find({
        product: new Types.ObjectId(productId),
        isPublic: true,
        type: 'product_review',
      })
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .lean();
  }

  async respond(id: string, dto: RespondToFeedbackDto, adminId: string): Promise<Feedback> {
    const feedback = await this.feedbackModel.findById(id);

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    feedback.adminResponse = dto.response;
    feedback.respondedAt = new Date();
    feedback.respondedBy = adminId;
    if (feedback.status === 'pending') {
      feedback.status = 'acknowledged';
    }

    return feedback.save();
  }

  async updateStatus(id: string, dto: UpdateFeedbackStatusDto): Promise<Feedback> {
    const feedback = await this.feedbackModel.findByIdAndUpdate(
      id,
      { status: dto.status },
      { new: true },
    );

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    return feedback;
  }

  async findUserFeedback(userId: string) {
    return this.feedbackModel
      .find({ user: new Types.ObjectId(userId) })
      .populate('product', 'name slug')
      .populate('order', 'orderNumber')
      .sort({ createdAt: -1 })
      .lean();
  }
}
