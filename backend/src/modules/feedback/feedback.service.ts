import { Injectable, NotFoundException } from '@nestjs/common';
import { Feedback } from './schemas/feedback.schema';
import { FeedbackRepository } from './repositories/feedback.repository';
import {
  CreateFeedbackDto,
  AdminCreateReviewDto,
  RespondToFeedbackDto,
  UpdateFeedbackStatusDto,
  FeedbackQueryDto,
} from './dto/feedback.dto';
import { parseObjectIdOptional, parseObjectId } from '../../common/utils/objectid.util';
import { OrderRepository } from '../orders/repositories/order.repository';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly orderRepository: OrderRepository,
    private readonly redisService: RedisService,
  ) {}

  async create(userId: string, dto: CreateFeedbackDto): Promise<Feedback> {
    const userObjId = parseObjectId(userId, 'userId');

    const verifiedPurchase =
      dto.type === 'product_review' && dto.productId
        ? !!(await this.orderRepository.getModel().exists({
            user: userObjId,
            status: 'delivered',
            'items.product': parseObjectId(dto.productId, 'productId'),
          }))
        : false;

    const data = {
      user: parseObjectId(userId, 'userId'),
      type: dto.type,
      order: parseObjectIdOptional(dto.orderId, 'orderId'),
      product: parseObjectIdOptional(dto.productId, 'productId'),
      rating: dto.rating,
      message: dto.message,
      images: dto.images || [],
      videos: dto.videos || [],
      isPublic: dto.type === 'product_review',
      metadata:
        dto.type === 'product_review'
          ? { verifiedPurchase }
          : {},
    };
    const saved = await this.feedbackRepository.create(data as Partial<Feedback>);
    this.clearChatbotCache();
    return saved as Feedback;
  }

  async adminCreate(dto: AdminCreateReviewDto): Promise<Feedback> {
    const data = {
      type: 'product_review' as const,
      product: parseObjectId(dto.productId, 'productId'),
      rating: dto.rating,
      message: dto.message,
      images: dto.images || [],
      videos: dto.videos || [],
      reviewerName: dto.reviewerName,
      isAdminCurated: true,
      isPublic: true,
      status: 'acknowledged' as const,
      metadata: { verifiedPurchase: false },
    };
    const saved = await this.feedbackRepository.create(data as Partial<Feedback>);
    this.clearChatbotCache();
    return saved as Feedback;
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
    const saved = await feedback.save();
    this.clearChatbotCache();
    return saved;
  }

  async updateStatus(id: string, dto: UpdateFeedbackStatusDto): Promise<Feedback> {
    const idObj = parseObjectId(id, 'id');
    const feedback = await this.feedbackRepository.findByIdAndUpdate(idObj, { status: dto.status });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }
    this.clearChatbotCache();
    return feedback as unknown as Feedback;
  }

  async findUserFeedback(userId: string) {
    const userObjId = parseObjectId(userId, 'userId');
    return this.feedbackRepository.findUserFeedback(userObjId);
  }

  private clearChatbotCache(): void {
    this.redisService.delPattern('chatbot:tool:*').catch(() => {});
  }
}
