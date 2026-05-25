import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RawMaterialDailyEntry, RawMaterialDailyEntryDocument } from '../schemas/raw-material-snapshot.schema';

@Injectable()
export class RawMaterialDailyEntryRepository {
  constructor(
    @InjectModel(RawMaterialDailyEntry.name)
    private readonly model: Model<RawMaterialDailyEntryDocument>,
  ) {}

  async upsertEntry(
    storeId: Types.ObjectId,
    rawMaterialId: Types.ObjectId,
    date: string,
    data: { openingStock: number; stockIn: number; processed: number; closing: number; outputLitres?: number },
  ): Promise<void> {
    await this.model.findOneAndUpdate(
      { store: storeId, rawMaterial: rawMaterialId, date },
      {
        $set: data,
        $setOnInsert: { store: storeId, rawMaterial: rawMaterialId, date },
      },
      { upsert: true },
    ).exec();
  }

  async getEntry(
    rawMaterialId: Types.ObjectId,
    date: string,
  ): Promise<RawMaterialDailyEntryDocument | null> {
    return this.model.findOne({ rawMaterial: rawMaterialId, date }).exec();
  }

  async getEntriesForMaterials(
    rawMaterialIds: Types.ObjectId[],
    date: string,
  ): Promise<RawMaterialDailyEntryDocument[]> {
    return this.model.find({ rawMaterial: { $in: rawMaterialIds }, date }).exec();
  }

  /** Get the most recent entry before the given date to carry forward closing as opening. */
  async getLatestEntryBefore(
    rawMaterialId: Types.ObjectId,
    beforeDate: string,
  ): Promise<RawMaterialDailyEntryDocument | null> {
    return this.model
      .findOne({ rawMaterial: rawMaterialId, date: { $lt: beforeDate } })
      .sort({ date: -1 })
      .exec();
  }

  async getByStoreAndDate(storeId: Types.ObjectId, date: string): Promise<unknown[]> {
    return this.model.aggregate([
      { $match: { store: storeId, date } },
      {
        $lookup: {
          from: 'rawmaterials',
          localField: 'rawMaterial',
          foreignField: '_id',
          as: 'materialInfo',
        },
      },
      { $unwind: { path: '$materialInfo', preserveNullAndEmptyArrays: false } },
      { $match: { 'materialInfo.isActive': true } },
      { $sort: { 'materialInfo.name': 1 } },
      {
        $project: {
          _id: 1,
          date: 1,
          openingStock: 1,
          stockIn: 1,
          processed: 1,
          outputLitres: 1,
          closing: 1,
          materialName: '$materialInfo.name',
          materialUnit: '$materialInfo.unit',
        },
      },
    ]).exec();
  }

  async getAvailableDates(storeId: Types.ObjectId): Promise<string[]> {
    const results = await this.model.distinct('date', { store: storeId }).exec();
    return (results as string[]).sort().reverse();
  }
}
