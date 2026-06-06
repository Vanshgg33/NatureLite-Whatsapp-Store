import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AdminChatbotController } from './admin-chatbot.controller';
import { AdminChatbotService } from './admin-chatbot.service';
import { AdminChatbotProcessor } from './admin-chatbot.processor';
import { QUEUE_ADMIN } from '../queues/queues.constants';
import { AdminChatSessionRepository } from './repositories/admin-chat-session.repository';
import { AdminChatSession, AdminChatSessionSchema } from './schemas/admin-chat-session.schema';
import { Subscription, SubscriptionSchema } from '../subscriptions/schemas/subscription.schema';
import { ProductsModule } from '../products/products.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { CouponsModule } from '../coupons/coupons.module';
import { CartModule } from '../cart/cart.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsModule } from '../payments/payments.module';
import { StoreSalesModule } from '../store-sales/store-sales.module';
import { RemindersModule } from '../reminders/reminders.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_ADMIN }),
    MongooseModule.forFeature([
      { name: AdminChatSession.name, schema: AdminChatSessionSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    ProductsModule,
    ChatbotModule,
    AnalyticsModule,
    OrdersModule,
    UsersModule,
    FeedbackModule,
    CouponsModule,
    CartModule,
    WalletModule,
    PaymentsModule,
    StoreSalesModule,
    RemindersModule,
    WhatsAppModule,
    EmailModule,
  ],
  controllers: [AdminChatbotController],
  providers: [AdminChatbotService, AdminChatSessionRepository, AdminChatbotProcessor],
})
export class AdminChatbotModule {}
