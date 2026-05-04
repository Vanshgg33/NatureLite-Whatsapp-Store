import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrderRepository } from './repositories/order.repository';
import { CartModule } from '../cart/cart.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { CouponsModule } from '../coupons/coupons.module';
import { SettingsModule } from '../settings/settings.module';
import { EmailModule } from '../email/email.module';
import { StoresModule } from '../stores/stores.module';
import { StoreStockModule } from '../store-stock/store-stock.module';
import { StoreSalesModule } from '../store-sales/store-sales.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UcmModule } from '../ucm/ucm.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    forwardRef(() => CartModule),
    ProductsModule,
    UsersModule,
    CouponsModule,
    SettingsModule,
    EmailModule,
    StoresModule,
    StoreStockModule,
    StoreSalesModule,
    WalletModule,
    NotificationsModule,
    UcmModule,
  ],
  controllers: [OrdersController],
  providers: [OrderRepository, OrdersService],
  exports: [OrderRepository, OrdersService],
})
export class OrdersModule {}
