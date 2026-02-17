import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminUserDocument } from './schemas/admin-user.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUserDocument>,
  ) {}

  async findAll(): Promise<AdminUser[]> {
    return this.adminUserModel.find().select('-password').exec();
  }

  async findById(id: string): Promise<AdminUser> {
    const admin = await this.adminUserModel.findById(id).select('-password');

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return admin;
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: 'admin' | 'superadmin';
  }): Promise<AdminUser> {
    const existing = await this.adminUserModel.findOne({
      email: data.email.toLowerCase(),
    });

    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const admin = new this.adminUserModel({
      ...data,
      email: data.email.toLowerCase(),
      password: hashedPassword,
    });

    await admin.save();

    const result = admin.toObject() as any;
    delete result.password;
    return result;
  }

  async update(
    id: string,
    data: {
      name?: string;
      phone?: string;
      role?: 'admin' | 'superadmin';
      isActive?: boolean;
      permissions?: string[];
    },
  ): Promise<AdminUser> {
    const admin = await this.adminUserModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true },
    ).select('-password');

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return admin;
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await this.adminUserModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { password: hashedPassword } },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Admin not found');
    }
  }

  async deactivate(id: string): Promise<AdminUser> {
    const admin = await this.adminUserModel.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true },
    ).select('-password');

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return admin;
  }

  async delete(id: string): Promise<void> {
    const result = await this.adminUserModel.deleteOne({
      _id: new Types.ObjectId(id),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Admin not found');
    }
  }
}
