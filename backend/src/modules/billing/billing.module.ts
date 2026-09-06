import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingCustomer, BillingCustomerSchema } from './schemas/billing-customer.schema';
import { BillingTagPrice, BillingTagPriceSchema } from './schemas/billing-tag-price.schema';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BillingCustomer.name, schema: BillingCustomerSchema },
      { name: BillingTagPrice.name, schema: BillingTagPriceSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
