import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';
export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);

export const PURCHASE_PERMISSIONS = [
  'pr.create',
  'po.raise',
  'po.approve',
  'delivery.receive',
  'request.close',
  'request.cancel',
  'deadline.set',
  'materials.manage',
  'tags.manage',
  'vendors.manage',
  'users.manage',
] as const;

export type PurchasePermission = (typeof PURCHASE_PERMISSIONS)[number];

export const ROLE_PRESETS: Record<string, PurchasePermission[]> = {
  SUPER_ADMIN: [...PURCHASE_PERMISSIONS],
  REQUESTER: ['pr.create', 'request.close'],
  APPROVER: ['po.approve', 'request.close'],
  RECEIVER: ['delivery.receive', 'request.close'],
  PURCHASE_OFFICER: ['po.raise', 'request.close'],
  CUSTOM: [],
};
