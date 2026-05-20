import { Module, forwardRef } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { MediaModule } from '../media/media.module';
import { ProductsModule } from '../products/products.module';
import { SettingsModule } from '../settings/settings.module';
import { StoresModule } from '../stores/stores.module';
import { StoreStockModule } from '../store-stock/store-stock.module';
import { UcmController } from './ucm.controller';
import { UcmService } from './ucm.service';

@Module({
  imports: [
    SettingsModule,
    CategoriesModule,
    MediaModule,
    forwardRef(() => ProductsModule),
    forwardRef(() => StoresModule),
    StoreStockModule,
  ],
  controllers: [UcmController],
  providers: [UcmService],
  exports: [UcmService],
})
export class UcmModule {}