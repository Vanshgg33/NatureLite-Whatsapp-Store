import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { BaseRepository } from '@/common/repository/base.repository';
import { UserQueryDto } from '../dto/user.dto';
import { PaginatedResult, paginate } from '@/common/types/pagination.types';
import { buildSearchOrFilter } from '@/common/utils/query.util';

@Injectable()
export class UserRepository extends BaseRepository<UserDocument> {
  constructor(
    @InjectModel(User.name) model: Model<UserDocument>,
  ) {
    super(model);
  }

  async findOneByPhone(phone: string): Promise<UserDocument | null> {
    return this.model.findOne({ phone }).exec();
  }

  async findOneByEmail(email: string): Promise<UserDocument | null> {
    return this.model.findOne({ email: email.toLowerCase() }).exec();
  }

  async findAllPaginated(query: UserQueryDto): Promise<PaginatedResult<User>> {
    const { page = 1, limit = 20, search, isActive, isBlocked, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const filter: Record<string, unknown> = {};
    const searchOr = buildSearchOrFilter(search, ['phone', 'name', 'email']);
    if (searchOr.length) filter.$or = searchOr;
    if (isActive !== undefined) filter.isActive = isActive;
    if (isBlocked !== undefined) filter.isBlocked = isBlocked;
    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    const [users, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter),
    ]);
    return paginate(users, total, { page, limit });
  }
}
