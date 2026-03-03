import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Store, StoreDocument } from '../schemas/store.schema';
import { BaseRepository } from '@/common/repository/base.repository';
@Injectable()
export class StoreRepository extends BaseRepository<StoreDocument> {
  constructor(
    @InjectModel(Store.name) model: Model<StoreDocument>,
  ) {
    super(model);
  }

  async findAllSorted(): Promise<StoreDocument[]> {
    return this.model.find().sort({ createdAt: 1 }).exec();
  }

  async findOneByCode(code: string): Promise<StoreDocument | null> {
    return this.model.findOne({ code }).exec();
  }

  async findOneMainStore(): Promise<StoreDocument | null> {
    return this.model.findOne({ isMainStore: true }).exec();
  }

  async insertMany(docs: Partial<Store>[]): Promise<StoreDocument[]> {
    return this.model.insertMany(docs) as Promise<StoreDocument[]>;
  }
}
