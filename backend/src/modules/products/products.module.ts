import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product, ProductSchema } from './schemas/product.schema';
import { ProductRepository } from './repositories/product.repository';
import { StoreStockModule } from '../store-stock/store-stock.module';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    StoreStockModule,
    forwardRef(() => StoresModule),
  ],
  controllers: [ProductsController],
  providers: [ProductRepository, ProductsService],
  exports: [ProductsService, ProductRepository],
})
export class ProductsModule {}
