import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Feedback, FeedbackSchema } from './schemas/feedback.schema';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackRepository } from './repositories/feedback.repository';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Feedback.name, schema: FeedbackSchema }]),
    OrdersModule,
  ],
  controllers: [FeedbackController],
  providers: [FeedbackRepository, FeedbackService],
  exports: [FeedbackRepository, FeedbackService],
})
export class FeedbackModule {}
