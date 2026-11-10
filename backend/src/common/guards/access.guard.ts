import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { effectivePermissions } from '../permissions/admin-pages';

const ACCESS_KEY = 'requiredAccess';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel('AdminUser') private adminModel: Model<any>,
    @InjectModel('AccessRole') private roleModel: Model<any>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ACCESS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;

    const jwtUser = ctx.switchToHttp().getRequest().user;
    if (!jwtUser) throw new ForbiddenException('Not authenticated');
    await this.assertAccess(jwtUser, required);
    return true;
  }

  /** Same check for handlers whose required key depends on the request (e.g. a settings key). `required` = full `admin.*` strings. */
  async assertAccess(jwtUser: { sub: string; role: string }, required: string[]): Promise<void> {
    if (jwtUser.role === 'superadmin') return;

    // Read from DB so role edits and deactivation apply on the very next request.
    const user = (await this.adminModel
      .findById(jwtUser.sub)
      .select('isActive accessRole permissions deniedPermissions')
      .lean()) as unknown as { isActive: boolean; accessRole?: unknown; permissions?: string[]; deniedPermissions?: string[] } | null;
    if (!user || !user.isActive) throw new ForbiddenException('Account deactivated');
    if (!user.accessRole) return; // legacy admin: unchanged behaviour

    const role = (await this.roleModel.findById(user.accessRole).select('permissions').lean()) as unknown as {
      permissions: string[];
    } | null;
    const perms = effectivePermissions(role?.permissions, user.permissions, user.deniedPermissions);
    if (!required.some((r) => perms.includes(r))) throw new ForbiddenException(`Missing permission: ${required.join(' or ')}`);
  }
}
