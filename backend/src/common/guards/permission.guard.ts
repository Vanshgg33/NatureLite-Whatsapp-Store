import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { effectivePermissions } from '../permissions/admin-pages';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel('AdminUser') private adminModel: Model<any>,
    @InjectModel('AccessRole') private roleModel: Model<any>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();
    const jwtUser = req.user;
    if (!jwtUser) throw new ForbiddenException('Not authenticated');

    // Re-read from DB on every permissioned request so deactivation takes effect immediately
    const dbUser = await this.adminModel
      .findById(jwtUser.sub)
      .select('isActive permissions role accessRole deniedPermissions')
      .lean() as unknown as {
        isActive: boolean; permissions: string[]; role: string; accessRole?: unknown; deniedPermissions?: string[];
      } | null;
    if (!dbUser || !dbUser.isActive) throw new ForbiddenException('Account deactivated');

    if (!required) return true;
    if (dbUser.role === 'superadmin') return true;

    // Access-role grants and per-user denials apply on top of the user's own permission list.
    const role = dbUser.accessRole
      ? (await this.roleModel.findById(dbUser.accessRole).select('permissions').lean()) as unknown as { permissions: string[] } | null
      : null;
    const perms = effectivePermissions(role?.permissions, dbUser.permissions, dbUser.deniedPermissions);
    if (!perms.includes(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
