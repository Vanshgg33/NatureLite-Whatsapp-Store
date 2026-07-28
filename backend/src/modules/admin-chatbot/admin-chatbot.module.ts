import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AdminChatbotController } from './admin-chatbot.controller';
import { AdminChatbotService } from './admin-chatbot.service';
import { AdminChatbotProcessor, ChatbotQueueProcessor } from './admin-chatbot.processor';
import { QUEUE_ADMIN, QUEUE_CHATBOT } from '../queues/queues.constants';
import { AdminChatSessionRepository } from './repositories/admin-chat-session.repository';
import { AdminChatSession, AdminChatSessionSchema } from './schemas/admin-chat-session.schema';
import { Subscription, SubscriptionSchema } from '../subscriptions/schemas/subscription.schema';
import { RawMaterial, RawMaterialSchema } from '../raw-materials/schemas/raw-material.schema';
import { RawMaterialDailyEntry, RawMaterialDailyEntrySchema } from '../raw-materials/schemas/raw-material-snapshot.schema';
import { Store, StoreSchema } from '../stores/schemas/store.schema';
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
import { SettingsModule } from '../settings/settings.module';
import { StoreStockModule } from '../store-stock/store-stock.module';
import { CategoriesModule } from '../categories/categories.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_ADMIN }),
    BullModule.registerQueue({ name: QUEUE_CHATBOT }),
    MongooseModule.forFeature([
      { name: AdminChatSession.name, schema: AdminChatSessionSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: RawMaterial.name, schema: RawMaterialSchema },
      { name: RawMaterialDailyEntry.name, schema: RawMaterialDailyEntrySchema },
      { name: Store.name, schema: StoreSchema },
    ]),
    forwardRef(() => ProductsModule),
    forwardRef(() => ChatbotModule),
    forwardRef(() => AnalyticsModule),
    forwardRef(() => OrdersModule),
    UsersModule,
    FeedbackModule,
    CouponsModule,
    forwardRef(() => CartModule),
    WalletModule,
    PaymentsModule,
    StoreSalesModule,
    RemindersModule,
    forwardRef(() => WhatsAppModule),
    EmailModule,
    SettingsModule,
    StoreStockModule,
    CategoriesModule,
    AdminModule,
  ],
  controllers: [AdminChatbotController],
  providers: [AdminChatbotService, AdminChatSessionRepository, AdminChatbotProcessor, ChatbotQueueProcessor],
})
export class AdminChatbotModule {}
