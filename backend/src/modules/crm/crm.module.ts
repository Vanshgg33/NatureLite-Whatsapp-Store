import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmCustomerStats, CrmCustomerStatsSchema } from './schemas/crm-customer-stats.schema';
import { CrmCallLog, CrmCallLogSchema } from './schemas/crm-call-log.schema';
import { CrmCampaign, CrmCampaignSchema } from './schemas/crm-campaign.schema';
import { CrmSettings, CrmSettingsSchema } from './schemas/crm-settings.schema';
import { CrmEngineRun, CrmEngineRunSchema } from './schemas/crm-engine-run.schema';
import { CrmActivityEvent, CrmActivityEventSchema } from './schemas/crm-activity-event.schema';
import { BillingBill, BillingBillSchema } from '../billing/schemas/billing-bill.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { AdminUser, AdminUserSchema } from '../admin/schemas/admin-user.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { ChatSession, ChatSessionSchema } from '../chatbot/schemas/chat-session.schema';
import { Cart, CartSchema } from '../cart/schemas/cart.schema';
import { MessageLog, MessageLogSchema } from '../whatsapp/schemas/message-log.schema';
import { Complaint, ComplaintSchema } from '../complaints/schemas/complaint.schema';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { MediaModule } from '../media/media.module';
import { CrmEngineService } from './crm-engine.service';
import { CrmService } from './crm.service';
import { CrmFoundationService } from './crm-foundation.service';
import { CrmInsightsService } from './crm-insights.service';
import { CrmOpsService } from './crm-ops.service';
import { CrmGoal, CrmGoalSchema, CrmSavedView, CrmSavedViewSchema, CrmLead, CrmLeadSchema, CrmWalkin, CrmWalkinSchema } from './schemas/crm-ops.schemas';
import { Feedback, FeedbackSchema } from '../feedback/schemas/feedback.schema';
import { AuditLog, AuditLogSchema } from '../audit/schemas/audit-log.schema';
import { CrmMarketingSpend, CrmMarketingSpendSchema } from './schemas/crm-marketing-spend.schema';
import { Subscription, SubscriptionSchema } from '../subscriptions/schemas/subscription.schema';
import { CrmController } from './crm.controller';
import { CrmLogicSet, CrmLogicSetSchema } from './schemas/crm-logic-set.schema';
import { CrmLogicLog, CrmLogicLogSchema } from './schemas/crm-logic-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CrmCustomerStats.name, schema: CrmCustomerStatsSchema },
      { name: CrmCallLog.name, schema: CrmCallLogSchema },
      { name: CrmCampaign.name, schema: CrmCampaignSchema },
      { name: CrmSettings.name, schema: CrmSettingsSchema },
      { name: CrmLogicSet.name, schema: CrmLogicSetSchema },
      { name: CrmLogicLog.name, schema: CrmLogicLogSchema },
      { name: CrmEngineRun.name, schema: CrmEngineRunSchema },
      { name: CrmActivityEvent.name, schema: CrmActivityEventSchema },
      { name: BillingBill.name, schema: BillingBillSchema },
      { name: CrmMarketingSpend.name, schema: CrmMarketingSpendSchema },
      { name: CrmGoal.name, schema: CrmGoalSchema },
      { name: CrmSavedView.name, schema: CrmSavedViewSchema },
      { name: CrmLead.name, schema: CrmLeadSchema },
      { name: CrmWalkin.name, schema: CrmWalkinSchema },
      { name: Feedback.name, schema: FeedbackSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: Cart.name, schema: CartSchema },
      { name: MessageLog.name, schema: MessageLogSchema },
      { name: Complaint.name, schema: ComplaintSchema },
    ]),
    WhatsAppModule,
    MediaModule,
  ],
  controllers: [CrmController],
  providers: [CrmEngineService, CrmService, CrmFoundationService, CrmInsightsService, CrmOpsService],
  exports: [CrmEngineService],
})
export class CrmModule {}
