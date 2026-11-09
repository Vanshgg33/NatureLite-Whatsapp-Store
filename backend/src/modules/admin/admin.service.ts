import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminUser } from './schemas/admin-user.schema';
import { AdminUserRepository } from './repositories/admin-user.repository';
import { parseObjectId } from '../../common/utils/objectid.util';
import { isValidAdminPermission } from '../../common/permissions/admin-pages';

@Injectable()
export class AdminService {
  constructor(private readonly adminUserRepository: AdminUserRepository) {}

  async findAll(): Promise<AdminUser[]> {
    return this.adminUserRepository.findAllExcludePassword();
  }

  async findDeliveryStaff(): Promise<AdminUser[]> {
    return this.adminUserRepository.findByDepartment('delivery');
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
    departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior';
    purchaseRole?: 'requester' | 'po_creator' | 'approver' | 'receiver';
    accessRole?: string;
    deniedPermissions?: string[];
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
      purchaseRole: data.purchaseRole,
    };
    if (data.accessRole) payload.accessRole = parseObjectId(data.accessRole, 'accessRole');
    if (data.deniedPermissions) payload.deniedPermissions = this.cleanPerms(data.deniedPermissions);
    if (data.phone?.trim()) {
      payload.phone = data.phone.trim();
    }

    const admin = await this.adminUserRepository.create(payload);
    return this.adminUserRepository.findByIdExcludePassword(admin._id);
  }

  async update(
    id: string,
    data: {
      name?: string;
      phone?: string;
      role?: 'admin' | 'superadmin';
      isActive?: boolean;
      permissions?: string[];
      departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior';
      purchaseRole?: 'requester' | 'po_creator' | 'approver' | 'receiver' | null;
      accessRole?: string | null;
      deniedPermissions?: string[];
    },
  ): Promise<AdminUser> {
    const idObj = parseObjectId(id, 'id');
    const { accessRole, ...rest } = data;
    const update: Record<string, unknown> = { ...rest };
    if (accessRole !== undefined) update.accessRole = accessRole ? parseObjectId(accessRole, 'accessRole') : null;
    if (data.permissions) update.permissions = this.cleanPerms(data.permissions);
    if (data.deniedPermissions) update.deniedPermissions = this.cleanPerms(data.deniedPermissions);
    const admin = await this.adminUserRepository.findByIdAndUpdateExcludePassword(idObj, update);
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    return admin;
  }

  // Per-user grants/denials may mix page permissions with the legacy purchase keys stored in `permissions`.
  private cleanPerms(perms: string[]): string[] {
    const bad = perms.filter((p) => p.startsWith('admin.') && !isValidAdminPermission(p));
    if (bad.length) throw new BadRequestException(`Unknown permissions: ${bad.join(', ')}`);
    return [...new Set(perms)];
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const idObj = parseObjectId(id, 'id');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await this.adminUserRepository.updateOne(
      { _id: idObj },
      { $set: { password: hashedPassword, failedLoginAttempts: 0 } },
    );

    if (result.modifiedCount === 0) {
      throw new NotFoundException('Admin not found');
    }

    // Clear any lockout so the new password works immediately
    await this.adminUserRepository.getModel().updateOne(
      { _id: idObj },
      { $unset: { lockoutUntil: 1 } },
    ).exec();
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
