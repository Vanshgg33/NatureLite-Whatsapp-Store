import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { AccessGuard } from '../guards/access.guard';

export const ACCESS_KEY = 'requiredAccess';

/**
 * Page/action permission from ADMIN_PAGES, e.g. @RequireAccess('orders.edit').
 * Several keys = any one is enough (for endpoints a second page also calls, e.g. Delivery History reads the Cash Ledger API).
 * Superadmins and legacy admins (no access role assigned) pass; users with an access role need a permission.
 */
export const RequireAccess = (...keys: string[]) =>
  applyDecorators(SetMetadata(ACCESS_KEY, keys.map((k) => `admin.${k}`)), UseGuards(AccessGuard));

/**
 * Superadmins and admins with no access role only. The key is deliberately absent from ADMIN_PAGES,
 * so no role can ever be granted it (use for audit logs, destructive resets, ...).
 */
export const NoRoleAccess = () => RequireAccess('__unrestricted__');
