import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import {
  WalletTransaction,
  WalletTransactionSchema,
} from './schemas/wallet-transaction.schema';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletTransactionRepository } from './repositories/wallet-transaction.repository';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { AdminWalletController } from './admin-wallet.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
    ]),
  ],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletRepository, WalletTransactionRepository, WalletService],
  exports: [WalletRepository, WalletTransactionRepository, WalletService],
})
export class WalletModule {}

