import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';
import {
  WalletBalanceResponse,
  WalletTransactionResponse,
} from './dto/wallet.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getBalance(@CurrentUser('sub') userId: string): Promise<WalletBalanceResponse> {
    const balancePaise = await this.walletService.getBalance(userId);
    return {
      balance: balancePaise / 100,
      currency: 'INR',
    };
  }

  @Get('transactions')
  async getRecentTransactions(
    @CurrentUser('sub') userId: string,
  ): Promise<{ transactions: WalletTransactionResponse[] }> {
    const { transactions } = await this.walletService.getRecentTransactions(userId, 10);

    return {
      transactions: transactions.map((tx) => ({
        id: tx._id.toString(),
        type: tx.type,
        amount: tx.amount / 100,
        reason: tx.reason,
        createdAt: tx.createdAt,
        orderId: tx.orderId?.toString(),
        meta: tx.meta,
      })),
    };
  }
}

