import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminUser } from './schemas/admin-user.schema';
import { AdminUserRepository } from './repositories/admin-user.repository';
import { parseObjectId } from '@/common/utils/objectid.util';

@Injectable()
export class AdminService {
  constructor(private readonly adminUserRepository: AdminUserRepository) {}

  async findAll(): Promise<AdminUser[]> {
    return this.adminUserRepository.findAllExcludePassword();
  }

  async findById(id: string): Promise<AdminUser> {
    const idObj = parseObjectId(id, 'id');
    const admin = await this.adminUserRepository.findByIdExcludePassword(idObj);
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
    departmentType?: 'packing' | 'billing' | 'delivery';
  }): Promise<AdminUser> {
    const existing = await this.adminUserRepository.findOneByEmail(data.email.toLowerCase());
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    if (data.phone?.trim()) {
      const existingPhone = await this.adminUserRepository.findOneByPhone(data.phone.trim());
      if (existingPhone) {
        throw new ConflictException('Phone number already registered');
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const payload: Partial<AdminUser> = {
      name: data.name,
      email: data.email.toLowerCase(),
      password: hashedPassword,
      role: data.role || 'admin',
      departmentType: data.departmentType,
    };
    if (data.phone?.trim()) {
      payload.phone = data.phone.trim();
    }

    const admin = await this.adminUserRepository.create(payload);

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
      departmentType?: 'packing' | 'billing' | 'delivery';
    },
  ): Promise<AdminUser> {
    const idObj = parseObjectId(id, 'id');
    const admin = await this.adminUserRepository.findByIdAndUpdateExcludePassword(idObj, data);
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    return admin;
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    const idObj = parseObjectId(id, 'id');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await this.adminUserRepository.updateOne(
      { _id: idObj },
      { $set: { password: hashedPassword } },
    );

    if (result.modifiedCount === 0) {
      throw new NotFoundException('Admin not found');
    }
  }

  async deactivate(id: string): Promise<AdminUser> {
    const idObj = parseObjectId(id, 'id');
    const admin = await this.adminUserRepository.findByIdAndUpdateExcludePassword(idObj, {
      isActive: false,
    });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    return admin;
  }

  async delete(id: string): Promise<void> {
    const idObj = parseObjectId(id, 'id');
    const result = await this.adminUserRepository.deleteOne({ _id: idObj });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Admin not found');
    }
  }
}
