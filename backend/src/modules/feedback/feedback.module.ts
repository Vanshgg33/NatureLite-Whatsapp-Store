import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Feedback, FeedbackSchema } from './schemas/feedback.schema';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackRepository } from './repositories/feedback.repository';
import { OrdersModule } from '../orders/orders.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Feedback.name, schema: FeedbackSchema }]),
    forwardRef(() => OrdersModule),
    MediaModule,
  ],
  controllers: [FeedbackController],
  providers: [FeedbackRepository, FeedbackService],
  exports: [FeedbackRepository, FeedbackService],
})
export class FeedbackModule {}
