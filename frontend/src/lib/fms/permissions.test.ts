import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it('superadmin always returns true regardless of permissions[]', () => {
    const user = { role: 'superadmin', permissions: [] } as any;
    expect(hasPermission(user, 'po.raise')).toBe(true);
  });

  it('returns false when permission not in array', () => {
    const user = { role: 'admin', permissions: ['pr.create', 'request.close'] } as any;
    expect(hasPermission(user, 'po.raise')).toBe(false);
  });

  it('returns true when permission is in array', () => {
    const user = { role: 'admin', permissions: ['po.approve', 'request.close'] } as any;
    expect(hasPermission(user, 'po.approve')).toBe(true);
  });

  it('returns false for null user', () => {
    expect(hasPermission(null, 'pr.create')).toBe(false);
  });
});
