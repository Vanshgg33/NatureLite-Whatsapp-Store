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
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { MediaModule } from '../media/media.module';
import { CrmEngineService } from './crm-engine.service';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CrmCustomerStats.name, schema: CrmCustomerStatsSchema },
      { name: CrmCallLog.name, schema: CrmCallLogSchema },
      { name: CrmCampaign.name, schema: CrmCampaignSchema },
      { name: CrmSettings.name, schema: CrmSettingsSchema },
      { name: CrmEngineRun.name, schema: CrmEngineRunSchema },
      { name: CrmActivityEvent.name, schema: CrmActivityEventSchema },
      { name: BillingBill.name, schema: BillingBillSchema },
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    WhatsAppModule,
    MediaModule,
  ],
  controllers: [CrmController],
  providers: [CrmEngineService, CrmService],
  exports: [CrmEngineService],
})
export class CrmModule {}
