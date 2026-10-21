import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AdminChatbotController } from './admin-chatbot.controller';
import { AdminChatbotService } from './admin-chatbot.service';
import { AdminChatbotToolsService } from './admin-chatbot-tools.service';
import { AdminChatbotProcessor, ChatbotQueueProcessor } from './admin-chatbot.processor';
import { RouterAgent } from './agents/router.agent';
import { OpsAgent } from './agents/ops.agent';
import { BillingCrmAgent } from './agents/billing-crm.agent';
import { PurchaseAgent } from './agents/purchase.agent';
import { SynthesizerAgent } from './agents/synthesizer.agent';
import { QUEUE_ADMIN, QUEUE_CHATBOT } from '../queues/queues.constants';
import { AdminChatSessionRepository } from './repositories/admin-chat-session.repository';
import { AdminChatSession, AdminChatSessionSchema } from './schemas/admin-chat-session.schema';
import { Subscription, SubscriptionSchema } from '../subscriptions/schemas/subscription.schema';
import { RawMaterial, RawMaterialSchema } from '../raw-materials/schemas/raw-material.schema';
import { RawMaterialDailyEntry, RawMaterialDailyEntrySchema } from '../raw-materials/schemas/raw-material-snapshot.schema';
import { Store, StoreSchema } from '../stores/schemas/store.schema';
import { BillingBill, BillingBillSchema } from '../billing/schemas/billing-bill.schema';
import { BillingCustomer, BillingCustomerSchema } from '../billing/schemas/billing-customer.schema';
import { Godown, GodownSchema } from '../billing/schemas/godown.schema';
import { CrmCustomerStats, CrmCustomerStatsSchema } from '../crm/schemas/crm-customer-stats.schema';
import { CrmCallLog, CrmCallLogSchema } from '../crm/schemas/crm-call-log.schema';
import { CrmCampaign, CrmCampaignSchema } from '../crm/schemas/crm-campaign.schema';
import { PurchaseRequest, PurchaseRequestSchema } from '../purchase/schemas/purchase-request.schema';
import { PurchaseVendor, PurchaseVendorSchema } from '../purchase/schemas/purchase-vendor.schema';
import { PurchaseMaterial, PurchaseMaterialSchema } from '../purchase/schemas/purchase-material.schema';
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
      { name: BillingBill.name, schema: BillingBillSchema },
      { name: BillingCustomer.name, schema: BillingCustomerSchema },
      { name: Godown.name, schema: GodownSchema },
      { name: CrmCustomerStats.name, schema: CrmCustomerStatsSchema },
      { name: CrmCallLog.name, schema: CrmCallLogSchema },
      { name: CrmCampaign.name, schema: CrmCampaignSchema },
      { name: PurchaseRequest.name, schema: PurchaseRequestSchema },
      { name: PurchaseVendor.name, schema: PurchaseVendorSchema },
      { name: PurchaseMaterial.name, schema: PurchaseMaterialSchema },
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
  providers: [
    AdminChatbotService,
    AdminChatbotToolsService,
    AdminChatSessionRepository,
    AdminChatbotProcessor,
    ChatbotQueueProcessor,
    RouterAgent,
    OpsAgent,
    BillingCrmAgent,
    PurchaseAgent,
    SynthesizerAgent,
  ],
})
export class AdminChatbotModule {}
