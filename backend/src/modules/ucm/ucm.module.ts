import { Module, forwardRef } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ProductsModule } from '../products/products.module';
import { SettingsModule } from '../settings/settings.module';
import { UcmController } from './ucm.controller';
import { UcmService } from './ucm.service';

@Module({
  imports: [SettingsModule, CategoriesModule, forwardRef(() => ProductsModule)],
  controllers: [UcmController],
  providers: [UcmService],
  exports: [UcmService],
})
export class UcmModule {}