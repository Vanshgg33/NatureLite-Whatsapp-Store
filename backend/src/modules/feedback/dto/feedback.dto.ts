import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsArray, IsMongoId, Min, Max } from 'class-validator';
import { FeedbackType, FeedbackStatus } from '../schemas/feedback.schema';

export class CreateFeedbackDto {
  @IsEnum(['product_review', 'order_feedback', 'general', 'complaint', 'suggestion'])
  @IsNotEmpty()
  type: FeedbackType;

  @IsMongoId()
  @IsOptional()
  orderId?: string;

  @IsMongoId()
  @IsOptional()
  productId?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsArray()
  @IsOptional()
  images?: string[];
}

export class RespondToFeedbackDto {
  @IsString()
  @IsNotEmpty()
  response: string;
}

export class UpdateFeedbackStatusDto {
  @IsEnum(['acknowledged', 'resolved', 'closed'])
  @IsNotEmpty()
  status: FeedbackStatus;
}

export class FeedbackQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  type?: FeedbackType;

  @IsOptional()
  status?: FeedbackStatus;

  @IsOptional()
  productId?: string;
}
