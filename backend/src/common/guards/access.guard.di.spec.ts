import { Controller, Get, Global, INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AccessGuard } from './access.guard';
import { RequireAccess } from '../decorators/require-access.decorator';

// Mirrors the real wiring: AdminModule is @Global and exports the AdminUser/AccessRole models + AccessGuard,
// while the controller lives in an unrelated module that knows nothing about them.
const users: Record<string, any> = {
  restricted: { isActive: true, accessRole: 'r1' },
  legacy: { isActive: true },
  off: { isActive: false, accessRole: 'r1' },
};
const chain = (v: unknown) => ({ select: () => ({ lean: async () => v }) });
const adminModel = { findById: (id: string) => chain(users[id] ?? null) };
const roleModel = { findById: () => chain({ permissions: ['admin.orders.view', 'admin.dashboard.view'] }) };

@Global()
@Module({
  providers: [
    { provide: getModelToken('AdminUser'), useValue: adminModel },
    { provide: getModelToken('AccessRole'), useValue: roleModel },
    AccessGuard,
  ],
  exports: [getModelToken('AdminUser'), getModelToken('AccessRole'), AccessGuard],
})
class FakeAdminModule {}

@Controller('t')
class TestController {
  @Get('view') @RequireAccess('orders.view') view() { return 'ok'; }
  @Get('any') @RequireAccess('customers.view', 'dashboard.view') any() { return 'ok'; }
  @Post('edit') @RequireAccess('orders.edit') edit() { return 'ok'; }
}

@Module({ controllers: [TestController] })
class FeatureModule {}

describe('@RequireAccess wiring across modules', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [FakeAdminModule, FeatureModule] }).compile();
    app = mod.createNestApplication();
    // Stand-in for the global JwtAuthGuard: identity comes from a header.
    app.use((req: any, _res: any, next: () => void) => {
      const id = req.headers['x-user'] as string;
      if (id) req.user = { sub: id, role: id === 'super' ? 'superadmin' : 'admin' };
      next();
    });
    await app.listen(0);
    base = await app.getUrl();
  });
  afterAll(() => app.close());

  const call = (path: string, user: string, method = 'GET') =>
    fetch(base + path, { method, headers: { 'x-user': user } }).then((r) => r.status);

  it('lets a role with the permission through', async () => expect(await call('/t/view', 'restricted')).toBe(200));
  it('blocks a role without the permission', async () => expect(await call('/t/edit', 'restricted', 'POST')).toBe(403));
  it('any-of: one matching permission is enough', async () => expect(await call('/t/any', 'restricted')).toBe(200));
  it('legacy admins and superadmins are unaffected', async () => {
    expect(await call('/t/edit', 'legacy', 'POST')).toBe(201); // POST default
    expect(await call('/t/edit', 'super', 'POST')).toBe(201);
  });
  it('deactivated users are blocked', async () => expect(await call('/t/view', 'off')).toBe(403));
});
