import { Module } from '@nestjs/common';
import { PublicChatbotController } from './public-chatbot.controller';
import { PublicChatbotService } from './public-chatbot.service';
import { ProductsModule } from '../products/products.module';
import { CategoriesModule } from '../categories/categories.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [ProductsModule, CategoriesModule, OrdersModule],
  controllers: [PublicChatbotController],
  providers: [PublicChatbotService],
})
export class PublicChatbotModule {}
