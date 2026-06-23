import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { Cart, CartSchema } from './schemas/cart.schema';
import { CartRepository } from './repositories/cart.repository';
import { CartAutomationService } from './cart-automation.service';
import { CartAutomationProcessor } from './cart-automation.processor';
import { CouponsModule } from '../coupons/coupons.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { ProductsModule } from '../products/products.module';
import { QUEUE_CART_AUTOMATION } from '../queues/queues.constants';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }]),
    BullModule.registerQueue({ name: QUEUE_CART_AUTOMATION }),
    forwardRef(() => ProductsModule),
    forwardRef(() => CouponsModule),
    forwardRef(() => OrdersModule),
    NotificationsModule,
    SettingsModule,
  ],
  controllers: [CartController],
  providers: [CartRepository, CartService, CartAutomationService, CartAutomationProcessor],
  exports: [CartRepository, CartService],
})
export class CartModule {}
