import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { Store, StoreSchema } from './schemas/store.schema';
import { AdminUser, AdminUserSchema } from '../admin/schemas/admin-user.schema';
import { StoreRepository } from './repositories/store.repository';
import { StoreStockModule } from '../store-stock/store-stock.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Store.name, schema: StoreSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
    ]),
    StoreStockModule,
    forwardRef(() => ProductsModule),
  ],
  controllers: [StoresController],
  providers: [StoreRepository, StoresService],
  exports: [StoreRepository, StoresService, MongooseModule],
})
export class StoresModule {}
