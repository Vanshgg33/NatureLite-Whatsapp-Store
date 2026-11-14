import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmModule } from '../crm/crm.module';
import { BillingBill, BillingBillSchema } from './schemas/billing-bill.schema';
import { BillingCounter, BillingCounterSchema } from './schemas/billing-counter.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { BusinessProfile, BusinessProfileSchema } from './schemas/business-profile.schema';
import { Godown, GodownSchema } from './schemas/godown.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BooksService } from './books.service';
import { BooksController } from './books.controller';
import { BillingAccount, BillingAccountSchema, BillingExpense, BillingExpenseSchema, BillingOpening, BillingOpeningSchema, BillingPayment, BillingPaymentSchema, BillingPurchase, BillingPurchaseSchema, BillingStockEntry, BillingStockEntrySchema } from './schemas/books.schemas';
import { ReportsService } from './reports/reports.service';
import { ReportsController } from './reports/reports.controller';
import { TaxSettingsModule } from './tax-settings/tax-settings.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { MediaModule } from '../media/media.module';
import { SettingsModule } from '../settings/settings.module';
import { BillingWhatsappService } from './billing-whatsapp.service';
import { BillingStockService } from './billing-stock.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: BillingBill.name, schema: BillingBillSchema },
      { name: BillingCounter.name, schema: BillingCounterSchema },
      { name: Product.name, schema: ProductSchema },
      { name: BusinessProfile.name, schema: BusinessProfileSchema },
      { name: Godown.name, schema: GodownSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: BillingAccount.name, schema: BillingAccountSchema },
      { name: BillingPayment.name, schema: BillingPaymentSchema },
      { name: BillingExpense.name, schema: BillingExpenseSchema },
      { name: BillingPurchase.name, schema: BillingPurchaseSchema },
      { name: BillingStockEntry.name, schema: BillingStockEntrySchema },
      { name: BillingOpening.name, schema: BillingOpeningSchema },
    ]),
    CrmModule,
    TaxSettingsModule,
    WhatsAppModule,
    MediaModule,
    SettingsModule,
  ],
  controllers: [BillingController, ReportsController, BooksController],
  providers: [BillingService, ReportsService, BooksService, BillingWhatsappService, BillingStockService],
  exports: [BillingService, BillingStockService],
})
export class BillingModule {}
