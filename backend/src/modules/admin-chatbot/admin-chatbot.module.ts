import { Module } from '@nestjs/common';
import { AdminChatbotController } from './admin-chatbot.controller';
import { AdminChatbotService } from './admin-chatbot.service';
import { ProductsModule } from '../products/products.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { CouponsModule } from '../coupons/coupons.module';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [
    ProductsModule,
    ChatbotModule,
    AnalyticsModule,
    OrdersModule,
    UsersModule,
    FeedbackModule,
    CouponsModule,
    CartModule,
  ],
  controllers: [AdminChatbotController],
  providers: [AdminChatbotService],
})
export class AdminChatbotModule {}
