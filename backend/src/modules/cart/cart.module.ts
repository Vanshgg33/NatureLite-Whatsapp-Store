import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { Cart, CartSchema } from './schemas/cart.schema';
import { CartRepository } from './repositories/cart.repository';
import { CartAutomationService } from './cart-automation.service';
import { ProductsModule } from '../products/products.module';
import { CouponsModule } from '../coupons/coupons.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }]),
    ProductsModule,
    forwardRef(() => CouponsModule),
    forwardRef(() => OrdersModule),
    NotificationsModule,
    SettingsModule,
  ],
  controllers: [CartController],
  providers: [CartRepository, CartService, CartAutomationService],
  exports: [CartRepository, CartService],
})
export class CartModule {}
