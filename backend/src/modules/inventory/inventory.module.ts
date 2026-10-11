import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryService } from './inventory.service';
import { StockMovement, StockMovementSchema } from './schemas/stock-movement.schema';
import { StoreStock, StoreStockSchema } from '../store-stock/schemas/store-stock.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Store, StoreSchema } from '../stores/schemas/store.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: StoreStock.name, schema: StoreStockSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Store.name, schema: StoreSchema },
    ]),
  ],
  providers: [InventoryService],
  exports: [InventoryService, MongooseModule],
})
export class InventoryModule {}
