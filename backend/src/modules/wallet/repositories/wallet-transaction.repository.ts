import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WalletTransaction,
  WalletTransactionDocument,
} from '../schemas/wallet-transaction.schema';
import { BaseRepository } from '@/common/repository/base.repository';

@Injectable()
export class WalletTransactionRepository extends BaseRepository<WalletTransactionDocument> {
  constructor(
    @InjectModel(WalletTransaction.name) model: Model<WalletTransactionDocument>,
  ) {
    super(model);
  }
}

