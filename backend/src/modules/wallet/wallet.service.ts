import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types, ClientSession } from 'mongoose';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletTransactionRepository } from './repositories/wallet-transaction.repository';
import { WalletDocument } from './schemas/wallet.schema';
import { WalletTransactionType } from './schemas/wallet-transaction.schema';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly walletTransactionRepository: WalletTransactionRepository,
  ) {}

  /**
   * Returns wallet for user, creating it if necessary.
   */
  async getOrCreateWallet(userId: string): Promise<WalletDocument> {
    const userObjId = parseObjectId(userId, 'userId');
    let wallet = await this.walletRepository.findByUser(userObjId);
    if (!wallet) {
      wallet = await this.walletRepository.create({
        user: userObjId,
        balance: 0,
      } as Partial<WalletDocument>);
    }
    return wallet;
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  /**
   * Credits user's wallet. Amount is in paise and must be positive.
   */
  async credit(
    userId: string,
    amountPaise: number,
    reason: string,
    meta?: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<WalletDocument> {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new BadRequestException('Amount must be a positive integer (paise)');
    }

    const userObjId = parseObjectId(userId, 'userId');
    const wallet = await this.getOrCreateWallet(userId);

    const updated = await this.walletRepository.getModel().findOneAndUpdate(
      { _id: wallet._id },
      { $inc: { balance: amountPaise } },
      { new: true, session },
    );

    if (!updated) {
      throw new NotFoundException('Wallet not found for user');
    }

    await this.walletTransactionRepository.getModel().create(
      [
        {
          wallet: updated._id as Types.ObjectId,
          user: userObjId,
          type: 'credit' as WalletTransactionType,
          amount: amountPaise,
          reason,
          orderId: (meta?.orderId as Types.ObjectId) ?? undefined,
          meta,
        },
      ],
      { session },
    );

    return updated;
  }

  /**
   * Debits user's wallet. Amount is in paise and must be positive.
   * Uses atomic update with balance >= amount constraint to avoid negative balances.
   */
  async debit(
    userId: string,
    amountPaise: number,
    reason: string,
    meta?: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<WalletDocument> {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new BadRequestException('Amount must be a positive integer (paise)');
    }

    const userObjId = parseObjectId(userId, 'userId');
    const wallet = await this.getOrCreateWallet(userId);

    const updated = await this.walletRepository.getModel().findOneAndUpdate(
      { _id: wallet._id, balance: { $gte: amountPaise } },
      { $inc: { balance: -amountPaise } },
      { new: true, session },
    );

    if (!updated) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    await this.walletTransactionRepository.getModel().create(
      [
        {
          wallet: updated._id as Types.ObjectId,
          user: userObjId,
          type: 'debit' as WalletTransactionType,
          amount: amountPaise,
          reason,
          orderId: (meta?.orderId as Types.ObjectId) ?? undefined,
          meta,
        },
      ],
      { session },
    );

    return updated;
  }

  /**
   * Returns latest N transactions for a user, ordered by newest first.
   */
  async getRecentTransactions(
    userId: string,
    limit = 10,
  ): Promise<{
    wallet: WalletDocument;
    transactions: Awaited<ReturnType<typeof this.walletTransactionRepository.find>>;
  }> {
    const wallet = await this.getOrCreateWallet(userId);

    const transactions = await this.walletTransactionRepository.getModel()
      .find({ wallet: wallet._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return { wallet, transactions };
  }
}

