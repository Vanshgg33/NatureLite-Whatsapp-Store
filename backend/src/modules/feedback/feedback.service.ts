import { Injectable, NotFoundException } from '@nestjs/common';
import { Feedback } from './schemas/feedback.schema';
import { FeedbackRepository } from './repositories/feedback.repository';
import {
  CreateFeedbackDto,
  RespondToFeedbackDto,
  UpdateFeedbackStatusDto,
  FeedbackQueryDto,
} from './dto/feedback.dto';
import { parseObjectIdOptional, parseObjectId } from '@/common/utils/objectid.util';

@Injectable()
export class FeedbackService {
  constructor(private readonly feedbackRepository: FeedbackRepository) {}

  async create(userId: string, dto: CreateFeedbackDto): Promise<Feedback> {
    const data = {
      user: parseObjectId(userId, 'userId'),
      type: dto.type,
      order: parseObjectIdOptional(dto.orderId, 'orderId'),
      product: parseObjectIdOptional(dto.productId, 'productId'),
      rating: dto.rating,
      message: dto.message,
      images: dto.images || [],
      isPublic: dto.type === 'product_review',
    };
    return this.feedbackRepository.create(data as Partial<Feedback>) as Promise<Feedback>;
  }

  async findAll(query: FeedbackQueryDto) {
    return this.feedbackRepository.findAllPaginated(query);
  }

  async findById(id: string): Promise<Feedback> {
    const idObj = parseObjectId(id, 'id');
    const feedback = await this.feedbackRepository.findByIdWithPopulate(idObj);
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }
    return feedback as unknown as Feedback;
  }

  async getPublicReviews(productId: string) {
    const productObjId = parseObjectId(productId, 'productId');
    return this.feedbackRepository.findPublicReviewsByProduct(productObjId);
  }

  async respond(id: string, dto: RespondToFeedbackDto, adminId: string): Promise<Feedback> {
    const idObj = parseObjectId(id, 'id');
    const feedback = await this.feedbackRepository.findById(idObj);
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
    const idObj = parseObjectId(id, 'id');
    const feedback = await this.feedbackRepository.findByIdAndUpdate(idObj, { status: dto.status });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }
    return feedback as unknown as Feedback;
  }

  async findUserFeedback(userId: string) {
    const userObjId = parseObjectId(userId, 'userId');
    return this.feedbackRepository.findUserFeedback(userObjId);
  }
}
