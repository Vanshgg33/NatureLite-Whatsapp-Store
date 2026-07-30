import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WalletService } from './wallet.service';
import { AdminAdjustWalletDto, WalletBalanceResponse, WalletTransactionResponse } from './dto/wallet.dto';

@Controller('admin/wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':userId')
  async getUserWallet(
    @Param('userId') userId: string,
  ): Promise<WalletBalanceResponse & { transactions: WalletTransactionResponse[] }> {
    const { wallet, transactions } = await this.walletService.getRecentTransactions(userId, 10);

    return {
      balance: wallet.balance / 100,
      currency: 'INR',
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

  @Post(':userId/credit')
  async creditUserWallet(
    @Param('userId') userId: string,
    @Body() dto: AdminAdjustWalletDto,
  ): Promise<WalletBalanceResponse> {
    const amountPaise = Math.round(dto.amount * 100);
    const wallet = await this.walletService.credit(userId, amountPaise, dto.note || 'manual_admin_credit');

    return {
      balance: wallet.balance / 100,
      currency: 'INR',
    };
  }

  @Post(':userId/debit')
  async debitUserWallet(
    @Param('userId') userId: string,
    @Body() dto: AdminAdjustWalletDto,
  ): Promise<WalletBalanceResponse> {
    const amountPaise = Math.round(dto.amount * 100);
    const wallet = await this.walletService.debit(userId, amountPaise, dto.note || 'manual_admin_debit');

    return {
      balance: wallet.balance / 100,
      currency: 'INR',
    };
  }
}

