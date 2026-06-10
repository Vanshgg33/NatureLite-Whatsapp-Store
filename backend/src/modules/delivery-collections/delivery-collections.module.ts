import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeliveryCollectionsController } from './delivery-collections.controller';
import { DeliveryCollectionsService } from './delivery-collections.service';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { AdminUser, AdminUserSchema } from '../admin/schemas/admin-user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
    ]),
  ],
  controllers: [DeliveryCollectionsController],
  providers: [DeliveryCollectionsService],
})
export class DeliveryCollectionsModule {}
