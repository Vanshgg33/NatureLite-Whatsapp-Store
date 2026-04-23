import { Module, forwardRef } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { SettingsModule } from '../settings/settings.module';
import { UcmController } from './ucm.controller';
import { UcmService } from './ucm.service';

@Module({
  imports: [SettingsModule, forwardRef(() => ProductsModule)],
  controllers: [UcmController],
  providers: [UcmService],
  exports: [UcmService],
})
export class UcmModule {}