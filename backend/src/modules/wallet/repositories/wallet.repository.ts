import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from '../schemas/wallet.schema';
import { BaseRepository } from '@/common/repository/base.repository';

@Injectable()
export class WalletRepository extends BaseRepository<WalletDocument> {
  constructor(
    @InjectModel(Wallet.name) model: Model<WalletDocument>,
  ) {
    super(model);
  }

  async findByUser(userId: Types.ObjectId): Promise<WalletDocument | null> {
    return this.model.findOne({ user: userId }).exec();
  }
}

