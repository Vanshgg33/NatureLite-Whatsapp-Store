import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { ChatSessionRepository } from './repositories/chat-session.repository';
import { ChatbotAnalyticsService } from './analytics/chatbot-analytics.service';
import { ChatbotAiService } from './chatbot-ai.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { UsersModule } from '../users/users.module';
import { ProductsModule } from '../products/products.module';
import { CategoriesModule } from '../categories/categories.module';
import { CartModule } from '../cart/cart.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { StoresModule } from '../stores/stores.module';
import { StoreStockModule } from '../store-stock/store-stock.module';
import { CouponsModule } from '../coupons/coupons.module';
import { UcmModule } from '../ucm/ucm.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([{ name: ChatSession.name, schema: ChatSessionSchema }]),
    forwardRef(() => WhatsAppModule),
    UsersModule,
    forwardRef(() => ProductsModule),
    CategoriesModule,
    forwardRef(() => CartModule),
    forwardRef(() => OrdersModule),
    PaymentsModule,
    WalletModule,
    FeedbackModule,
    forwardRef(() => StoresModule),
    StoreStockModule,
    CouponsModule,
    forwardRef(() => UcmModule),
  ],
  controllers: [ChatbotController],
  providers: [ChatSessionRepository, ChatbotService, ChatbotAnalyticsService, ChatbotAiService],
  exports: [ChatSessionRepository, ChatbotService],
})
export class ChatbotModule {}
