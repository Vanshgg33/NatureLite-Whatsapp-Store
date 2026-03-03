import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from '../schemas/settings.schema';
import { BaseRepository } from '@/common/repository/base.repository';

@Injectable()
export class SettingsRepository extends BaseRepository<SettingsDocument> {
  constructor(
    @InjectModel(Settings.name) model: Model<SettingsDocument>,
  ) {
    super(model);
  }

  async findOneByKey(key: string): Promise<SettingsDocument | null> {
    return this.model.findOne({ key }).exec();
  }

  async findByCategory(category: string): Promise<SettingsDocument[]> {
    return this.model.find({ category }).exec();
  }

  async findPublic(): Promise<SettingsDocument[]> {
    return this.model.find({ isPublic: true }).exec();
  }

  async findAllSettings(): Promise<SettingsDocument[]> {
    return this.model.find().exec();
  }

  async findOneAndUpdateByKey(
    key: string,
    update: Record<string, unknown>,
  ): Promise<SettingsDocument | null> {
    return this.model.findOneAndUpdate({ key }, { $set: update }, { new: true }).exec();
  }
}
