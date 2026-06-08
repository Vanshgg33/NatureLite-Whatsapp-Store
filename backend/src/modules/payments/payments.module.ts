import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentRepository } from './repositories/payment.repository';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { StoreSalesModule } from '../store-sales/store-sales.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    forwardRef(() => OrdersModule),
    WalletModule,
    forwardRef(() => StoreSalesModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentRepository, PaymentsService],
  exports: [PaymentRepository, PaymentsService],
})
export class PaymentsModule {}
