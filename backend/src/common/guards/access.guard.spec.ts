import { ForbiddenException } from '@nestjs/common';
import { AccessGuard } from './access.guard';
import { ADMIN_PAGES, effectivePermissions, isValidAdminPermission } from '../permissions/admin-pages';

const chain = (value: unknown) => ({ select: () => ({ lean: async () => value }) });

function makeGuard(user: unknown, role: unknown, required: string[] = ['admin.orders.edit']) {
  const reflector = { getAllAndOverride: () => required } as any;
  const adminModel = { findById: () => chain(user) } as any;
  const roleModel = { findById: () => chain(role) } as any;
  return new AccessGuard(reflector, adminModel, roleModel);
}
const ctx = (jwt: object) =>
  ({ getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user: jwt }) }) }) as any;

describe('effectivePermissions', () => {
  it('unions role + user grants and removes denials', () => {
    expect(effectivePermissions(['a', 'b'], ['c'], ['b'])).toEqual(['a', 'c']);
  });
});

describe('registry', () => {
  it('every page has a view action and valid keys', () => {
    ADMIN_PAGES.forEach((p) => expect(p.actions[0].key).toBe('view'));
    expect(isValidAdminPermission('admin.orders.edit')).toBe(true);
    expect(isValidAdminPermission('admin.orders.nope')).toBe(false);
  });
});

describe('AccessGuard', () => {
  it('lets superadmin through without a DB lookup', async () => {
    await expect(makeGuard(null, null).canActivate(ctx({ sub: '1', role: 'superadmin' }))).resolves.toBe(true);
  });
  it('lets legacy admins (no access role) through', async () => {
    const g = makeGuard({ isActive: true }, null);
    await expect(g.canActivate(ctx({ sub: '1', role: 'admin' }))).resolves.toBe(true);
  });
  it('allows a role that grants the permission', async () => {
    const g = makeGuard({ isActive: true, accessRole: 'r' }, { permissions: ['admin.orders.edit'] });
    await expect(g.canActivate(ctx({ sub: '1', role: 'admin' }))).resolves.toBe(true);
  });
  it('blocks a role that lacks the permission', async () => {
    const g = makeGuard({ isActive: true, accessRole: 'r' }, { permissions: ['admin.orders.view'] });
    await expect(g.canActivate(ctx({ sub: '1', role: 'admin' }))).rejects.toThrow(ForbiddenException);
  });
  it('accepts any one of several listed permissions', async () => {
    const g = makeGuard(
      { isActive: true, accessRole: 'r' },
      { permissions: ['admin.dashboard.view'] },
      ['admin.orders.view', 'admin.dashboard.view'],
    );
    await expect(g.canActivate(ctx({ sub: '1', role: 'admin' }))).resolves.toBe(true);
  });
  it('blocks a per-user denial even when the role grants it', async () => {
    const g = makeGuard(
      { isActive: true, accessRole: 'r', deniedPermissions: ['admin.orders.edit'] },
      { permissions: ['admin.orders.edit'] },
    );
    await expect(g.canActivate(ctx({ sub: '1', role: 'admin' }))).rejects.toThrow(ForbiddenException);
  });
  it('blocks deactivated users', async () => {
    const g = makeGuard({ isActive: false, accessRole: 'r' }, { permissions: ['admin.orders.edit'] });
    await expect(g.canActivate(ctx({ sub: '1', role: 'admin' }))).rejects.toThrow(ForbiddenException);
  });
});
