import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RawMaterial, RawMaterialDocument } from '../schemas/raw-material.schema';
import { BaseRepository } from '../../../common/repository/base.repository';

@Injectable()
export class RawMaterialRepository extends BaseRepository<RawMaterialDocument> {
  constructor(
    @InjectModel(RawMaterial.name) model: Model<RawMaterialDocument>,
  ) {
    super(model);
  }

  async findByStore(storeId: Types.ObjectId, search?: string): Promise<RawMaterialDocument[]> {
    const filter: Record<string, unknown> = { store: storeId, isActive: true };
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    return this.model.find(filter).sort({ name: 1 }).exec();
  }

  async setTotalStock(id: Types.ObjectId, totalStock: number): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { totalStock } }).exec();
  }
}
