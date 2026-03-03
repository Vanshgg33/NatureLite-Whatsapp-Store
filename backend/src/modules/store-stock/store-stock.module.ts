import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoreStockService } from './store-stock.service';
import { StoreStockController } from './store-stock.controller';
import { StoreStock, StoreStockSchema } from './schemas/store-stock.schema';
import { StoreStockRepository } from './repositories/store-stock.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StoreStock.name, schema: StoreStockSchema }]),
  ],
  controllers: [StoreStockController],
  providers: [StoreStockRepository, StoreStockService],
  exports: [StoreStockRepository, StoreStockService, MongooseModule],
})
export class StoreStockModule {}
