import { Module } from '@nestjs/common';
import { AdminChatbotController } from './admin-chatbot.controller';
import { AdminChatbotService } from './admin-chatbot.service';
import { ProductsModule } from '../products/products.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    ProductsModule,
    ChatbotModule,
    AnalyticsModule,
    OrdersModule,
  ],
  controllers: [AdminChatbotController],
  providers: [AdminChatbotService],
})
export class AdminChatbotModule {}
