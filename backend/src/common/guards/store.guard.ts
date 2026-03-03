import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class StoreGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    // Superadmins and admins without a store scope can access any store
    if (user.role === 'superadmin' || !user.storeId) return true;

    // For store-scoped admins, check if the requested storeId matches their own
    const storeIdParam =
      request.params?.storeId ||
      request.body?.storeId ||
      request.query?.storeId;

    // If the endpoint has a storeId param, it must match the user's store
    if (storeIdParam && user.storeId !== storeIdParam) {
      throw new ForbiddenException('You can only access your own store');
    }

    // If the endpoint has no storeId param, block store-scoped admins
    // (they should only access store-scoped endpoints)
    if (!storeIdParam) {
      throw new ForbiddenException('You can only access your own store resources');
    }

    return true;
  }
}
