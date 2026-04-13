import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) {
      throw new ForbiddenException('No user found in request');
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    // Department staff may only access specific order workflow endpoints; other admin routes are forbidden
    if (requiredRoles.includes('admin') && user.departmentType) {
      const handlerName = context.getHandler().name;
      const allowedDepartmentHandlers = [
        'findAll',
        'updateStatus',
        'markPacked',
        'updateDeliveryWorkflow',
        'findOne',
        'findByOrderNumber',
      ];
      if (!allowedDepartmentHandlers.includes(handlerName)) {
        throw new ForbiddenException('Department staff cannot access this area. Use the department portal.');
      }
    }

    return true;
  }
}
