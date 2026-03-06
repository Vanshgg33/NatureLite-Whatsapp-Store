import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminUser, AdminUserDocument } from '../schemas/admin-user.schema';
import { BaseRepository } from '@/common/repository/base.repository';

@Injectable()
export class AdminUserRepository extends BaseRepository<AdminUserDocument> {
  constructor(
    @InjectModel(AdminUser.name) model: Model<AdminUserDocument>,
  ) {
    super(model);
  }

  async findAllExcludePassword(): Promise<AdminUserDocument[]> {
    return this.model.find().select('-password').exec();
  }

  async findByIdExcludePassword(id: Types.ObjectId): Promise<AdminUserDocument | null> {
    return this.model.findById(id).select('-password').exec();
  }

  async findOneByEmail(email: string): Promise<AdminUserDocument | null> {
    return this.model.findOne({ email: email.toLowerCase() }).exec();
  }

  async findOneByPhone(phone: string): Promise<AdminUserDocument | null> {
    if (!phone || !phone.trim()) return null;
    return this.model.findOne({ phone: phone.trim() }).exec();
  }

  async findByIdAndUpdateExcludePassword(
    id: Types.ObjectId,
    update: Record<string, unknown>,
  ): Promise<AdminUserDocument | null> {
    return this.model.findByIdAndUpdate(id, { $set: update }, { new: true }).select('-password').exec();
  }
}
