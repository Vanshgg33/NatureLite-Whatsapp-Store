import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingCustomer, BillingCustomerSchema } from './schemas/billing-customer.schema';
import { BillingTagPrice, BillingTagPriceSchema } from './schemas/billing-tag-price.schema';
import { BillingBill, BillingBillSchema } from './schemas/billing-bill.schema';
import { BillingCounter, BillingCounterSchema } from './schemas/billing-counter.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BillingCustomer.name, schema: BillingCustomerSchema },
      { name: BillingTagPrice.name, schema: BillingTagPriceSchema },
      { name: BillingBill.name, schema: BillingBillSchema },
      { name: BillingCounter.name, schema: BillingCounterSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
