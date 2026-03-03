import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoreSalesService } from './store-sales.service';
import { StoreSalesController } from './store-sales.controller';
import { StoreSale, StoreSaleSchema } from './schemas/store-sale.schema';
import { StoreSaleRepository } from './repositories/store-sale.repository';
import { StoreStockModule } from '../store-stock/store-stock.module';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StoreSale.name, schema: StoreSaleSchema }]),
    StoreStockModule,
    ProductsModule,
    StoresModule,
    RemindersModule,
  ],
  controllers: [StoreSalesController],
  providers: [StoreSaleRepository, StoreSalesService],
  exports: [StoreSaleRepository, StoreSalesService, MongooseModule],
})
export class StoreSalesModule {}
