import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Types } from 'mongoose';
import { RefreshToken, RefreshTokenDocument } from '../schemas/refresh-token.schema';
import { BaseRepository } from '../../../common/repository/base.repository';

@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshTokenDocument> {
  constructor(
    @InjectModel(RefreshToken.name) model: Model<RefreshTokenDocument>,
  ) {
    super(model);
  }

  async deleteManyByUserId(userId: Types.ObjectId): Promise<number> {
    const result = await this.model.deleteMany({ userId }).exec();
    return result.deletedCount ?? 0;
  }
}

