import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoreStockService } from './store-stock.service';
import { StoreStockController } from './store-stock.controller';
import { StoreStock, StoreStockSchema } from './schemas/store-stock.schema';
import { StockSnapshot, StockSnapshotSchema } from './schemas/stock-snapshot.schema';
import { StoreStockRepository } from './repositories/store-stock.repository';
import { StockSnapshotRepository } from './repositories/stock-snapshot.repository';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    AdminModule,
    MongooseModule.forFeature([
      { name: StoreStock.name, schema: StoreStockSchema },
      { name: StockSnapshot.name, schema: StockSnapshotSchema },
    ]),
  ],
  controllers: [StoreStockController],
  providers: [StoreStockRepository, StockSnapshotRepository, StoreStockService],
  exports: [StoreStockRepository, StoreStockService, MongooseModule],
})
export class StoreStockModule {}
