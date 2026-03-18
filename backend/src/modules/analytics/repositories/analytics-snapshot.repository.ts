import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AnalyticsSnapshot,
  AnalyticsSnapshotDocument,
  SnapshotPeriod,
} from '../schemas/analytics-snapshot.schema';
import { BaseRepository } from '../../../common/repository/base.repository';

@Injectable()
export class AnalyticsSnapshotRepository extends BaseRepository<AnalyticsSnapshotDocument> {
  constructor(
    @InjectModel(AnalyticsSnapshot.name) model: Model<AnalyticsSnapshotDocument>,
  ) {
    super(model);
  }

  async findByPeriod(
    period: SnapshotPeriod,
    limit: number = 30,
  ): Promise<AnalyticsSnapshotDocument[]> {
    return this.model.find({ period }).sort({ date: -1 }).limit(limit).exec();
  }
}
