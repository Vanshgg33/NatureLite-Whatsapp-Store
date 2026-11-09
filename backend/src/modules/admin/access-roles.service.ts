import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessRole, AccessRoleDocument } from './schemas/access-role.schema';
import { AdminUser, AdminUserDocument } from './schemas/admin-user.schema';
import { AuditService } from '../audit/audit.service';
import { effectivePermissions, isValidAdminPermission } from '../../common/permissions/admin-pages';
import { parseObjectId } from '../../common/utils/objectid.util';

export interface AccessRoleInput {
  name?: string;
  description?: string;
  permissions?: string[];
}

@Injectable()
export class AccessRolesService {
  constructor(
    @InjectModel(AccessRole.name) private readonly roleModel: Model<AccessRoleDocument>,
    @InjectModel(AdminUser.name) private readonly userModel: Model<AdminUserDocument>,
    private readonly audit: AuditService,
  ) {}

  private cleanPermissions(perms: string[] = []): string[] {
    const bad = perms.filter((p) => !isValidAdminPermission(p));
    if (bad.length) throw new BadRequestException(`Unknown permissions: ${bad.join(', ')}`);
    return [...new Set(perms)];
  }

  async findAll(): Promise<(AccessRole & { userCount: number })[]> {
    const [roles, counts] = await Promise.all([
      this.roleModel.find().sort({ name: 1 }).lean(),
      this.userModel.aggregate([{ $match: { accessRole: { $ne: null } } }, { $group: { _id: '$accessRole', n: { $sum: 1 } } }]),
    ]);
    const byRole = new Map(counts.map((c) => [String(c._id), c.n as number]));
    return roles.map((r) => ({ ...r, userCount: byRole.get(String(r._id)) ?? 0 }));
  }

  /** What the logged-in admin may do. `restricted: false` = legacy/superadmin, UI keeps its old behaviour. */
  async myAccess(userId: string): Promise<{ restricted: boolean; roleName?: string; permissions: string[] }> {
    const user = await this.userModel
      .findById(userId)
      .select('role accessRole permissions deniedPermissions')
      .lean();
    if (!user || user.role === 'superadmin' || !user.accessRole) return { restricted: false, permissions: [] };
    const role = await this.roleModel.findById(user.accessRole).select('name permissions').lean();
    return {
      restricted: true,
      roleName: role?.name,
      permissions: effectivePermissions(role?.permissions, user.permissions, user.deniedPermissions),
    };
  }

  async create(input: AccessRoleInput, by: { id: string; name?: string }): Promise<AccessRole> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Role name is required');
    if (await this.roleModel.exists({ name })) throw new ConflictException('A role with this name already exists');
    const role = await this.roleModel.create({
      name,
      description: input.description?.trim() ?? '',
      permissions: this.cleanPermissions(input.permissions),
    });
    await this.audit.log({
      action: 'access_role.create', performedBy: by.id, performedByName: by.name,
      targetId: String(role._id), targetModel: 'AccessRole', newValues: { name, permissions: role.permissions },
    });
    return role;
  }

  async update(id: string, input: AccessRoleInput, by: { id: string; name?: string }): Promise<AccessRole> {
    const _id = parseObjectId(id, 'id');
    const role = await this.roleModel.findById(_id);
    if (!role) throw new NotFoundException('Role not found');
    const previous = { name: role.name, permissions: role.permissions };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Role name is required');
      if (name !== role.name && (await this.roleModel.exists({ name }))) {
        throw new ConflictException('A role with this name already exists');
      }
      role.name = name;
    }
    if (input.description !== undefined) role.description = input.description.trim();
    if (input.permissions !== undefined) role.permissions = this.cleanPermissions(input.permissions);
    await role.save();
    await this.audit.log({
      action: 'access_role.update', performedBy: by.id, performedByName: by.name,
      targetId: id, targetModel: 'AccessRole', previousValues: previous,
      newValues: { name: role.name, permissions: role.permissions },
    });
    return role;
  }

  async remove(id: string, by: { id: string; name?: string }): Promise<void> {
    const _id = parseObjectId(id, 'id');
    const inUse = await this.userModel.countDocuments({ accessRole: _id });
    if (inUse > 0) throw new BadRequestException(`Role is assigned to ${inUse} user(s). Reassign them first.`);
    const role = await this.roleModel.findByIdAndDelete(_id);
    if (!role) throw new NotFoundException('Role not found');
    await this.audit.log({
      action: 'access_role.delete', performedBy: by.id, performedByName: by.name,
      targetId: id, targetModel: 'AccessRole', previousValues: { name: role.name },
    });
  }
}
