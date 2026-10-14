import { PermissionGuard } from '../../common/guards/permission.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

const mockAdminModel = {
  findById: jest.fn(),
};

const makeCtx = (user: any, handlerName = 'someHandler'): ExecutionContext => {
  const handler = jest.fn();
  Object.defineProperty(handler, 'name', { value: handlerName });
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => ({}),
  } as any;
};

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionGuard(reflector, mockAdminModel as any);
  });

  afterEach(() => jest.clearAllMocks());

  const mockQuery = (data: any) => ({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(data) }),
  });

  it('allows superadmin with no permission key set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    mockAdminModel.findById.mockReturnValue(mockQuery({ isActive: true, permissions: [], role: 'superadmin' }));
    const result = await guard.canActivate(makeCtx({ sub: 'id1', role: 'superadmin' }));
    expect(result).toBe(true);
  });

  it('throws 403 when user lacks required permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('po.raise');
    mockAdminModel.findById.mockReturnValue(mockQuery({ isActive: true, permissions: ['pr.create'], role: 'admin' }));
    await expect(guard.canActivate(makeCtx({ sub: 'id1', role: 'admin' }))).rejects.toThrow(ForbiddenException);
  });

  it('throws 403 when user is deactivated (even if JWT is valid)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('pr.create');
    mockAdminModel.findById.mockReturnValue(mockQuery({ isActive: false, permissions: ['pr.create'], role: 'admin' }));
    await expect(guard.canActivate(makeCtx({ sub: 'id1', role: 'admin' }))).rejects.toThrow(ForbiddenException);
  });

  it('allows when user has the required permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('po.approve');
    mockAdminModel.findById.mockReturnValue(mockQuery({ isActive: true, permissions: ['po.approve', 'request.close'], role: 'admin' }));
    const result = await guard.canActivate(makeCtx({ sub: 'id1', role: 'admin' }));
    expect(result).toBe(true);
  });
});
