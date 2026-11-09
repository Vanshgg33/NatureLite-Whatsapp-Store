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
