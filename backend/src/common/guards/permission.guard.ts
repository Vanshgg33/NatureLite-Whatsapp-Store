import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel('AdminUser') private adminModel: Model<any>,
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
      .select('isActive permissions role')
      .lean() as unknown as { isActive: boolean; permissions: string[]; role: string } | null;
    if (!dbUser || !dbUser.isActive) throw new ForbiddenException('Account deactivated');

    if (!required) return true;
    if (dbUser.role === 'superadmin') return true;

    if (!dbUser.permissions?.includes(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
