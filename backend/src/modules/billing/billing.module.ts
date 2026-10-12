import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmModule } from '../crm/crm.module';
import { BillingTagPrice, BillingTagPriceSchema } from './schemas/billing-tag-price.schema';
import { BillingBill, BillingBillSchema } from './schemas/billing-bill.schema';
import { BillingCounter, BillingCounterSchema } from './schemas/billing-counter.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { BusinessProfile, BusinessProfileSchema } from './schemas/business-profile.schema';
import { Godown, GodownSchema } from './schemas/godown.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { TaxSettingsModule } from './tax-settings/tax-settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: BillingTagPrice.name, schema: BillingTagPriceSchema },
      { name: BillingBill.name, schema: BillingBillSchema },
      { name: BillingCounter.name, schema: BillingCounterSchema },
      { name: Product.name, schema: ProductSchema },
      { name: BusinessProfile.name, schema: BusinessProfileSchema },
      { name: Godown.name, schema: GodownSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
    CrmModule,
    TaxSettingsModule,
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
